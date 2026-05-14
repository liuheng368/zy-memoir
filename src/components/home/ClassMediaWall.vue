<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import Lightbox from '@/components/common/Lightbox.vue'
import { addClassMedia, listClassMedia, type ClassMediaItem } from '@/api/classMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useImageCompress } from '@/composables/useImageCompress'
import { useMp3Encode } from '@/composables/useMp3Encode'
import { canRecord, useRecorder } from '@/composables/useRecorder'
import { toast } from '@/composables/useToast'
import { useUpload, uuidShort } from '@/composables/useUpload'
import { useAuthStore } from '@/stores/auth'
import {
  MAX_CLASS_MEDIA_PHOTOS,
  MAX_CLASS_MEDIA_RECORDINGS,
  MAX_RECORDING_SECONDS,
} from '@/utils/constants'
import { proxiedMediaUrl } from '@/utils/mediaUrl'

type Status = 'idle' | 'loading' | 'ready' | 'error'

const auth = useAuthStore()
const { role, token, displayName, studentProfile, teacherProfile } = storeToRefs(auth)

const items = ref<ClassMediaItem[]>([])
const status = ref<Status>('idle')
const error = ref<string | null>(null)
const photoInputRef = ref<HTMLInputElement | null>(null)
const uploadingPhoto = ref(false)
const savingRecording = ref(false)
const lightboxOpen = ref(false)
const lightboxSrc = ref('')
const lightboxAlt = ref('')

const uploader = useUpload()
const imageCompress = useImageCompress()
const recorder = useRecorder()
const mp3 = useMp3Encode()
const audioPlayer = useAudioPlayer()

const isLoggedIn = computed(
  () => role.value === 'student' || role.value === 'teacher' || role.value === 'admin',
)
const ownerKey = computed(() => {
  if (role.value === 'student') return `student-${studentProfile.value?.studentId ?? 'unknown'}`
  if (role.value === 'teacher') return `teacher-${teacherProfile.value?.teacherId ?? 'unknown'}`
  if (role.value === 'admin') return 'admin'
  return 'guest'
})
const myItems = computed(() => {
  if (!isLoggedIn.value) return []
  if (role.value === 'admin') return items.value.filter((it) => it.ownerRole === 'admin')
  if (role.value === 'student') {
    return items.value.filter((it) => it.ownerKey === `student:${studentProfile.value?.studentId}`)
  }
  if (role.value === 'teacher') {
    return items.value.filter((it) => it.ownerKey === `teacher:${teacherProfile.value?.teacherId}`)
  }
  return []
})
const myPhotoCount = computed(() => myItems.value.filter((it) => it.type === 'photo').length)
const myRecordingCount = computed(
  () => myItems.value.filter((it) => it.type === 'recording').length,
)
const canUploadPhoto = computed(
  () => isLoggedIn.value && myPhotoCount.value < MAX_CLASS_MEDIA_PHOTOS,
)
const canUploadRecording = computed(
  () => isLoggedIn.value && myRecordingCount.value < MAX_CLASS_MEDIA_RECORDINGS,
)
const canUseRecorder = computed(() => canRecord())
const isRecording = computed(() => recorder.status.value === 'recording')

const shuffledItems = computed(() => {
  return [...items.value].sort((a, b) => stableWeight(a) - stableWeight(b))
})

onMounted(() => {
  void refresh()
})

async function refresh(): Promise<void> {
  status.value = 'loading'
  error.value = null
  try {
    items.value = await listClassMedia()
    status.value = 'ready'
  } catch (e) {
    error.value = (e as Error)?.message || '加载失败'
    status.value = 'error'
  }
}

function stableWeight(item: ClassMediaItem): number {
  const s = `${item.id}:${item.createdAt}:${item.ownerKey}`
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function tileClass(item: ClassMediaItem): string {
  const n = stableWeight(item) % 7
  if (item.type === 'recording') return n % 2 === 0 ? 'voice-wide' : 'voice'
  if (n === 0) return 'photo-large'
  if (n === 1 || n === 2) return 'photo-tall'
  return 'photo'
}

function mediaSrc(url: string): string {
  return proxiedMediaUrl(url) || url
}

function guessExt(file: File | Blob): string {
  const t = (file as File).type || ''
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  return 'jpg'
}

function openLogin(): void {
  auth.openLoginPanel()
}

function pickPhoto(): void {
  if (!token.value) {
    openLogin()
    return
  }
  if (!canUploadPhoto.value) {
    toast.error(`图片最多 ${MAX_CLASS_MEDIA_PHOTOS} 张`)
    return
  }
  photoInputRef.value?.click()
}

async function onPhotoSelected(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !token.value) return
  if (!file.type.startsWith('image/')) {
    toast.error('请选择图片文件')
    return
  }
  const tid = toast.loading('正在上传图片…')
  uploadingPhoto.value = true
  try {
    const compressed = await imageCompress.compress(file)
    const result = await uploader.upload({
      cloudPath: `class-media/${ownerKey.value}/photos/${uuidShort()}.${guessExt(compressed)}`,
      file: compressed,
      kind: 'photo',
      retries: 1,
    })
    const saved = await addClassMedia({
      token: token.value,
      type: 'photo',
      fileID: result.fileID,
      url: result.url,
    })
    items.value = [saved.item, ...items.value]
    toast.success('图片已加入回忆墙')
  } catch (e) {
    toast.error((e as Error)?.message || '图片上传失败')
  } finally {
    uploadingPhoto.value = false
    toast.dismiss(tid)
  }
}

async function startRecording(): Promise<void> {
  if (!token.value) {
    openLogin()
    return
  }
  if (!canUploadRecording.value) {
    toast.error(`语音最多 ${MAX_CLASS_MEDIA_RECORDINGS} 条`)
    return
  }
  if (!canUseRecorder.value) {
    toast.error('当前浏览器不支持录音')
    return
  }
  try {
    recorder.maxSeconds.value = MAX_RECORDING_SECONDS
    await recorder.start()
  } catch (e) {
    toast.error((e as Error)?.message || '无法开始录音')
  }
}

async function stopAndSaveRecording(): Promise<void> {
  if (!token.value || recorder.status.value !== 'recording') return
  const tid = toast.loading('正在保存语音…')
  savingRecording.value = true
  try {
    const raw = await recorder.stop()
    const encoded = await mp3.encode(raw)
    const result = await uploader.upload({
      cloudPath: `class-media/${ownerKey.value}/recordings/${uuidShort()}.mp3`,
      file: encoded.blob,
      kind: 'recording',
      retries: 1,
    })
    const saved = await addClassMedia({
      token: token.value,
      type: 'recording',
      fileID: result.fileID,
      url: result.url,
      duration: encoded.duration,
    })
    items.value = [saved.item, ...items.value]
    toast.success('语音已加入回忆墙')
  } catch (e) {
    toast.error((e as Error)?.message || '语音上传失败')
  } finally {
    savingRecording.value = false
    toast.dismiss(tid)
  }
}

function cancelRecording(): void {
  recorder.cancel()
}

function openImage(item: ClassMediaItem): void {
  lightboxSrc.value = mediaSrc(item.url)
  lightboxAlt.value = `${item.ownerName || '同学'} 上传的图片`
  lightboxOpen.value = true
}

async function toggleRecording(item: ClassMediaItem): Promise<void> {
  try {
    await audioPlayer.toggle(mediaSrc(item.url))
  } catch {
    toast.error('语音播放失败')
  }
}

function formatDuration(sec?: number): string {
  const n = Math.max(0, Math.round(sec || 0))
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <section class="class-media-wall">
    <header class="wall-head">
      <div>
        <h2>回忆散落</h2>
        <p>照片和语音会随机铺在这里，像一面会慢慢长大的班级墙。</p>
      </div>
      <button type="button" class="refresh-btn" :disabled="status === 'loading'" @click="refresh">
        刷新
      </button>
    </header>

    <div class="composer">
      <div class="quota">
        <strong>{{ isLoggedIn ? displayName : '登录后上传' }}</strong>
        <span>图片 {{ myPhotoCount }} / {{ MAX_CLASS_MEDIA_PHOTOS }}</span>
        <span>语音 {{ myRecordingCount }} / {{ MAX_CLASS_MEDIA_RECORDINGS }}</span>
      </div>
      <div class="actions">
        <button
          type="button"
          class="action-btn"
          :disabled="uploadingPhoto || !canUploadPhoto"
          @click="pickPhoto"
        >
          上传图片
        </button>
        <button
          v-if="!isRecording"
          type="button"
          class="action-btn primary"
          :disabled="savingRecording || !canUploadRecording || !canUseRecorder"
          @click="startRecording"
        >
          录语音
        </button>
        <template v-else>
          <button
            type="button"
            class="action-btn primary"
            :disabled="savingRecording"
            @click="stopAndSaveRecording"
          >
            保存 {{ recorder.elapsed.value }}s
          </button>
          <button
            type="button"
            class="action-btn"
            :disabled="savingRecording"
            @click="cancelRecording"
          >
            取消
          </button>
        </template>
        <button v-if="!isLoggedIn" type="button" class="link-btn" @click="openLogin">去登录</button>
      </div>
      <input ref="photoInputRef" type="file" accept="image/*" hidden @change="onPhotoSelected" />
    </div>

    <div v-if="status === 'loading' && !items.length" class="state">正在整理回忆…</div>
    <div v-else-if="status === 'error'" class="state error">
      <span>{{ error || '加载失败' }}</span>
      <button type="button" @click="refresh">重试</button>
    </div>
    <div v-else-if="!items.length" class="state">还没有照片或语音，第一条可以从这里开始。</div>

    <div v-else class="media-grid">
      <article
        v-for="item in shuffledItems"
        :key="item.id"
        class="media-card"
        :class="tileClass(item)"
      >
        <button
          v-if="item.type === 'photo'"
          type="button"
          class="photo-btn"
          :aria-label="`查看 ${item.ownerName} 上传的图片`"
          @click="openImage(item)"
        >
          <img :src="mediaSrc(item.url)" :alt="`${item.ownerName} 上传的图片`" loading="lazy" />
        </button>
        <button
          v-else
          type="button"
          class="voice-btn"
          :class="{ playing: audioPlayer.isPlaying(mediaSrc(item.url)) }"
          @click="toggleRecording(item)"
        >
          <span class="play-icon">{{
            audioPlayer.isPlaying(mediaSrc(item.url)) ? '暂停' : '播放'
          }}</span>
          <span class="voice-meta">
            <strong>{{ item.ownerName || '匿名' }}</strong>
            <small>{{ formatDuration(item.duration) }}</small>
          </span>
          <span class="voice-bar">
            <i :style="{ width: `${audioPlayer.progress(mediaSrc(item.url)) * 100}%` }"></i>
          </span>
        </button>
        <footer class="media-foot">
          <span>{{ item.ownerName || '匿名' }}</span>
          <span>{{ item.type === 'photo' ? '图片' : '语音' }}</span>
        </footer>
      </article>
    </div>

    <Lightbox v-model:open="lightboxOpen" :src="lightboxSrc" :alt="lightboxAlt" />
  </section>
</template>

<style scoped>
.class-media-wall {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 16px;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.wall-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.wall-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}

.wall-head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-soft);
}

.refresh-btn,
.action-btn,
.link-btn {
  min-height: 36px;
  border: 1px solid rgba(255, 122, 142, 0.32);
  background: #fff;
  color: var(--color-text);
  border-radius: 999px;
  padding: 0 14px;
  font-size: 13px;
  cursor: pointer;
}

.action-btn.primary {
  background: #ff7a8e;
  color: #fff;
  border-color: #ff7a8e;
}

.action-btn:disabled,
.refresh-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.link-btn {
  color: #ff6c80;
}

.composer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, rgba(255, 248, 245, 0.95), rgba(238, 250, 245, 0.9));
}

.quota {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--color-text-soft);
}

.quota strong {
  font-size: 14px;
  color: var(--color-text);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.state {
  min-height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-soft);
  border: 1px dashed rgba(255, 122, 142, 0.28);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.state.error {
  color: #b42318;
}

.state button {
  border: none;
  background: transparent;
  color: #ff6c80;
  cursor: pointer;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-auto-rows: 74px;
  grid-auto-flow: dense;
  gap: 10px;
}

.media-card {
  position: relative;
  overflow: hidden;
  min-width: 0;
  border-radius: var(--radius-md);
  background: #fff8f5;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.media-card.photo {
  grid-column: span 2;
  grid-row: span 2;
}

.media-card.photo-large {
  grid-column: span 3;
  grid-row: span 3;
}

.media-card.photo-tall {
  grid-column: span 2;
  grid-row: span 3;
}

.media-card.voice {
  grid-column: span 2;
  grid-row: span 1;
}

.media-card.voice-wide {
  grid-column: span 3;
  grid-row: span 1;
}

.photo-btn,
.voice-btn {
  width: 100%;
  height: 100%;
  border: none;
  padding: 0;
  cursor: pointer;
  display: block;
  background: transparent;
}

.photo-btn img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transition: transform 0.18s ease;
}

.photo-btn:hover img {
  transform: scale(1.035);
}

.voice-btn {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 12px;
  text-align: left;
  background: linear-gradient(135deg, #e9f7f0, #fff8f5);
}

.voice-btn.playing {
  background: linear-gradient(135deg, #ffe2e8, #edf9f3);
}

.play-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 32px;
  border-radius: 999px;
  background: #fff;
  color: #ff6c80;
  font-size: 12px;
  font-weight: 600;
}

.voice-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.voice-meta strong,
.media-foot span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-meta strong {
  color: var(--color-text);
  font-size: 13px;
}

.voice-meta small {
  color: var(--color-text-soft);
  font-size: 11px;
}

.voice-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 8px;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 122, 142, 0.18);
}

.voice-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #ff7a8e;
}

.media-foot {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}

.media-card.voice .media-foot,
.media-card.voice-wide .media-foot {
  display: none;
}

@media (max-width: 760px) {
  .class-media-wall {
    padding: 16px 12px;
    border-radius: var(--radius-md);
  }

  .wall-head,
  .composer {
    flex-direction: column;
    align-items: stretch;
  }

  .actions {
    justify-content: flex-start;
  }

  .media-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: 68px;
    gap: 8px;
  }

  .media-card.photo,
  .media-card.photo-tall {
    grid-column: span 2;
    grid-row: span 2;
  }

  .media-card.photo-large,
  .media-card.voice-wide {
    grid-column: span 4;
  }

  .media-card.photo-large {
    grid-row: span 3;
  }

  .media-card.voice {
    grid-column: span 4;
  }
}

@media (max-width: 380px) {
  .media-grid {
    grid-auto-rows: 62px;
  }

  .action-btn,
  .link-btn,
  .refresh-btn {
    padding: 0 12px;
  }
}
</style>
