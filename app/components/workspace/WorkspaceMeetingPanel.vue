<script setup lang="ts">
import type {
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingMode,
  ProjectMeetingUtterance,
} from '~~/shared/types/domain'

interface MeetingCaptionItem {
  id: string
  text: string
  speakerName: string
  speakerLabel: string
  startedAtMs: number
  endedAtMs: number
  final: boolean
}

const props = withDefaults(defineProps<{
  meetings?: ProjectMeeting[]
  activeMeetingId?: string
  activeMeeting?: ProjectMeetingDetail | null
  utterances?: ProjectMeetingUtterance[]
  liveCaptions?: MeetingCaptionItem[]
  loading?: boolean
  detailLoading?: boolean
  mutating?: boolean
  joinUrl?: string
  joinToken?: string
  joinExpiresAt?: string
}>(), {
  meetings: () => [],
  activeMeetingId: '',
  activeMeeting: null,
  utterances: () => [],
  liveCaptions: () => [],
  loading: false,
  detailLoading: false,
  mutating: false,
  joinUrl: '',
  joinToken: '',
  joinExpiresAt: '',
})

const emit = defineEmits<{
  createMeeting: [payload: { mode: ProjectMeetingMode }]
  refreshMeetings: []
  joinMeeting: [meetingId: string]
  endMeeting: [meetingId: string]
  selectMeeting: [meetingId: string]
  openResource: [resourceId: string]
}>()

const showEmbeddedMeeting = ref(false)
const browserOnline = ref(true)
const microphoneState = ref<'checking' | 'granted' | 'prompt' | 'denied' | 'unknown'>('checking')

function formatMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const mergedCaptions = computed(() => {
  const finals = props.utterances.map(item => ({
    id: item.id,
    text: item.text,
    speakerName: item.speakerName,
    speakerLabel: item.speakerLabel,
    startedAtMs: item.startedAtMs,
    endedAtMs: item.endedAtMs,
    final: true,
  }))
  const pending = props.liveCaptions.filter(item => !item.final)
  return [...finals, ...pending]
    .sort((left, right) => left.startedAtMs - right.startedAtMs)
    .slice(-20)
})

const activeMeetingStatusLabel = computed(() => {
  if (!props.activeMeeting)
    return '暂无会议'
  if (props.activeMeeting.status === 'active')
    return '进行中'
  if (props.activeMeeting.status === 'ended')
    return '已结束'
  return '失败'
})

async function syncMicrophonePermission(): Promise<void> {
  if (!import.meta.client || !('permissions' in navigator)) {
    microphoneState.value = 'unknown'
    return
  }

  try {
    const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    microphoneState.value = permission.state as typeof microphoneState.value
    permission.onchange = () => {
      microphoneState.value = permission.state as typeof microphoneState.value
    }
  }
  catch {
    microphoneState.value = 'unknown'
  }
}

function handleOnlineStatus(): void {
  if (!import.meta.client)
    return
  browserOnline.value = navigator.onLine
}

function openMeetingResource(resourceId: string | null | undefined): void {
  const normalized = String(resourceId || '').trim()
  if (!normalized)
    return
  emit('openResource', normalized)
}

function joinActiveMeeting(): void {
  if (!props.activeMeeting?.id)
    return
  showEmbeddedMeeting.value = true
  emit('joinMeeting', props.activeMeeting.id)
}

watch(() => props.joinUrl, (value) => {
  if (!value)
    return
  showEmbeddedMeeting.value = true
})

onMounted(() => {
  handleOnlineStatus()
  void syncMicrophonePermission()
  if (import.meta.client) {
    window.addEventListener('online', handleOnlineStatus)
    window.addEventListener('offline', handleOnlineStatus)
  }
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('online', handleOnlineStatus)
    window.removeEventListener('offline', handleOnlineStatus)
  }
})
</script>

<template>
  <div class="meeting-panel mx-auto max-w-6xl space-y-4">
    <section class="p-5 border border-slate-200 rounded-3xl bg-white shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <div class="text-xs text-slate-600 px-3 py-1 rounded-full bg-slate-100 inline-flex gap-2 items-center">
            <span class="material-symbols-outlined text-sm">video_call</span>
            会议中台
          </div>
          <h2 class="text-2xl text-slate-900 font-semibold">
            {{ activeMeeting?.title || '项目会议' }}
          </h2>
          <p class="text-sm text-slate-500">
            实时字幕、参会人状态、录制沉淀和会议纪要都会在这里汇总。
          </p>
          <p class="text-xs text-slate-400">
            发起会议入口已移到左侧栏「项目会议」。
          </p>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <button class="meeting-btn meeting-btn--ghost" type="button" :disabled="loading || mutating" @click="emit('refreshMeetings')">
            刷新
          </button>
        </div>
      </div>

      <div class="mt-4 gap-3 grid md:grid-cols-3">
        <div class="meeting-stat">
          <span class="meeting-stat__label">当前状态</span>
          <span class="meeting-stat__value">{{ activeMeetingStatusLabel }}</span>
        </div>
        <div class="meeting-stat">
          <span class="meeting-stat__label">网络</span>
          <span class="meeting-stat__value" :class="browserOnline ? 'text-emerald-600' : 'text-rose-600'">
            {{ browserOnline ? '在线' : '离线' }}
          </span>
        </div>
        <div class="meeting-stat">
          <span class="meeting-stat__label">麦克风权限</span>
          <span class="meeting-stat__value">
            {{
              microphoneState === 'granted' ? '已授权'
              : microphoneState === 'prompt' ? '待授权'
                : microphoneState === 'denied' ? '已拒绝'
                  : microphoneState === 'checking' ? '检查中'
                    : '未知'
            }}
          </span>
        </div>
      </div>
    </section>

    <section class="gap-4 grid xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside class="p-4 border border-slate-200 rounded-3xl bg-white shadow-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-sm text-slate-900 font-semibold">
            最近会议
          </h3>
          <span class="text-xs text-slate-400">{{ meetings.length }} 条</span>
        </div>
        <div class="mt-3 space-y-2">
          <button
            v-for="item in meetings"
            :key="item.id"
            type="button"
            class="meeting-list-item"
            :class="item.id === activeMeetingId ? 'meeting-list-item--active' : ''"
            @click="emit('selectMeeting', item.id)"
          >
            <span class="text-sm text-slate-800 font-medium truncate">{{ item.title }}</span>
            <span class="text-xs text-slate-500">
              {{ item.status === 'active' ? '进行中' : item.status === 'ended' ? '已结束' : '失败' }}
            </span>
          </button>
          <div v-if="meetings.length === 0" class="text-sm text-slate-400 px-3 py-6 text-center border border-slate-200 rounded-2xl border-dashed">
            暂无会议记录
          </div>
        </div>
      </aside>

      <section class="space-y-4">
        <div class="p-4 border border-slate-200 rounded-3xl bg-white shadow-sm">
          <div v-if="detailLoading" class="text-sm text-slate-500">
            正在加载会议详情...
          </div>
          <template v-else-if="activeMeeting">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="space-y-2">
                <div class="text-xs text-slate-500 flex flex-wrap gap-2 items-center">
                  <span class="px-2.5 py-1 rounded-full bg-slate-100">{{ activeMeeting.mode === 'audio' ? '语音会议' : '视频会议' }}</span>
                  <span class="px-2.5 py-1 rounded-full bg-slate-100">{{ activeMeeting.provider }}</span>
                  <span>开始于 {{ activeMeeting.startedAt }}</span>
                </div>
                <p class="text-sm text-slate-600">
                  房间：<code>{{ activeMeeting.providerRoomName }}</code>
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-if="activeMeeting.status === 'active'"
                  class="meeting-btn"
                  type="button"
                  :disabled="mutating"
                  @click="joinActiveMeeting"
                >
                  加入会议
                </button>
                <button
                  v-if="activeMeeting.status === 'active'"
                  class="meeting-btn meeting-btn--danger"
                  type="button"
                  :disabled="mutating"
                  @click="emit('endMeeting', activeMeeting.id)"
                >
                  结束会议
                </button>
                <button
                  v-if="activeMeeting.notesResourceId"
                  class="meeting-btn meeting-btn--ghost"
                  type="button"
                  @click="openMeetingResource(activeMeeting.notesResourceId)"
                >
                  打开纪要
                </button>
                <button
                  v-if="activeMeeting.recordingResourceId"
                  class="meeting-btn meeting-btn--ghost"
                  type="button"
                  @click="openMeetingResource(activeMeeting.recordingResourceId)"
                >
                  打开录制
                </button>
              </div>
            </div>

            <div v-if="showEmbeddedMeeting && joinUrl" class="meeting-frame mt-4 border border-slate-200 rounded-2xl overflow-hidden">
              <iframe :src="joinUrl" title="meeting-embed" class="border-0 bg-slate-50 h-[520px] w-full" allow="camera; microphone; display-capture" />
            </div>
            <div v-else-if="activeMeeting.status === 'active'" class="mt-4 p-4 border border-slate-200 rounded-2xl border-dashed bg-slate-50">
              <p class="text-sm text-slate-600">
                当前仓库通过 provider join URL 嵌入会议客户端。若尚未配置嵌入地址，会显示 token 供外部 RTC 客户端接入。
              </p>
              <div v-if="joinToken" class="mt-3">
                <p class="text-xs text-slate-400">
                  Token 过期时间：{{ joinExpiresAt || '未提供' }}
                </p>
                <textarea class="meeting-token mt-2" readonly :value="joinToken" />
              </div>
            </div>

            <div class="mt-4 gap-4 grid lg:grid-cols-[280px_minmax(0,1fr)]">
              <div class="p-3 border border-slate-200 rounded-2xl">
                <h4 class="text-sm text-slate-900 font-semibold">
                  参会人
                </h4>
                <div class="mt-3 space-y-2">
                  <div
                    v-for="participant in activeMeeting.participants"
                    :key="participant.id"
                    class="px-3 py-2 rounded-2xl bg-slate-50"
                  >
                    <div class="flex gap-3 items-center justify-between">
                      <span class="text-sm text-slate-800 font-medium truncate">{{ participant.displayName }}</span>
                      <span class="text-xs text-slate-400">{{ participant.role }}</span>
                    </div>
                    <div class="text-xs text-slate-500 mt-1 flex gap-2">
                      <span>音频：{{ participant.audioTrackState }}</span>
                      <span>视频：{{ participant.videoTrackState }}</span>
                    </div>
                  </div>
                  <div v-if="activeMeeting.participants.length === 0" class="text-sm text-slate-400">
                    暂无参会人
                  </div>
                </div>
              </div>

              <div class="p-3 border border-slate-200 rounded-2xl">
                <div class="flex gap-3 items-center justify-between">
                  <h4 class="text-sm text-slate-900 font-semibold">
                    实时字幕 / 逐句稿
                  </h4>
                  <span class="text-xs text-slate-400">{{ mergedCaptions.length }} 条</span>
                </div>
                <div class="mt-3 pr-1 max-h-[420px] overflow-y-auto space-y-2">
                  <div
                    v-for="caption in mergedCaptions"
                    :key="caption.id"
                    class="px-3 py-2 border border-slate-100 rounded-2xl"
                    :class="caption.final ? 'bg-white' : 'bg-amber-50'"
                  >
                    <div class="flex gap-3 items-center justify-between">
                      <span class="text-sm text-slate-800 font-medium">{{ caption.speakerName || caption.speakerLabel }}</span>
                      <span class="text-xs text-slate-400">{{ formatMs(caption.startedAtMs) }} - {{ formatMs(caption.endedAtMs) }}</span>
                    </div>
                    <p class="text-sm text-slate-600 mt-1">
                      {{ caption.text }}
                    </p>
                  </div>
                  <div v-if="mergedCaptions.length === 0" class="text-sm text-slate-400 px-4 py-8 text-center border border-slate-200 rounded-2xl border-dashed">
                    暂无字幕
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="text-sm text-slate-400 px-4 py-10 text-center border border-slate-200 rounded-2xl border-dashed">
            选择左侧会议记录，或直接发起一次新会议。
          </div>
        </div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.meeting-panel {
  min-width: 0;
}

.meeting-btn {
  border: 1px solid #0f172a;
  background: #0f172a;
  color: #fff;
  border-radius: 999px;
  padding: 0.6rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.meeting-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.meeting-btn--secondary {
  background: #2563eb;
  border-color: #2563eb;
}

.meeting-btn--ghost {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}

.meeting-btn--danger {
  background: #dc2626;
  border-color: #dc2626;
}

.meeting-stat {
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  padding: 0.85rem 1rem;
  background: linear-gradient(180deg, #fff, #f8fafc);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.meeting-stat__label {
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-stat__value {
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-list-item {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  padding: 0.8rem 0.9rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.meeting-list-item--active {
  border-color: #2563eb;
  background: #eff6ff;
}

.meeting-token {
  width: 100%;
  min-height: 132px;
  border: 1px solid #cbd5e1;
  border-radius: 1rem;
  padding: 0.85rem 1rem;
  resize: vertical;
  background: #fff;
  font-size: 0.8rem;
  color: #334155;
}
</style>
