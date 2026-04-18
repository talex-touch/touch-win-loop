import type {
  ChatMessage,
  WorkspaceStreamSystemMessageEventType,
  WorkspaceStreamSystemMessageMetadata,
} from '~~/shared/types/domain'

export interface WorkspaceStreamSystemMessageView {
  eventType: WorkspaceStreamSystemMessageEventType
  seq: number
  title: string
  toolName: string
  payloadSummary: string
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSeq(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

function parseToolContent(content: string): { toolName: string, payloadSummary: string } {
  const normalized = content.replace(/^工具[:：]\s*/u, '').trim()
  if (!normalized)
    return { toolName: '', payloadSummary: '' }

  const [toolNamePart, ...rest] = normalized.split(/\s+[·•|｜]\s+/u)
  return {
    toolName: toText(toolNamePart),
    payloadSummary: toText(rest.join(' · ')),
  }
}

export function summarizeWorkspaceToolPayload(payload: unknown, maxLength = 180): string {
  if (payload === null || payload === undefined)
    return ''

  const normalized = typeof payload === 'string'
    ? payload.trim()
    : (() => {
        try {
          return JSON.stringify(payload)
        }
        catch {
          return ''
        }
      })()

  if (!normalized || normalized === '{}' || normalized === '[]')
    return ''

  if (normalized.length <= maxLength)
    return normalized

  return `${normalized.slice(0, maxLength)}...`
}

export function buildWorkspaceStreamSystemMessageContent(
  eventType: WorkspaceStreamSystemMessageEventType,
  data: Record<string, unknown>,
): string {
  if (eventType === 'progress') {
    const message = toText(data.message) || 'AI 处理中...'
    return `进度：${message}`
  }

  const toolName = toText(data.name) || 'unknown_tool'
  const payloadSummary = summarizeWorkspaceToolPayload(data.payload)
  if (!payloadSummary)
    return `工具：${toolName}`
  return `工具：${toolName} · ${payloadSummary}`
}

export function buildWorkspaceStreamSystemMessageMetadata(
  eventType: WorkspaceStreamSystemMessageEventType,
  seq: number,
  data: Record<string, unknown>,
): WorkspaceStreamSystemMessageMetadata {
  if (eventType === 'progress') {
    return {
      eventType,
      seq: normalizeSeq(seq),
    }
  }

  return {
    eventType,
    seq: normalizeSeq(seq),
    toolName: toText(data.name),
    payloadSummary: summarizeWorkspaceToolPayload(data.payload),
  }
}

export function createWorkspaceStreamSystemChatMessage(
  eventType: WorkspaceStreamSystemMessageEventType,
  data: Record<string, unknown>,
  seq: number,
): ChatMessage {
  return {
    role: 'system',
    content: buildWorkspaceStreamSystemMessageContent(eventType, data),
    metadata: buildWorkspaceStreamSystemMessageMetadata(eventType, seq, data),
  }
}

export function isWorkspaceStreamSystemMessageMetadata(value: unknown): value is WorkspaceStreamSystemMessageMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const candidate = value as Record<string, unknown>
  const eventType = candidate.eventType
  return (
    (eventType === 'progress' || eventType === 'tool')
    && normalizeSeq(candidate.seq) > 0
  )
}

export function resolveWorkspaceStreamSystemMessageView(
  message: Pick<ChatMessage, 'role' | 'content' | 'metadata'>,
): WorkspaceStreamSystemMessageView | null {
  if (message.role !== 'system')
    return null

  const normalizedContent = toText(message.content)
  const metadata = isWorkspaceStreamSystemMessageMetadata(message.metadata)
    ? message.metadata
    : null
  const eventType = metadata?.eventType || (normalizedContent.startsWith('工具：') ? 'tool' : 'progress')
  const seq = normalizeSeq(metadata?.seq)

  if (eventType === 'tool') {
    const parsedFromContent = parseToolContent(normalizedContent)
    const toolName = toText(metadata?.toolName) || parsedFromContent.toolName
    const payloadSummary = toText(metadata?.payloadSummary) || parsedFromContent.payloadSummary
    return {
      eventType,
      seq,
      title: toolName ? `调用 ${toolName}` : '工具调用',
      toolName,
      payloadSummary,
    }
  }

  return {
    eventType,
    seq,
    title: normalizedContent.replace(/^进度[:：]\s*/u, '').trim() || normalizedContent || 'AI 处理中...',
    toolName: '',
    payloadSummary: '',
  }
}
