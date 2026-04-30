<script setup lang="ts">
/**
 * src/components/overlays/TeacherOverlay.vue — 老师浮层（spec §1.4 / plan G7）
 *
 * 与学生浮层差异：
 *   - **无自我介绍 / 无照片墙**（PRD 仅要求头像 + 录音）；
 *   - 录音段数**不设上限**（plan Q-PLAN-12 = 默认不限，前端不卡，云函数也不限）；
 *   - 主态判定更严格：必须 `role==='teacher'` 且 `teacherProfile.teacherId === props.teacherId`
 *     才允许 mode='owner'；其它一律 visitor（与 spec Q-TEACHER-OTHER 决议
 *     「默认不允许其他角色 / 游客点开教师浮层」一致；本组件本身仍兼容 visitor，
 *     由父级决定是否开放点击入口）。
 */
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import {
  addTeacherRecording,
  getTeacherDetail,
  removeTeacherRecording,
  updateTeacherAvatar,
  type RecordingRef,
  type TeacherFull,
} from '@/api/teachers'
import { useImageCompress } from '@/composables/useImageCompress'
import { useUpload, uuidShort } from '@/composables/useUpload'
import { canRecord, useRecorder } from '@/composables/useRecorder'
import { useMp3Encode } from '@/composables/useMp3Encode'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { toast } from '@/composables/useToast'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { MAX_RECORDING_SECONDS } from '@/utils/constants'

interface Props {
  open: boolean
  teacherId: number | null
  mode?: 'owner' | 'visitor'
}
const props = withDefaults(defineProps<Props>(), {
  mode: 'visitor',
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'updated'): void
}>()

const authStore = useAuthStore()
const { role, teacherProfile, token } = storeToRefs(authStore)

const effectiveMode = computed<'owner' | 'visitor'>(() => {
  if (typeof props.teacherId !== 'number') return 'visitor'
  if (role.value !== 'teacher') return 'visitor'
  if (teacherProfile.value?.teacherId !== props.teacherId) return 'visitor'
  return props.mode === 'owner' ? 'owner' : 'visitor'
})

/* -------------------- 详情数据 -------------------- */
const detail = ref<TeacherFull | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)

async function loadDetail(id: number): Promise<void> {
  loading.value = true
  loadError.value = null
  detail.value = null
  try {
    detail.value = await getTeacherDetail(id)
  } catch (e) {
    loadError.value = (e as Error).message || '加载失败'
  } finally {
    loading.value = false
  }
}

function retryLoad(): void {
  if (typeof props.teacherId === 'number') void loadDetail(props.teacherId)
}

watch(
  () => [props.open, props.teacherId] as const,
  ([open, id]) => {
    if (open && typeof id === 'number') {
      void loadDetail(id)
    } else if (!open) {
      audioPlayer.stop()
      if (recorder.status.value === 'recording') recorder.cancel()
      recordingPanelOpen.value = false
      pendingDelete.value = null
      confirmOpen.value = false
    }
  },
)

function close(): void {
  emit('update:open', false)
}

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
  if (!file || !detail.value || !token.value) return
  const tid = toast.loading('正在更新头像…')
  try {
    const compressed = await compressor.compress(file)
    const cloudPath = `teachers/${detail.value.id}/avatar/${uuidShort()}.${guessExt(compressed)}`
    const result = await avatarUploader.upload({
      cloudPath,
      file: compressed,
      kind: 'avatar',
    })
    const r = await updateTeacherAvatar({
      token: token.value,
      fileID: result.fileID,
      url: result.url,
      teacherId: detail.value.id,
    })
    if (detail.value) detail.value.avatar = r.avatar
    toast.success('头像已更新')
    emit('updated')
  } catch (err) {
    toast.error((err as Error).message || '头像上传失败')
  } finally {
    toast.dismiss(tid)
  }
}

function guessExt(file: File | Blob): string {
  const t = (file as File).type || ''
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  return 'jpg'
}

/* -------------------- 长按删除（仅录音） -------------------- */
const pendingDelete = ref<{ id: string; label: string } | null>(null)
const confirmOpen = ref(false)
const LONG_PRESS_MS = 600
let longPressTimer: ReturnType<typeof setTimeout> | null = null

function onLongPressStart(target: { id: string; label: string }): void {
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
  const tid = toast.loading('删除中…')
  try {
    const target = pendingDelete.value
    const rec = detail.value.recordings.find((x) => x.id === target.id)
    if (rec && audioPlayer.isPlaying(rec.url)) audioPlayer.stop()
    const r = await removeTeacherRecording({
      token: token.value,
      recordingId: target.id,
      teacherId: detail.value.id,
    })
    detail.value.recordings = r.recordings
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

/* -------------------- 录音 inline 面板 -------------------- */
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

const canAddRecording = computed(() => effectiveMode.value === 'owner')
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
    const cloudPath = `teachers/${detail.value.id}/recording/${uuidShort()}.mp3`
    const result = await recordingUploader.upload({
      cloudPath,
      file: enc.blob,
      kind: 'recording',
    })
    const duration = Math.max(1, Math.round(enc.duration))
    const r = await addTeacherRecording({
      token: token.value,
      fileID: result.fileID,
      url: result.url,
      duration,
      teacherId: detail.value.id,
    })
    detail.value.recordings = r.recordings
    toast.success('录音已添加')
    emit('updated')
    recorder.cancel()
    recordingPanelOpen.value = false
  } catch (err) {
    toast.error((err as Error).message || '录音上传失败')
  } finally {
    toast.dismiss(tid)
    recordingBusy.value = false
  }
}

/* -------------------- 录音播放 -------------------- */
async function togglePlay(rec: RecordingRef): Promise<void> {
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

function recIdOf(r: RecordingRef): string {
  // seed 阶段可能没 id，回落用 url 作为长按 / 删除 key（删除接口走 id；
  // 缺 id 时按钮自然走 visitor 长按禁用 + 不走删除 path）
  return r.id ?? r.url
}

const ROLE_LABEL: Record<TeacherFull['role'], string> = {
  lead: '主班',
  assistant: '配班',
  life: '生活',
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
              <span v-else-if="props.teacherId !== null">老师 #{{ props.teacherId }}</span>
              <span v-if="detail" class="role-badge">{{ ROLE_LABEL[detail.role] }}老师</span>
              <span class="mode-badge" :class="effectiveMode">
                {{ effectiveMode === 'owner' ? '主态' : '只读' }}
              </span>
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
              <div class="avatar-wrap">
                <img v-if="detail.avatar?.url" :src="detail.avatar.url" :alt="detail.name" />
                <span v-else class="avatar-initial">{{ Array.from(detail.name)[0] || '师' }}</span>
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
              <input
                ref="avatarInputRef"
                type="file"
                accept="image/*"
                hidden
                @change="onAvatarPicked"
              />
            </section>

            <!-- 录音 -->
            <section class="recordings-section">
              <div class="section-head">
                <h3>录音</h3>
                <span v-if="detail.recordings.length" class="counter">
                  共 {{ detail.recordings.length }} 段
                </span>
              </div>
              <ul v-if="detail.recordings.length" class="rec-list">
                <li
                  v-for="r in detail.recordings"
                  :key="recIdOf(r)"
                  class="rec-item"
                  :class="{ deletable: effectiveMode === 'owner' && r.id }"
                  @pointerdown="
                    r.id && onLongPressStart({ id: r.id, label: '这段录音' })
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
  </Teleport>
</template>

<style scoped>
.overlay-mask {
  position: fixed;
  inset: 0;
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
  max-height: 92vh;
  background: var(--color-card);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.15);
}
@media (min-width: 768px) {
  .overlay-mask {
    align-items: center;
  }
  .overlay-sheet {
    border-radius: 16px;
    max-height: 86vh;
  }
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}
.sheet-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.role-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #faf2ec;
  color: #b07b3a;
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
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, #faf2ec 0%, #d8b48a 100%);
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

/* section head 复用 */
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
.empty-hint {
  margin: 4px 0;
  font-size: 12px;
  color: var(--color-text-soft);
  text-align: center;
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
</style>
