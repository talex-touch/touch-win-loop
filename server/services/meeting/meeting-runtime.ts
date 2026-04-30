import type { RuntimeSettings } from '~~/server/utils/env'
import type { ProjectMeetingRuntimeHealth } from '~~/shared/types/domain'
import { getMeetingAsrGateway } from '~~/server/services/meeting/asr-gateway'
import { getRtcProviderGateway } from '~~/server/services/meeting/rtc-provider'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export function listMeetingRtcConfigIssues(runtime: RuntimeSettings): string[] {
  const provider = normalizeString(runtime.meeting.rtc.provider).toLowerCase()
  if (!provider)
    return ['RTC provider 未配置']

  if (provider !== 'livekit')
    return [`RTC provider "${provider}" 暂未适配站内会议客户端`]

  const issues: string[] = []
  if (!normalizeString(runtime.meeting.rtc.serverUrl))
    issues.push('RTC serverUrl 未配置')
  if (!normalizeString(runtime.meeting.rtc.apiKey))
    issues.push('RTC apiKey 未配置')
  if (!normalizeString(runtime.meeting.rtc.apiSecret))
    issues.push('RTC apiSecret 未配置')
  return issues
}

export function listMeetingAsrConfigIssues(runtime: RuntimeSettings): string[] {
  const provider = normalizeString(runtime.meeting.asr.provider).toLowerCase()
  if (!provider)
    return ['ASR provider 未配置']

  if (provider !== 'http' && provider !== 'openai-compatible')
    return [`ASR provider "${provider}" 暂不支持`]

  const issues: string[] = []
  if (provider === 'http' && !normalizeString(runtime.meeting.asr.serviceUrl))
    issues.push('ASR serviceUrl 未配置')
  if (provider === 'openai-compatible') {
    const asrRuntime = resolveAiRuntimeForChannel(runtime, 'meeting_asr').ai
    if (!normalizeString(asrRuntime.provider) || !normalizeString(asrRuntime.baseURL) || !normalizeString(asrRuntime.model))
      issues.push('meeting_asr 场景未绑定可用 ASR Provider/模型')
  }
  return issues
}

export function listMeetingRuntimeIssues(runtime: RuntimeSettings): string[] {
  return [
    ...listMeetingRtcConfigIssues(runtime),
    ...listMeetingAsrConfigIssues(runtime),
  ]
}

export function buildProjectMeetingRuntimeHealth(runtime: RuntimeSettings): ProjectMeetingRuntimeHealth {
  const rtcIssues = listMeetingRtcConfigIssues(runtime)
  const asrIssues = listMeetingAsrConfigIssues(runtime)
  return {
    ready: rtcIssues.length === 0 && asrIssues.length === 0,
    rtcProvider: normalizeString(runtime.meeting.rtc.provider),
    asrProvider: normalizeString(runtime.meeting.asr.provider),
    rtcIssues,
    asrIssues,
    issues: [...rtcIssues, ...asrIssues],
  }
}

export function assertMeetingRuntimeReady(runtime: RuntimeSettings): void {
  getRtcProviderGateway(runtime)
  getMeetingAsrGateway(runtime)
}

export function resolveMeetingRuntimeError(error: unknown): { status: number, message: string } | null {
  const message = error instanceof Error ? normalizeString(error.message) : ''
  if (!message)
    return null

  if (message === 'MEETING_RTC_CONFIG_MISSING') {
    return {
      status: 503,
      message: '会议 RTC 服务未配置，请联系管理员在后台完成配置。',
    }
  }

  if (message === 'MEETING_RTC_PROVIDER_UNSUPPORTED') {
    return {
      status: 503,
      message: '当前会议 RTC provider 暂不支持，请联系管理员切换为 LiveKit。',
    }
  }

  if (message === 'MEETING_ASR_CONFIG_MISSING' || message === 'MEETING_ASR_SERVICE_URL_MISSING') {
    return {
      status: 503,
      message: '会议转写服务未配置，当前无法启动会议。',
    }
  }

  if (message === 'MEETING_ASR_CHANNEL_NOT_CONFIGURED') {
    return {
      status: 503,
      message: '会议 ASR 场景未绑定可用 Provider/模型，请先在 AI 场景配置中接通 meeting_asr。',
    }
  }

  if (message === 'MEETING_ASR_PROVIDER_UNSUPPORTED') {
    return {
      status: 503,
      message: '当前会议转写 provider 暂不支持，请联系管理员检查后台配置。',
    }
  }

  if (message === 'MEETING_PUBLIC_BASE_URL_NOT_CONFIGURED') {
    return {
      status: 503,
      message: '会议回调基地址未配置，请设置 WINLOOP_PUBLIC_BASE_URL 后再试。',
    }
  }

  return null
}
