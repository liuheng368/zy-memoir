<script setup lang="ts">
/**
 * 老师卡片（plan M-③ 子件）
 *
 * 内容：
 *   - 圆形头像（缺省 → 首字符色块）
 *   - 姓名 + 角色标签（主班 / 配班 / 生活老师）
 *   - 录音条：圆形播放钮 + 时长 + 简短波形；G4 起接通 useAudioPlayer 互斥单例
 *     （同一时刻全站只 1 条录音在播；切歌时旧的自动暂停）。
 *
 * 事件：
 *   - `click-avatar` → Home.vue 决定是否开启 G7 教师浮层
 *   - `play-recording` (teacher, index) → 仍向上抛 informational，便于父级埋点
 *     （播放本身已由本组件直接调 useAudioPlayer 完成，父级无需再处理）
 */
import { computed } from 'vue'
import type { TeacherFull } from '@/api/teachers'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { toast } from '@/composables/useToast'
import { defaultTeacherAvatar } from '@/utils/defaultAvatar'
import { proxiedMediaUrl } from '@/utils/mediaUrl'

const props = defineProps<{
  teacher: TeacherFull
}>()

const emit = defineEmits<{
  (e: 'click-avatar', teacher: TeacherFull): void
  (e: 'play-recording', payload: { teacher: TeacherFull; index: number }): void
}>()

const player = useAudioPlayer()

async function onPlayClick(index: number, url: string): Promise<void> {
  emit('play-recording', { teacher: props.teacher, index })
  if (!url) {
    toast.error('录音文件不可用')
    return
  }
  try {
    await player.toggle(url)
  } catch {
    toast.error('播放失败')
  }
}

const roleLabel = computed(() => {
  switch (props.teacher.role) {
    case 'lead':
      return '主班老师'
    case 'assistant':
      return '配班老师'
    case 'life':
      return '生活老师'
    default:
      return '老师'
  }
})

/** 头像 src 兜底链：上传图 → 默认 SVG（plan G11） */
const avatarSrc = computed(() => proxiedMediaUrl(props.teacher.avatar?.url) || defaultTeacherAvatar())

/** 把 60s 内的整秒转成 0:42 这种文案 */
function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
</script>

<template>
  <article class="teacher-card">
    <button
      type="button"
      class="avatar"
      :data-role="teacher.role"
      :aria-label="`${roleLabel} ${teacher.name}`"
      @click="$emit('click-avatar', teacher)"
    >
      <img :src="avatarSrc" :alt="teacher.name" decoding="async" />
    </button>

    <div class="meta">
      <h3 class="name">{{ teacher.name }}</h3>
      <span class="role-tag" :data-role="teacher.role">{{ roleLabel }}</span>
    </div>

    <!-- 录音条占位 -->
    <ul v-if="teacher.recordings.length" class="recordings">
      <li
        v-for="(r, i) in teacher.recordings"
        :key="r.url || i"
        class="rec"
      >
        <button
          type="button"
          class="play-btn"
          :class="{ playing: player.isPlaying(r.url) }"
          :aria-label="`${player.isPlaying(r.url) ? '暂停' : '播放'}第 ${i + 1} 段录音 ${fmtDuration(r.duration)}`"
          @click="onPlayClick(i, r.url)"
        >
          {{ player.isPlaying(r.url) ? '⏸' : '▶' }}
        </button>
        <span class="wave" aria-hidden="true">
          <i v-for="b in 12" :key="b" :style="{ height: 30 + ((i * 7 + b * 11) % 60) + '%' }"></i>
        </span>
        <span class="dur">{{ fmtDuration(r.duration) }}</span>
      </li>
    </ul>
    <p v-else class="recordings-empty">录音待录</p>
  </article>
</template>

<style scoped>
.teacher-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  background: var(--color-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.teacher-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 3px solid var(--color-primary-soft);
  background: linear-gradient(135deg, #ffd1d6 0%, var(--color-primary) 100%);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32px;
  font-weight: 600;
  transition: border-color 0.18s ease;
}

.avatar:hover {
  border-color: var(--color-primary);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar[data-role='assistant'] {
  background: linear-gradient(135deg, #c5e3ff 0%, #4a90e2 100%);
}

.avatar[data-role='life'] {
  background: linear-gradient(135deg, #ffe6b8 0%, #f0a020 100%);
}

.avatar-initial {
  user-select: none;
}

.meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.role-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.role-tag[data-role='assistant'] {
  background: #e6f1ff;
  color: #4a90e2;
}

.role-tag[data-role='life'] {
  background: #fff3dc;
  color: #f0a020;
}

.recordings {
  width: 100%;
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rec {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--color-primary-soft);
  border-radius: 999px;
}

.play-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  transition: background 0.15s ease;
}
.play-btn.playing {
  background: #b03a3a;
}

.wave {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 18px;
}

.wave i {
  display: inline-block;
  width: 2px;
  background: var(--color-primary);
  border-radius: 1px;
  opacity: 0.7;
}

.dur {
  font-size: 11px;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}

.recordings-empty {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--color-text-soft);
}
</style>
