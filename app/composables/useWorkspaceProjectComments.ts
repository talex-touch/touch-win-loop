import type { ComputedRef, Ref } from 'vue'
import type {
  ApiResponse,
  ProjectResourceCommentAnchor,
  ProjectResourceCommentImageNodeAnchor,
  ProjectResourceCommentTextSelectionAnchor,
  ProjectResourceCommentThread,
} from '~~/shared/types/domain'
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useAuthApiFetch } from '~/composables/auth-api'
import { resolveApiErrorMessage } from '~/utils/workspace-project-helpers'

interface UseWorkspaceProjectCommentsOptions {
  activeProjectId: Ref<string> | ComputedRef<string>
  activeMarkdownResourceId: Ref<string> | ComputedRef<string>
  currentUserId: Ref<string> | ComputedRef<string>
  currentUsername: Ref<string> | ComputedRef<string>
  currentUserAvatarUrl: Ref<string | null | undefined> | ComputedRef<string | null | undefined>
  onStatusLine: (message: string) => void
  onOpenCommentsPanel?: () => void
  onScrollToThread?: (threadId: string) => void
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function readString(source: Ref<string> | ComputedRef<string>): string {
  return normalizeString(source.value)
}

function readNullableString(
  source: Ref<string | null | undefined> | ComputedRef<string | null | undefined>,
): string | null {
  return normalizeString(source.value) || null
}

export function useWorkspaceProjectComments(options: UseWorkspaceProjectCommentsOptions) {
  const authApiFetch = useAuthApiFetch()

  const markdownCommentThreads = ref<ProjectResourceCommentThread[]>([])
  const activeMarkdownCommentThreadId = ref('')
  const markdownCommentDraftAnchor = ref<ProjectResourceCommentAnchor | null>(null)
  const markdownCommentLoading = ref(false)
  const markdownCommentMutating = ref(false)

  let markdownCommentPollTimer: ReturnType<typeof setInterval> | null = null

  function clearMarkdownCommentPolling(): void {
    if (!markdownCommentPollTimer)
      return
    clearInterval(markdownCommentPollTimer)
    markdownCommentPollTimer = null
  }

  function summarizeCommentAnchor(anchor: ProjectResourceCommentAnchor): string {
    if (anchor.type === 'image_node')
      return normalizeString(anchor.title) || normalizeString(anchor.alt) || '图片评论'
    return normalizeString(anchor.selectedTextPreview) || normalizeString(anchor.headingText) || '文本评论'
  }

  function replaceMarkdownCommentThread(nextThread: ProjectResourceCommentThread, optionsOverrides: { removeThreadId?: string } = {}): void {
    const removeThreadId = normalizeString(optionsOverrides.removeThreadId)
    const nextThreads = markdownCommentThreads.value
      .filter(thread => thread.id !== nextThread.id && thread.id !== removeThreadId)
    nextThreads.unshift(nextThread)
    markdownCommentThreads.value = nextThreads
    activeMarkdownCommentThreadId.value = nextThread.id
  }

  function removeMarkdownCommentThread(threadId: string): void {
    const normalizedThreadId = normalizeString(threadId)
    if (!normalizedThreadId)
      return
    markdownCommentThreads.value = markdownCommentThreads.value.filter(thread => thread.id !== normalizedThreadId)
    if (activeMarkdownCommentThreadId.value === normalizedThreadId)
      activeMarkdownCommentThreadId.value = ''
  }

  function buildOptimisticCommentMessage(threadId: string, body: string) {
    const now = new Date().toISOString()
    return {
      id: `temp-comment-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: readString(options.activeProjectId),
      resourceId: readString(options.activeMarkdownResourceId),
      threadId,
      body,
      createdByUserId: readString(options.currentUserId),
      createdByUsername: readString(options.currentUsername) || '我',
      createdByAvatarUrl: readNullableString(options.currentUserAvatarUrl),
      createdAt: now,
      updatedAt: now,
    }
  }

  function buildOptimisticCommentThread(anchor: ProjectResourceCommentAnchor, body: string): ProjectResourceCommentThread {
    const now = new Date().toISOString()
    const threadId = `temp-comment-thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return {
      id: threadId,
      projectId: readString(options.activeProjectId),
      resourceId: readString(options.activeMarkdownResourceId),
      status: 'open',
      anchorType: anchor.type,
      anchor,
      summaryText: summarizeCommentAnchor(anchor),
      createdByUserId: readString(options.currentUserId),
      createdByUsername: readString(options.currentUsername) || '我',
      createdByAvatarUrl: readNullableString(options.currentUserAvatarUrl),
      resolvedByUserId: null,
      resolvedByUsername: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
      messages: [
        buildOptimisticCommentMessage(threadId, body),
      ],
    }
  }

  function openMarkdownComments(payload: {
    draftAnchor?: ProjectResourceCommentAnchor | null
    threadId?: string
  } = {}): void {
    options.onOpenCommentsPanel?.()

    if (payload.draftAnchor) {
      markdownCommentDraftAnchor.value = payload.draftAnchor
      activeMarkdownCommentThreadId.value = ''
    }

    const threadId = normalizeString(payload.threadId)
    if (threadId) {
      markdownCommentDraftAnchor.value = null
      activeMarkdownCommentThreadId.value = threadId
    }
  }

  async function loadMarkdownCommentThreads(payload: { silent?: boolean } = {}): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const resourceId = readString(options.activeMarkdownResourceId)

    if (!projectId || !resourceId) {
      markdownCommentThreads.value = []
      activeMarkdownCommentThreadId.value = ''
      markdownCommentDraftAnchor.value = null
      return
    }

    if (!payload.silent)
      markdownCommentLoading.value = true

    try {
      const response = await authApiFetch<ApiResponse<{ threads: ProjectResourceCommentThread[] }>>(
        `/projects/${projectId}/resources/${resourceId}/comments`,
      )
      markdownCommentThreads.value = Array.isArray(response.data?.threads) ? response.data.threads : []
      if (!markdownCommentThreads.value.some(thread => thread.id === activeMarkdownCommentThreadId.value))
        activeMarkdownCommentThreadId.value = ''
    }
    catch (error) {
      if (!payload.silent)
        options.onStatusLine(resolveApiErrorMessage(error, '评论列表加载失败。'))
    }
    finally {
      if (!payload.silent)
        markdownCommentLoading.value = false
    }
  }

  function startMarkdownCommentPolling(): void {
    clearMarkdownCommentPolling()
    const projectId = readString(options.activeProjectId)
    const resourceId = readString(options.activeMarkdownResourceId)
    if (!projectId || !resourceId)
      return

    markdownCommentPollTimer = setInterval(() => {
      void loadMarkdownCommentThreads({ silent: true })
    }, 15000)
  }

  function handleMarkdownCreateCommentFromSelection(anchor: ProjectResourceCommentTextSelectionAnchor): void {
    openMarkdownComments({ draftAnchor: anchor })
  }

  function handleMarkdownCreateCommentFromImage(anchor: ProjectResourceCommentImageNodeAnchor): void {
    openMarkdownComments({ draftAnchor: anchor })
  }

  function handleMarkdownOpenCommentThread(threadId: string): void {
    openMarkdownComments({ threadId })
    nextTick(() => {
      options.onScrollToThread?.(threadId)
    })
  }

  function cancelMarkdownCommentDraft(): void {
    markdownCommentDraftAnchor.value = null
  }

  async function createMarkdownCommentThread(body: string): Promise<void> {
    const anchor = markdownCommentDraftAnchor.value
    const projectId = readString(options.activeProjectId)
    const resourceId = readString(options.activeMarkdownResourceId)
    const normalizedBody = normalizeString(body)
    if (!anchor || !projectId || !resourceId || !normalizedBody || markdownCommentMutating.value)
      return

    const optimisticThread = buildOptimisticCommentThread(anchor, normalizedBody)
    markdownCommentMutating.value = true
    markdownCommentDraftAnchor.value = null
    replaceMarkdownCommentThread(optimisticThread)

    try {
      const response = await authApiFetch<ApiResponse<{ thread: ProjectResourceCommentThread }>>(
        `/projects/${projectId}/resources/${resourceId}/comments`,
        {
          method: 'POST',
          body: {
            anchor,
            body: normalizedBody,
          },
        },
      )

      const thread = response.data?.thread
      if (!thread?.id)
        throw new Error('COMMENT_THREAD_CREATE_INVALID')

      replaceMarkdownCommentThread(thread, {
        removeThreadId: optimisticThread.id,
      })
      options.onStatusLine('评论已创建。')
    }
    catch (error) {
      removeMarkdownCommentThread(optimisticThread.id)
      markdownCommentDraftAnchor.value = anchor
      options.onStatusLine(resolveApiErrorMessage(error, '创建评论失败，请稍后重试。'))
    }
    finally {
      markdownCommentMutating.value = false
    }
  }

  async function replyMarkdownCommentThread(payload: { threadId: string, body: string }): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const resourceId = readString(options.activeMarkdownResourceId)
    const threadId = normalizeString(payload.threadId)
    const body = normalizeString(payload.body)
    if (!projectId || !resourceId || !threadId || !body || markdownCommentMutating.value)
      return

    const thread = markdownCommentThreads.value.find(item => item.id === threadId)
    if (!thread)
      return

    const optimisticMessage = buildOptimisticCommentMessage(threadId, body)
    markdownCommentMutating.value = true
    markdownCommentThreads.value = markdownCommentThreads.value.map((item) => {
      if (item.id !== threadId)
        return item
      return {
        ...item,
        status: 'open',
        updatedAt: optimisticMessage.updatedAt,
        messages: [...item.messages, optimisticMessage],
      }
    })

    try {
      const response = await authApiFetch<ApiResponse<{ thread: ProjectResourceCommentThread }>>(
        `/projects/${projectId}/resources/${resourceId}/comments/${threadId}/messages`,
        {
          method: 'POST',
          body: {
            body,
          },
        },
      )

      const nextThread = response.data?.thread
      if (!nextThread?.id)
        throw new Error('COMMENT_THREAD_REPLY_INVALID')
      replaceMarkdownCommentThread(nextThread)
      options.onStatusLine('回复已发送。')
    }
    catch (error) {
      await loadMarkdownCommentThreads({ silent: true })
      options.onStatusLine(resolveApiErrorMessage(error, '回复评论失败，请稍后重试。'))
    }
    finally {
      markdownCommentMutating.value = false
    }
  }

  async function updateMarkdownCommentThreadState(threadId: string, nextStatus: 'resolved' | 'open'): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const resourceId = readString(options.activeMarkdownResourceId)
    const normalizedThreadId = normalizeString(threadId)
    if (!projectId || !resourceId || !normalizedThreadId || markdownCommentMutating.value)
      return

    const previousThreads = markdownCommentThreads.value
    markdownCommentMutating.value = true
    markdownCommentThreads.value = markdownCommentThreads.value.map((thread) => {
      if (thread.id !== normalizedThreadId)
        return thread
      return {
        ...thread,
        status: nextStatus === 'resolved' ? 'resolved' : 'open',
        resolvedAt: nextStatus === 'resolved' ? new Date().toISOString() : null,
        resolvedByUserId: nextStatus === 'resolved' ? readString(options.currentUserId) : null,
        resolvedByUsername: nextStatus === 'resolved' ? readString(options.currentUsername) || null : null,
      }
    })

    try {
      const response = await authApiFetch<ApiResponse<{ thread: ProjectResourceCommentThread }>>(
        `/projects/${projectId}/resources/${resourceId}/comments/${normalizedThreadId}/${nextStatus === 'resolved' ? 'resolve' : 'reopen'}`,
        {
          method: 'POST',
        },
      )
      const thread = response.data?.thread
      if (!thread?.id)
        throw new Error('COMMENT_THREAD_STATE_INVALID')
      replaceMarkdownCommentThread(thread)
      options.onStatusLine(nextStatus === 'resolved' ? '评论线程已解决。' : '评论线程已重新打开。')
    }
    catch (error) {
      markdownCommentThreads.value = previousThreads
      options.onStatusLine(resolveApiErrorMessage(error, nextStatus === 'resolved' ? '解决评论失败。' : '重新打开评论失败。'))
    }
    finally {
      markdownCommentMutating.value = false
    }
  }

  async function resolveMarkdownCommentThread(threadId: string): Promise<void> {
    await updateMarkdownCommentThreadState(threadId, 'resolved')
  }

  async function reopenMarkdownCommentThread(threadId: string): Promise<void> {
    await updateMarkdownCommentThreadState(threadId, 'open')
  }

  onBeforeUnmount(() => {
    clearMarkdownCommentPolling()
  })

  return {
    markdownCommentThreads,
    activeMarkdownCommentThreadId,
    markdownCommentDraftAnchor,
    markdownCommentLoading,
    markdownCommentMutating,
    clearMarkdownCommentPolling,
    openMarkdownComments,
    loadMarkdownCommentThreads,
    startMarkdownCommentPolling,
    handleMarkdownCreateCommentFromSelection,
    handleMarkdownCreateCommentFromImage,
    handleMarkdownOpenCommentThread,
    cancelMarkdownCommentDraft,
    createMarkdownCommentThread,
    replyMarkdownCommentThread,
    resolveMarkdownCommentThread,
    reopenMarkdownCommentThread,
  }
}
