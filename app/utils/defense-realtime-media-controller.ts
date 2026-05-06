import type { DefenseRealtimeMediaMode } from '~~/shared/types/domain'

export interface DefenseRealtimeAudioChunk {
  pcm: Uint8Array
  sampleRate: number
  durationMs: number
  createdAt: string
}

export interface DefenseRealtimeVideoFrame {
  base64: string
  mimeType: string
  width: number
  height: number
  createdAt: string
}

export interface DefenseRealtimeMediaTelemetry {
  audioInputLabel: string
  videoInputLabel: string
  audioLevel: number
  audioSampleRate: number | null
  videoWidth: number | null
  videoHeight: number | null
  audioLastCapturedAt: string | null
  videoLastCapturedAt: string | null
}

export interface DefenseRealtimeMediaControllerOptions {
  previewElementId?: string
  targetSampleRate?: number
  frameIntervalMs?: number
}

export interface DefenseRealtimeMediaStartOptions {
  mode: DefenseRealtimeMediaMode
}

interface PreviewSurfaceElement extends HTMLElement {
  __defenseRealtimePreviewVideo__?: HTMLVideoElement | null
}

function nowIsoString(): string {
  return new Date().toISOString()
}

function resolveAudioContextCtor(): typeof AudioContext | null {
  if (typeof window !== 'undefined') {
    const ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (ctor)
      return ctor
  }
  if (typeof globalThis !== 'undefined' && 'AudioContext' in globalThis)
    return (globalThis as typeof globalThis & { AudioContext: typeof AudioContext }).AudioContext
  return null
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && String(error.message || '').trim())
    return error.message
  return fallback
}

function downsampleBuffer(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Int16Array {
  if (!input.length)
    return new Int16Array(0)
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0)
    return new Int16Array(0)
  if (inputSampleRate === outputSampleRate) {
    const direct = new Int16Array(input.length)
    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index] || 0))
      direct[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7FFF)
    }
    return direct
  }

  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Int16Array(outputLength)
  let offset = 0
  for (let index = 0; index < outputLength; index += 1) {
    const nextOffset = Math.min(input.length, Math.round((index + 1) * ratio))
    let sum = 0
    let count = 0
    while (offset < nextOffset) {
      sum += input[offset] || 0
      count += 1
      offset += 1
    }
    const averaged = count > 0 ? sum / count : 0
    const sample = Math.max(-1, Math.min(1, averaged))
    output[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7FFF)
  }
  return output
}

export class DefenseRealtimeMediaController {
  private readonly audioListeners = new Set<(chunk: DefenseRealtimeAudioChunk) => void>()
  private readonly videoListeners = new Set<(frame: DefenseRealtimeVideoFrame) => void>()
  private readonly telemetryListeners = new Set<(telemetry: DefenseRealtimeMediaTelemetry) => void>()
  private readonly previewElementId: string
  private readonly targetSampleRate: number
  private readonly defaultFrameIntervalMs: number
  private readonly telemetry: DefenseRealtimeMediaTelemetry = {
    audioInputLabel: '',
    videoInputLabel: '',
    audioLevel: 0,
    audioSampleRate: null,
    videoWidth: null,
    videoHeight: null,
    audioLastCapturedAt: null,
    videoLastCapturedAt: null,
  }

  private stream: MediaStream | null = null
  private audioTrack: MediaStreamTrack | null = null
  private videoTrack: MediaStreamTrack | null = null
  private previewVideoElement: HTMLVideoElement | null = null
  private frameCanvas: HTMLCanvasElement | null = null
  private frameTimerId: number | null = null
  private audioContext: AudioContext | null = null
  private audioSourceNode: MediaStreamAudioSourceNode | null = null
  private audioProcessorNode: ScriptProcessorNode | null = null
  private audioGainNode: GainNode | null = null
  private telemetryEmittedAt = 0
  private mode: DefenseRealtimeMediaMode = 'audio_video'
  private audioEnabled = true
  private videoEnabled = true

  constructor(options: DefenseRealtimeMediaControllerOptions = {}) {
    this.previewElementId = String(options.previewElementId || '').trim()
    this.targetSampleRate = Math.max(8000, Math.min(48000, Math.trunc(Number(options.targetSampleRate || 16000) || 16000)))
    this.defaultFrameIntervalMs = Math.max(250, Math.min(5000, Math.trunc(Number(options.frameIntervalMs || 1000) || 1000)))
  }

  async start(options: DefenseRealtimeMediaStartOptions): Promise<void> {
    this.mode = options.mode
    this.audioEnabled = true
    this.videoEnabled = options.mode === 'audio_video'
    await this.stop()

    if (!import.meta.client || !navigator.mediaDevices?.getUserMedia)
      throw new Error('当前浏览器不支持实时音视频设备采集。')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: options.mode === 'audio_video',
      })
    }
    catch (error) {
      throw new Error(options.mode === 'audio_video'
        ? normalizeErrorMessage(error, '音视频设备权限申请失败，请检查麦克风 / 摄像头授权，或切到仅音频后重试。')
        : normalizeErrorMessage(error, '麦克风权限申请失败，请检查浏览器授权后重试。'))
    }

    this.stream = stream
    const [audioTrack] = stream.getAudioTracks()
    const [videoTrack] = stream.getVideoTracks()
    this.audioTrack = audioTrack || null
    this.videoTrack = videoTrack || null

    if (!this.audioTrack)
      throw new Error('未获取到可用麦克风轨道。')
    if (options.mode === 'audio_video' && !this.videoTrack)
      throw new Error('未获取到可用摄像头轨道，请切到仅音频后重试。')

    this.updateTelemetry({
      audioInputLabel: this.resolveTrackLabel(this.audioTrack, '默认麦克风'),
      videoInputLabel: this.videoTrack ? this.resolveTrackLabel(this.videoTrack, '默认摄像头') : '',
      audioSampleRate: this.audioTrack.getSettings?.().sampleRate || this.targetSampleRate,
      videoWidth: this.videoTrack?.getSettings?.().width || null,
      videoHeight: this.videoTrack?.getSettings?.().height || null,
      audioLevel: 0,
      audioLastCapturedAt: null,
      videoLastCapturedAt: null,
    })

    this.attachPreview()
    await this.startAudioCapture()
    this.startVideoCapture()
  }

  async stop(): Promise<void> {
    this.stopVideoCapture()
    this.detachPreview()

    if (this.audioProcessorNode) {
      this.audioProcessorNode.onaudioprocess = null
      try {
        this.audioProcessorNode.disconnect()
      }
      catch {
      }
      this.audioProcessorNode = null
    }
    if (this.audioSourceNode) {
      try {
        this.audioSourceNode.disconnect()
      }
      catch {
      }
      this.audioSourceNode = null
    }
    if (this.audioGainNode) {
      try {
        this.audioGainNode.disconnect()
      }
      catch {
      }
      this.audioGainNode = null
    }
    if (this.audioContext) {
      try {
        await this.audioContext.close()
      }
      catch {
      }
      this.audioContext = null
    }

    if (this.stream) {
      for (const track of this.stream.getTracks())
        track.stop()
    }
    this.stream = null
    this.audioTrack = null
    this.videoTrack = null
    this.frameCanvas = null
    this.updateTelemetry({
      audioInputLabel: '',
      videoInputLabel: '',
      audioLevel: 0,
      audioSampleRate: null,
      videoWidth: null,
      videoHeight: null,
      audioLastCapturedAt: null,
      videoLastCapturedAt: null,
    }, { force: true })
  }

  async setAudioEnabled(enabled: boolean): Promise<void> {
    this.audioEnabled = enabled
    if (this.audioTrack)
      this.audioTrack.enabled = enabled
    if (!enabled)
      this.updateTelemetry({ audioLevel: 0 }, { force: true })
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    if (enabled && this.mode === 'audio')
      throw new Error('当前媒体模式为仅音频，不能在会话中途开启摄像头。')

    this.videoEnabled = enabled
    if (this.videoTrack)
      this.videoTrack.enabled = enabled
    if (enabled) {
      this.startVideoCapture()
    }
    else {
      this.stopVideoCapture()
      this.updateTelemetry({
        videoWidth: null,
        videoHeight: null,
        videoLastCapturedAt: null,
      }, { force: true })
    }
  }

  onAudioChunk(listener: (chunk: DefenseRealtimeAudioChunk) => void): () => void {
    this.audioListeners.add(listener)
    return () => {
      this.audioListeners.delete(listener)
    }
  }

  onVideoFrame(listener: (frame: DefenseRealtimeVideoFrame) => void): () => void {
    this.videoListeners.add(listener)
    return () => {
      this.videoListeners.delete(listener)
    }
  }

  onTelemetry(listener: (telemetry: DefenseRealtimeMediaTelemetry) => void): () => void {
    this.telemetryListeners.add(listener)
    listener({ ...this.telemetry })
    return () => {
      this.telemetryListeners.delete(listener)
    }
  }

  getAudioInputDeviceId(): string {
    return String(this.audioTrack?.getSettings?.().deviceId || '').trim()
  }

  getVideoInputDeviceId(): string {
    return String(this.videoTrack?.getSettings?.().deviceId || '').trim()
  }

  isVideoAvailable(): boolean {
    return Boolean(this.videoTrack)
  }

  clearPreviewSurface(): void {
    this.detachPreview()
  }

  private resolveTrackLabel(track: MediaStreamTrack | null, fallback: string): string {
    const label = String(track?.label || '').trim()
    return label || fallback
  }

  private updateTelemetry(patch: Partial<DefenseRealtimeMediaTelemetry>, options: { force?: boolean } = {}): void {
    Object.assign(this.telemetry, patch)
    const now = Date.now()
    if (!options.force && now - this.telemetryEmittedAt < 120)
      return
    this.telemetryEmittedAt = now
    const snapshot = { ...this.telemetry }
    for (const listener of this.telemetryListeners)
      listener(snapshot)
  }

  private resolveAudioLevel(input: Float32Array): number {
    if (!input.length)
      return 0
    let sum = 0
    for (let index = 0; index < input.length; index += 1) {
      const sample = input[index] || 0
      sum += sample * sample
    }
    return Math.max(0, Math.min(1, Math.sqrt(sum / input.length) * 4))
  }

  private attachPreview(): void {
    if (!this.previewElementId || !this.stream || !this.videoTrack || typeof document === 'undefined')
      return
    const container = document.getElementById(this.previewElementId) as PreviewSurfaceElement | null
    if (!container)
      return

    let video = container.__defenseRealtimePreviewVideo__ || null
    if (!video) {
      video = document.createElement('video')
      video.autoplay = true
      video.muted = true
      video.playsInline = true
      video.className = 'workspace-defense-workbench__preview-video'
      video.style.width = '100%'
      video.style.height = '100%'
      video.style.objectFit = 'cover'
      video.style.position = 'absolute'
      video.style.inset = '0'
      container.appendChild(video)
      container.__defenseRealtimePreviewVideo__ = video
    }
    video.srcObject = this.stream
    void video.play().catch(() => {
    })
    this.previewVideoElement = video
  }

  private detachPreview(): void {
    const previewVideoElement = this.previewVideoElement
    if (previewVideoElement?.parentElement) {
      const container = previewVideoElement.parentElement as PreviewSurfaceElement | null
      previewVideoElement.pause()
      previewVideoElement.srcObject = null
      previewVideoElement.parentElement.removeChild(previewVideoElement)
      if (container)
        container.__defenseRealtimePreviewVideo__ = null
    }
    this.previewVideoElement = null
  }

  private async startAudioCapture(): Promise<void> {
    if (!this.stream)
      return

    const AudioContextCtor = resolveAudioContextCtor()
    if (!AudioContextCtor)
      return

    try {
      const audioContext = new AudioContextCtor()
      if (audioContext.state === 'suspended' && audioContext.resume)
        await audioContext.resume()
      const source = audioContext.createMediaStreamSource(this.stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      const gain = audioContext.createGain()
      gain.gain.value = 0
      source.connect(processor)
      processor.connect(gain)
      gain.connect(audioContext.destination)
      processor.onaudioprocess = (event) => {
        if (!this.audioEnabled)
          return
        const channelData = event.inputBuffer?.getChannelData?.(0)
        if (!channelData)
          return
        const pcm16 = downsampleBuffer(channelData, event.inputBuffer.sampleRate, this.targetSampleRate)
        if (pcm16.byteLength <= 0)
          return
        const pcm = new Uint8Array(pcm16.buffer.slice(0))
        const durationMs = Math.max(1, Math.round(pcm16.length / this.targetSampleRate * 1000))
        const chunk: DefenseRealtimeAudioChunk = {
          pcm,
          sampleRate: this.targetSampleRate,
          durationMs,
          createdAt: nowIsoString(),
        }
        this.updateTelemetry({
          audioLevel: this.resolveAudioLevel(channelData),
          audioSampleRate: this.targetSampleRate,
          audioLastCapturedAt: chunk.createdAt,
        })
        for (const listener of this.audioListeners)
          listener(chunk)
      }

      this.audioContext = audioContext
      this.audioSourceNode = source
      this.audioProcessorNode = processor
      this.audioGainNode = gain
    }
    catch {
      this.audioContext = null
      this.audioSourceNode = null
      this.audioProcessorNode = null
      this.audioGainNode = null
    }
  }

  private startVideoCapture(): void {
    this.stopVideoCapture()
    if (!import.meta.client || !this.videoEnabled || !this.videoTrack || typeof document === 'undefined')
      return

    const video = this.previewVideoElement || document.createElement('video')
    if (!this.previewVideoElement) {
      video.autoplay = true
      video.muted = true
      video.playsInline = true
      if (this.stream)
        video.srcObject = this.stream
      void video.play().catch(() => {
      })
    }
    this.previewVideoElement = video
    this.frameCanvas = document.createElement('canvas')
    this.frameTimerId = window.setInterval(() => {
      if (!this.videoEnabled || !this.previewVideoElement || !this.frameCanvas)
        return
      const width = this.previewVideoElement.videoWidth || 0
      const height = this.previewVideoElement.videoHeight || 0
      if (!width || !height)
        return

      const scaledWidth = Math.max(160, Math.min(640, width))
      const scaledHeight = Math.max(90, Math.round(height / width * scaledWidth))
      this.frameCanvas.width = scaledWidth
      this.frameCanvas.height = scaledHeight
      const context = this.frameCanvas.getContext('2d')
      if (!context)
        return
      context.drawImage(this.previewVideoElement, 0, 0, scaledWidth, scaledHeight)
      const base64 = String(this.frameCanvas.toDataURL('image/jpeg', 0.72) || '').split(',')[1] || ''
      if (!base64)
        return

      const frame: DefenseRealtimeVideoFrame = {
        base64,
        mimeType: 'image/jpeg',
        width: scaledWidth,
        height: scaledHeight,
        createdAt: nowIsoString(),
      }
      this.updateTelemetry({
        videoWidth: scaledWidth,
        videoHeight: scaledHeight,
        videoLastCapturedAt: frame.createdAt,
      })
      for (const listener of this.videoListeners)
        listener(frame)
    }, this.defaultFrameIntervalMs)
  }

  private stopVideoCapture(): void {
    if (this.frameTimerId !== null) {
      window.clearInterval(this.frameTimerId)
      this.frameTimerId = null
    }
  }
}

export function createDefenseRealtimeMediaController(
  options: DefenseRealtimeMediaControllerOptions = {},
): DefenseRealtimeMediaController {
  return new DefenseRealtimeMediaController(options)
}
