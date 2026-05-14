<script setup lang="ts">
/**
 * 路由 `/admin` 主页合影管理页（plan G9 / Q-PLAN-18 / Q-PLAN-22）
 *
 * v0.6 双角色入口（PRD v0.4 / spec v0.6）：
 * - **管理员**：`/admin?token=<HMAC>` → onMounted 调 `adminCheck` 校验 token → setAdmin；
 * - **老师**：从 `/teacher` 登录后已持 `AUTH_HMAC_KEY` token → 跳过 `adminCheck`，直接 fetchBanners；
 * - 路由守卫（src/router/index.ts）已拦掉 guest / 学生 / 无 token / 无 canManageBanners 三类；
 * - 通过 → 展示主页合影网格 + 上传（caption + 压缩 + 进度）+ 删除（二次确认）；
 * - 老师 / 管理员**操作权限完全等同**：可删除任意合影（含他人上传）。
 *
 * 数据来源：useClassDataStore.banners（与 Home.vue 共享同一份引用，
 * 上传 / 删除直接 mutate `banners.data`，主页轮播自动刷新）。
 *
 * 写入路径（plan API-19）：
 *   1. useImageCompress.compress(file) → ≤ 3 MB
 *   2. useUpload.upload({ cloudPath: `banners/<yyyy-MM>/<uuid>.<ext>` })
 *   3. addBanner({ token, fileID, url, caption })  → 云函数双 HMAC key 验签 + 写库
 *   4. unshift 到 banners.data 头部（与云端 orderBy createdAt desc 一致）
 *
 * 删除路径：ConfirmDialog → removeBanner({ token, bannerId })
 *   → 同步 splice store；云函数侧 `app.deleteFile` 已静默吞错
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useClassDataStore } from '@/stores/classData'
import { adminCheck, AuthApiError } from '@/api/auth'
import {
  addBanner,
  BannerApiError,
  removeBanner,
  type Banner,
} from '@/api/banners'
import { useImageCompress } from '@/composables/useImageCompress'
import { useUpload, uuidShort } from '@/composables/useUpload'
import { useToast } from '@/composables/useToast'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { MAX_IMAGE_BYTES, ROUTES } from '@/utils/constants'
import { proxiedMediaUrl } from '@/utils/mediaUrl'
import { isNetworkError, networkErrorMessage } from '@/utils/network'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const classData = useClassDataStore()
const { toast } = useToast()

/* -------------------- token 校验骨架（沿用 G2） -------------------- */
const checking = ref(false)
const checkError = ref('')

const tokenInQuery = computed(() => {
  const t = route.query.token
  return typeof t === 'string' ? t.trim() : ''
})

async function verifyAdmin(token: string) {
  checking.value = true
  checkError.value = ''
  try {
    const res = await adminCheck(token)
    auth.setAdmin({ token: res.token })
  } catch (e) {
    if (e instanceof AuthApiError) {
      checkError.value =
        e.code === 'EXPIRED_TOKEN'
          ? '管理员 token 已过期，请联系负责人重新签发'
          : '管理员 token 校验失败'
    } else {
      checkError.value = (e as Error)?.message || '校验异常，请稍后重试'
    }
  } finally {
    checking.value = false
  }
}

onMounted(async () => {
  // v0.6 双角色入口：
  // 1) 老师 / 管理员已持 token（canManageBanners=true）→ 直接拉数据，跳过 adminCheck；
  // 2) 否则若 query 带 ?token= → 走 adminCheck 把游客 / 未初始化升级为 admin；
  // 3) 校验通过后拉合影。
  if (!auth.canManageBanners && tokenInQuery.value) {
    await verifyAdmin(tokenInQuery.value)
  }
  if (auth.canManageBanners) {
    await classData.fetchBanners()
  }
})

function backHome() {
  router.push(ROUTES.HOME)
}

/* -------------------- G9 合影管理 -------------------- */
const compressor = useImageCompress()
const uploader = useUpload()
const { status: uploadStatus, progress: uploadProgress } = uploader
const fileInputRef = ref<HTMLInputElement | null>(null)
const captionDraft = ref('')
const submitting = ref(false)

const bannersState = computed(() => classData.banners)
const bannerList = computed(() => classData.banners.data)
const bannerCount = computed(() => bannerList.value.length)
const isLoadingBanners = computed(
  () => bannersState.value.status === 'loading' || bannersState.value.status === 'idle',
)
const isErrorBanners = computed(() => bannersState.value.status === 'error')

function pickFile() {
  if (submitting.value) return
  fileInputRef.value?.click()
}

function imageSrc(url: string): string {
  return proxiedMediaUrl(url) || url
}

async function refreshBanners() {
  await classData.fetchBanners(true)
}

async function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!auth.token) {
    toast.error('登录态缺失，请刷新页面')
    return
  }
  if (!/^image\//.test(file.type)) {
    toast.error('请选择图片文件')
    return
  }
  const trimmed = captionDraft.value.trim().slice(0, 60)
  // G11：把单次上传抽成可重入闭包，弱网失败 toast 的「重试」按钮直接调用它
  await doUploadBanner(file, trimmed)
}

async function doUploadBanner(file: File, caption: string) {
  if (!auth.token) {
    toast.error('登录态缺失，请刷新页面')
    return
  }
  submitting.value = true
  const tid = toast.loading('正在上传合影…')
  try {
    const compressed = await compressor.compress(file)
    if (compressed.size > MAX_IMAGE_BYTES) {
      throw new Error('压缩后仍超过 3 MB，建议换张更小的图')
    }
    const now = new Date()
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const cloudPath = `banners/${yyyyMm}/${uuidShort()}.${guessExt(compressed)}`
    const result = await uploader.upload({
      cloudPath,
      file: compressed,
      kind: 'banner',
    })
    const r = await addBanner({
      token: auth.token,
      fileID: result.fileID,
      url: result.url,
      caption: caption || undefined,
    })
    // unshift：与 listBanners orderBy createdAt desc 顺序保持一致
    classData.banners.data.unshift(r.banner)
    captionDraft.value = ''
    toast.success('合影已上传')
  } catch (err) {
    const fallback =
      err instanceof BannerApiError
        ? err.message || '上传失败，请稍后重试'
        : (err as Error)?.message || '上传失败，请稍后重试'
    // 弱网类提示走「重试」action（不自动消失），其它走默认错误 toast
    if (isNetworkError(err)) {
      toast.errorWithRetry(networkErrorMessage(err, fallback), () =>
        doUploadBanner(file, caption),
      )
    } else {
      toast.error(fallback)
    }
  } finally {
    toast.dismiss(tid)
    submitting.value = false
  }
}

function guessExt(file: File | Blob): string {
  const t = (file as File).type || ''
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  return 'jpg'
}

/* ---- 删除：长按 / 显式 ✕ → ConfirmDialog ---- */
const confirmState = reactive({
  open: false,
  target: null as Banner | null,
  busy: false,
})

function askRemove(b: Banner) {
  if (confirmState.busy) return
  confirmState.target = b
  confirmState.open = true
}

async function doRemove() {
  const target = confirmState.target
  if (!target || !auth.token) return
  confirmState.busy = true
  const tid = toast.loading('正在删除…')
  try {
    await removeBanner({ token: auth.token, bannerId: target.id })
    const idx = classData.banners.data.findIndex((x) => x.id === target.id)
    if (idx >= 0) classData.banners.data.splice(idx, 1)
    toast.success('已删除')
  } catch (err) {
    const msg =
      err instanceof BannerApiError
        ? err.message || '删除失败，请稍后重试'
        : (err as Error)?.message || '删除失败，请稍后重试'
    toast.error(msg)
  } finally {
    toast.dismiss(tid)
    confirmState.busy = false
    confirmState.target = null
  }
}

function onConfirmCancel() {
  confirmState.target = null
}
</script>

<template>
  <main class="admin">
    <header class="topbar">
      <button class="back" @click="backHome">← 返回主页</button>
      <h1>主页合影管理</h1>
    </header>

    <section v-if="checking" class="placeholder">
      <p>正在校验登录态…</p>
    </section>

    <section v-else-if="checkError" class="placeholder error-box">
      <h2>校验失败</h2>
      <p>{{ checkError }}</p>
      <button class="primary" @click="backHome">返回主页</button>
    </section>

    <template v-else-if="auth.canManageBanners">
      <!-- 上传区 -->
      <section class="card upload-card">
        <h2>主页合影管理</h2>
        <p class="hint">
          已上传 {{ bannerCount }} 张。新合影会出现在主页轮播头部，
          单张会自动压缩到 3 MB 以内。
        </p>

        <label class="caption-label" for="caption-input">备注 / 标题（可选，≤ 60）</label>
        <textarea
          id="caption-input"
          v-model="captionDraft"
          class="caption-input"
          maxlength="60"
          rows="2"
          placeholder="例如：2024 春游 · 西湖植物园"
          :disabled="submitting"
        ></textarea>

        <div class="upload-row">
          <button
            type="button"
            class="primary"
            :disabled="submitting"
            @click="pickFile"
          >
            {{ submitting ? '上传中…' : '选择图片上传' }}
          </button>
          <span v-if="submitting" class="progress" aria-live="polite">
            {{ uploadStatus === 'uploading' ? `${uploadProgress}%` : '处理中…' }}
          </span>
        </div>
        <input
          ref="fileInputRef"
          class="visually-hidden"
          type="file"
          accept="image/*"
          @change="onFilePicked"
        />
      </section>

      <!-- 网格区 -->
      <section class="card grid-card">
        <header class="grid-header">
          <h3>合影网格</h3>
          <button
            type="button"
            class="link"
            :disabled="isLoadingBanners"
            @click="refreshBanners"
          >
            刷新
          </button>
        </header>

        <div v-if="isLoadingBanners" class="empty">加载中…</div>
        <div v-else-if="isErrorBanners" class="empty error">
          加载失败：{{ bannersState.error || '未知错误' }}
        </div>
        <div v-else-if="bannerCount === 0" class="empty">
          还没有上传合影，点击上方按钮添加第一张吧
        </div>
        <ul v-else class="grid">
          <li v-for="b in bannerList" :key="b.id" class="cell">
            <div class="img-wrap">
              <img :src="imageSrc(b.url)" :alt="b.caption ?? '合影'" loading="lazy" />
              <button
                type="button"
                class="remove-btn"
                :disabled="confirmState.busy"
                aria-label="删除合影"
                @click="askRemove(b)"
              >
                ✕
              </button>
            </div>
            <p v-if="b.caption" class="caption">{{ b.caption }}</p>
            <p v-else class="caption muted">（无备注）</p>
          </li>
        </ul>
      </section>
    </template>

    <section v-else class="placeholder">
      <p>等待校验…</p>
    </section>

    <ConfirmDialog
      v-model:open="confirmState.open"
      title="删除合影"
      :content="
        confirmState.target?.caption
          ? `确定删除「${confirmState.target.caption}」？此操作不可撤销`
          : '确定删除这张合影？此操作不可撤销'
      "
      ok-text="删除"
      cancel-text="取消"
      :danger="true"
      @ok="doRemove"
      @cancel="onConfirmCancel"
    />
  </main>
</template>

<style scoped>
.admin {
  min-height: 100vh;
  min-height: 100dvh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--color-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.topbar h1 {
  margin: 0;
  font-size: 16px;
  min-width: 0;
}

.back {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 13px;
  padding: 4px 8px;
  cursor: pointer;
}

.placeholder {
  background: var(--color-card);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 24px 16px;
  text-align: center;
  color: var(--color-text-soft);
}

.placeholder h2 {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--color-text);
}

.placeholder p {
  margin: 0 0 8px;
  font-size: 13px;
}

.error-box {
  border-color: #ffccc7;
  color: #d4380d;
}

.card {
  background: var(--color-card);
  border-radius: var(--radius-md);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.upload-card h2 {
  margin: 0 0 6px;
  font-size: 16px;
  color: var(--color-text);
}

.hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--color-text-soft);
  line-height: 1.5;
}

.caption-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-soft);
  margin-bottom: 4px;
}

.caption-input {
  width: 100%;
  resize: vertical;
  font: inherit;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  background: #fff;
  color: var(--color-text);
  box-sizing: border-box;
}

.caption-input:focus {
  outline: 2px solid var(--color-primary-soft);
  border-color: var(--color-primary);
}

.upload-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress {
  font-size: 12px;
  color: var(--color-text-soft);
}

.primary {
  padding: 8px 20px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.primary:hover {
  background: var(--color-primary-strong, #3f7a51);
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.grid-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.grid-header h3 {
  margin: 0;
  font-size: 15px;
  color: var(--color-text);
}

.link {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
}

.link:disabled {
  color: var(--color-text-soft);
  cursor: not-allowed;
}

.empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--color-text-soft);
  font-size: 13px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.empty.error {
  border-color: #ffccc7;
  color: #d4380d;
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.img-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-primary-soft);
}

.img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.remove-btn:hover:not(:disabled) {
  background: rgba(201, 70, 70, 0.9);
}

.remove-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.caption {
  margin: 0;
  font-size: 12px;
  color: var(--color-text);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caption.muted {
  color: var(--color-text-soft);
  font-style: italic;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  border: 0;
}

@media (max-width: 480px) {
  .admin {
    padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
  }

  .topbar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
  }

  .topbar h1 {
    width: 100%;
  }

  .card {
    padding: 14px;
  }

  .caption-input {
    font-size: 16px;
  }

  .upload-row {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .primary {
    width: 100%;
    min-height: 42px;
  }

  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 360px) {
  .admin {
    padding-left: 8px;
    padding-right: 8px;
  }

  .grid {
    gap: 8px;
  }

  .remove-btn {
    width: 28px;
    height: 28px;
  }
}
</style>
