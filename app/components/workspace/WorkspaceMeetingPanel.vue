<script setup lang="ts">
import type {
  DefenseRealtimeMediaMode,
  DefenseRealtimeProvider,
  DefenseRealtimeRuntimeOptions,
  DefenseRealtimeSessionMeta,
  ProjectMeetingDetail,
  ProjectMeetingGuestShare,
  ProjectMeetingInvitee,
  ProjectMeetingUtterance,
  WorkspaceType,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'
import ProjectMeetingWebClient from '~/components/meeting/ProjectMeetingWebClient.vue'

interface MeetingCaptionItem {
  id: string
  text: string
  speakerName: string
  speakerLabel: string
  startedAtMs: number
  endedAtMs: number
  final: boolean
}

interface MeetingParticipantViewItem {
  id: string
  displayName: string
  role: string
  audioTrackState: string
  videoTrackState: string
  screenShareTrackState: string
  screenShareAudioTrackState: string
  joinedAt?: string | null
  leftAt?: string | null
}

type MeetingPanelSheet = 'details' | 'status' | 'share' | null

const props = withDefaults(defineProps<{
  activeMeeting?: ProjectMeetingDetail | null
  utterances?: ProjectMeetingUtterance[]
  liveCaptions?: MeetingCaptionItem[]
  detailLoading?: boolean
  refreshing?: boolean
  mutating?: boolean
  joinUrl?: string
  joinToken?: string
  joinExpiresAt?: string
  rtcServerUrl?: string
  guestShare?: ProjectMeetingGuestShare | null
  guestShareLoading?: boolean
  currentUserId?: string
  workspaceType?: WorkspaceType | ''
  meetingPlanTier?: 'personal_team' | 'business_team' | null
  defenseRealtimeState?: DefenseRealtimeSessionMeta | null
  defenseRealtimeOptions?: DefenseRealtimeRuntimeOptions | null
  defenseRealtimeLogs?: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    createdAt: string
  }>
}>(), {
  activeMeeting: null,
  utterances: () => [],
  liveCaptions: () => [],
  detailLoading: false,
  refreshing: false,
  mutating: false,
  joinUrl: '',
  joinToken: '',
  joinExpiresAt: '',
  rtcServerUrl: '',
  guestShare: null,
  guestShareLoading: false,
  currentUserId: '',
  workspaceType: '',
  meetingPlanTier: null,
  defenseRealtimeState: null,
  defenseRealtimeOptions: null,
  defenseRealtimeLogs: () => [],
})

const emit = defineEmits<{
  joinMeeting: [meetingId: string]
  startMeeting: [meetingId: string]
  endMeeting: [meetingId: string]
  openResource: [resourceId: string]
  createGuestShare: [meetingId: string]
  regenerateGuestShare: [meetingId: string]
  revokeGuestShare: [meetingId: string]
  startDefenseRealtimeSidecar: []
  updateDefenseRealtimeProvider: [provider: DefenseRealtimeProvider]
  updateDefenseRealtimeMediaMode: [mode: DefenseRealtimeMediaMode]
  toggleDefenseRealtimeAudio: [enabled: boolean]
  toggleDefenseRealtimeVideo: [enabled: boolean]
  interruptDefenseRealtime: []
  reconnectDefenseRealtime: []
}>()

const browserOnline = ref(true)
const microphoneState = ref<'checking' | 'granted' | 'prompt' | 'denied' | 'unknown'>('checking')
const activeMeetingSheet = ref<MeetingPanelSheet>(null)

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolvePlanTier(): 'personal_team' | 'business_team' {
  if (props.meetingPlanTier === 'personal_team')
    return 'personal_team'
  if (props.meetingPlanTier === 'business_team')
    return 'business_team'
  return props.workspaceType === 'personal' ? 'personal_team' : 'business_team'
}

function formatDateTime(value: string | null | undefined): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return '未设置'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()))
    return normalized

  return parsed.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDurationMinutes(value: number | null | undefined): string {
  const minutes = Number(value || 0)
  if (!Number.isFinite(minutes) || minutes <= 0)
    return '未设置'
  if (minutes >= 60 && minutes % 60 === 0)
    return `${minutes / 60} 小时`
  return `${minutes} 分钟`
}

function formatMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function resolveStatusLabel(status: ProjectMeetingDetail['status'] | ''): string {
  if (status === 'scheduled')
    return '待开始'
  if (status === 'active')
    return '进行中'
  if (status === 'ended')
    return '已结束'
  if (status === 'failed')
    return '失败'
  return '未选择会议'
}

function resolveInviteeName(invitee: ProjectMeetingInvitee): string {
  return normalizeString(invitee.username) || invitee.userId
}

function openMeetingResource(resourceId: string | null | undefined): void {
  const normalized = normalizeString(resourceId)
  if (!normalized)
    return
  emit('openResource', normalized)
}

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

function joinActiveMeeting(): void {
  if (!props.activeMeeting?.id || props.activeMeeting.status !== 'active')
    return
  emit('joinMeeting', props.activeMeeting.id)
}

function startScheduledMeeting(): void {
  if (!props.activeMeeting?.id || props.activeMeeting.status !== 'scheduled')
    return
  emit('startMeeting', props.activeMeeting.id)
}

function endCurrentMeeting(): void {
  if (!props.activeMeeting?.id || props.activeMeeting.status !== 'active')
    return
  emit('endMeeting', props.activeMeeting.id)
}

function createGuestShare(): void {
  if (!props.activeMeeting?.id)
    return
  emit('createGuestShare', props.activeMeeting.id)
}

function regenerateGuestShare(): void {
  if (!props.activeMeeting?.id)
    return
  emit('regenerateGuestShare', props.activeMeeting.id)
}

function revokeGuestShare(): void {
  if (!props.activeMeeting?.id)
    return
  emit('revokeGuestShare', props.activeMeeting.id)
}

function toggleMeetingPanelSheet(sheet: Exclude<MeetingPanelSheet, null>): void {
  activeMeetingSheet.value = activeMeetingSheet.value === sheet ? null : sheet
}

function closeMeetingPanelSheet(): void {
  activeMeetingSheet.value = null
}

async function copyGuestShareUrl(): Promise<void> {
  const shareUrl = normalizeString(props.guestShare?.shareUrl)
  if (!import.meta.client || !shareUrl)
    return

  try {
    await navigator.clipboard.writeText(shareUrl)
    Message.success('外部参会链接已复制。')
  }
  catch {
    Message.error('复制外部参会链接失败，请手动复制。')
  }
}

const currentUserId = computed(() => normalizeString(props.currentUserId))
const activeMeetingStatusLabel = computed(() => resolveStatusLabel(props.activeMeeting?.status || ''))
const meetingModeLabel = computed(() => props.activeMeeting?.mode === 'audio' ? '语音会议' : '视频会议')
const planLimitText = computed(() => resolvePlanTier() === 'personal_team' ? '15 分钟' : '24 小时')
const isHost = computed(() => {
  const meeting = props.activeMeeting
  if (!meeting)
    return false
  return Boolean(currentUserId.value && normalizeString(meeting.startedByUserId) === currentUserId.value)
})
const canStartMeeting = computed(() => props.activeMeeting?.status === 'scheduled' && isHost.value)
const canJoinMeeting = computed(() => props.activeMeeting?.status === 'active')
const canEndMeeting = computed(() => props.activeMeeting?.status === 'active' && isHost.value)
const canManageGuestShare = computed(() => {
  return Boolean(
    isHost.value
    && props.activeMeeting
    && props.activeMeeting.status !== 'ended'
    && props.activeMeeting.status !== 'failed',
  )
})
const microphoneStateLabel = computed(() => {
  if (microphoneState.value === 'granted')
    return '已授权'
  if (microphoneState.value === 'prompt')
    return '待授权'
  if (microphoneState.value === 'denied')
    return '已拒绝'
  if (microphoneState.value === 'checking')
    return '检查中'
  return '未知'
})
const scheduledStartInFuture = computed(() => {
  const value = props.activeMeeting?.scheduledStartAt
  if (!value)
    return false
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp))
    return false
  return timestamp > Date.now()
})
const startActionLabel = computed(() => scheduledStartInFuture.value ? '提前开始' : '开始会议')
const infoRows = computed<Array<{ label: string, value: string }>>(() => {
  const meeting = props.activeMeeting
  if (!meeting)
    return []

  return [
    { label: '会议模式', value: meetingModeLabel.value },
    { label: '当前状态', value: activeMeetingStatusLabel.value },
    { label: '预约开始', value: formatDateTime(meeting.scheduledStartAt || meeting.startedAt) },
    { label: '预约结束', value: formatDateTime(meeting.scheduledEndAt) },
    { label: '时长上限', value: planLimitText.value },
    { label: '本次时长', value: formatDurationMinutes(meeting.durationMinutes) },
    { label: '主持人 ID', value: meeting.startedByUserId || '未设置' },
    { label: 'RTC Provider', value: meeting.provider || '未设置' },
  ]
})
const mergedCaptions = computed<MeetingCaptionItem[]>(() => {
  const finals = props.utterances.map(item => ({
    id: item.id,
    text: item.text,
    speakerName: item.speakerName,
    speakerLabel: item.speakerLabel,
    startedAtMs: item.startedAtMs,
    endedAtMs: item.endedAtMs,
    final: true,
  }))
  const partials = props.liveCaptions.filter(item => !item.final)
  return [...finals, ...partials]
    .sort((left, right) => {
      if (left.startedAtMs !== right.startedAtMs)
        return left.startedAtMs - right.startedAtMs
      return left.endedAtMs - right.endedAtMs
    })
    .slice(-40)
})
const participantItems = computed<MeetingParticipantViewItem[]>(() => {
  return (props.activeMeeting?.participants || []).map(item => ({
    id: item.id,
    displayName: item.displayName,
    role: item.role,
    audioTrackState: item.audioTrackState,
    videoTrackState: item.videoTrackState,
    screenShareTrackState: item.screenShareTrackState,
    screenShareAudioTrackState: item.screenShareAudioTrackState,
    joinedAt: item.joinedAt,
    leftAt: item.leftAt,
  }))
})
const activeScreenShareCount = computed(() => {
  return participantItems.value.filter(item => item.screenShareTrackState === 'active').length
})
const runtimeStatusRows = computed<Array<{ label: string, value: string, icon: string, tone?: 'positive' | 'warning' | 'danger' }>>(() => {
  return [
    {
      label: '网络状态',
      value: browserOnline.value ? '在线' : '离线',
      icon: browserOnline.value ? 'wifi' : 'wifi_off',
      tone: browserOnline.value ? 'positive' : 'danger',
    },
    {
      label: '麦克风授权',
      value: microphoneStateLabel.value,
      icon: microphoneState.value === 'granted' ? 'mic' : 'mic_off',
      tone: microphoneState.value === 'denied' ? 'danger' : microphoneState.value === 'prompt' ? 'warning' : 'positive',
    },
    { label: '套餐会议上限', value: planLimitText.value, icon: 'timer' },
    { label: '参会人', value: `${participantItems.value.length} 人`, icon: 'groups' },
    { label: '共享路数', value: `${activeScreenShareCount.value} 路`, icon: 'screen_share' },
    { label: '字幕缓存', value: `${mergedCaptions.value.length} 条`, icon: 'closed_caption' },
  ]
})
const activeMeetingSheetTitle = computed(() => {
  if (activeMeetingSheet.value === 'details')
    return '会议详情'
  if (activeMeetingSheet.value === 'status')
    return '运行状态'
  if (activeMeetingSheet.value === 'share')
    return '外部分享'
  return ''
})
const meetingSummaryHint = computed(() => {
  if (!props.activeMeeting)
    return ''
  if (props.activeMeeting.status === 'scheduled') {
    return isHost.value
      ? '预约会议尚未开始。启动后才会创建 RTC 房间、签发成员 token，并开放外部 guest 入会。'
      : '预约会议尚未开始。你可以先查看邀请信息，等待主持人手动启动。'
  }
  if (props.activeMeeting.status === 'active') {
    if (activeScreenShareCount.value > 0)
      return `会议已切到站内 Web 客户端。当前有 ${activeScreenShareCount.value} 路屏幕共享进行中，实时字幕在右侧滚动，录制和纪要会在结束后自动沉淀。`
    return '会议已切到站内 Web 客户端。支持会中屏幕共享与共享音频，实时字幕在右侧滚动，录制和纪要会在结束后自动沉淀。'
  }
  if (props.activeMeeting.status === 'ended')
    return '会议已结束，可继续查看最终逐句稿、录制与纪要资源。'
  return '会议进入异常状态，请稍后刷新详情或重新发起。'
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

watch(() => props.activeMeeting?.id, () => {
  closeMeetingPanelSheet()
})
</script>

<template>
  <div class="meeting-panel w-full space-y-4">
    <section class="meeting-panel__hero">
      <div class="space-y-3">
        <div class="meeting-panel__badge">
          <span class="material-symbols-outlined text-sm">{{ activeMeeting?.mode === 'audio' ? 'headset_mic' : 'video_call' }}</span>
          {{ activeMeetingStatusLabel }}
        </div>
        <div>
          <h2 class="text-2xl text-slate-900 font-semibold">
            {{ activeMeeting?.title || '项目会议详情' }}
          </h2>
          <p class="text-sm text-slate-600 mt-2">
            {{ meetingSummaryHint || '点击左侧最近会议或创建会议后，可在这里查看单场会议的完整详情。' }}
          </p>
        </div>
        <div v-if="props.refreshing" class="meeting-panel__refreshing">
          <span class="meeting-panel__refreshing-dot" aria-hidden="true" />
          <span>刷新中</span>
        </div>
      </div>
    </section>

    <div v-if="detailLoading" class="meeting-panel__empty">
      正在加载会议详情...
    </div>
    <div v-else-if="!activeMeeting" class="meeting-panel__empty">
      请从总览或左侧最近会议中打开一场具体会议。
    </div>
    <template v-else>
      <section
        v-if="activeMeeting.status === 'scheduled'"
        class="meeting-panel__card"
      >
        <div class="meeting-panel__notice">
          <span class="material-symbols-outlined text-base">schedule</span>
          <div>
            <p class="meeting-panel__notice-title">
              {{ isHost ? '会议待主持人启动' : '等待主持人开始会议' }}
            </p>
            <p class="meeting-panel__notice-text">
              {{
                isHost
                  ? (scheduledStartInFuture ? '当前可提前开始，启动后才会创建 RTC 房间并签发成员 / guest join token。' : '现在可以开始会议，启动后成员与 guest 才能进入站内客户端。')
                  : '会议开始前可先查看邀请信息与预约时间，启动后才会出现加入入口。'
              }}
            </p>
          </div>
        </div>
      </section>

      <template v-else-if="activeMeeting.status === 'active'">
        <ProjectMeetingWebClient
          :provider="activeMeeting.provider"
          :mode="activeMeeting.mode"
          :meeting-id="activeMeeting.id"
          :title="activeMeeting.title"
          :rtc-join-token="joinToken"
          :rtc-join-expires-at="joinExpiresAt"
          :rtc-server-url="rtcServerUrl"
          :rtc-join-url="joinUrl"
          :participants="participantItems"
          :captions="mergedCaptions"
          :defense-realtime-state="defenseRealtimeState"
          :defense-realtime-options="defenseRealtimeOptions"
          :defense-realtime-logs="defenseRealtimeLogs"
          @start-defense-realtime-sidecar="emit('startDefenseRealtimeSidecar')"
          @update-defense-realtime-provider="emit('updateDefenseRealtimeProvider', $event)"
          @update-defense-realtime-media-mode="emit('updateDefenseRealtimeMediaMode', $event)"
          @toggle-defense-realtime-audio="emit('toggleDefenseRealtimeAudio', $event)"
          @toggle-defense-realtime-video="emit('toggleDefenseRealtimeVideo', $event)"
          @interrupt-defense-realtime="emit('interruptDefenseRealtime')"
          @reconnect-defense-realtime="emit('reconnectDefenseRealtime')"
        />
      </template>

      <section v-if="activeMeeting.status !== 'active'" class="meeting-panel__card">
        <div class="meeting-panel__content-grid">
          <div class="meeting-panel__detail-box">
            <h3 class="meeting-panel__section-title">
              参会人
            </h3>
            <div class="meeting-panel__person-list">
              <div
                v-for="participant in participantItems"
                :key="participant.id"
                class="meeting-panel__person-item"
              >
                <div class="meeting-panel__person-main">
                  <span class="meeting-panel__person-name">{{ participant.displayName }}</span>
                  <span class="meeting-panel__person-role">{{ participant.role }}</span>
                </div>
                <div class="meeting-panel__person-meta">
                  音频：{{ participant.audioTrackState }} · 视频：{{ participant.videoTrackState }}
                </div>
              </div>
              <div v-if="participantItems.length === 0" class="meeting-panel__empty-inline">
                暂无参会人数据。
              </div>
            </div>
          </div>

          <div class="meeting-panel__detail-box">
            <div class="flex gap-3 items-center justify-between">
              <h3 class="meeting-panel__section-title">
                最终逐句稿
              </h3>
              <span class="text-xs text-slate-400">{{ utterances.length }} 条</span>
            </div>
            <div class="meeting-panel__caption-list">
              <div
                v-for="caption in utterances"
                :key="caption.id"
                class="meeting-panel__caption-item"
              >
                <div class="flex gap-3 items-center justify-between">
                  <span class="text-sm text-slate-800 font-medium">{{ caption.speakerName || caption.speakerLabel }}</span>
                  <span class="text-xs text-slate-400">{{ formatMs(caption.startedAtMs) }} - {{ formatMs(caption.endedAtMs) }}</span>
                </div>
                <p class="text-sm text-slate-600 mt-1">
                  {{ caption.text }}
                </p>
              </div>
              <div v-if="utterances.length === 0" class="meeting-panel__empty-inline">
                暂无逐句稿。
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="meeting-panel__bottom-space" aria-hidden="true" />

      <div
        v-if="activeMeetingSheet"
        class="meeting-panel__sheet-backdrop"
        @click="closeMeetingPanelSheet"
      />
      <aside
        v-if="activeMeetingSheet"
        class="meeting-panel__sheet"
        role="dialog"
        :aria-label="activeMeetingSheetTitle"
      >
        <header class="meeting-panel__sheet-head">
          <div>
            <span class="meeting-panel__sheet-kicker">会议控制台</span>
            <h3>{{ activeMeetingSheetTitle }}</h3>
          </div>
          <button
            class="meeting-panel__icon-button"
            type="button"
            aria-label="关闭面板"
            title="关闭面板"
            @click="closeMeetingPanelSheet"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>

        <div v-if="activeMeetingSheet === 'details'" class="meeting-panel__sheet-body">
          <div class="meeting-panel__detail-list meeting-panel__detail-list--sheet">
            <div
              v-for="item in infoRows"
              :key="item.label"
              class="meeting-panel__detail-item"
            >
              <span class="meeting-panel__detail-label">{{ item.label }}</span>
              <span class="meeting-panel__detail-value">{{ item.value }}</span>
            </div>
          </div>

          <section class="meeting-panel__sheet-section">
            <h4 class="meeting-panel__section-title">
              邀请成员
            </h4>
            <div class="meeting-panel__person-list">
              <div
                v-for="invitee in activeMeeting.invitees"
                :key="invitee.id"
                class="meeting-panel__person-item"
              >
                <div class="meeting-panel__person-main">
                  <span class="meeting-panel__person-name">{{ resolveInviteeName(invitee) }}</span>
                  <span class="meeting-panel__person-role">{{ invitee.role }}</span>
                </div>
                <div class="meeting-panel__person-meta">
                  邀请于 {{ formatDateTime(invitee.invitedAt) }}
                </div>
              </div>
              <div v-if="activeMeeting.invitees.length === 0" class="meeting-panel__empty-inline">
                暂无额外邀请成员，默认仅主持人入会。
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="activeMeetingSheet === 'status'" class="meeting-panel__sheet-body">
          <div class="meeting-panel__status-grid">
            <div
              v-for="item in runtimeStatusRows"
              :key="item.label"
              class="meeting-panel__status-item"
              :class="item.tone ? `meeting-panel__status-item--${item.tone}` : ''"
            >
              <span class="material-symbols-outlined">{{ item.icon }}</span>
              <div>
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeMeetingSheet === 'share'" class="meeting-panel__sheet-body">
          <div class="meeting-panel__share-head meeting-panel__share-head--sheet">
            <div>
              <h4 class="meeting-panel__section-title">
                外部分享
              </h4>
              <p class="meeting-panel__share-hint">
                单会议单链接。外部端严格脱敏，不展示项目 / 工作区 / 录制 / 纪要，guest token 为短时有效。
              </p>
            </div>
            <div class="meeting-panel__share-actions">
              <button
                v-if="!guestShare"
                class="meeting-btn"
                type="button"
                :disabled="guestShareLoading"
                @click="createGuestShare"
              >
                {{ guestShareLoading ? '生成中...' : '生成外部链接' }}
              </button>
              <template v-else>
                <button
                  class="meeting-btn"
                  type="button"
                  :disabled="guestShareLoading"
                  @click="copyGuestShareUrl"
                >
                  复制链接
                </button>
                <button
                  class="meeting-btn meeting-btn--ghost"
                  type="button"
                  :disabled="guestShareLoading"
                  @click="regenerateGuestShare"
                >
                  {{ guestShareLoading ? '处理中...' : '重新生成' }}
                </button>
                <button
                  class="meeting-btn meeting-btn--danger"
                  type="button"
                  :disabled="guestShareLoading"
                  @click="revokeGuestShare"
                >
                  {{ guestShareLoading ? '处理中...' : '撤销' }}
                </button>
              </template>
            </div>
          </div>

          <div v-if="guestShare" class="meeting-panel__share-body">
            <label class="meeting-panel__share-field">
              <span>当前有效链接</span>
              <input :value="guestShare.shareUrl" readonly>
            </label>
            <div class="meeting-panel__share-meta">
              <span>到期时间：{{ formatDateTime(guestShare.expiresAt) }}</span>
              <span>会议结束后链接会立即失效</span>
            </div>
          </div>
          <div v-else class="meeting-panel__empty-inline">
            当前还没有外部参会链接。
          </div>
        </div>
      </aside>

      <nav class="meeting-panel__bottom-bar" aria-label="会议详情快捷操作">
        <button
          class="meeting-panel__dock-button"
          :class="{ 'meeting-panel__dock-button--active': activeMeetingSheet === 'details' }"
          type="button"
          aria-label="查看会议详情"
          title="查看会议详情"
          @click="toggleMeetingPanelSheet('details')"
        >
          <span class="material-symbols-outlined">info</span>
          <strong>详情</strong>
        </button>
        <button
          class="meeting-panel__dock-button"
          :class="{ 'meeting-panel__dock-button--active': activeMeetingSheet === 'status' }"
          type="button"
          aria-label="查看运行状态"
          title="查看运行状态"
          @click="toggleMeetingPanelSheet('status')"
        >
          <span class="material-symbols-outlined">{{ browserOnline ? 'wifi' : 'wifi_off' }}</span>
          <strong>{{ browserOnline ? '在线' : '离线' }}</strong>
        </button>
        <button
          v-if="canManageGuestShare"
          class="meeting-panel__dock-button"
          :class="{ 'meeting-panel__dock-button--active': activeMeetingSheet === 'share' }"
          type="button"
          aria-label="管理外部分享"
          title="管理外部分享"
          @click="toggleMeetingPanelSheet('share')"
        >
          <span class="material-symbols-outlined">link</span>
          <strong>{{ guestShare ? '分享' : '生成' }}</strong>
        </button>
        <button
          v-if="canStartMeeting"
          class="meeting-panel__dock-button meeting-panel__dock-button--primary"
          type="button"
          :disabled="mutating"
          :aria-label="startActionLabel"
          :title="startActionLabel"
          @click="startScheduledMeeting"
        >
          <span class="material-symbols-outlined">play_arrow</span>
          <strong>{{ mutating ? '处理中' : '开始' }}</strong>
        </button>
        <button
          v-if="canJoinMeeting"
          class="meeting-panel__dock-button meeting-panel__dock-button--primary"
          type="button"
          :disabled="mutating"
          aria-label="加入会议"
          title="加入会议"
          @click="joinActiveMeeting"
        >
          <span class="material-symbols-outlined">login</span>
          <strong>{{ mutating ? '处理中' : '加入' }}</strong>
        </button>
        <button
          v-if="activeMeeting?.notesResourceId"
          class="meeting-panel__dock-button"
          type="button"
          aria-label="打开纪要"
          title="打开纪要"
          @click="openMeetingResource(activeMeeting.notesResourceId)"
        >
          <span class="material-symbols-outlined">article</span>
          <strong>纪要</strong>
        </button>
        <button
          v-if="activeMeeting?.recordingResourceId"
          class="meeting-panel__dock-button"
          type="button"
          aria-label="打开录制"
          title="打开录制"
          @click="openMeetingResource(activeMeeting.recordingResourceId)"
        >
          <span class="material-symbols-outlined">movie</span>
          <strong>录制</strong>
        </button>
        <button
          v-if="canEndMeeting"
          class="meeting-panel__dock-button meeting-panel__dock-button--danger"
          type="button"
          :disabled="mutating"
          aria-label="结束会议"
          title="结束会议"
          @click="endCurrentMeeting"
        >
          <span class="material-symbols-outlined">call_end</span>
          <strong>{{ mutating ? '处理中' : '结束' }}</strong>
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.meeting-panel {
  min-width: 0;
  position: relative;
}

.meeting-panel__hero,
.meeting-panel__card {
  border: 1px solid #e2e8f0;
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #fff, #f8fafc);
  padding: 1.25rem;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
}

.meeting-panel__hero {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.meeting-panel__refreshing {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
}

.meeting-panel__refreshing-dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: #3b82f6;
  animation: meeting-panel-refresh-pulse 1s ease-in-out infinite;
}

.meeting-panel__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #0f172a;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.meeting-panel__share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
}

.meeting-panel__detail-grid,
.meeting-panel__content-grid {
  display: grid;
  gap: 1rem;
}

.meeting-panel__detail-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
}

.meeting-panel__content-grid {
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
}

.meeting-panel__detail-list,
.meeting-panel__detail-box {
  border: 1px solid #e2e8f0;
  border-radius: 1.25rem;
  background: #fff;
  padding: 1rem;
}

.meeting-panel__detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.meeting-panel__detail-list--sheet {
  border-radius: 1rem;
  padding: 0;
}

.meeting-panel__detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.meeting-panel__detail-label {
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-panel__detail-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
  word-break: break-word;
}

.meeting-panel__section-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-panel__person-list,
.meeting-panel__caption-list {
  margin-top: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meeting-panel__person-item,
.meeting-panel__caption-item {
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #fff;
  padding: 0.85rem 0.95rem;
}

.meeting-panel__person-main {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
}

.meeting-panel__person-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-panel__person-role {
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
}

.meeting-panel__person-meta {
  margin-top: 0.35rem;
  font-size: 0.8rem;
  color: #64748b;
}

.meeting-panel__notice {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  border-radius: 1rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 1rem;
}

.meeting-panel__notice-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-panel__notice-text {
  margin: 0.35rem 0 0;
  font-size: 0.875rem;
  color: #475569;
}

.meeting-panel__share-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.meeting-panel__share-head--sheet {
  flex-direction: column;
}

.meeting-panel__share-hint {
  margin: 0.45rem 0 0;
  font-size: 0.875rem;
  color: #64748b;
}

.meeting-panel__share-body {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.meeting-panel__share-field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.8rem;
  color: #64748b;
}

.meeting-panel__share-field input {
  border: 1px solid #cbd5e1;
  border-radius: 1rem;
  background: #fff;
  padding: 0.85rem 1rem;
  font-size: 0.85rem;
  color: #334155;
}

.meeting-panel__share-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-panel__empty,
.meeting-panel__empty-inline {
  border: 1px dashed #cbd5e1;
  border-radius: 1rem;
  background: #fff;
  padding: 1rem;
  text-align: center;
  color: #64748b;
}

.meeting-btn {
  border: 1px solid #0f172a;
  background: #0f172a;
  color: #fff;
  border-radius: 999px;
  padding: 0.65rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.meeting-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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

.meeting-panel__bottom-space {
  height: 5.5rem;
}

.meeting-panel__bottom-bar {
  position: sticky;
  z-index: 32;
  bottom: 1rem;
  left: 0;
  right: 0;
  width: min(100%, 760px);
  margin: 0 auto;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(18px);
  padding: 0.45rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  overflow-x: auto;
}

.meeting-panel__dock-button,
.meeting-panel__icon-button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #475569;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.meeting-panel__dock-button {
  min-width: 4.25rem;
  height: 3.6rem;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.35rem 0.65rem;
}

.meeting-panel__dock-button .material-symbols-outlined {
  font-size: 1.25rem;
}

.meeting-panel__dock-button strong {
  max-width: 4.4rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  font-weight: 700;
}

.meeting-panel__dock-button:hover,
.meeting-panel__dock-button--active {
  background: #eef2ff;
  color: #1d4ed8;
}

.meeting-panel__dock-button--primary {
  background: #0f172a;
  color: #fff;
}

.meeting-panel__dock-button--primary:hover {
  background: #111827;
  color: #fff;
}

.meeting-panel__dock-button--danger {
  background: #dc2626;
  color: #fff;
}

.meeting-panel__dock-button--danger:hover {
  background: #b91c1c;
  color: #fff;
}

.meeting-panel__dock-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.meeting-panel__sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 35;
  background: rgba(15, 23, 42, 0.08);
}

.meeting-panel__sheet {
  position: fixed;
  z-index: 36;
  right: max(1rem, env(safe-area-inset-right));
  bottom: 6.5rem;
  width: min(440px, calc(100vw - 2rem));
  max-height: min(68vh, 620px);
  overflow: auto;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
  padding: 1rem;
}

.meeting-panel__sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.meeting-panel__sheet-head h3 {
  margin: 0.15rem 0 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.meeting-panel__sheet-kicker {
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
}

.meeting-panel__sheet-body,
.meeting-panel__sheet-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.meeting-panel__icon-button {
  width: 2rem;
  height: 2rem;
  background: #f1f5f9;
}

.meeting-panel__status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.meeting-panel__status-item {
  min-width: 0;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #f8fafc;
  padding: 0.85rem;
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
}

.meeting-panel__status-item .material-symbols-outlined {
  color: #64748b;
  font-size: 1.2rem;
}

.meeting-panel__status-item div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.meeting-panel__status-item span:not(.material-symbols-outlined) {
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-panel__status-item strong {
  overflow-wrap: anywhere;
  font-size: 0.9rem;
  color: #0f172a;
}

.meeting-panel__status-item--positive .material-symbols-outlined,
.meeting-panel__status-item--positive strong {
  color: #059669;
}

.meeting-panel__status-item--warning .material-symbols-outlined,
.meeting-panel__status-item--warning strong {
  color: #b45309;
}

.meeting-panel__status-item--danger .material-symbols-outlined,
.meeting-panel__status-item--danger strong {
  color: #dc2626;
}

@keyframes meeting-panel-refresh-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.92);
  }

  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@media (max-width: 1024px) {
  .meeting-panel__detail-grid,
  .meeting-panel__content-grid,
  .meeting-panel__stats {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .meeting-panel__hero,
  .meeting-panel__share-head {
    flex-direction: column;
  }

  .meeting-panel__detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
