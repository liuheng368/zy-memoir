<script setup lang="ts">
/**
 * src/components/overlays/StudentOverlay.vue — 学生浮层（spec §1.3 / plan G6）
 *
 * 三态分支（plan §页面交互细节 + AC-17）：
 *   - owner   ：仅"登录学生本人"且 props.mode === 'owner' 时
 *   - visitor ：其它一切情况（包含游客 / 客态 / 教师 / 管理员看学生）
 *
 * 业务能力（owner only）：
 *   - 头像换图（useImageCompress → useUpload → updateStudentAvatar）
 *   - 自我介绍编辑（≤300 字 + 1 s 防抖自动保存 → updateStudentIntro）
 *   - 照片网格（≤3 张，"+" / 长按删除 → addStudentPhoto / removeStudentPhoto）
 *   - 录音列表（≤5 段、单段 ≤ 60 s，"+" / 长按删除
 *               → useRecorder + useMp3Encode + useUpload → addStudentRecording）
 *
 * 游客兜底（plan AC-17）：
 *   - mount 时若 `authStore.isGuest` 或非本人 → 强制 `effectiveMode='visitor'`，
 *     模板根本不渲染编辑入口；deeplink 携带 mode=owner 也无效。
 *
 * 与 G10 的关系：
 *   - 录音弹层（RecordModal）目前在 plan G10 待拆分，G6 这里先用 inline 面板覆盖；
 *     上传/删除二次确认走共用 `<ConfirmDialog>`（已 G10 一部分前置完成）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import {
  addStudentPhoto,
  addStudentRecording,
  getStudentDetail,
  removeStudentAvatar,
  removeStudentPhoto,
  removeStudentRecording,
  updateStudentAvatar,
  updateStudentIntro,
  type StudentDetail,
  type StudentRecordingRef,
} from '@/api/students'
import { useImageCompress } from '@/composables/useImageCompress'
import { useUpload, uuidShort } from '@/composables/useUpload'
import { canRecord, useRecorder } from '@/composables/useRecorder'
import { useMp3Encode } from '@/composables/useMp3Encode'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { toast } from '@/composables/useToast'
import { overlayMaskColor, useOverlayThemeColor } from '@/composables/useOverlayThemeColor'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import AvatarCropper from '@/components/common/AvatarCropper.vue'
import Lightbox from '@/components/common/Lightbox.vue'
import { defaultStudentAvatar } from '@/utils/defaultAvatar'
import { isNetworkError, networkErrorMessage } from '@/utils/network'
import {
  MAX_INTRO_LENGTH,
  MAX_RECORDING_SECONDS,
  MAX_STUDENT_PHOTOS,
  MAX_STUDENT_RECORDINGS,
} from '@/utils/constants'

interface Props {
  /** 受控开关；父级 v-model:open */
  open: boolean
  /** 当前查看的学生 id；为 null 时不拉取 */
  studentId: number | null
  /** 调用方期望的模式（默认 visitor）；最终是否生效以 effectiveMode 为准 */
  mode?: 'owner' | 'visitor'
}
const props = withDefaults(defineProps<Props>(), {
  mode: 'visitor',
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** 学生数据变更（拍照 / 录音 / 改简介）后通知父级，以便刷新计数 */
  (e: 'updated'): void
}>()

const authStore = useAuthStore()
const { role, studentProfile, token } = storeToRefs(authStore)

/**
 * 实际模式判定（**plan AC-17 强制兜底**）：
 * - 必须 props.mode === 'owner' + role === 'student' + 学生 id 等于自己；
 * - 任何不满足都降级为 visitor，不渲染编辑入口。
 */
const effectiveMode = computed<'owner' | 'visitor'>(() => {
  if (typeof props.studentId !== 'number') return 'visitor'
  if (role.value !== 'student') return 'visitor'
  if (studentProfile.value?.studentId !== props.studentId) return 'visitor'
  return props.mode === 'owner' ? 'owner' : 'visitor'
})

// iOS Safari：浮层 open 时把 status bar / URL bar 的 chrome 颜色切到「mask 叠加 page-bg」
// 后的近似色，让两条 chrome 区域跟随浮层一起变暗，视觉上「包裹」住整个屏幕
useOverlayThemeColor(
  () => props.open,
  overlayMaskColor(20, 20, 20, 0.42), // 与 .overlay-mask background 同源
)

/* -------------------- 详情数据加载 -------------------- */
const detail = ref<StudentDetail | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)

async function loadDetail(id: number): Promise<void> {
  loading.value = true
  loadError.value = null
  detail.value = null
  try {
    const d = await getStudentDetail(id)
    detail.value = d
    intro.value = d.intro || ''
    introSaved.value = d.intro || ''
  } catch (e) {
    loadError.value = (e as Error).message || '加载失败'
  } finally {
    loading.value = false
  }
}

function retryLoad(): void {
  if (typeof props.studentId === 'number') void loadDetail(props.studentId)
}

watch(
  () => [props.open, props.studentId] as const,
  ([open, id]) => {
    if (open && typeof id === 'number') {
      void loadDetail(id)
    } else if (!open) {
      // 关闭：停止音频 + 取消录音 + 关闭 inline 录音面板
      audioPlayer.stop()
      if (recorder.status.value === 'recording') recorder.cancel()
      recordingPanelOpen.value = false
      pendingDelete.value = null
      confirmOpen.value = false
    }
  },
  { immediate: false },
)

function close(): void {
  emit('update:open', false)
}

/* -------------------- 自我介绍（owner only） -------------------- */
const intro = ref('')
const introSaved = ref('')
const introSaving = ref(false)
let introTimer: ReturnType<typeof setTimeout> | null = null

const introOver = computed(() => intro.value.length > MAX_INTRO_LENGTH)
const introDirty = computed(() => intro.value !== introSaved.value)

function onIntroInput(): void {
  if (effectiveMode.value !== 'owner') return
  if (introTimer) clearTimeout(introTimer)
  if (introOver.value) return
  introTimer = setTimeout(() => {
    void saveIntro()
  }, 1000)
}

async function saveIntro(): Promise<void> {
  if (effectiveMode.value !== 'owner') return
  if (!detail.value || !token.value) return
  if (!introDirty.value || introOver.value) return
  introSaving.value = true
  const value = intro.value
  try {
    await updateStudentIntro({
      token: token.value,
      intro: value,
      studentId: detail.value.id,
    })
    introSaved.value = value
    if (detail.value) detail.value.intro = value
    toast.success('已保存')
    emit('updated')
  } catch (e) {
    toast.error((e as Error).message || '保存失败')
  } finally {
    introSaving.value = false
  }
}

onBeforeUnmount(() => {
  if (introTimer) clearTimeout(introTimer)
})

/* -------------------- 头像（owner 可换） -------------------- */
const compressor = useImageCompress()
const avatarUploader = useUpload()
const { status: avatarStatus } = avatarUploader
const avatarInputRef = ref<HTMLInputElement | null>(null)

function pickAvatar(): void {
  if (effectiveMode.value !== 'owner') return
  avatarInputRef.value?.click()
}

async function onAvatarPicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  // PRD v0.4 二期 / spec §6.1：先进裁剪弹层，确认后再走 doUploadAvatar
  cropperFile.value = file
  cropperOpen.value = true
}

/* -------------------- 头像裁剪 / 头像放大（PRD v0.4 二期） -------------------- */
const cropperOpen = ref(false)
const cropperFile = ref<File | null>(null)
const lightboxOpen = ref(false)

const lightboxSrc = computed(
  () => detail.value?.avatar?.url || (detail.value ? defaultStudentAvatar(detail.value.gender) : ''),
)

function onCropConfirmed(blob: Blob): void {
  if (!cropperFile.value) return
  const orig = cropperFile.value
  // 输出 jpeg；保留原文件名前缀方便排查
  const filename = orig.name.replace(/\.[^.]+$/, '') + '.jpg'
  const cropped = new File([blob], filename, { type: blob.type || 'image/jpeg' })
  cropperFile.value = null
  void doUploadAvatar(cropped)
}

function onCropCancel(): void {
  cropperFile.value = null
}

function onCropReselect(): void {
  // 关闭裁剪弹层，重新弹出文件选择器
  cropperOpen.value = false
  cropperFile.value = null
  setTimeout(() => avatarInputRef.value?.click(), 50)
}

function onAvatarImgClick(): void {
  if (!detail.value) return
  lightboxOpen.value = true
}

async function doUploadAvatar(file: File): Promise<void> {
  if (!detail.value || !token.value) return
  const tid = toast.loading('正在更新头像…')
  try {
    const compressed = await compressor.compress(file)
    const cloudPath = `students/${detail.value.id}/avatar/${uuidShort()}.${guessExt(compressed)}`
    const result = await avatarUploader.upload({
      cloudPath,
      file: compressed,
      kind: 'avatar',
    })
    const r = await updateStudentAvatar({
      token: token.value,
      fileID: result.fileID,
      url: result.url,
      studentId: detail.value.id,
    })
    if (detail.value) detail.value.avatar = r.avatar
    toast.success('头像已更新')
    emit('updated')
  } catch (err) {
    const fallback = (err as Error).message || '头像上传失败'
    if (isNetworkError(err)) {
      toast.errorWithRetry(networkErrorMessage(err, fallback), () =>
        doUploadAvatar(file),
      )
    } else {
      toast.error(fallback)
    }
  } finally {
    toast.dismiss(tid)
  }
}

function requestRemoveAvatar(): void {
  if (effectiveMode.value !== 'owner' || !detail.value?.avatar?.url) return
  pendingDelete.value = { kind: 'avatar', id: 'avatar', label: '头像' }
  confirmOpen.value = true
}

function guessExt(file: File | Blob): string {
  const t = (file as File).type || ''
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  return 'jpg'
}

/* -------------------- 照片墙（owner +/-） -------------------- */
const photoUploader = useUpload()
const { status: photoStatus } = photoUploader
const photoInputRef = ref<HTMLInputElement | null>(null)

const photoCount = computed(() => detail.value?.photos.length ?? 0)
const canAddPhoto = computed(
  () => effectiveMode.value === 'owner' && photoCount.value < MAX_STUDENT_PHOTOS,
)

function pickPhoto(): void {
  if (!canAddPhoto.value) return
  photoInputRef.value?.click()
}

async function onPhotoPicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (photoCount.value >= MAX_STUDENT_PHOTOS) {
    toast.error(`最多 ${MAX_STUDENT_PHOTOS} 张照片`)
    return
  }
  await doUploadPhoto(file)
}

async function doUploadPhoto(file: File): Promise<void> {
  if (!detail.value || !token.value) return
  const tid = toast.loading('正在上传照片…')
  try {
    const compressed = await compressor.compress(file)
    const cloudPath = `students/${detail.value.id}/photo/${uuidShort()}.${guessExt(compressed)}`
    const result = await photoUploader.upload({
      cloudPath,
      file: compressed,
      kind: 'photo',
    })
    const r = await addStudentPhoto({
      token: token.value,
      fileID: result.fileID,
      url: result.url,
      studentId: detail.value.id,
    })
    if (detail.value) detail.value.photos = r.photos
    toast.success('照片已添加')
    emit('updated')
  } catch (err) {
    const fallback = (err as Error).message || '照片上传失败'
    if (isNetworkError(err)) {
      toast.errorWithRetry(networkErrorMessage(err, fallback), () =>
        doUploadPhoto(file),
      )
    } else {
      toast.error(fallback)
    }
  } finally {
    toast.dismiss(tid)
  }
}

/* -------------------- 长按删除（照片 / 录音通用） -------------------- */
type DeleteTarget =
  | { kind: 'avatar'; id: 'avatar'; label: string }
  | { kind: 'photo'; id: string; label: string }
  | { kind: 'recording'; id: string; label: string }

const pendingDelete = ref<DeleteTarget | null>(null)
const confirmOpen = ref(false)
const LONG_PRESS_MS = 600
let longPressTimer: ReturnType<typeof setTimeout> | null = null

function onLongPressStart(target: DeleteTarget): void {
  if (effectiveMode.value !== 'owner') return
  cancelLongPress()
  longPressTimer = setTimeout(() => {
    pendingDelete.value = target
    confirmOpen.value = true
  }, LONG_PRESS_MS)
}

function cancelLongPress(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

async function onConfirmDelete(): Promise<void> {
  if (!pendingDelete.value || !detail.value || !token.value) return
  const target = pendingDelete.value
  const tid = toast.loading('删除中…')
  try {
    if (target.kind === 'avatar') {
      await removeStudentAvatar({
        token: token.value,
        studentId: detail.value.id,
      })
      detail.value.avatar = null
    } else if (target.kind === 'photo') {
      const r = await removeStudentPhoto({
        token: token.value,
        photoId: target.id,
        studentId: detail.value.id,
      })
      detail.value.photos = r.photos
    } else {
      const rec = detail.value.recordings.find((x) => x.id === target.id)
      if (rec && audioPlayer.isPlaying(rec.url)) audioPlayer.stop()
      const r = await removeStudentRecording({
        token: token.value,
        recordingId: target.id,
        studentId: detail.value.id,
      })
      detail.value.recordings = r.recordings
    }
    toast.success('已删除')
    emit('updated')
  } catch (err) {
    toast.error((err as Error).message || '删除失败')
  } finally {
    toast.dismiss(tid)
    pendingDelete.value = null
  }
}

function onCancelDelete(): void {
  pendingDelete.value = null
}

/* -------------------- 录音 inline 面板（owner only） -------------------- */
const recorder = useRecorder()
const {
  status: recStatus,
  elapsed: recElapsed,
  blob: recBlob,
  error: recError,
} = recorder
const mp3 = useMp3Encode()
const recordingUploader = useUpload()
const audioPlayer = useAudioPlayer()

const recordingPanelOpen = ref(false)
const recordingBusy = ref(false)

const recordingsCount = computed(() => detail.value?.recordings.length ?? 0)
const canAddRecording = computed(
  () => effectiveMode.value === 'owner' && recordingsCount.value < MAX_STUDENT_RECORDINGS,
)
const canRecordHere = computed(() => canRecord())

function openRecordingPanel(): void {
  if (!canAddRecording.value) return
  if (!canRecordHere.value) {
    toast.error('当前浏览器不支持录音')
    return
  }
  recordingPanelOpen.value = true
}

async function startRecording(): Promise<void> {
  try {
    await recorder.start()
  } catch (e) {
    toast.error((e as Error).message || '麦克风启动失败')
  }
}

async function stopRecording(): Promise<void> {
  try {
    await recorder.stop()
  } catch (e) {
    toast.error((e as Error).message || '停止失败')
  }
}

function cancelRecording(): void {
  recorder.cancel()
  recordingPanelOpen.value = false
}

function reRecord(): void {
  recorder.cancel()
}

async function saveRecording(): Promise<void> {
  if (!recBlob.value || !detail.value || !token.value) return
  recordingBusy.value = true
  const tid = toast.loading('正在保存录音…')
  try {
    const enc = await mp3.encode(recBlob.value)
    const cloudPath = `students/${detail.value.id}/recording/${uuidShort()}.mp3`
    const result = await recordingUploader.upload({
      cloudPath,
      file: enc.blob,
      kind: 'recording',
    })
    const duration = Math.max(1, Math.round(enc.duration))
    const r = await addStudentRecording({
      token: token.value,
      fileID: result.fileID,
      url: result.url,
      duration,
      studentId: detail.value.id,
    })
    detail.value.recordings = r.recordings
    toast.success('录音已添加')
    emit('updated')
    recorder.cancel()
    recordingPanelOpen.value = false
  } catch (err) {
    const fallback = (err as Error).message || '录音上传失败'
    if (isNetworkError(err)) {
      // 重试时 recBlob 仍在（catch 不 cancel），用户点「重试」即重走 saveRecording
      toast.errorWithRetry(networkErrorMessage(err, fallback), () => {
        void saveRecording()
      })
    } else {
      toast.error(fallback)
    }
  } finally {
    toast.dismiss(tid)
    recordingBusy.value = false
  }
}

/* -------------------- 录音播放 -------------------- */
async function togglePlay(rec: StudentRecordingRef): Promise<void> {
  try {
    await audioPlayer.toggle(rec.url)
  } catch {
    toast.error('播放失败')
  }
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function recBlobKb(): string {
  return Math.round((recBlob.value?.size || 0) / 1024).toString()
}
</script>

<template>
  <Teleport to="body">
    <transition name="overlay-fade">
      <div v-if="open" class="overlay-mask" role="dialog" aria-modal="true" @click.self="close">
        <div class="overlay-sheet">
          <header class="sheet-header">
            <h2 class="sheet-title">
              <span v-if="detail">{{ detail.name }}</span>
              <span v-else-if="props.studentId !== null">学生 #{{ props.studentId }}</span>
              <span v-if="effectiveMode === 'owner'" class="mode-badge owner">主态</span>
            </h2>
            <button type="button" class="close-btn" aria-label="关闭" @click="close">×</button>
          </header>

          <div v-if="loading" class="state-block">加载中…</div>
          <div v-else-if="loadError" class="state-block error">
            <p>{{ loadError }}</p>
            <button type="button" class="retry-btn" @click="retryLoad">重试</button>
          </div>

          <div v-else-if="detail" class="sheet-body">
            <!-- 头像 -->
            <section class="avatar-section">
              <div
                class="avatar-wrap"
                :class="[`gender-${detail.gender}`]"
              >
                <img
                  :src="detail.avatar?.url || defaultStudentAvatar(detail.gender)"
                  :alt="detail.name"
                  decoding="async"
                  class="avatar-img"
                  @click="onAvatarImgClick"
                />
                <div v-if="avatarStatus === 'uploading'" class="avatar-mask">上传中…</div>
              </div>
              <button
                v-if="effectiveMode === 'owner'"
                type="button"
                class="avatar-change"
                :disabled="avatarStatus === 'uploading'"
                @click="pickAvatar"
              >
                {{ detail.avatar?.url ? '换头像' : '上传头像' }}
              </button>
              <button
                v-if="effectiveMode === 'owner' && detail.avatar?.url"
                type="button"
                class="avatar-remove"
                :disabled="avatarStatus === 'uploading'"
                @click="requestRemoveAvatar"
              >
                删除头像
              </button>
              <input
                ref="avatarInputRef"
                type="file"
                accept="image/*"
                hidden
                @change="onAvatarPicked"
              />
            </section>

            <!-- 自我介绍 -->
            <section class="intro-section">
              <div class="section-head">
                <h3>自我介绍</h3>
                <span
                  v-if="effectiveMode === 'owner'"
                  class="counter"
                  :class="{ over: introOver }"
                  >{{ intro.length }} / {{ MAX_INTRO_LENGTH }}</span
                >
              </div>
              <textarea
                v-if="effectiveMode === 'owner'"
                v-model="intro"
                class="intro-textarea"
                :class="{ over: introOver }"
                :placeholder="`说点什么，让大家认识你（≤ ${MAX_INTRO_LENGTH} 字）`"
                rows="4"
                @input="onIntroInput"
                @blur="saveIntro"
              />
              <p v-else class="intro-readonly">
                {{ detail.intro || '暂未填写自我介绍' }}
              </p>
              <p v-if="introSaving" class="intro-status">保存中…</p>
              <p v-else-if="introOver" class="intro-status err">超出 {{ MAX_INTRO_LENGTH }} 字</p>
            </section>

            <!-- 照片墙 -->
            <section class="photos-section">
              <div class="section-head">
                <h3>照片</h3>
                <span v-if="effectiveMode === 'owner'" class="counter"
                  >{{ photoCount }} / {{ MAX_STUDENT_PHOTOS }}</span
                >
              </div>
              <div class="photo-grid">
                <div
                  v-for="p in detail.photos"
                  :key="p.id"
                  class="photo-cell"
                  :class="{ deletable: effectiveMode === 'owner' }"
                  @pointerdown="
                    onLongPressStart({ kind: 'photo', id: p.id, label: '这张照片' })
                  "
                  @pointerup="cancelLongPress"
                  @pointerleave="cancelLongPress"
                  @pointercancel="cancelLongPress"
                  @contextmenu.prevent
                >
                  <img :src="p.url" :alt="`${detail.name} 的照片`" loading="lazy" />
                </div>
                <button
                  v-if="canAddPhoto"
                  type="button"
                  class="photo-add"
                  :disabled="photoStatus === 'uploading'"
                  @click="pickPhoto"
                >
                  <span aria-hidden="true">＋</span>
                </button>
                <p v-if="!detail.photos.length && effectiveMode !== 'owner'" class="empty-hint">
                  还没有照片
                </p>
              </div>
              <input
                ref="photoInputRef"
                type="file"
                accept="image/*"
                hidden
                @change="onPhotoPicked"
              />
            </section>

            <!-- 录音 -->
            <section class="recordings-section">
              <div class="section-head">
                <h3>录音</h3>
                <span v-if="effectiveMode === 'owner'" class="counter"
                  >{{ recordingsCount }} / {{ MAX_STUDENT_RECORDINGS }}</span
                >
              </div>
              <ul v-if="detail.recordings.length" class="rec-list">
                <li
                  v-for="r in detail.recordings"
                  :key="r.id"
                  class="rec-item"
                  :class="{ deletable: effectiveMode === 'owner' }"
                  @pointerdown="
                    onLongPressStart({ kind: 'recording', id: r.id, label: '这段录音' })
                  "
                  @pointerup="cancelLongPress"
                  @pointerleave="cancelLongPress"
                  @pointercancel="cancelLongPress"
                  @contextmenu.prevent
                >
                  <button
                    type="button"
                    class="rec-play"
                    :class="{ playing: audioPlayer.isPlaying(r.url) }"
                    :aria-label="audioPlayer.isPlaying(r.url) ? '暂停' : '播放'"
                    @click.stop="togglePlay(r)"
                  >
                    {{ audioPlayer.isPlaying(r.url) ? '⏸' : '▶' }}
                  </button>
                  <div class="rec-meta">
                    <span class="rec-duration">{{ fmtDuration(r.duration) }}</span>
                    <span class="rec-progress" aria-hidden="true">
                      <span
                        class="rec-progress-bar"
                        :style="{ width: `${audioPlayer.progress(r.url) * 100}%` }"
                      ></span>
                    </span>
                  </div>
                  <!-- PRD v0.4 二期 / spec §6.3：owner 显式删除按钮（@click.stop 防长按冒泡） -->
                  <button
                    v-if="effectiveMode === 'owner'"
                    type="button"
                    class="rec-delete"
                    aria-label="删除录音"
                    @click.stop="
                      pendingDelete = { kind: 'recording', id: r.id, label: '这段录音' };
                      confirmOpen = true;
                      cancelLongPress();
                    "
                    @pointerdown.stop
                  >
                    🗑
                  </button>
                </li>
              </ul>
              <p v-else class="empty-hint">还没有录音</p>
              <button
                v-if="canAddRecording"
                type="button"
                class="rec-add"
                @click="openRecordingPanel"
              >
                ＋ 录一段
              </button>
            </section>

            <!-- 录音 inline 面板（owner only） -->
            <div
              v-if="recordingPanelOpen && effectiveMode === 'owner'"
              class="record-panel"
              role="region"
              aria-label="录音"
              @click.stop
            >
              <p class="record-status">
                <template v-if="recStatus === 'idle'"
                  >点击「开始」录音（最长 {{ MAX_RECORDING_SECONDS }} 秒）</template
                >
                <template v-else-if="recStatus === 'recording'"
                  >录音中… {{ recElapsed }} / {{ MAX_RECORDING_SECONDS }} s</template
                >
                <template v-else-if="recStatus === 'stopped'"
                  >录音完成（约 {{ recBlobKb() }} KB）</template
                >
                <template v-else-if="recStatus === 'error'">{{ recError }}</template>
              </p>
              <div class="record-actions">
                <button
                  v-if="recStatus === 'idle'"
                  type="button"
                  class="btn-rec primary"
                  @click="startRecording"
                >
                  ● 开始
                </button>
                <button
                  v-if="recStatus === 'recording'"
                  type="button"
                  class="btn-rec danger"
                  @click="stopRecording"
                >
                  ■ 停止
                </button>
                <template v-if="recStatus === 'stopped'">
                  <button
                    type="button"
                    class="btn-rec ghost"
                    :disabled="recordingBusy"
                    @click="reRecord"
                  >
                    重录
                  </button>
                  <button
                    type="button"
                    class="btn-rec primary"
                    :disabled="recordingBusy"
                    @click="saveRecording"
                  >
                    保存
                  </button>
                </template>
                <button
                  type="button"
                  class="btn-rec ghost"
                  :disabled="recordingBusy"
                  @click="cancelRecording"
                >
                  取消
                </button>
              </div>
            </div>
          </div>

          <ConfirmDialog
            v-model:open="confirmOpen"
            title="确认删除"
            :content="
              pendingDelete ? `确定删除${pendingDelete.label}？删除后不可恢复。` : ''
            "
            ok-text="删除"
            cancel-text="再想想"
            danger
            @ok="onConfirmDelete"
            @cancel="onCancelDelete"
          />
        </div>
      </div>
    </transition>

    <!-- PRD v0.4 二期 / spec §6.1：头像裁剪弹层 -->
    <AvatarCropper
      v-model:open="cropperOpen"
      :file="cropperFile"
      @confirm="onCropConfirmed"
      @cancel="onCropCancel"
      @reselect="onCropReselect"
    />

    <!-- PRD v0.4 二期 / spec §6.2：头像放大遮罩（仅头像，不接入照片墙） -->
    <Lightbox
      v-model:open="lightboxOpen"
      :src="lightboxSrc"
      :alt="detail?.name || '头像'"
    />
  </Teleport>
</template>

<style scoped>
.overlay-mask {
  position: fixed;
  inset: 0;
  /* iOS Safari：100vh 不含 safe-area，min-height: 100dvh 兜底，
     让半透明遮罩在动态视口高度（含 home indicator 区）下也铺满。 */
  min-height: 100vh;
  min-height: 100dvh;
  z-index: 8000;
  background: rgba(20, 20, 20, 0.42);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.overlay-sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  /* sheet 贴底，需把高度从 100dvh 中扣掉 home indicator 安全区，
     避免按钮 / 录音 inline 面板被横条遮挡。 */
  max-height: calc(92dvh - env(safe-area-inset-bottom));
  background: var(--color-card);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.15);
  /* iOS 上让 sheet 内部最后一行内容自然避开 home indicator */
  padding-bottom: env(safe-area-inset-bottom);
}

@media (min-width: 768px) {
  /* PC 端居中卡片（plan Q-OVERLAY-MOTION） */
  .overlay-mask {
    align-items: center;
  }
  .overlay-sheet {
    border-radius: 16px;
    max-height: 86vh;
    /* PC 上居中显示，没有贴底诉求，关掉 safe-area padding 避免下沿空白 */
    padding-bottom: 0;
  }
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.sheet-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.mode-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f3f5;
  color: #555;
}
.mode-badge.owner {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.close-btn {
  appearance: none;
  border: none;
  background: none;
  font-size: 26px;
  line-height: 1;
  color: #888;
  padding: 0 6px;
}
.close-btn:hover {
  color: #333;
}

.state-block {
  padding: 36px 24px;
  text-align: center;
  color: var(--color-text-soft);
}
.state-block.error p {
  color: var(--color-error);
  margin: 0 0 12px;
}
.retry-btn {
  appearance: none;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  background: #fff;
  border-radius: 8px;
  padding: 6px 18px;
  font-size: 13px;
}

.sheet-body {
  padding: 18px 18px 26px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* 头像 */
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.avatar-wrap {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 16px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 36px;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  border: 2px solid #fff;
}
.avatar-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-wrap .avatar-img {
  cursor: zoom-in;
}
.avatar-wrap.gender-female {
  background: linear-gradient(135deg, #ffd1d6 0%, #ff7e8b 100%);
}
.avatar-wrap.gender-male {
  background: linear-gradient(135deg, #c5e3ff 0%, #4a90e2 100%);
}
.avatar-wrap.gender-unknown {
  background: linear-gradient(135deg, #e0e0e0 0%, #909090 100%);
}
.avatar-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.avatar-change {
  appearance: none;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  background: #fff;
  border-radius: 999px;
  padding: 6px 18px;
  font-size: 13px;
}
.avatar-change:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.avatar-remove {
  appearance: none;
  border: 1px solid rgba(191, 75, 75, 0.4);
  color: #b54444;
  background: #fff;
  border-radius: 999px;
  padding: 6px 18px;
  font-size: 13px;
}
.avatar-remove:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 通用 section head */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.section-head h3 {
  margin: 0;
  font-size: 14px;
  color: var(--color-text);
  font-weight: 600;
}
.counter {
  font-size: 12px;
  color: var(--color-text-soft);
}
.counter.over {
  color: var(--color-error);
}

/* 自我介绍 */
.intro-textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
  background: #fff;
  resize: vertical;
  min-height: 96px;
}
.intro-textarea:focus {
  outline: 2px solid var(--color-primary-soft);
  border-color: var(--color-primary);
}
.intro-textarea.over {
  border-color: var(--color-error);
}
.intro-readonly {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text);
  line-height: 1.6;
  background: #faf6f4;
  border-radius: 10px;
  padding: 10px 12px;
  min-height: 60px;
}
.intro-status {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-soft);
}
.intro-status.err {
  color: var(--color-error);
}

/* 照片网格 */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.photo-cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #f3f3f5;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}
.photo-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-cell.deletable {
  cursor: pointer;
}
.photo-add {
  appearance: none;
  border: 1.5px dashed var(--color-border);
  background: #fff;
  border-radius: 10px;
  aspect-ratio: 1;
  font-size: 28px;
  color: var(--color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.photo-add:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.photo-add:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.empty-hint {
  margin: 4px 0;
  font-size: 12px;
  color: var(--color-text-soft);
  text-align: center;
}

/* 录音列表 */
.rec-list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rec-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #faf6f4;
  border-radius: 10px;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}
.rec-play {
  appearance: none;
  border: none;
  background: var(--color-primary);
  color: #fff;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rec-play.playing {
  background: #b03a3a;
}
.rec-meta {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.rec-duration {
  font-size: 12px;
  color: var(--color-text-soft);
  flex-shrink: 0;
  width: 36px;
}
.rec-progress {
  flex: 1;
  height: 4px;
  background: #e6e0dd;
  border-radius: 999px;
  overflow: hidden;
}
.rec-progress-bar {
  display: block;
  height: 100%;
  background: var(--color-primary);
  transition: width 0.15s linear;
}
.rec-delete {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #fdecec;
  color: #c94646;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  margin-left: 6px;
}
.rec-delete:hover {
  background: #f7d6d6;
}
.rec-add {
  appearance: none;
  border: 1.5px dashed var(--color-border);
  background: #fff;
  color: var(--color-primary);
  border-radius: 10px;
  padding: 10px 0;
  width: 100%;
  font-size: 13px;
}
.rec-add:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

/* 录音 inline 面板 */
.record-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  border-top: 1px solid var(--color-border);
  padding: 16px 18px max(20px, env(safe-area-inset-bottom));
  box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 10;
}
.record-status {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text);
}
.record-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.btn-rec {
  appearance: none;
  border: none;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 13px;
  cursor: pointer;
}
.btn-rec.primary {
  background: var(--color-primary);
  color: #fff;
}
.btn-rec.danger {
  background: #c94646;
  color: #fff;
}
.btn-rec.ghost {
  background: #f1f3f5;
  color: #555;
}
.btn-rec:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 进出动效（plan Q-OVERLAY-MOTION 方案 A）
 * 移动端：bottom sheet 上滑 + mask 淡入
 * PC 端 (≥768px)：居中卡片 scale 收缩，避免大屏「从底部猛滑」的脱节感
 * prefers-reduced-motion：仅淡入淡出，不做位移 / 缩放
 */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.22s ease;
}
.overlay-fade-enter-active .overlay-sheet,
.overlay-fade-leave-active .overlay-sheet {
  transition: transform 0.24s ease;
}
.overlay-fade-enter-from {
  opacity: 0;
}
.overlay-fade-enter-from .overlay-sheet {
  transform: translateY(24px);
}
.overlay-fade-leave-to {
  opacity: 0;
}
.overlay-fade-leave-to .overlay-sheet {
  transform: translateY(16px);
}

@media (min-width: 768px) {
  .overlay-fade-enter-active .overlay-sheet,
  .overlay-fade-leave-active .overlay-sheet {
    transition: transform 0.22s ease, opacity 0.22s ease;
  }
  .overlay-fade-enter-from .overlay-sheet {
    transform: scale(0.94);
    opacity: 0;
  }
  .overlay-fade-leave-to .overlay-sheet {
    transform: scale(0.96);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .overlay-fade-enter-active .overlay-sheet,
  .overlay-fade-leave-active .overlay-sheet {
    transition: opacity 0.18s ease;
  }
  .overlay-fade-enter-from .overlay-sheet,
  .overlay-fade-leave-to .overlay-sheet {
    transform: none;
    opacity: 0;
  }
}
</style>
