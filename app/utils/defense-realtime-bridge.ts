import type {
  DefenseRealtimeBootstrapPayload,
  DefenseRealtimeConnectionState,
  DefenseRealtimeNormalizedEvent,
  DefenseRealtimeProvider,
} from '~~/shared/types/domain'
import type {
  DefenseRealtimeAudioChunk,
  DefenseRealtimeMediaController,
  DefenseRealtimeVideoFrame,
} from '~/utils/defense-realtime-media-controller'

export interface DefenseRealtimeProviderBridge {
  bootstrap: () => Promise<DefenseRealtimeBootstrapPayload>
  connect: (mediaController: DefenseRealtimeMediaController) => Promise<void>
  disconnect: () => Promise<void>
  interrupt: () => Promise<void>
  setAudioEnabled: (enabled: boolean) => Promise<void>
  setVideoEnabled: (enabled: boolean) => Promise<void>
  onEvent: (listener: (event: DefenseRealtimeNormalizedEvent) => void) => () => void
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function nowIsoString(): string {
  return new Date().toISOString()
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function safeJsonParse<T = Record<string, unknown>>(value: string): T | null {
  const normalized = normalizeString(value)
  if (!normalized)
    return null
  try {
    return JSON.parse(normalized) as T
  }
  catch {
    return null
  }
}

function buildRealtimeWsUrl(rawUrl: string): string {
  const normalizedUrl = normalizeString(rawUrl)
  if (!normalizedUrl || !import.meta.client)
    return normalizedUrl

  if (/^wss?:\/\//i.test(normalizedUrl))
    return normalizedUrl

  if (/^https?:\/\//i.test(normalizedUrl)) {
    const parsed = new URL(normalizedUrl)
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    return parsed.toString()
  }

  const origin = window.location.origin.replace(/^http/i, 'ws')
  const path = normalizedUrl.startsWith('/') ? normalizedUrl : `/${normalizedUrl}`
  return `${origin}${path}`
}

function extractTextCandidate(value: unknown, depth = 0): string {
  if (depth > 4 || value == null)
    return ''
  if (typeof value === 'string')
    return normalizeString(value)
  if (typeof value === 'number')
    return String(value)
  if (Array.isArray(value))
    return value.map(item => extractTextCandidate(item, depth + 1)).find(Boolean) || ''
  if (typeof value !== 'object')
    return ''

  const record = value as Record<string, unknown>
  const directKeys = [
    'text',
    'spoken',
    'delta',
    'content',
    'transcript',
    'answer',
    'message',
    'value',
  ] as const
  for (const key of directKeys) {
    const candidate = extractTextCandidate(record[key], depth + 1)
    if (candidate)
      return candidate
  }
  for (const nestedKey of ['payload', 'output', 'data', 'message', 'event']) {
    const candidate = extractTextCandidate(record[nestedKey], depth + 1)
    if (candidate)
      return candidate
  }
  return ''
}

function extractNumericCandidate(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function extractLatencyMs(value: unknown): number | null {
  const record = normalizeObject(value)
  const directKeys = ['latency', 'latencyMs', 'latency_ms', 'rtt', 'roundTripMs']
  for (const key of directKeys) {
    const numeric = extractNumericCandidate(record[key])
    if (numeric !== null && numeric >= 0)
      return numeric
  }

  const timestamps = normalizeObject(record.timestamps)
  const timestampValues = Object.values(timestamps)
    .map(item => extractNumericCandidate(item))
    .filter((item): item is number => item !== null && item >= 0)
  if (timestampValues.length >= 2)
    return Math.max(...timestampValues) - Math.min(...timestampValues)

  return null
}

function createEventMetadata(event: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...normalizeObject(event),
    ...overrides,
  }
}

function resolveQwenEventName(message: Record<string, unknown>): string {
  const output = normalizeObject(message.payload)?.output
  return normalizeString(normalizeObject(output).event || normalizeObject(message.header).event || normalizeObject(message.header).name)
}

function resolveQwenDialogId(message: Record<string, unknown>): string {
  const output = normalizeObject(normalizeObject(message.payload).output)
  return normalizeString(output.dialog_id || output.dialogId)
}

function resolveQwenRoundId(message: Record<string, unknown>): string {
  const output = normalizeObject(normalizeObject(message.payload).output)
  return normalizeString(output.round_id || output.roundId || normalizeObject(message.header).task_id)
}

function resolveQwenEventText(message: Record<string, unknown>): string {
  const output = normalizeObject(normalizeObject(message.payload).output)
  return extractTextCandidate(output)
}

function resolveQwenFinished(message: Record<string, unknown>): boolean {
  const output = normalizeObject(normalizeObject(message.payload).output)
  return Boolean(output.finished ?? output.is_final ?? output.isFinal)
}

function resolveQwenState(message: Record<string, unknown>): string {
  const output = normalizeObject(normalizeObject(message.payload).output)
  return normalizeString(output.state || output.dialog_state || output.dialogState)
}

function resolveCozeConversationId(payload: DefenseRealtimeBootstrapPayload, event?: unknown): string {
  const record = normalizeObject(event)
  return normalizeString(record.conversationId || record.conversation_id || record.id || payload.coze?.conversationId)
}

function resolveCozeProviderSessionId(event?: unknown): string {
  const record = normalizeObject(event)
  return normalizeString(record.sessionId || record.session_id || record.chatId || record.chat_id || record.id)
}

class Pcm16AudioPlayer {
  private readonly sampleRate: number
  private audioContext: AudioContext | null = null
  private queueTime = 0

  constructor(sampleRate = 24000) {
    this.sampleRate = Math.max(8000, Math.min(48000, Math.trunc(sampleRate)))
  }

  private async ensureContext(): Promise<AudioContext | null> {
    if (!import.meta.client || typeof window === 'undefined')
      return null

    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor)
        return null
      this.audioContext = new AudioContextCtor()
    }
    if (this.audioContext.state === 'suspended' && this.audioContext.resume)
      await this.audioContext.resume()
    return this.audioContext
  }

  async play(bufferLike: ArrayBuffer | ArrayBufferView): Promise<void> {
    const context = await this.ensureContext()
    if (!context)
      return

    const view = bufferLike instanceof ArrayBuffer
      ? new Int16Array(bufferLike)
      : new Int16Array(bufferLike.buffer, bufferLike.byteOffset, Math.floor(bufferLike.byteLength / 2))
    if (!view.length)
      return

    const audioBuffer = context.createBuffer(1, view.length, this.sampleRate)
    const channel = audioBuffer.getChannelData(0)
    for (let index = 0; index < view.length; index += 1) {
      const sample = view[index] || 0
      channel[index] = Math.max(-1, Math.min(1, sample / 0x8000))
    }

    const source = context.createBufferSource()
    source.buffer = audioBuffer
    source.connect(context.destination)
    const startAt = Math.max(context.currentTime, this.queueTime || context.currentTime)
    source.start(startAt)
    this.queueTime = startAt + audioBuffer.duration
  }

  async dispose(): Promise<void> {
    if (!this.audioContext)
      return
    try {
      await this.audioContext.close()
    }
    catch {
    }
    this.audioContext = null
    this.queueTime = 0
  }
}

abstract class BaseDefenseRealtimeBridge implements DefenseRealtimeProviderBridge {
  protected listeners = new Set<(event: DefenseRealtimeNormalizedEvent) => void>()
  protected connectionState: DefenseRealtimeConnectionState = 'idle'
  protected audioEnabled = true
  protected videoEnabled = true
  protected mediaController: DefenseRealtimeMediaController | null = null
  protected mediaCleanupCallbacks: Array<() => void> = []

  constructor(
    protected readonly payload: DefenseRealtimeBootstrapPayload,
  ) {}

  async bootstrap(): Promise<DefenseRealtimeBootstrapPayload> {
    this.emit({
      type: 'session.state',
      provider: this.payload.provider,
      sessionId: this.payload.sessionId,
      meetingId: this.payload.meetingId,
      transport: this.payload.transport,
      createdAt: nowIsoString(),
      connectionState: 'bootstrapping',
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
    })
    return this.payload
  }

  onEvent(listener: (event: DefenseRealtimeNormalizedEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  protected emit(event: DefenseRealtimeNormalizedEvent): void {
    for (const listener of this.listeners)
      listener(event)
  }

  protected emitState(connectionState: DefenseRealtimeConnectionState, metadata: Record<string, unknown> = {}): void {
    this.connectionState = connectionState
    this.emit({
      type: 'session.state',
      provider: this.payload.provider,
      sessionId: this.payload.sessionId,
      meetingId: this.payload.meetingId,
      transport: this.payload.transport,
      createdAt: nowIsoString(),
      connectionState,
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
      conversationId: this.payload.coze?.conversationId || undefined,
      metadata,
    })
  }

  protected bindMediaController(mediaController: DefenseRealtimeMediaController): void {
    this.clearMediaBindings()
    this.mediaController = mediaController
  }

  protected registerMediaCleanup(callback: () => void): void {
    this.mediaCleanupCallbacks.push(callback)
  }

  protected clearMediaBindings(): void {
    for (const cleanup of this.mediaCleanupCallbacks.splice(0))
      cleanup()
  }

  protected emitError(errorMessage: string, metadata: Record<string, unknown> = {}): void {
    this.emit({
      type: 'error',
      provider: this.payload.provider,
      sessionId: this.payload.sessionId,
      meetingId: this.payload.meetingId,
      createdAt: nowIsoString(),
      errorMessage,
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
      metadata,
    })
    this.emitState('error', metadata)
  }

  protected emitLatency(latencyMs: number | null, metadata: Record<string, unknown> = {}): void {
    if (latencyMs === null || latencyMs < 0)
      return
    this.emit({
      type: 'latency',
      provider: this.payload.provider,
      sessionId: this.payload.sessionId,
      meetingId: this.payload.meetingId,
      createdAt: nowIsoString(),
      latencyMs,
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
      metadata,
    })
  }

  async disconnect(): Promise<void> {
    this.clearMediaBindings()
    this.emitState('closed')
  }

  async interrupt(): Promise<void> {
    this.emit({
      type: 'assistant.audio.ended',
      provider: this.payload.provider,
      sessionId: this.payload.sessionId,
      meetingId: this.payload.meetingId,
      createdAt: nowIsoString(),
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
      metadata: {
        reason: 'manual_interrupt',
      },
    })
    this.emitState('interrupted')
  }

  async setAudioEnabled(enabled: boolean): Promise<void> {
    this.audioEnabled = enabled
    if (this.mediaController)
      await this.mediaController.setAudioEnabled(enabled).catch(() => {})
    this.emitState(this.connectionState, {
      audioEnabled: enabled,
    })
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    this.videoEnabled = enabled
    if (this.mediaController)
      await this.mediaController.setVideoEnabled(enabled)
    this.emitState(this.connectionState, {
      videoEnabled: enabled,
    })
  }

  abstract connect(mediaController: DefenseRealtimeMediaController): Promise<void>
}

class QwenBridge extends BaseDefenseRealtimeBridge {
  private socket: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private readonly taskId = globalThis.crypto?.randomUUID?.() || `qwen-${Date.now()}`
  private dialogId = ''
  private readyForAudio = false
  private assistantAudioActive = false
  private latestAssistantText = ''
  private audioPlayer = new Pcm16AudioPlayer(24000)

  async connect(mediaController: DefenseRealtimeMediaController): Promise<void> {
    const baseWsUrl = buildRealtimeWsUrl(normalizeString(this.payload.qwen?.connectionUrl || this.payload.qwen?.baseWsUrl))
    if (!import.meta.client || !baseWsUrl) {
      this.emitError('千问实时链路缺少 WebSocket 地址。')
      return
    }

    this.bindMediaController(mediaController)
    this.emitState('connecting')

    this.registerMediaCleanup(mediaController.onAudioChunk((chunk) => {
      void this.handleAudioChunk(chunk)
    }))
    this.registerMediaCleanup(mediaController.onVideoFrame((frame) => {
      void this.handleVideoFrame(frame)
    }))

    await new Promise<void>((resolve, reject) => {
      let settled = false
      try {
        this.socket = new WebSocket(baseWsUrl)
      }
      catch (error) {
        reject(error instanceof Error ? error : new Error('千问实时链路连接失败。'))
        return
      }

      if (!this.socket) {
        reject(new Error('千问实时链路连接失败。'))
        return
      }

      this.socket.binaryType = 'arraybuffer'
      this.socket.addEventListener('open', () => {
        this.startHeartbeat()
        this.sendStartMessage()
        if (!settled) {
          settled = true
          resolve()
        }
      }, { once: true })
      this.socket.addEventListener('error', () => {
        if (!settled) {
          settled = true
          reject(new Error('千问实时链路连接失败。'))
        }
      }, { once: true })
      this.socket.addEventListener('close', (event) => {
        this.stopHeartbeat()
        if (this.assistantAudioActive) {
          this.assistantAudioActive = false
          this.emit({
            type: 'assistant.audio.ended',
            provider: 'qwen',
            sessionId: this.payload.sessionId,
            meetingId: this.payload.meetingId,
            createdAt: nowIsoString(),
            conversationId: this.dialogId || undefined,
            speakerLabel: 'AgentDef',
            metadata: {
              reason: normalizeString(event.reason) || 'socket_closed',
            },
          })
        }
        if (!settled) {
          settled = true
          reject(new Error(normalizeString(event.reason) || '千问实时链路已关闭。'))
          return
        }
        if (event.code !== 1000) {
          this.emitError(normalizeString(event.reason) || '千问实时链路异常关闭。', {
            closeCode: event.code,
          })
          return
        }
        this.emitState('closed', {
          closeCode: event.code,
        })
      })
      this.socket.addEventListener('message', (event) => {
        void this.handleSocketMessage(event)
      })
    }).catch((error) => {
      this.emitError(error instanceof Error ? error.message : '千问实时链路连接失败。')
      throw error
    })
  }

  override async disconnect(): Promise<void> {
    this.stopHeartbeat()
    if (this.socket && this.socket.readyState < WebSocket.CLOSING)
      this.socket.close(1000, 'client_closed')
    this.socket = null
    await this.audioPlayer.dispose()
    await super.disconnect()
  }

  override async interrupt(): Promise<void> {
    this.sendJson({
      header: {
        action: 'continue-task',
        task_id: this.taskId,
        streaming: 'duplex',
      },
      payload: {
        input: {
          directive: 'CancelSpeech',
          dialog_id: this.dialogId || undefined,
        },
      },
    })
    await super.interrupt()
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.sendJson({
        header: {
          action: 'continue-task',
          task_id: this.taskId,
          streaming: 'duplex',
        },
        payload: {
          input: {
            directive: 'HeartBeat',
            dialog_id: this.dialogId || undefined,
          },
        },
      })
    }, 20_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private buildQwenStartPayload(): Record<string, unknown> {
    const personaPack = this.payload.personaPack
    const workspaceId = normalizeString(this.payload.qwen?.workspaceId)
    const appId = normalizeString(this.payload.qwen?.appId)
    return {
      header: {
        action: 'run-task',
        task_id: this.taskId,
        streaming: 'duplex',
      },
      payload: {
        task_group: 'aigc',
        task: 'multimodal-generation',
        function: 'generation',
        model: normalizeString(this.payload.qwen?.realtimeModel) || 'multimodal-dialog',
        input: {
          directive: 'Start',
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
          ...(appId ? { app_id: appId } : {}),
        },
        parameters: {
          upstream: {
            type: this.payload.mediaMode === 'audio_video' ? 'AudioAndVideo' : 'AudioOnly',
            mode: 'duplex',
            audio_format: 'pcm',
            sample_rate: 16000,
          },
          downstream: {
            voice: normalizeString(this.payload.qwen?.voice) || undefined,
            sample_rate: 24000,
          },
          ...(this.payload.qwen?.vadMode ? { turn_detection: { type: this.payload.qwen.vadMode } } : {}),
          client_info: {
            user_id: normalizeString(personaPack.sessionId || this.payload.sessionId),
            device: {
              uuid: this.taskId,
            },
          },
          biz_params: {
            user_defined_params: {
              winloop_defense: {
                contest_name: normalizeString(personaPack.contestName),
                track_name: normalizeString(personaPack.trackName),
                stage: normalizeString(personaPack.stage),
                turn_count: personaPack.turnCount,
                judges: personaPack.judges.map(item => ({
                  id: item.id,
                  label: item.name,
                  judgeType: item.judgeType,
                  focusAreas: item.focusAreas,
                })),
              },
            },
          },
        },
      },
    }
  }

  private sendStartMessage(): void {
    this.sendJson(this.buildQwenStartPayload())
  }

  private sendJson(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      return
    this.socket.send(JSON.stringify(payload))
  }

  private async handleAudioChunk(chunk: DefenseRealtimeAudioChunk): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.readyForAudio)
      return
    this.socket.send(chunk.pcm)
  }

  private async handleVideoFrame(frame: DefenseRealtimeVideoFrame): Promise<void> {
    if (this.payload.mediaMode !== 'audio_video')
      return
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      return
    this.sendJson({
      header: {
        action: 'continue-task',
        task_id: this.taskId,
        streaming: 'duplex',
      },
      payload: {
        input: {
          directive: 'UpdateInfo',
          dialog_id: this.dialogId || undefined,
        },
        parameters: {
          images: [
            {
              type: 'base64',
              value: frame.base64,
            },
          ],
        },
      },
    })
  }

  private async handleSocketMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data === 'string') {
      const parsed = safeJsonParse<Record<string, unknown>>(event.data)
      if (!parsed)
        return
      this.handleJsonMessage(parsed)
      return
    }

    const binaryChunk = event.data instanceof ArrayBuffer
      ? event.data
      : (ArrayBuffer.isView(event.data) ? event.data : null)
    if (!binaryChunk)
      return

    await this.audioPlayer.play(binaryChunk).catch(() => {})
  }

  private handleJsonMessage(message: Record<string, unknown>): void {
    const eventName = resolveQwenEventName(message)
    const dialogId = resolveQwenDialogId(message)
    const roundId = resolveQwenRoundId(message)
    const text = resolveQwenEventText(message)
    const finished = resolveQwenFinished(message)
    const state = resolveQwenState(message)
    const output = normalizeObject(normalizeObject(message.payload).output)
    const latencyMs = extractLatencyMs(output.extra_info || output)

    if (dialogId)
      this.dialogId = dialogId
    if (latencyMs !== null)
      this.emitLatency(latencyMs, createEventMetadata(output))

    if (eventName === 'RequestAccepted') {
      this.emitState('connecting', {
        providerSessionId: roundId || this.taskId,
        conversationId: dialogId || undefined,
      })
      return
    }

    if (eventName === 'DialogStateChanged') {
      const normalizedState = state.toLowerCase()
      this.readyForAudio = normalizedState === 'listening'
      this.emitState(normalizedState === 'idle' ? 'closed' : 'connected', {
        providerSessionId: roundId || this.taskId,
        conversationId: dialogId || undefined,
        dialogState: state || 'Listening',
      })
      return
    }

    if (eventName === 'SpeechContent') {
      this.emit({
        type: finished ? 'user.transcript.final' : 'user.transcript.partial',
        provider: 'qwen',
        sessionId: this.payload.sessionId,
        meetingId: this.payload.meetingId,
        transport: this.payload.transport,
        createdAt: nowIsoString(),
        conversationId: dialogId || undefined,
        providerSessionId: roundId || this.taskId,
        text,
        speakerLabel: '答辩者',
        audioEnabled: this.audioEnabled,
        videoEnabled: this.videoEnabled,
        isFinal: finished,
        metadata: createEventMetadata(output),
      })
      return
    }

    if (eventName === 'RespondingStarted' || eventName === 'LocalRespondingStarted') {
      this.assistantAudioActive = true
      this.emit({
        type: 'assistant.audio.started',
        provider: 'qwen',
        sessionId: this.payload.sessionId,
        meetingId: this.payload.meetingId,
        transport: this.payload.transport,
        createdAt: nowIsoString(),
        conversationId: dialogId || undefined,
        providerSessionId: roundId || this.taskId,
        speakerLabel: 'AgentDef',
        audioEnabled: this.audioEnabled,
        videoEnabled: this.videoEnabled,
        metadata: createEventMetadata(output),
      })
      return
    }

    if (eventName === 'RespondingContent') {
      this.latestAssistantText = text || this.latestAssistantText
      this.emit({
        type: finished ? 'assistant.transcript.final' : 'assistant.transcript.delta',
        provider: 'qwen',
        sessionId: this.payload.sessionId,
        meetingId: this.payload.meetingId,
        transport: this.payload.transport,
        createdAt: nowIsoString(),
        conversationId: dialogId || undefined,
        providerSessionId: roundId || this.taskId,
        text: this.latestAssistantText,
        speakerLabel: 'AgentDef',
        audioEnabled: this.audioEnabled,
        videoEnabled: this.videoEnabled,
        isFinal: finished,
        metadata: createEventMetadata(output),
      })
      return
    }

    if (eventName === 'RespondingEnded' || eventName === 'LocalRespondingEnded') {
      this.assistantAudioActive = false
      this.emit({
        type: 'assistant.audio.ended',
        provider: 'qwen',
        sessionId: this.payload.sessionId,
        meetingId: this.payload.meetingId,
        transport: this.payload.transport,
        createdAt: nowIsoString(),
        conversationId: dialogId || undefined,
        providerSessionId: roundId || this.taskId,
        speakerLabel: 'AgentDef',
        audioEnabled: this.audioEnabled,
        videoEnabled: this.videoEnabled,
        metadata: createEventMetadata(output, {
          text: this.latestAssistantText,
        }),
      })
      return
    }

    if (eventName === 'TaskFailed' || eventName === 'Error' || eventName === 'Failed') {
      this.emitError(normalizeString(output.message || output.error_message || output.errorMessage) || '千问实时链路返回异常。', createEventMetadata(output))
    }
  }
}

class CozeBridge extends BaseDefenseRealtimeBridge {
  private client: any = null
  private readonly boundEventHandlers: Array<{ eventName: string, handler: (event: unknown) => void }> = []

  async connect(mediaController: DefenseRealtimeMediaController): Promise<void> {
    const accessToken = normalizeString(this.payload.coze?.accessToken)
    const botId = normalizeString(this.payload.coze?.botId)
    const connectorId = normalizeString(this.payload.coze?.connectorId)
    const baseURL = normalizeString(this.payload.coze?.baseUrl)
    if (!import.meta.client || !accessToken || !botId || !baseURL || !connectorId) {
      this.emitError('Coze realtime 缺少连接参数。')
      return
    }

    this.bindMediaController(mediaController)
    this.emitState('connecting')
    try {
      const cozeRealtimeModuleId = '@coze/realtime-api'
      const module = await import(/* @vite-ignore */ cozeRealtimeModuleId).catch((error: unknown) => {
        throw new Error(
          error instanceof Error && error.message
            ? `Coze realtime SDK 未就绪：${error.message}`
            : 'Coze realtime SDK 未安装或当前环境无法加载。',
        )
      })
      const RealtimeClient = module.RealtimeClient
      const EventNames = module.EventNames
      this.client = new RealtimeClient({
        baseURL,
        accessToken,
        botId,
        connectorId,
        voiceId: normalizeString(this.payload.coze?.voiceId) || undefined,
        conversationId: normalizeString(this.payload.coze?.conversationId) || undefined,
        audioMutedDefault: !this.audioEnabled,
        allowPersonalAccessTokenInBrowser: false,
        videoConfig: {
          videoOnDefault: this.videoEnabled,
          renderDom: 'workspace-defense-realtime-preview',
          videoInputDeviceId: normalizeString(mediaController.getVideoInputDeviceId()) || undefined,
        },
        getRoomInfo: async () => this.payload.coze?.roomInfo || undefined,
      })

      const register = (eventName: string | undefined, handler: (event: unknown) => void) => {
        if (!eventName || !this.client?.on)
          return
        this.client.on(eventName, handler)
        this.boundEventHandlers.push({ eventName, handler })
      }

      register(EventNames?.CONNECTING, () => {
        this.emitState('connecting')
      })
      register(EventNames?.CONNECTED, () => {
        this.emitState('connected', {
          conversationId: this.payload.coze?.conversationId || undefined,
        })
      })
      register(EventNames?.DISCONNECTED, () => {
        this.emitState('closed')
      })
      register(EventNames?.INTERRUPTED, () => {
        this.emitState('interrupted')
      })
      register(EventNames?.AUDIO_UNMUTED, () => {
        this.audioEnabled = true
        this.emitState(this.connectionState, {
          audioEnabled: true,
        })
      })
      register(EventNames?.AUDIO_MUTED, () => {
        this.audioEnabled = false
        this.emitState(this.connectionState, {
          audioEnabled: false,
        })
      })
      register(EventNames?.VIDEO_ON, () => {
        this.videoEnabled = true
        this.emitState(this.connectionState, {
          videoEnabled: true,
        })
      })
      register(EventNames?.VIDEO_OFF, () => {
        this.videoEnabled = false
        this.emitState(this.connectionState, {
          videoEnabled: false,
        })
      })
      register(EventNames?.NETWORK_QUALITY, (event) => {
        this.emitLatency(extractLatencyMs(event), createEventMetadata(event))
      })
      register(EventNames?.ROOM_INFO, (event) => {
        this.emitState(this.connectionState, createEventMetadata(event))
      })
      register(EventNames?.VIDEO_ERROR, (event) => {
        this.emitError(extractTextCandidate(event) || 'Coze 视频链路异常。', createEventMetadata(event))
      })
      register(EventNames?.ERROR, (event) => {
        this.emitError(extractTextCandidate(event) || 'Coze realtime 异常。', createEventMetadata(event))
      })
      register(EventNames?.SERVER_ERROR, (event) => {
        this.emitError(extractTextCandidate(event) || 'Coze 服务端异常。', createEventMetadata(event))
      })
      register(EventNames?.SESSION_CREATED, (event) => {
        this.emitState(this.connectionState, {
          providerSessionId: resolveCozeProviderSessionId(event) || undefined,
          conversationId: resolveCozeConversationId(this.payload, event) || undefined,
        })
      })
      register(EventNames?.SESSION_UPDATED, (event) => {
        this.emitState(this.connectionState, createEventMetadata(event, {
          providerSessionId: resolveCozeProviderSessionId(event) || undefined,
          conversationId: resolveCozeConversationId(this.payload, event) || undefined,
        }))
      })
      register(EventNames?.AUDIO_AGENT_SPEECH_STARTED, (event) => {
        this.emit({
          type: 'assistant.audio.started',
          provider: 'coze',
          sessionId: this.payload.sessionId,
          meetingId: this.payload.meetingId,
          transport: this.payload.transport,
          createdAt: nowIsoString(),
          conversationId: resolveCozeConversationId(this.payload, event) || undefined,
          providerSessionId: resolveCozeProviderSessionId(event) || undefined,
          speakerLabel: 'AgentDef',
          audioEnabled: this.audioEnabled,
          videoEnabled: this.videoEnabled,
          metadata: createEventMetadata(event),
        })
      })
      register(EventNames?.AUDIO_AGENT_SPEECH_STOPPED, (event) => {
        this.emit({
          type: 'assistant.audio.ended',
          provider: 'coze',
          sessionId: this.payload.sessionId,
          meetingId: this.payload.meetingId,
          transport: this.payload.transport,
          createdAt: nowIsoString(),
          conversationId: resolveCozeConversationId(this.payload, event) || undefined,
          providerSessionId: resolveCozeProviderSessionId(event) || undefined,
          speakerLabel: 'AgentDef',
          audioEnabled: this.audioEnabled,
          videoEnabled: this.videoEnabled,
          metadata: createEventMetadata(event),
        })
      })
      register(EventNames?.CONVERSATION_AUDIO_TRANSCRIPT_DELTA, (event) => {
        const text = extractTextCandidate(event)
        this.emit({
          type: 'user.transcript.partial',
          provider: 'coze',
          sessionId: this.payload.sessionId,
          meetingId: this.payload.meetingId,
          transport: this.payload.transport,
          createdAt: nowIsoString(),
          conversationId: resolveCozeConversationId(this.payload, event) || undefined,
          providerSessionId: resolveCozeProviderSessionId(event) || undefined,
          text,
          speakerLabel: '答辩者',
          audioEnabled: this.audioEnabled,
          videoEnabled: this.videoEnabled,
          metadata: createEventMetadata(event),
        })
      })
      register(EventNames?.CONVERSATION_MESSAGE_DELTA, (event) => {
        const text = extractTextCandidate(event)
        this.emit({
          type: 'assistant.transcript.delta',
          provider: 'coze',
          sessionId: this.payload.sessionId,
          meetingId: this.payload.meetingId,
          transport: this.payload.transport,
          createdAt: nowIsoString(),
          conversationId: resolveCozeConversationId(this.payload, event) || undefined,
          providerSessionId: resolveCozeProviderSessionId(event) || undefined,
          text,
          speakerLabel: 'AgentDef',
          audioEnabled: this.audioEnabled,
          videoEnabled: this.videoEnabled,
          metadata: createEventMetadata(event),
        })
      })
      register(EventNames?.CONVERSATION_MESSAGE_COMPLETED, (event) => {
        const text = extractTextCandidate(event)
        this.emit({
          type: 'assistant.transcript.final',
          provider: 'coze',
          sessionId: this.payload.sessionId,
          meetingId: this.payload.meetingId,
          transport: this.payload.transport,
          createdAt: nowIsoString(),
          conversationId: resolveCozeConversationId(this.payload, event) || undefined,
          providerSessionId: resolveCozeProviderSessionId(event) || undefined,
          text,
          speakerLabel: 'AgentDef',
          audioEnabled: this.audioEnabled,
          videoEnabled: this.videoEnabled,
          isFinal: true,
          metadata: createEventMetadata(event),
        })
      })
      register(EventNames?.CONVERSATION_CHAT_COMPLETED, (event) => {
        this.emitState('connected', createEventMetadata(event))
      })
      register(EventNames?.CONVERSATION_CHAT_FAILED, (event) => {
        this.emitError(extractTextCandidate(event) || 'Coze 对话链路失败。', createEventMetadata(event))
      })

      mediaController.clearPreviewSurface()
      await this.client.connect()
      const audioInputDeviceId = normalizeString(mediaController.getAudioInputDeviceId())
      const videoInputDeviceId = normalizeString(mediaController.getVideoInputDeviceId())
      if (audioInputDeviceId && this.client?.setAudioInputDevice)
        await this.client.setAudioInputDevice(audioInputDeviceId)
      if (videoInputDeviceId && this.client?.setVideoInputDevice && this.payload.mediaMode === 'audio_video')
        await this.client.setVideoInputDevice(videoInputDeviceId)
      await mediaController.stop().catch(() => {})
      this.emitState('connected', {
        conversationId: this.payload.coze?.conversationId || undefined,
      })
    }
    catch (error) {
      this.emitError(error instanceof Error ? error.message : 'Coze realtime 连接失败。')
      throw error
    }
  }

  override async disconnect(): Promise<void> {
    for (const entry of this.boundEventHandlers.splice(0)) {
      if (this.client?.off)
        this.client.off(entry.eventName, entry.handler)
    }
    if (this.client?.disconnect)
      await this.client.disconnect()
    this.client = null
    await super.disconnect()
  }

  override async interrupt(): Promise<void> {
    if (this.client?.interrupt)
      await this.client.interrupt()
    await super.interrupt()
  }

  override async setAudioEnabled(enabled: boolean): Promise<void> {
    if (this.client?.setAudioEnable)
      await this.client.setAudioEnable(enabled)
    await super.setAudioEnabled(enabled)
  }

  override async setVideoEnabled(enabled: boolean): Promise<void> {
    if (this.client?.setVideoEnable)
      await this.client.setVideoEnable(enabled)
    await super.setVideoEnabled(enabled)
  }
}

export function createDefenseRealtimeProviderBridge(
  provider: DefenseRealtimeProvider,
  payload: DefenseRealtimeBootstrapPayload,
): DefenseRealtimeProviderBridge {
  return provider === 'coze' ? new CozeBridge(payload) : new QwenBridge(payload)
}
