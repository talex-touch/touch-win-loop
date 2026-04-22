import type {
  AiChatMessage,
  AiChatSession,
  AiWorkspaceResult,
  AiWorkspaceStreamEvent,
  AiWorkspaceStreamEventType,
  ApiResponse,
  ChatMessage,
} from '~~/shared/types/domain'

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function parseSseBlock(rawBlock: string): { eventType: string, dataText: string } | null {
  const block = rawBlock.trim()
  if (!block)
    return null

  const lines = block.split('\n').map(line => line.replace(/\r$/, ''))
  let eventType = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:'))
      eventType = line.slice(6).trim()
    else if (line.startsWith('data:'))
      dataLines.push(line.slice(5).trimStart())
  }

  return {
    eventType,
    dataText: dataLines.join('\n'),
  }
}

function toJsonPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function toModelMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role,
      content: message.content,
      metadata: message.metadata,
    }))
}

export function useLoopyDialog(input: {
  getGreeting: () => string
  getSessionTitle: () => string
}) {
  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)

  const selectedWorkspaceId = ref('')
  const sessions = ref<AiChatSession[]>([])
  const activeSessionId = ref('')
  const messages = ref<ChatMessage[]>([])
  const chatInput = ref('')
  const loadingSessions = ref(false)
  const chatLoading = ref(false)
  const statusText = ref('')
  const errorText = ref('')

  const showSuggestions = computed(() => {
    return !chatLoading.value
      && messages.value.length <= 1
      && messages.value.every(item => item.role === 'assistant')
  })

  const canSend = computed(() => {
    return Boolean(selectedWorkspaceId.value) && !chatLoading.value
  })

  function resetConversation() {
    messages.value = [
      {
        role: 'assistant',
        content: input.getGreeting(),
      },
    ]
  }

  function clearScopeState() {
    sessions.value = []
    activeSessionId.value = ''
    statusText.value = ''
    errorText.value = ''
    chatInput.value = ''
    resetConversation()
  }

  async function loadMessages(sessionId: string) {
    const normalizedWorkspaceId = normalizeText(selectedWorkspaceId.value)
    const normalizedSessionId = normalizeText(sessionId)
    if (!normalizedWorkspaceId || !normalizedSessionId) {
      resetConversation()
      return
    }

    try {
      const response = await fetch(
        String(endpoint(`/teams/${normalizedWorkspaceId}/chat/sessions/${normalizedSessionId}/messages?limit=200&projectId=&mode=dialog_ask`)),
        {
          credentials: 'include',
        },
      )
      const payload = await response.json() as ApiResponse<{ session: AiChatSession, messages: AiChatMessage[] }>
      if (!response.ok)
        throw new Error(String(payload?.message || '会话消息加载失败，请稍后重试。'))

      const restoredMessages = payload.data.messages.map(item => ({
        role: item.role,
        content: item.content,
        metadata: item.metadata,
      })) as ChatMessage[]

      messages.value = restoredMessages.length > 0
        ? restoredMessages
        : [{
            role: 'assistant',
            content: input.getGreeting(),
          }]
    }
    catch (error: any) {
      errorText.value = String(error?.data?.message || error?.message || '会话消息加载失败，请稍后重试。')
      resetConversation()
    }
  }

  async function createSession(preferredTitle = ''): Promise<string | null> {
    const normalizedWorkspaceId = normalizeText(selectedWorkspaceId.value)
    if (!normalizedWorkspaceId)
      return null

    try {
      const response = await fetch(String(endpoint(`/teams/${normalizedWorkspaceId}/chat/sessions`)), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: '',
          mode: 'dialog_ask',
          title: preferredTitle || input.getSessionTitle(),
        }),
      })
      const payload = await response.json() as ApiResponse<AiChatSession>
      if (!response.ok)
        throw new Error(String(payload?.message || '新建会话失败，请稍后重试。'))

      return payload.data.id
    }
    catch (error: any) {
      errorText.value = String(error?.data?.message || error?.message || '新建会话失败，请稍后重试。')
      return null
    }
  }

  async function loadSessions(preferredSessionId = '') {
    const normalizedWorkspaceId = normalizeText(selectedWorkspaceId.value)
    if (!normalizedWorkspaceId) {
      sessions.value = []
      activeSessionId.value = ''
      resetConversation()
      return
    }

    loadingSessions.value = true
    errorText.value = ''
    try {
      const response = await fetch(
        String(endpoint(`/teams/${normalizedWorkspaceId}/chat/sessions?limit=30&projectId=&mode=dialog_ask`)),
        {
          credentials: 'include',
        },
      )
      const payload = await response.json() as ApiResponse<AiChatSession[]>
      if (!response.ok)
        throw new Error(String(payload?.message || '会话加载失败，请稍后重试。'))

      sessions.value = payload.data

      const nextSession = sessions.value.find(item => item.id === preferredSessionId)
        || sessions.value.find(item => item.id === activeSessionId.value)
        || sessions.value[0]

      activeSessionId.value = normalizeText(nextSession?.id)
      if (activeSessionId.value) {
        await loadMessages(activeSessionId.value)
        return
      }

      resetConversation()
    }
    catch (error: any) {
      sessions.value = []
      activeSessionId.value = ''
      errorText.value = String(error?.data?.message || error?.message || '会话加载失败，请稍后重试。')
      resetConversation()
    }
    finally {
      loadingSessions.value = false
    }
  }

  async function syncWorkspace(workspaceId: string) {
    const normalizedWorkspaceId = normalizeText(workspaceId)
    if (selectedWorkspaceId.value === normalizedWorkspaceId && sessions.value.length > 0)
      return

    selectedWorkspaceId.value = normalizedWorkspaceId
    clearScopeState()

    if (!normalizedWorkspaceId)
      return

    await loadSessions()
  }

  async function switchSession(sessionId: string) {
    const normalizedSessionId = normalizeText(sessionId)
    if (!normalizedSessionId || normalizedSessionId === activeSessionId.value)
      return

    activeSessionId.value = normalizedSessionId
    await loadMessages(normalizedSessionId)
  }

  async function startNewSession() {
    const createdId = await createSession()
    if (!createdId)
      return

    activeSessionId.value = createdId
    statusText.value = '已创建新会话。'
    await loadSessions(createdId)
  }

  async function sendMessage(contentOverride = '') {
    const normalizedWorkspaceId = normalizeText(selectedWorkspaceId.value)
    if (!normalizedWorkspaceId) {
      errorText.value = '当前没有可用工作空间。'
      return
    }

    const content = normalizeText(contentOverride || chatInput.value)
    if (!content)
      return

    errorText.value = ''
    statusText.value = ''

    if (!activeSessionId.value) {
      const createdId = await createSession()
      if (!createdId)
        return
      activeSessionId.value = createdId
    }

    const pendingMessages = [...messages.value, {
      role: 'user' as const,
      content,
    }]
    messages.value = pendingMessages
    chatInput.value = ''
    chatLoading.value = true

    let assistantBuffer = ''
    let assistantMetadata: Record<string, unknown> | undefined
    const renderAssistantMessage = () => {
      const nextMessages = [...pendingMessages]
      if (assistantBuffer) {
        nextMessages.push({
          role: 'assistant',
          content: assistantBuffer,
          metadata: assistantMetadata,
        })
      }
      messages.value = nextMessages
    }

    try {
      const response = await fetch(endpoint('/ai/workspace/stream'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId: normalizedWorkspaceId,
          workspaceId: normalizedWorkspaceId,
          sessionId: activeSessionId.value || undefined,
          mode: 'dialog_ask',
          messages: toModelMessages(pendingMessages),
          context: {
            teamId: normalizedWorkspaceId,
            workspaceId: normalizedWorkspaceId,
          },
        }),
      })

      if (!response.ok) {
        const fallbackMessage = `请求失败：HTTP ${response.status}`
        const data = await response.json().catch(() => null) as ApiResponse<null> | null
        throw new Error(String(data?.message || fallbackMessage))
      }

      if (!response.body)
        throw new Error('未收到可读取的流式响应。')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break

        buffer += decoder.decode(value, { stream: true })
        while (true) {
          const separatorIndex = buffer.indexOf('\n\n')
          if (separatorIndex < 0)
            break

          const block = buffer.slice(0, separatorIndex)
          buffer = buffer.slice(separatorIndex + 2)
          const parsed = parseSseBlock(block)
          if (!parsed)
            continue

          const payload = parsed.dataText
            ? JSON.parse(parsed.dataText) as AiWorkspaceStreamEvent
            : null
          const eventType = (payload?.event || parsed.eventType) as AiWorkspaceStreamEventType
          const data = toJsonPayload(payload?.data)

          if (eventType === 'progress') {
            statusText.value = normalizeText(data.message) || '正在整理当前工作空间上下文...'
            if (data.sessionId)
              activeSessionId.value = normalizeText(data.sessionId)
            continue
          }

          if (eventType === 'tool') {
            const toolName = normalizeText(data.name)
            statusText.value = toolName
              ? `正在调用工具：${toolName}`
              : '正在调用工具...'
            continue
          }

          if (eventType === 'delta') {
            assistantBuffer += String(data.text || '')
            renderAssistantMessage()
            continue
          }

          if (eventType === 'done') {
            const result = toJsonPayload(data.result) as Partial<AiWorkspaceResult>
            assistantBuffer = normalizeText(result.assistantReply) || assistantBuffer
            assistantMetadata = result.knowledge ? { knowledge: result.knowledge } : undefined
            if (result.sessionId)
              activeSessionId.value = normalizeText(result.sessionId)
            statusText.value = '已完成回答。'
            renderAssistantMessage()
            continue
          }

          if (eventType === 'error')
            throw new Error(normalizeText(data.message) || '当前暂不可用，请稍后重试。')
        }
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '当前暂不可用，请稍后重试。'
      errorText.value = message
      messages.value = [
        ...pendingMessages,
        {
          role: 'assistant',
          content: message,
        },
      ]
    }
    finally {
      chatLoading.value = false
      await loadSessions(activeSessionId.value)
    }
  }

  function useSuggestion(question: string) {
    chatInput.value = normalizeText(question)
    void sendMessage(chatInput.value)
  }

  return {
    selectedWorkspaceId,
    sessions,
    activeSessionId,
    messages,
    chatInput,
    loadingSessions,
    chatLoading,
    statusText,
    errorText,
    canSend,
    showSuggestions,
    syncWorkspace,
    switchSession,
    startNewSession,
    sendMessage,
    useSuggestion,
    resetConversation,
  }
}
