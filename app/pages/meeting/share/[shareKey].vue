<script setup lang="ts">
import type {
  ApiResponse,
  ProjectMeetingGuestJoinSession,
  SharedProjectMeetingSnapshot,
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

definePageMeta({
  layout: false,
})

useHead({
  title: '外部会议分享',
})

const runtime = useRuntimeConfig()
const route = useRoute()
const { endpoint } = useApiEndpoint(runtime)

const shareSnapshot = ref<SharedProjectMeetingSnapshot | null>(null)
const guestJoinSession = ref<ProjectMeetingGuestJoinSession | null>(null)
const liveCaptions = ref<MeetingCaptionItem[]>([])
const displayName = ref('')
const pageLoading = ref(true)
const joinLoading = ref(false)
const pageError = ref('')

let snapshotPollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeGuestRealtime: (() => void) | null = null
let guestRealtimeClient: ReturnType<typeof useWorkspaceRealtime> | null = null

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolveShareKey(): string {
  return normalizeString((route.params as Record<string, unknown>)?.shareKey)
}

function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const maybeData = (error as { data?: { message?: string } }).data
    const message = String(maybeData?.message || '').trim()
    if (message)
      return message
  }

  if (error instanceof Error && error.message.trim())
    return error.message.trim()

  return fallback
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
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildMeetingCaptionItem(payload: Record<string, unknown>, final: boolean): MeetingCaptionItem | null {
  const text = normalizeString(payload.text)
  if (!text)
    return null

  const startedAtMs = Math.max(0, Math.trunc(Number(payload.startedAtMs || 0)))
  const endedAtMs = Math.max(startedAtMs, Math.trunc(Number(payload.endedAtMs || payload.startedAtMs || 0)))
  const speakerLabel = normalizeString(payload.speakerLabel) || normalizeString(payload.speakerName) || '发言人'
  const utteranceId = normalizeString(payload.utteranceId)

  return {
    id: utteranceId || `${final ? 'final' : 'partial'}:${speakerLabel}:${startedAtMs}:${endedAtMs}`,
    text,
    speakerName: speakerLabel,
    speakerLabel,
    startedAtMs,
    endedAtMs,
    final,
  }
}

function buildCaptionKey(item: Pick<MeetingCaptionItem, 'speakerLabel' | 'startedAtMs'>): string {
  return `${normalizeString(item.speakerLabel)}::${Math.max(0, Math.trunc(Number(item.startedAtMs || 0)))}`
}

function upsertLiveCaption(item: MeetingCaptionItem): void {
  if (item.final) {
    const targetKey = buildCaptionKey(item)
    liveCaptions.value = liveCaptions.value.filter(existing => buildCaptionKey(existing) !== targetKey)
    return
  }

  const targetKey = buildCaptionKey(item)
  const nextItems = liveCaptions.value.filter(existing => buildCaptionKey(existing) !== targetKey)
  nextItems.push(item)
  liveCaptions.value = nextItems
    .sort((left, right) => left.startedAtMs - right.startedAtMs)
    .slice(-24)
}

function clearSnapshotPolling(): void {
  if (!snapshotPollTimer)
    return
  clearInterval(snapshotPollTimer)
  snapshotPollTimer = null
}

function syncSnapshotPolling(): void {
  clearSnapshotPolling()
  if (!shareSnapshot.value || guestJoinSession.value)
    return
  if (shareSnapshot.value.status !== 'scheduled')
    return

  snapshotPollTimer = setInterval(() => {
    void loadSharedMeetingSnapshot({ silent: true })
  }, 5000)
}

function disposeGuestRealtime(): void {
  unsubscribeGuestRealtime?.()
  unsubscribeGuestRealtime = null
  guestRealtimeClient?.disconnect()
  guestRealtimeClient = null
}

function applyShareSnapshot(snapshot: SharedProjectMeetingSnapshot | null): void {
  shareSnapshot.value = snapshot
  liveCaptions.value = []
  if (snapshot && snapshot.status !== 'active' && guestJoinSession.value) {
    guestJoinSession.value = null
    disposeGuestRealtime()
  }
  syncSnapshotPolling()
}

function handleGuestRealtimeMessage(message: { type?: string, payload?: Record<string, unknown> }): void {
  const messageType = normalizeString(message.type)
  if (!messageType)
    return

  if (messageType === 'error') {
    pageError.value = normalizeString(message.payload?.message) || '会议实时连接已断开，请刷新后重试。'
    return
  }

  const payload = message.payload && typeof message.payload === 'object'
    ? message.payload
    : {}
  const meetingId = normalizeString(payload.meetingId)
  if (meetingId && shareSnapshot.value && meetingId !== shareSnapshot.value.meetingId)
    return

  if (messageType === 'meeting.caption.partial' || messageType === 'meeting.caption.final') {
    const caption = buildMeetingCaptionItem(payload, messageType === 'meeting.caption.final')
    if (!caption)
      return
    upsertLiveCaption(caption)
    if (caption.final)
      void loadSharedMeetingSnapshot({ silent: true })
    return
  }

  if (
    messageType === 'meeting.state.updated'
    || messageType === 'meeting.participant.updated'
    || messageType === 'meeting.share.updated'
    || messageType === 'meeting.summary.ready'
  ) {
    void loadSharedMeetingSnapshot({ silent: true })
  }
}

function connectGuestRealtime(session: ProjectMeetingGuestJoinSession): void {
  if (!import.meta.client)
    return

  disposeGuestRealtime()
  guestRealtimeClient = useWorkspaceRealtime({
    guestToken: session.meetingGuestToken,
    forceIsolated: true,
  })
  unsubscribeGuestRealtime = guestRealtimeClient.onMessage(handleGuestRealtimeMessage)
  guestRealtimeClient.subscribeMeeting(session.meetingId)
}

async function loadSharedMeetingSnapshot(options: { silent?: boolean } = {}): Promise<void> {
  const shareKey = resolveShareKey()
  if (!shareKey)
    return

  if (!options.silent)
    pageLoading.value = true

  try {
    const response = await unsafeFetch<ApiResponse<SharedProjectMeetingSnapshot>>(endpoint(`/share/meetings/${shareKey}`))
    applyShareSnapshot(response.data || null)
    pageError.value = ''
  }
  catch (error) {
    shareSnapshot.value = null
    pageError.value = resolveApiErrorMessage(error, '当前分享链接不可用。')
  }
  finally {
    if (!options.silent)
      pageLoading.value = false
  }
}

async function joinSharedMeeting(): Promise<void> {
  const shareKey = resolveShareKey()
  const normalizedDisplayName = normalizeString(displayName.value)
  if (!shareKey || !normalizedDisplayName || joinLoading.value)
    return

  joinLoading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ProjectMeetingGuestJoinSession>>(
      endpoint(`/share/meetings/${shareKey}/join`),
      {
        method: 'POST',
        body: {
          displayName: normalizedDisplayName,
        },
      },
    )
    guestJoinSession.value = response.data
    shareSnapshot.value = response.data.snapshot
    liveCaptions.value = []
    connectGuestRealtime(response.data)
    pageError.value = ''
    clearSnapshotPolling()
    Message.success('已进入外部会议。')
  }
  catch (error) {
    pageError.value = resolveApiErrorMessage(error, '加入会议失败，请稍后重试。')
    Message.error(pageError.value)
  }
  finally {
    joinLoading.value = false
  }
}

const canJoin = computed(() => shareSnapshot.value?.status === 'active')
const mergedCaptions = computed<MeetingCaptionItem[]>(() => {
  const finals = (shareSnapshot.value?.utterances || []).map(item => ({
    id: item.id,
    text: item.text,
    speakerName: item.speakerLabel,
    speakerLabel: item.speakerLabel,
    startedAtMs: item.startedAtMs,
    endedAtMs: item.endedAtMs,
    final: true,
  }))
  const partials = liveCaptions.value.filter(item => !item.final)
  return [...finals, ...partials]
    .sort((left, right) => {
      if (left.startedAtMs !== right.startedAtMs)
        return left.startedAtMs - right.startedAtMs
      return left.endedAtMs - right.endedAtMs
    })
    .slice(-32)
})
const shareStatusText = computed(() => {
  const status = shareSnapshot.value?.status
  if (status === 'scheduled')
    return '等待主持人开始'
  if (status === 'active')
    return '可加入'
  if (status === 'ended')
    return '已结束'
  if (status === 'failed')
    return '已失效'
  return '加载中'
})

onMounted(() => {
  void loadSharedMeetingSnapshot()
})

onBeforeUnmount(() => {
  clearSnapshotPolling()
  disposeGuestRealtime()
})
</script>

<template>
  <main class="meeting-share-page">
    <section class="meeting-share-shell">
      <header class="meeting-share-hero">
        <div class="meeting-share-hero__badge">
          <span class="material-symbols-outlined text-sm">{{ shareSnapshot?.mode === 'audio' ? 'headset_mic' : 'video_call' }}</span>
          {{ shareStatusText }}
        </div>
        <h1>{{ shareSnapshot?.title || '外部会议' }}</h1>
        <p>
          这是脱敏后的外部参会页。不会展示项目、工作区、录制、纪要或其他内部上下文信息。
        </p>
      </header>

      <div v-if="pageLoading" class="meeting-share-card meeting-share-card--empty">
        正在加载会议分享...
      </div>

      <div v-else-if="pageError && !shareSnapshot" class="meeting-share-card meeting-share-card--empty">
        {{ pageError }}
      </div>

      <template v-else-if="shareSnapshot">
        <section class="meeting-share-grid">
          <article class="meeting-share-card">
            <div class="meeting-share-card__head">
              <h2>会议信息</h2>
              <span>{{ shareStatusText }}</span>
            </div>
            <dl class="meeting-share-facts">
              <div>
                <dt>会议模式</dt>
                <dd>{{ shareSnapshot.mode === 'audio' ? '外部语音会议' : '外部视频会议' }}</dd>
              </div>
              <div>
                <dt>预约开始</dt>
                <dd>{{ formatDateTime(shareSnapshot.scheduledStartAt) }}</dd>
              </div>
              <div>
                <dt>预约结束</dt>
                <dd>{{ formatDateTime(shareSnapshot.scheduledEndAt) }}</dd>
              </div>
              <div>
                <dt>参会人数</dt>
                <dd>{{ shareSnapshot.participantCount }}</dd>
              </div>
            </dl>
          </article>

          <article class="meeting-share-card">
            <div class="meeting-share-card__head">
              <h2>加入设置</h2>
              <span>guest token 15 分钟</span>
            </div>
            <template v-if="!guestJoinSession">
              <label class="meeting-share-field">
                <span>显示名</span>
                <input
                  v-model="displayName"
                  type="text"
                  maxlength="60"
                  placeholder="输入当前会议中显示的名称"
                >
              </label>
              <p class="meeting-share-tip">
                进入会议前可先完成设备权限授权。外部端只看到脱敏后的参会人与字幕标签。
              </p>
              <button
                class="meeting-share-button"
                type="button"
                :disabled="joinLoading || !canJoin || !displayName.trim()"
                @click="joinSharedMeeting"
              >
                {{
                  joinLoading ? '加入中...'
                  : canJoin ? '加入外部会议'
                    : '等待主持人开始'
                }}
              </button>
            </template>
            <template v-else>
              <p class="meeting-share-tip">
                已加入会议。若 guest token 过期，可刷新本页重新换取临时 token。
              </p>
              <p class="meeting-share-tip">
                guest token 到期时间：{{ formatDateTime(guestJoinSession.meetingGuestExpiresAt) }}
              </p>
            </template>
          </article>
        </section>

        <div v-if="pageError" class="meeting-share-inline-error">
          {{ pageError }}
        </div>

        <ProjectMeetingWebClient
          v-if="guestJoinSession"
          class="mt-4"
          provider="livekit"
          :mode="shareSnapshot.mode"
          :meeting-id="shareSnapshot.meetingId"
          :title="shareSnapshot.title"
          :rtc-join-token="guestJoinSession.rtcJoinToken"
          :rtc-join-expires-at="guestJoinSession.rtcJoinExpiresAt"
          :rtc-server-url="guestJoinSession.rtcServerUrl"
          :rtc-join-url="guestJoinSession.rtcJoinUrl"
          :participants="shareSnapshot.participants"
          :captions="mergedCaptions"
          :meeting-guest-token="guestJoinSession.meetingGuestToken"
          :guest="true"
        />

        <section
          v-else-if="shareSnapshot.status === 'ended' || shareSnapshot.status === 'failed'"
          class="meeting-share-card meeting-share-card--empty mt-4"
        >
          当前会议已结束，外部分享链接不再提供加入或任何会后资源。
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.meeting-share-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.15), transparent 28%),
    linear-gradient(180deg, #f8fafc, #eef2ff 45%, #f8fafc);
  padding: 2rem 1rem 3rem;
}

.meeting-share-shell {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.meeting-share-hero {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1.75rem;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(18px);
  padding: 1.5rem;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.meeting-share-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.meeting-share-hero h1 {
  margin: 0.9rem 0 0;
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.05;
  font-weight: 700;
  color: #0f172a;
}

.meeting-share-hero p {
  margin: 0.75rem 0 0;
  max-width: 40rem;
  font-size: 0.95rem;
  line-height: 1.7;
  color: #475569;
}

.meeting-share-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.meeting-share-card {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.88);
  padding: 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.05);
}

.meeting-share-card--empty {
  text-align: center;
  color: #64748b;
}

.meeting-share-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.meeting-share-card__head h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-share-card__head span {
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-share-facts {
  margin: 1rem 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.meeting-share-facts dt {
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-share-facts dd {
  margin: 0.35rem 0 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-share-field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 1rem;
}

.meeting-share-field span {
  font-size: 0.8rem;
  color: #475569;
}

.meeting-share-field input {
  border: 1px solid #cbd5e1;
  border-radius: 1rem;
  background: #fff;
  padding: 0.85rem 1rem;
  font-size: 0.92rem;
  color: #0f172a;
}

.meeting-share-tip,
.meeting-share-inline-error {
  margin: 0.9rem 0 0;
  font-size: 0.85rem;
  line-height: 1.7;
}

.meeting-share-tip {
  color: #64748b;
}

.meeting-share-inline-error {
  border: 1px solid #fecaca;
  border-radius: 1rem;
  background: #fff1f2;
  color: #be123c;
  padding: 0.85rem 1rem;
}

.meeting-share-button {
  margin-top: 1rem;
  border: 1px solid #0f172a;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.meeting-share-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .meeting-share-grid,
  .meeting-share-facts {
    grid-template-columns: 1fr;
  }

  .meeting-share-page {
    padding-inline: 0.75rem;
  }
}
</style>
