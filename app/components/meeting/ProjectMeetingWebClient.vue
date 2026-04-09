<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ProjectMeetingMode } from '~~/shared/types/domain'

interface MeetingCaptionItem {
  id: string
  text: string
  speakerName: string
  speakerLabel: string
  startedAtMs: number
  endedAtMs: number
  final: boolean
}

interface MeetingParticipantItem {
  id: string
  displayName: string
  role: string
  audioTrackState: string
  videoTrackState: string
  joinedAt?: string | null
  leftAt?: string | null
}

interface MediaTrackItem {
  key: string
  kind: 'audio' | 'video'
  label: string
  isLocal: boolean
  track: any
}

const props = withDefaults(defineProps<{
  provider?: string
  mode?: ProjectMeetingMode
  meetingId?: string
  title?: string
  rtcJoinToken?: string
  rtcJoinExpiresAt?: string
  rtcServerUrl?: string
  rtcJoinUrl?: string
  participants?: MeetingParticipantItem[]
  captions?: MeetingCaptionItem[]
  guest?: boolean
}>(), {
  provider: 'mock',
  mode: 'video',
  meetingId: '',
  title: '',
  rtcJoinToken: '',
  rtcJoinExpiresAt: '',
  rtcServerUrl: '',
  rtcJoinUrl: '',
  participants: () => [],
  captions: () => [],
  guest: false,
})

const roomRef = shallowRef<any>(null)
const mediaTracks = ref<MediaTrackItem[]>([])
const connectionState = ref<'idle' | 'connecting' | 'connected' | 'error'>('idle')
const connectionError = ref('')
const micEnabled = ref(false)
const cameraEnabled = ref(false)

const videoElements = new Map<string, HTMLVideoElement>()
const audioElements = new Map<string, HTMLAudioElement>()
const boundVideoTracks = new Map<string, any>()
const boundAudioTracks = new Map<string, any>()

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolveRtcServerUrl(rawUrl: string): string {
  const normalized = normalizeString(rawUrl)
  if (!normalized)
    return ''
  if (normalized.startsWith('https://'))
    return `wss://${normalized.slice('https://'.length)}`
  if (normalized.startsWith('http://'))
    return `ws://${normalized.slice('http://'.length)}`
  return normalized
}

function formatDateTime(value: string | null | undefined): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return '未提供'

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

function formatMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function buildTrackKey(participantIdentity: string, publicationSid: string, kind: 'audio' | 'video'): string {
  return `${participantIdentity}:${publicationSid}:${kind}`
}

function clearTrackBinding(
  key: string,
  elementMap: Map<string, any>,
  bindingMap: Map<string, any>,
): void {
  const previousTrack = bindingMap.get(key)
  const element = elementMap.get(key)
  if (previousTrack && element) {
    try {
      previousTrack.detach(element)
    }
    catch {
      // ignore detach failures
    }
  }
  bindingMap.delete(key)
}

function syncTrackBindings(): void {
  const nextVideoTracks = new Map(
    mediaTracks.value
      .filter(item => item.kind === 'video')
      .map(item => [item.key, item.track]),
  )
  const nextAudioTracks = new Map(
    mediaTracks.value
      .filter(item => item.kind === 'audio' && !item.isLocal)
      .map(item => [item.key, item.track]),
  )

  for (const key of [...boundVideoTracks.keys()]) {
    if (!nextVideoTracks.has(key))
      clearTrackBinding(key, videoElements, boundVideoTracks)
  }
  for (const key of [...boundAudioTracks.keys()]) {
    if (!nextAudioTracks.has(key))
      clearTrackBinding(key, audioElements, boundAudioTracks)
  }

  for (const [key, element] of videoElements) {
    const nextTrack = nextVideoTracks.get(key)
    const boundTrack = boundVideoTracks.get(key)
    if (!element || !nextTrack)
      continue
    if (boundTrack && boundTrack !== nextTrack)
      clearTrackBinding(key, videoElements, boundVideoTracks)
    if (boundVideoTracks.get(key) === nextTrack)
      continue
    try {
      nextTrack.attach(element)
      element.muted = true
      element.playsInline = true
      void element.play?.().catch(() => undefined)
      boundVideoTracks.set(key, nextTrack)
    }
    catch {
      // ignore attach failures
    }
  }

  for (const [key, element] of audioElements) {
    const nextTrack = nextAudioTracks.get(key)
    const boundTrack = boundAudioTracks.get(key)
    if (!element || !nextTrack)
      continue
    if (boundTrack && boundTrack !== nextTrack)
      clearTrackBinding(key, audioElements, boundAudioTracks)
    if (boundAudioTracks.get(key) === nextTrack)
      continue
    try {
      nextTrack.attach(element)
      element.autoplay = true
      void element.play?.().catch(() => undefined)
      boundAudioTracks.set(key, nextTrack)
    }
    catch {
      // ignore attach failures
    }
  }
}

function releaseAllTrackBindings(): void {
  for (const key of [...boundVideoTracks.keys()])
    clearTrackBinding(key, videoElements, boundVideoTracks)
  for (const key of [...boundAudioTracks.keys()])
    clearTrackBinding(key, audioElements, boundAudioTracks)
}

function collectParticipantTracks(participant: any, input: { label: string, isLocal: boolean }): MediaTrackItem[] {
  const publications = Array.from(participant?.trackPublications?.values?.() || [])
  return publications.flatMap((publication: any) => {
    const track = publication?.track
    const kind = String(track?.kind || publication?.kind || '').trim()
    if (!track || (kind !== 'audio' && kind !== 'video'))
      return []

    return [{
      key: buildTrackKey(
        normalizeString(participant?.identity || publication?.participantSid || publication?.trackSid || publication?.sid || 'participant'),
        normalizeString(publication?.trackSid || publication?.sid || track?.sid || kind),
        kind as 'audio' | 'video',
      ),
      kind: kind as 'audio' | 'video',
      label: input.label,
      isLocal: input.isLocal,
      track,
    }]
  })
}

function syncRoomTracks(): void {
  const room = roomRef.value
  if (!room) {
    mediaTracks.value = []
    releaseAllTrackBindings()
    return
  }

  const nextTracks: MediaTrackItem[] = []
  nextTracks.push(...collectParticipantTracks(room.localParticipant, {
    label: props.guest ? '来宾（你）' : '你',
    isLocal: true,
  }))

  let remoteIndex = 0
  for (const participant of Array.from(room.remoteParticipants?.values?.() || [])) {
    remoteIndex += 1
    nextTracks.push(...collectParticipantTracks(participant, {
      label: props.guest ? `远端 ${remoteIndex}` : `参会人 ${remoteIndex}`,
      isLocal: false,
    }))
  }

  mediaTracks.value = nextTracks
  void nextTick(() => {
    syncTrackBindings()
  })
}

async function disconnectRoom(): Promise<void> {
  releaseAllTrackBindings()
  mediaTracks.value = []
  const room = roomRef.value
  roomRef.value = null
  micEnabled.value = false
  cameraEnabled.value = false

  if (!room)
    return

  try {
    room.removeAllListeners?.()
  }
  catch {
    // ignore listener cleanup failures
  }

  try {
    await room.disconnect?.()
  }
  catch {
    // ignore disconnect failures
  }
}

async function enableInitialDevices(room: any): Promise<void> {
  try {
    micEnabled.value = await room.localParticipant.setMicrophoneEnabled(true)
  }
  catch {
    micEnabled.value = false
  }

  if (props.mode !== 'video') {
    cameraEnabled.value = false
    return
  }

  try {
    cameraEnabled.value = await room.localParticipant.setCameraEnabled(true)
  }
  catch {
    cameraEnabled.value = false
  }
}

async function connectLivekitRoom(): Promise<void> {
  const rtcJoinToken = normalizeString(props.rtcJoinToken)
  const rtcServerUrl = resolveRtcServerUrl(props.rtcServerUrl)
  if (!import.meta.client || props.provider !== 'livekit' || !rtcJoinToken || !rtcServerUrl) {
    connectionState.value = 'idle'
    connectionError.value = ''
    await disconnectRoom()
    return
  }

  await disconnectRoom()
  connectionState.value = 'connecting'
  connectionError.value = ''

  try {
    const livekit = await import('livekit-client')
    const room = new livekit.Room({
      adaptiveStream: true,
      dynacast: true,
    })
    roomRef.value = room

    const resync = () => {
      syncRoomTracks()
    }

    room
      .on(livekit.RoomEvent.ConnectionStateChanged, (state: string) => {
        connectionState.value = state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : 'idle'
      })
      .on(livekit.RoomEvent.ParticipantConnected, resync)
      .on(livekit.RoomEvent.ParticipantDisconnected, resync)
      .on(livekit.RoomEvent.TrackSubscribed, resync)
      .on(livekit.RoomEvent.TrackUnsubscribed, resync)
      .on(livekit.RoomEvent.LocalTrackPublished, resync)
      .on(livekit.RoomEvent.LocalTrackUnpublished, resync)
      .on(livekit.RoomEvent.TrackMuted, resync)
      .on(livekit.RoomEvent.TrackUnmuted, resync)
      .on(livekit.RoomEvent.Disconnected, () => {
        connectionState.value = 'idle'
        releaseAllTrackBindings()
        mediaTracks.value = []
      })

    await room.connect(rtcServerUrl, rtcJoinToken, {
      autoSubscribe: true,
    })
    await enableInitialDevices(room)
    connectionState.value = 'connected'
    syncRoomTracks()
  }
  catch (error) {
    connectionState.value = 'error'
    connectionError.value = error instanceof Error ? error.message : '连接会议失败。'
    await disconnectRoom()
  }
}

async function toggleMicrophone(): Promise<void> {
  const room = roomRef.value
  if (!room?.localParticipant)
    return
  try {
    micEnabled.value = await room.localParticipant.setMicrophoneEnabled(!micEnabled.value)
    syncRoomTracks()
  }
  catch (error) {
    connectionError.value = error instanceof Error ? error.message : '切换麦克风失败。'
  }
}

async function toggleCamera(): Promise<void> {
  const room = roomRef.value
  if (!room?.localParticipant || props.mode !== 'video')
    return
  try {
    cameraEnabled.value = await room.localParticipant.setCameraEnabled(!cameraEnabled.value)
    syncRoomTracks()
  }
  catch (error) {
    connectionError.value = error instanceof Error ? error.message : '切换摄像头失败。'
  }
}

function setVideoElement(key: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLVideoElement)
    videoElements.set(key, element)
  else
    videoElements.delete(key)
  syncTrackBindings()
}

function setAudioElement(key: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLAudioElement)
    audioElements.set(key, element)
  else
    audioElements.delete(key)
  syncTrackBindings()
}

const hasJoinSession = computed(() => Boolean(normalizeString(props.rtcJoinToken) && normalizeString(props.rtcServerUrl)))
const isLivekit = computed(() => normalizeString(props.provider).toLowerCase() === 'livekit')
const isMock = computed(() => normalizeString(props.provider).toLowerCase() === 'mock')
const isUnsupported = computed(() => !isLivekit.value && !isMock.value)
const videoTracks = computed(() => mediaTracks.value.filter(item => item.kind === 'video'))
const remoteAudioTracks = computed(() => mediaTracks.value.filter(item => item.kind === 'audio' && !item.isLocal))
const participantCount = computed(() => props.participants.length)
const captionItems = computed(() => [...props.captions].slice(-18))
const connectionBadgeText = computed(() => {
  if (connectionState.value === 'connected')
    return '已连接'
  if (connectionState.value === 'connecting')
    return '连接中'
  if (connectionState.value === 'error')
    return '连接异常'
  return '待加入'
})
const joinHint = computed(() => {
  if (isUnsupported.value)
    return '当前 RTC provider 暂未适配站内 Web 客户端。'
  if (isMock.value)
    return '当前为 mock 会议环境，仅展示占位客户端。'
  if (!hasJoinSession.value)
    return '请先点击加入会议，系统会在当前页加载站内会议客户端。'
  return ''
})

watch(
  () => [props.provider, props.meetingId, props.rtcJoinToken, props.rtcServerUrl].join('::'),
  () => {
    void connectLivekitRoom()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  void disconnectRoom()
})
</script>

<template>
  <section class="meeting-web-client">
    <header class="meeting-web-client__header">
      <div>
        <div class="meeting-web-client__badge">
          <span class="material-symbols-outlined text-sm">{{ mode === 'audio' ? 'headset_mic' : 'videocam' }}</span>
          {{ connectionBadgeText }}
        </div>
        <h3 class="meeting-web-client__title">
          {{ title || (mode === 'audio' ? '语音会议客户端' : '视频会议客户端') }}
        </h3>
        <p class="meeting-web-client__hint">
          {{ joinHint || `RTC Token 有效期至 ${formatDateTime(rtcJoinExpiresAt)}` }}
        </p>
      </div>

      <div class="meeting-web-client__controls">
        <button
          class="meeting-web-client__button"
          type="button"
          :disabled="!hasJoinSession || !isLivekit || connectionState !== 'connected'"
          @click="toggleMicrophone"
        >
          {{ micEnabled ? '关闭麦克风' : '开启麦克风' }}
        </button>
        <button
          v-if="mode === 'video'"
          class="meeting-web-client__button meeting-web-client__button--ghost"
          type="button"
          :disabled="!hasJoinSession || !isLivekit || connectionState !== 'connected'"
          @click="toggleCamera"
        >
          {{ cameraEnabled ? '关闭摄像头' : '开启摄像头' }}
        </button>
        <a
          v-if="rtcJoinUrl"
          class="meeting-web-client__button meeting-web-client__button--ghost"
          :href="rtcJoinUrl"
          target="_blank"
          rel="noreferrer"
        >
          外部窗口打开
        </a>
      </div>
    </header>

    <div v-if="connectionError" class="meeting-web-client__error">
      {{ connectionError }}
    </div>

    <div v-if="isUnsupported" class="meeting-web-client__notice">
      当前 provider 为 `{{ provider || 'unknown' }}`，此轮仅正式支持 `livekit` Web 客户端。
    </div>

    <div v-else-if="isMock" class="meeting-web-client__notice">
      mock 模式下仅保留客户端壳，便于本地联调会议详情、字幕与分享链路。
    </div>

    <div v-else-if="!hasJoinSession" class="meeting-web-client__notice">
      {{ joinHint }}
    </div>

    <div v-else class="meeting-web-client__layout">
      <section class="meeting-web-client__stage">
        <div v-if="mode === 'video'" class="meeting-web-client__video-grid">
          <div
            v-for="track in videoTracks"
            :key="track.key"
            class="meeting-web-client__video-tile"
          >
            <video
              :ref="element => setVideoElement(track.key, element)"
              autoplay
              muted
              playsinline
              class="meeting-web-client__video"
            />
            <span class="meeting-web-client__video-label">
              {{ track.label }}
            </span>
          </div>
          <div v-if="videoTracks.length === 0" class="meeting-web-client__video-empty">
            当前暂无可展示的视频流，参会人加入后会自动出现在这里。
          </div>
        </div>

        <div v-else class="meeting-web-client__audio-stage">
          <div class="meeting-web-client__audio-kpi">
            <span>参会人</span>
            <strong>{{ participantCount }}</strong>
          </div>
          <div class="meeting-web-client__audio-kpi">
            <span>麦克风</span>
            <strong>{{ micEnabled ? '已开启' : '未开启' }}</strong>
          </div>
          <div class="meeting-web-client__audio-kpi">
            <span>远端音轨</span>
            <strong>{{ remoteAudioTracks.length }}</strong>
          </div>
        </div>

        <audio
          v-for="track in remoteAudioTracks"
          :key="track.key"
          :ref="element => setAudioElement(track.key, element)"
          autoplay
          class="hidden"
        />
      </section>

      <aside class="meeting-web-client__sidebar">
        <section class="meeting-web-client__panel">
          <div class="meeting-web-client__panel-head">
            <h4>参会人</h4>
            <span>{{ participantCount }}</span>
          </div>
          <div class="meeting-web-client__participant-list">
            <div
              v-for="participant in participants"
              :key="participant.id"
              class="meeting-web-client__participant-item"
            >
              <div>
                <div class="meeting-web-client__participant-name">
                  {{ participant.displayName }}
                </div>
                <div class="meeting-web-client__participant-meta">
                  {{ participant.role }} · 音频 {{ participant.audioTrackState }} · 视频 {{ participant.videoTrackState }}
                </div>
              </div>
            </div>
            <div v-if="participants.length === 0" class="meeting-web-client__empty">
              暂无参会人数据。
            </div>
          </div>
        </section>

        <section class="meeting-web-client__panel">
          <div class="meeting-web-client__panel-head">
            <h4>实时字幕</h4>
            <span>{{ captionItems.length }}</span>
          </div>
          <div class="meeting-web-client__caption-list">
            <div
              v-for="caption in captionItems"
              :key="caption.id"
              class="meeting-web-client__caption-item"
              :class="caption.final ? '' : 'meeting-web-client__caption-item--partial'"
            >
              <div class="meeting-web-client__caption-top">
                <span>{{ caption.speakerLabel || caption.speakerName }}</span>
                <span>{{ formatMs(caption.startedAtMs) }} - {{ formatMs(caption.endedAtMs) }}</span>
              </div>
              <p>{{ caption.text }}</p>
            </div>
            <div v-if="captionItems.length === 0" class="meeting-web-client__empty">
              暂无实时字幕。
            </div>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.meeting-web-client {
  border: 1px solid #e2e8f0;
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #fff, #f8fafc);
  padding: 1rem;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
}

.meeting-web-client__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.meeting-web-client__badge {
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

.meeting-web-client__title {
  margin: 0.75rem 0 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-web-client__hint {
  margin: 0.45rem 0 0;
  font-size: 0.875rem;
  color: #475569;
}

.meeting-web-client__controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

.meeting-web-client__button {
  border: 1px solid #0f172a;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  padding: 0.62rem 0.95rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}

.meeting-web-client__button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.meeting-web-client__button--ghost {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}

.meeting-web-client__error,
.meeting-web-client__notice,
.meeting-web-client__empty,
.meeting-web-client__video-empty {
  margin-top: 1rem;
  border-radius: 1rem;
  padding: 0.95rem 1rem;
  font-size: 0.875rem;
}

.meeting-web-client__error {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #be123c;
}

.meeting-web-client__notice,
.meeting-web-client__empty,
.meeting-web-client__video-empty {
  border: 1px dashed #cbd5e1;
  background: #fff;
  color: #64748b;
}

.meeting-web-client__layout {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 360px);
  gap: 1rem;
}

.meeting-web-client__stage,
.meeting-web-client__panel {
  border: 1px solid #e2e8f0;
  border-radius: 1.25rem;
  background: #fff;
  padding: 0.9rem;
}

.meeting-web-client__video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.meeting-web-client__video-tile {
  position: relative;
  min-height: 220px;
  overflow: hidden;
  border-radius: 1rem;
  background: radial-gradient(circle at top, #1e293b, #020617);
}

.meeting-web-client__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.meeting-web-client__video-label {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
}

.meeting-web-client__audio-stage {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.meeting-web-client__audio-kpi {
  border-radius: 1rem;
  background: linear-gradient(180deg, #eff6ff, #f8fafc);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: #1e3a8a;
}

.meeting-web-client__audio-kpi span {
  font-size: 0.78rem;
  color: #64748b;
}

.meeting-web-client__audio-kpi strong {
  font-size: 1.35rem;
  color: #0f172a;
}

.meeting-web-client__sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.meeting-web-client__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.meeting-web-client__panel-head h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-web-client__panel-head span {
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-web-client__participant-list,
.meeting-web-client__caption-list {
  margin-top: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.meeting-web-client__participant-item,
.meeting-web-client__caption-item {
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #fff;
  padding: 0.85rem 0.9rem;
}

.meeting-web-client__participant-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-web-client__participant-meta {
  margin-top: 0.35rem;
  font-size: 0.78rem;
  color: #64748b;
}

.meeting-web-client__caption-item--partial {
  background: #fffbeb;
  border-color: #fde68a;
}

.meeting-web-client__caption-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-web-client__caption-item p {
  margin: 0.45rem 0 0;
  font-size: 0.875rem;
  color: #334155;
  line-height: 1.6;
}

@media (max-width: 1024px) {
  .meeting-web-client__layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .meeting-web-client__header,
  .meeting-web-client__audio-stage {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .meeting-web-client__controls {
    justify-content: flex-start;
  }
}
</style>
