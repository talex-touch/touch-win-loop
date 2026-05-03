<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type {
  DefenseRealtimeMediaMode,
  DefenseRealtimeProvider,
  DefenseRealtimeRuntimeOptions,
  DefenseRealtimeSessionMeta,
  ProjectMeetingMode,
  ProjectMeetingTrackState,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'

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
  audioTrackState: ProjectMeetingTrackState | string
  videoTrackState: ProjectMeetingTrackState | string
  screenShareTrackState: ProjectMeetingTrackState | string
  screenShareAudioTrackState: ProjectMeetingTrackState | string
  joinedAt?: string | null
  leftAt?: string | null
}

type MediaTrackSource = 'microphone' | 'camera' | 'screen_share' | 'screen_share_audio' | 'unknown'

interface MediaTrackItem {
  key: string
  kind: 'audio' | 'video'
  source: MediaTrackSource
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
  meetingGuestToken?: string
  guest?: boolean
  defenseRealtimeState?: DefenseRealtimeSessionMeta | null
  defenseRealtimeOptions?: DefenseRealtimeRuntimeOptions | null
  defenseRealtimeLogs?: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    createdAt: string
  }>
}>(), {
  provider: '',
  mode: 'video',
  meetingId: '',
  title: '',
  rtcJoinToken: '',
  rtcJoinExpiresAt: '',
  rtcServerUrl: '',
  rtcJoinUrl: '',
  participants: () => [],
  captions: () => [],
  meetingGuestToken: '',
  guest: false,
  defenseRealtimeState: null,
  defenseRealtimeOptions: null,
  defenseRealtimeLogs: () => [],
})

const emit = defineEmits<{
  startDefenseRealtimeSidecar: []
  updateDefenseRealtimeProvider: [provider: DefenseRealtimeProvider]
  updateDefenseRealtimeMediaMode: [mode: DefenseRealtimeMediaMode]
  toggleDefenseRealtimeAudio: [enabled: boolean]
  toggleDefenseRealtimeVideo: [enabled: boolean]
  interruptDefenseRealtime: []
  reconnectDefenseRealtime: []
}>()

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const roomRef = shallowRef<any>(null)
const mediaTracks = ref<MediaTrackItem[]>([])
const connectionState = ref<'idle' | 'connecting' | 'connected' | 'error'>('idle')
const connectionError = ref('')
const micEnabled = ref(false)
const cameraEnabled = ref(false)
const screenShareEnabled = ref(false)
const screenShareAudioEnabled = ref(false)
const screenShareHint = ref('')
const screenShareBusy = ref(false)
const captionUploadState = ref<'idle' | 'capturing' | 'error'>('idle')
const captionUploadHint = ref('')

const videoElements = new Map<string, HTMLVideoElement>()
const audioElements = new Map<string, HTMLAudioElement>()
const boundVideoTracks = new Map<string, any>()
const boundAudioTracks = new Map<string, any>()
let captionAudioContext: AudioContext | null = null
let captionSourceNode: MediaStreamAudioSourceNode | null = null
let captionProcessorNode: ScriptProcessorNode | null = null
let captionSilentGainNode: GainNode | null = null
let captionFlushTimer: number | null = null
let captionPcmChunks: Uint8Array[] = []
let captionPendingBytes = 0
let captionUploading = false
let captionTrackKey = ''
let captionParticipantIdentity = ''
let captionSampleRate = 0
let captionCaptureEpoch = 0

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

function resolveTrackSource(value: unknown): MediaTrackSource {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'microphone')
    return 'microphone'
  if (normalized === 'camera')
    return 'camera'
  if (normalized === 'screen_share')
    return 'screen_share'
  if (normalized === 'screen_share_audio')
    return 'screen_share_audio'
  return 'unknown'
}

function resolveCaptionUploadLabel(): string {
  if (captionUploadState.value === 'capturing')
    return '上行中'
  if (captionUploadState.value === 'error')
    return '异常'
  return '待机'
}

function clearCaptionFlushTimer(): void {
  if (!captionFlushTimer)
    return
  window.clearTimeout(captionFlushTimer)
  captionFlushTimer = null
}

function encodePcm16Mono(samples: Float32Array): Uint8Array {
  const pcm = new ArrayBuffer(samples.length * 2)
  const view = new DataView(pcm)
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] || 0))
    view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true)
  }
  return new Uint8Array(pcm)
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, item) => sum + item.byteLength, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += step) {
    const slice = bytes.subarray(offset, Math.min(bytes.byteLength, offset + step))
    binary += String.fromCharCode(...slice)
  }
  return window.btoa(binary)
}

function buildTrackLabel(baseLabel: string, source: MediaTrackSource): string {
  if (source === 'screen_share')
    return `${baseLabel} · 共享画面`
  if (source === 'screen_share_audio')
    return `${baseLabel} · 共享音频`
  if (source === 'microphone')
    return `${baseLabel} · 麦克风`
  return baseLabel
}

function buildTrackKey(
  participantIdentity: string,
  publicationSid: string,
  source: MediaTrackSource,
  kind: 'audio' | 'video',
): string {
  return `${participantIdentity}:${publicationSid}:${source}:${kind}`
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
    const kind = normalizeString(track?.kind || publication?.kind) as 'audio' | 'video'
    if (!track || (kind !== 'audio' && kind !== 'video'))
      return []

    const source = resolveTrackSource(track?.source || publication?.source)
    return [{
      key: buildTrackKey(
        normalizeString(participant?.identity || publication?.participantSid || publication?.trackSid || publication?.sid || 'participant'),
        normalizeString(publication?.trackSid || publication?.sid || track?.sid || kind),
        source,
        kind,
      ),
      kind,
      source,
      label: buildTrackLabel(input.label, source),
      isLocal: input.isLocal,
      track,
    }]
  })
}

function syncLocalState(room: any): void {
  const participant = room?.localParticipant
  micEnabled.value = Boolean(participant?.isMicrophoneEnabled)
  cameraEnabled.value = props.mode === 'video' && Boolean(participant?.isCameraEnabled)
  screenShareEnabled.value = props.mode === 'video' && Boolean(participant?.isScreenShareEnabled)
  screenShareAudioEnabled.value = mediaTracks.value.some(
    item => item.isLocal && item.kind === 'audio' && item.source === 'screen_share_audio',
  )
}

function syncRoomTracks(): void {
  const room = roomRef.value
  if (!room) {
    mediaTracks.value = []
    screenShareHint.value = ''
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
  syncLocalState(room)
  void nextTick(() => {
    syncTrackBindings()
  })
  void syncCaptionCapture()
}

function resolveLocalMicrophoneTrack(room: any): MediaStreamTrack | null {
  const publications: any[] = Array.from(room?.localParticipant?.trackPublications?.values?.() || [])
  for (const publication of publications) {
    if (resolveTrackSource(publication?.source || publication?.track?.source) !== 'microphone')
      continue
    const mediaStreamTrack = publication?.track?.mediaStreamTrack
    if (mediaStreamTrack instanceof MediaStreamTrack)
      return mediaStreamTrack
  }
  return null
}

async function postCaptionFrame(chunkBase64: string): Promise<void> {
  const meetingId = normalizeString(props.meetingId)
  const participantIdentity = normalizeString(captionParticipantIdentity)
  if (!import.meta.client || !meetingId || !chunkBase64 || !participantIdentity)
    return

  const response = await fetch(endpoint(`/meetings/${meetingId}/captions/frame`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      meetingGuestToken: normalizeString(props.meetingGuestToken) || undefined,
      participantIdentity,
      chunkBase64,
      mimeType: captionSampleRate > 0
        ? `audio/pcm;rate=${captionSampleRate};channels=1;encoding=s16le`
        : 'audio/pcm;channels=1;encoding=s16le',
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(normalizeString(payload?.message) || '字幕音频上传失败。')
  }
}

async function flushCaptionQueue(force = false): Promise<void> {
  clearCaptionFlushTimer()
  if (captionUploading || captionPcmChunks.length === 0)
    return
  if (!force && captionPendingBytes < 32 * 1024)
    return

  const currentEpoch = captionCaptureEpoch
  const merged = concatUint8Arrays(captionPcmChunks)
  captionPcmChunks = []
  captionPendingBytes = 0
  captionUploading = true

  try {
    await postCaptionFrame(toBase64(merged))
    if (currentEpoch === captionCaptureEpoch) {
      captionUploadState.value = 'capturing'
      captionUploadHint.value = '字幕音频正在上行。'
    }
  }
  catch (error) {
    if (currentEpoch === captionCaptureEpoch) {
      captionUploadState.value = 'error'
      captionUploadHint.value = error instanceof Error ? error.message : '字幕音频上传失败。'
    }
  }
  finally {
    captionUploading = false
    if (captionPcmChunks.length > 0)
      void flushCaptionQueue(true)
  }
}

function scheduleCaptionFlush(): void {
  if (captionPendingBytes >= 32 * 1024) {
    void flushCaptionQueue(true)
    return
  }
  if (captionFlushTimer)
    return
  captionFlushTimer = window.setTimeout(() => {
    captionFlushTimer = null
    void flushCaptionQueue(true)
  }, 400)
}

async function stopCaptionCapture(options: { flush?: boolean } = {}): Promise<void> {
  captionCaptureEpoch += 1
  clearCaptionFlushTimer()
  if (options.flush !== false)
    await flushCaptionQueue(true)

  if (captionProcessorNode) {
    captionProcessorNode.onaudioprocess = null
    try {
      captionProcessorNode.disconnect()
    }
    catch {
      // ignore disconnect failures
    }
  }

  if (captionSourceNode) {
    try {
      captionSourceNode.disconnect()
    }
    catch {
      // ignore disconnect failures
    }
  }

  if (captionSilentGainNode) {
    try {
      captionSilentGainNode.disconnect()
    }
    catch {
      // ignore disconnect failures
    }
  }

  if (captionAudioContext) {
    try {
      await captionAudioContext.close()
    }
    catch {
      // ignore close failures
    }
  }

  captionAudioContext = null
  captionSourceNode = null
  captionProcessorNode = null
  captionSilentGainNode = null
  captionPcmChunks = []
  captionPendingBytes = 0
  captionUploading = false
  captionTrackKey = ''
  captionParticipantIdentity = ''
  captionSampleRate = 0

  if (captionUploadState.value !== 'error') {
    captionUploadState.value = 'idle'
    if (!captionUploadHint.value || captionUploadHint.value === '字幕音频正在上行。')
      captionUploadHint.value = ''
  }
}

async function syncCaptionCapture(): Promise<void> {
  if (!import.meta.client || props.provider !== 'livekit') {
    await stopCaptionCapture({ flush: false })
    return
  }

  const room = roomRef.value
  const meetingId = normalizeString(props.meetingId)
  const localParticipant = room?.localParticipant
  const localIdentity = normalizeString(localParticipant?.identity)
  const microphoneTrack = resolveLocalMicrophoneTrack(room)
  const nextTrackKey = microphoneTrack ? `${localIdentity}:${microphoneTrack.id}` : ''

  if (
    !room
    || connectionState.value !== 'connected'
    || !meetingId
    || !localParticipant?.isMicrophoneEnabled
    || !localIdentity
    || !microphoneTrack
  ) {
    await stopCaptionCapture()
    return
  }

  if (captionTrackKey === nextTrackKey)
    return

  await stopCaptionCapture()

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextCtor) {
    captionUploadState.value = 'error'
    captionUploadHint.value = '当前浏览器不支持会中字幕音频采集。'
    return
  }

  try {
    const audioContext = new AudioContextCtor()
    if (audioContext.state === 'suspended')
      await audioContext.resume().catch(() => undefined)

    const sourceNode = audioContext.createMediaStreamSource(new MediaStream([microphoneTrack]))
    const processorNode = audioContext.createScriptProcessor(4096, 1, 1)
    const silentGainNode = audioContext.createGain()
    silentGainNode.gain.value = 0

    processorNode.onaudioprocess = (audioEvent: AudioProcessingEvent) => {
      if (!localParticipant?.isMicrophoneEnabled)
        return
      const samples = audioEvent.inputBuffer.getChannelData(0)
      const pcmChunk = encodePcm16Mono(samples)
      captionPcmChunks.push(pcmChunk)
      captionPendingBytes += pcmChunk.byteLength
      scheduleCaptionFlush()
    }

    sourceNode.connect(processorNode)
    processorNode.connect(silentGainNode)
    silentGainNode.connect(audioContext.destination)

    captionAudioContext = audioContext
    captionSourceNode = sourceNode
    captionProcessorNode = processorNode
    captionSilentGainNode = silentGainNode
    captionTrackKey = nextTrackKey
    captionParticipantIdentity = localIdentity
    captionSampleRate = audioContext.sampleRate
    captionUploadState.value = 'capturing'
    captionUploadHint.value = '字幕音频正在上行。'
  }
  catch (error) {
    captionUploadState.value = 'error'
    captionUploadHint.value = error instanceof Error ? error.message : '启动字幕音频采集失败。'
    await stopCaptionCapture({ flush: false })
  }
}

async function disconnectRoom(): Promise<void> {
  await stopCaptionCapture()
  releaseAllTrackBindings()
  mediaTracks.value = []
  const room = roomRef.value
  roomRef.value = null
  micEnabled.value = false
  cameraEnabled.value = false
  screenShareEnabled.value = false
  screenShareAudioEnabled.value = false
  screenShareBusy.value = false

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
    screenShareEnabled.value = false
    screenShareAudioEnabled.value = false
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
    screenShareHint.value = ''
    await disconnectRoom()
    return
  }

  await disconnectRoom()
  connectionState.value = 'connecting'
  connectionError.value = ''
  screenShareHint.value = ''

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
      .on(livekit.RoomEvent.MediaDevicesError, (error: Error) => {
        connectionError.value = error?.message || '读取媒体设备失败。'
      })
      .on(livekit.RoomEvent.Disconnected, () => {
        connectionState.value = 'idle'
        void stopCaptionCapture()
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

async function toggleScreenShare(): Promise<void> {
  const room = roomRef.value
  if (!room?.localParticipant || props.mode !== 'video' || props.guest || screenShareBusy.value)
    return

  screenShareBusy.value = true
  connectionError.value = ''
  try {
    if (screenShareEnabled.value) {
      await room.localParticipant.setScreenShareEnabled(false)
      screenShareEnabled.value = false
      screenShareAudioEnabled.value = false
      screenShareHint.value = '屏幕共享已结束。'
      return
    }

    try {
      await room.localParticipant.setScreenShareEnabled(true, {
        audio: true,
        video: true,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include',
      })
      screenShareHint.value = '已开启屏幕共享。若浏览器支持，会同时共享系统音频。'
    }
    catch (error) {
      await room.localParticipant.setScreenShareEnabled(true, {
        audio: false,
        video: true,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      })
      screenShareHint.value = '当前浏览器或授权未提供共享音频，已切换为仅共享画面。'
      Message.warning('当前浏览器或授权未提供共享音频，已切换为仅共享画面。')
      if (error instanceof Error)
        connectionError.value = ''
    }

    syncRoomTracks()
  }
  catch (error) {
    connectionError.value = error instanceof Error ? error.message : '开启屏幕共享失败。'
  }
  finally {
    screenShareBusy.value = false
    syncRoomTracks()
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

function resolveRoleLabel(value: string): string {
  const normalized = normalizeString(value)
  if (normalized === 'host')
    return '主持人'
  if (normalized === 'member')
    return '成员'
  if (normalized === 'guest')
    return '来宾'
  if (normalized === 'system')
    return '系统'
  if (normalized === 'unknown')
    return '待映射'
  return normalized || '参会人'
}

function resolveTrackStateLabel(value: ProjectMeetingTrackState | string, type: 'audio' | 'video' | 'screen' | 'screen_audio'): string | null {
  const normalized = normalizeString(value)
  if (normalized === 'active') {
    if (type === 'audio')
      return '麦克风开启'
    if (type === 'video')
      return '视频开启'
    if (type === 'screen')
      return '屏幕共享中'
    return '共享音频中'
  }
  if (normalized === 'muted') {
    if (type === 'audio')
      return '麦克风静音'
    if (type === 'video')
      return '视频静默'
    if (type === 'screen')
      return '共享暂停'
    return '共享音频静音'
  }
  if (normalized === 'ended') {
    if (type === 'screen')
      return '共享已结束'
    if (type === 'screen_audio')
      return '共享音频已结束'
    return null
  }
  return null
}

function buildParticipantMeta(participant: MeetingParticipantItem): string {
  const parts = [resolveRoleLabel(participant.role)]
  const statuses = [
    resolveTrackStateLabel(participant.audioTrackState, 'audio'),
    resolveTrackStateLabel(participant.videoTrackState, 'video'),
    resolveTrackStateLabel(participant.screenShareTrackState, 'screen'),
    resolveTrackStateLabel(participant.screenShareAudioTrackState, 'screen_audio'),
  ].filter(Boolean)
  return [...parts, ...statuses].join(' · ')
}

const hasJoinSession = computed(() => Boolean(normalizeString(props.rtcJoinToken) && normalizeString(props.rtcServerUrl)))
const isLivekit = computed(() => normalizeString(props.provider).toLowerCase() === 'livekit')
const isConfigured = computed(() => Boolean(normalizeString(props.provider)))
const isUnsupported = computed(() => isConfigured.value && !isLivekit.value)
const cameraTracks = computed(() => mediaTracks.value.filter(item => item.kind === 'video' && item.source !== 'screen_share'))
const screenShareTracks = computed(() => mediaTracks.value.filter(item => item.kind === 'video' && item.source === 'screen_share'))
const remoteMicrophoneTracks = computed(() => mediaTracks.value.filter(item => item.kind === 'audio' && !item.isLocal && item.source !== 'screen_share_audio'))
const remoteScreenShareAudioTracks = computed(() => mediaTracks.value.filter(item => item.kind === 'audio' && !item.isLocal && item.source === 'screen_share_audio'))
const remoteAudioTracks = computed(() => mediaTracks.value.filter(item => item.kind === 'audio' && !item.isLocal))
const participantCount = computed(() => {
  if (props.participants.length > 0)
    return props.participants.length
  const room = roomRef.value
  const remoteCount = Array.from(room?.remoteParticipants?.values?.() || []).length
  return remoteCount + (room?.localParticipant ? 1 : 0)
})
const captionItems = computed(() => [...props.captions].slice(-18))
const canShareScreen = computed(() => !props.guest && props.mode === 'video' && hasJoinSession.value && isLivekit.value && connectionState.value === 'connected')
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
  if (!isConfigured.value)
    return '会议服务未配置，请联系管理员在后台完成 LiveKit / ASR 配置。'
  if (isUnsupported.value)
    return '当前 RTC provider 暂未适配站内 Web 客户端。'
  if (!hasJoinSession.value)
    return '请先点击加入会议，系统会在当前页加载站内会议客户端。'
  return ''
})
const audioStageStats = computed(() => [
  { label: '参会人', value: String(participantCount.value) },
  { label: '麦克风', value: micEnabled.value ? '已开启' : '未开启' },
  { label: '远端音轨', value: String(remoteMicrophoneTracks.value.length) },
  { label: '共享音频', value: String(remoteScreenShareAudioTracks.value.length) },
])
const showDefenseRealtimeSidecar = computed(() => {
  return Boolean(
    normalizeString(props.defenseRealtimeState?.linkedMeetingId)
    && normalizeString(props.defenseRealtimeState?.linkedMeetingId) === normalizeString(props.meetingId),
  )
})
const canManageDefenseRealtimeSidecar = computed(() => !props.guest && isLivekit.value && hasJoinSession.value)
const defenseRealtimeProvider = computed<DefenseRealtimeProvider>(() => props.defenseRealtimeState?.provider === 'coze' ? 'coze' : 'qwen')
const defenseRealtimeMediaMode = computed<DefenseRealtimeMediaMode>(() => props.defenseRealtimeState?.mediaMode === 'audio' ? 'audio' : 'audio_video')
const cozeRealtimeSelectable = computed(() => props.defenseRealtimeOptions?.coze.configured !== false)
const defenseRealtimeLocked = computed(() => {
  const state = normalizeString(props.defenseRealtimeState?.connectionState)
  return props.defenseRealtimeState?.bootstrapState === 'bootstrapping'
    || state === 'connecting'
    || state === 'connected'
    || state === 'ready'
})
const canStartDefenseRealtimeSidecar = computed(() => {
  return canManageDefenseRealtimeSidecar.value
    && !showDefenseRealtimeSidecar.value
    && connectionState.value === 'connected'
})
const canInterruptDefenseRealtimeSidecar = computed(() => {
  const state = normalizeString(props.defenseRealtimeState?.connectionState)
  return showDefenseRealtimeSidecar.value && (state === 'connected' || state === 'ready' || state === 'speaking')
})
const defenseRealtimeVideoToggleDisabled = computed(() => defenseRealtimeMediaMode.value === 'audio')

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
        <button
          v-if="mode === 'video' && !guest"
          class="meeting-web-client__button meeting-web-client__button--share"
          type="button"
          :disabled="!canShareScreen || screenShareBusy"
          @click="toggleScreenShare"
        >
          {{
            screenShareBusy ? '处理中...'
            : screenShareEnabled ? '停止共享' : '开始共享'
          }}
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

    <div v-if="screenShareHint && isLivekit && connectionState === 'connected'" class="meeting-web-client__notice">
      {{ screenShareHint }}
    </div>

    <div v-if="captionUploadHint && isLivekit && connectionState === 'connected'" class="meeting-web-client__notice">
      字幕上行：{{ captionUploadHint }}
    </div>

    <div v-if="isUnsupported" class="meeting-web-client__notice">
      当前 provider 为 `{{ provider || 'unknown' }}`，此轮仅正式支持 `livekit` Web 客户端。
    </div>

    <div v-else-if="!isConfigured" class="meeting-web-client__notice">
      会议服务尚未配置。请先在后台完成 LiveKit / ASR 参数配置，再创建或启动会议。
    </div>

    <div v-else-if="!hasJoinSession" class="meeting-web-client__notice">
      {{ joinHint }}
    </div>

    <div v-else class="meeting-web-client__layout">
      <section class="meeting-web-client__stage">
        <template v-if="mode === 'video'">
          <section v-if="screenShareTracks.length > 0" class="meeting-web-client__media-section">
            <div class="meeting-web-client__section-head">
              <h4>共享区</h4>
              <span>{{ screenShareTracks.length }} 路共享</span>
            </div>
            <div class="meeting-web-client__share-grid">
              <div
                v-for="track in screenShareTracks"
                :key="track.key"
                class="meeting-web-client__video-tile meeting-web-client__video-tile--share"
              >
                <video
                  :ref="element => setVideoElement(track.key, element)"
                  autoplay
                  muted
                  playsinline
                  class="meeting-web-client__video"
                />
                <span class="meeting-web-client__video-badge">
                  共享中
                </span>
                <span class="meeting-web-client__video-label">
                  {{ track.label }}
                </span>
              </div>
            </div>
          </section>

          <section class="meeting-web-client__media-section">
            <div class="meeting-web-client__section-head">
              <h4>摄像头区</h4>
              <span>{{ cameraTracks.length }} 路画面</span>
            </div>
            <div v-if="cameraTracks.length > 0" class="meeting-web-client__video-grid">
              <div
                v-for="track in cameraTracks"
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
            </div>
            <div v-else class="meeting-web-client__video-empty">
              当前暂无可展示的摄像头画面，参会人加入或打开摄像头后会自动出现在这里。
            </div>
          </section>
        </template>

        <div v-else class="meeting-web-client__audio-stage">
          <div
            v-for="item in audioStageStats"
            :key="item.label"
            class="meeting-web-client__audio-kpi"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
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
                  {{ buildParticipantMeta(participant) }}
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
            <h4>会中状态</h4>
            <span>{{ mode === 'audio' ? '语音' : '视频' }}</span>
          </div>
          <div class="meeting-web-client__status-list">
            <div class="meeting-web-client__status-item">
              <span>本地麦克风</span>
              <strong>{{ micEnabled ? '已开启' : '未开启' }}</strong>
            </div>
            <div v-if="mode === 'video'" class="meeting-web-client__status-item">
              <span>本地摄像头</span>
              <strong>{{ cameraEnabled ? '已开启' : '未开启' }}</strong>
            </div>
            <div v-if="mode === 'video'" class="meeting-web-client__status-item">
              <span>本地共享</span>
              <strong>{{ screenShareEnabled ? '共享中' : '未共享' }}</strong>
            </div>
            <div v-if="mode === 'video'" class="meeting-web-client__status-item">
              <span>共享音频</span>
              <strong>{{ screenShareAudioEnabled ? '已带音频' : '未检测到' }}</strong>
            </div>
            <div class="meeting-web-client__status-item">
              <span>远端共享音频</span>
              <strong>{{ remoteScreenShareAudioTracks.length }} 路</strong>
            </div>
            <div class="meeting-web-client__status-item">
              <span>远端麦克风</span>
              <strong>{{ remoteMicrophoneTracks.length }} 路</strong>
            </div>
            <div class="meeting-web-client__status-item">
              <span>字幕上行</span>
              <strong>{{ resolveCaptionUploadLabel() }}</strong>
            </div>
          </div>
        </section>

        <section v-if="canManageDefenseRealtimeSidecar || showDefenseRealtimeSidecar" class="meeting-web-client__panel">
          <div class="meeting-web-client__panel-head">
            <h4>AI Sidecar</h4>
            <span>{{ defenseRealtimeProvider === 'coze' ? 'Coze' : '百炼' }}</span>
          </div>
          <div v-if="canManageDefenseRealtimeSidecar" class="meeting-web-client__sidecar-actions">
            <button
              v-if="!showDefenseRealtimeSidecar"
              class="meeting-web-client__button meeting-web-client__button--compact"
              type="button"
              :disabled="!canStartDefenseRealtimeSidecar"
              @click="emit('startDefenseRealtimeSidecar')"
            >
              启动 Sidecar
            </button>
            <template v-else>
              <button
                class="meeting-web-client__button meeting-web-client__button--compact"
                type="button"
                :disabled="!canInterruptDefenseRealtimeSidecar"
                @click="emit('interruptDefenseRealtime')"
              >
                打断
              </button>
              <button
                class="meeting-web-client__button meeting-web-client__button--compact meeting-web-client__button--ghost"
                type="button"
                @click="emit('toggleDefenseRealtimeAudio', !(defenseRealtimeState?.audioEnabled !== false))"
              >
                麦克风 {{ defenseRealtimeState?.audioEnabled !== false ? '开' : '关' }}
              </button>
              <button
                class="meeting-web-client__button meeting-web-client__button--compact meeting-web-client__button--ghost"
                type="button"
                :disabled="defenseRealtimeVideoToggleDisabled"
                @click="emit('toggleDefenseRealtimeVideo', !(defenseRealtimeState?.videoEnabled === true))"
              >
                摄像头 {{ defenseRealtimeState?.videoEnabled === true ? '开' : '关' }}
              </button>
              <button
                class="meeting-web-client__button meeting-web-client__button--compact meeting-web-client__button--ghost"
                type="button"
                :disabled="defenseRealtimeState?.bootstrapState === 'bootstrapping'"
                @click="emit('reconnectDefenseRealtime')"
              >
                重连
              </button>
            </template>
          </div>
          <div v-if="canManageDefenseRealtimeSidecar && !showDefenseRealtimeSidecar" class="meeting-web-client__sidecar-selects">
            <label>
              <span>实时链路</span>
              <select
                :value="defenseRealtimeProvider"
                :disabled="defenseRealtimeLocked"
                @change="emit('updateDefenseRealtimeProvider', (($event.target as HTMLSelectElement).value === 'coze' && cozeRealtimeSelectable ? 'coze' : 'qwen'))"
              >
                <option value="qwen">百炼</option>
                <option value="coze" :disabled="!cozeRealtimeSelectable">Coze</option>
              </select>
            </label>
            <label>
              <span>媒体</span>
              <select
                :value="defenseRealtimeMediaMode"
                :disabled="defenseRealtimeLocked"
                @change="emit('updateDefenseRealtimeMediaMode', (($event.target as HTMLSelectElement).value === 'audio' ? 'audio' : 'audio_video'))"
              >
                <option value="audio_video">音视频理解</option>
                <option value="audio">仅音频</option>
              </select>
            </label>
          </div>
          <div class="meeting-web-client__status-list">
            <div class="meeting-web-client__status-item">
              <span>连接态</span>
              <strong>{{ defenseRealtimeState?.connectionState || 'idle' }}</strong>
            </div>
            <div class="meeting-web-client__status-item">
              <span>媒体</span>
              <strong>{{ defenseRealtimeState?.mediaMode === 'audio' ? '仅音频' : '音视频理解' }}</strong>
            </div>
            <div class="meeting-web-client__status-item">
              <span>当前评委</span>
              <strong>{{ defenseRealtimeState?.latestSpeakerLabel || '等待首句' }}</strong>
            </div>
            <div class="meeting-web-client__status-item">
              <span>延迟</span>
              <strong>{{ defenseRealtimeState?.latestLatencyMs ? `${Math.round(defenseRealtimeState.latestLatencyMs)} ms` : '暂无' }}</strong>
            </div>
          </div>
          <div v-if="defenseRealtimeState?.lastError" class="meeting-web-client__notice mt-3">
            sidecar 异常：{{ defenseRealtimeState.lastError }}
          </div>
          <div v-if="defenseRealtimeLogs.length > 0" class="meeting-web-client__caption-list mt-3">
            <div
              v-for="item in defenseRealtimeLogs.slice(-3)"
              :key="item.id"
              class="meeting-web-client__caption-item"
            >
              <div class="meeting-web-client__caption-top">
                <span>Provider 日志</span>
                <span>{{ formatDateTime(item.createdAt) }}</span>
              </div>
              <p>{{ item.message }}</p>
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

.meeting-web-client__button--compact {
  padding: 0.45rem 0.7rem;
  font-size: 0.78rem;
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

.meeting-web-client__button--share {
  background: linear-gradient(135deg, #0f766e, #0f172a);
  border-color: #0f766e;
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

.meeting-web-client__media-section + .meeting-web-client__media-section {
  margin-top: 1rem;
}

.meeting-web-client__section-head,
.meeting-web-client__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.meeting-web-client__section-head h4,
.meeting-web-client__panel-head h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-web-client__section-head span,
.meeting-web-client__panel-head span {
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-web-client__share-grid,
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

.meeting-web-client__video-tile--share {
  min-height: 260px;
  border: 1px solid rgba(20, 184, 166, 0.35);
  box-shadow: inset 0 0 0 1px rgba(20, 184, 166, 0.12);
}

.meeting-web-client__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.meeting-web-client__video-label,
.meeting-web-client__video-badge {
  position: absolute;
  border-radius: 999px;
  color: #fff;
  font-size: 0.75rem;
}

.meeting-web-client__video-label {
  left: 0.75rem;
  bottom: 0.75rem;
  background: rgba(15, 23, 42, 0.72);
  padding: 0.25rem 0.55rem;
}

.meeting-web-client__video-badge {
  top: 0.75rem;
  right: 0.75rem;
  background: rgba(15, 118, 110, 0.92);
  padding: 0.25rem 0.6rem;
}

.meeting-web-client__audio-stage {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
}

.meeting-web-client__audio-kpi strong {
  font-size: 1.2rem;
  color: #0f172a;
}

.meeting-web-client__sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.meeting-web-client__participant-list,
.meeting-web-client__caption-list,
.meeting-web-client__status-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meeting-web-client__sidecar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.meeting-web-client__sidecar-selects {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.meeting-web-client__sidecar-selects label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.74rem;
  color: #475569;
}

.meeting-web-client__sidecar-selects select {
  min-width: 0;
  border: 1px solid #cbd5e1;
  border-radius: 0.65rem;
  background: #fff;
  color: #0f172a;
  padding: 0.4rem 0.5rem;
  font-size: 0.78rem;
}

.meeting-web-client__participant-item,
.meeting-web-client__caption-item,
.meeting-web-client__status-item {
  border-radius: 1rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 0.75rem;
}

.meeting-web-client__participant-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-web-client__participant-meta {
  margin-top: 0.3rem;
  font-size: 0.78rem;
  line-height: 1.6;
  color: #64748b;
}

.meeting-web-client__status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.meeting-web-client__status-item span {
  font-size: 0.82rem;
  color: #475569;
}

.meeting-web-client__status-item strong {
  font-size: 0.82rem;
  color: #0f172a;
}

.meeting-web-client__caption-item--partial {
  border-style: dashed;
}

.meeting-web-client__caption-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #475569;
}

.meeting-web-client__caption-item p {
  margin: 0.45rem 0 0;
  font-size: 0.88rem;
  line-height: 1.65;
  color: #0f172a;
}

@media (max-width: 1024px) {
  .meeting-web-client__layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .meeting-web-client__header {
    flex-direction: column;
  }

  .meeting-web-client__controls {
    width: 100%;
    justify-content: flex-start;
  }

  .meeting-web-client__audio-stage {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .meeting-web-client__share-grid,
  .meeting-web-client__video-grid {
    grid-template-columns: 1fr;
  }
}
</style>
