import type { ChatMessage } from '~~/shared/types/domain'

type WorkspaceLocalStreamState = 'streaming' | 'aborted'

function toMetadataRecord(metadata: ChatMessage['metadata']): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return {}
  return { ...metadata }
}

function compactMetadata(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined)
  if (entries.length === 0)
    return undefined
  return Object.fromEntries(entries)
}

function isLocalMessageForRequest(message: ChatMessage, localRequestId: string): boolean {
  if (!localRequestId)
    return false

  const metadata = toMetadataRecord(message.metadata)
  return String(metadata.localRequestId || '') === localRequestId
}

export function toWorkspaceModelMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => {
      if (message.role !== 'user' && message.role !== 'assistant')
        return false

      const metadata = toMetadataRecord(message.metadata)
      if (metadata.localOnly === true)
        return message.role === 'user' && metadata.streamState === 'streaming'

      return true
    })
    .map(message => ({
      role: message.role,
      content: message.content,
    }))
}

export function createWorkspaceLocalChatMessage(input: {
  role: ChatMessage['role']
  content: string
  localRequestId: string
  streamState?: WorkspaceLocalStreamState
  metadata?: ChatMessage['metadata']
}): ChatMessage {
  return {
    role: input.role,
    content: input.content,
    metadata: compactMetadata({
      ...toMetadataRecord(input.metadata),
      localOnly: true,
      localRequestId: input.localRequestId,
      streamState: input.streamState,
    }),
  }
}

export function finalizeWorkspaceLocalChatMessages(messages: ChatMessage[], localRequestId: string): ChatMessage[] {
  return messages.map((message) => {
    if (!isLocalMessageForRequest(message, localRequestId))
      return message

    const metadata = toMetadataRecord(message.metadata)
    delete metadata.localOnly
    delete metadata.localRequestId
    delete metadata.streamState
    return {
      ...message,
      metadata: compactMetadata(metadata),
    }
  })
}

export function markWorkspaceLocalChatMessagesAborted(messages: ChatMessage[], localRequestId: string): ChatMessage[] {
  return messages.map((message) => {
    if (!isLocalMessageForRequest(message, localRequestId))
      return message

    return {
      ...message,
      metadata: compactMetadata({
        ...toMetadataRecord(message.metadata),
        localOnly: true,
        localRequestId,
        streamState: 'aborted',
      }),
    }
  })
}
