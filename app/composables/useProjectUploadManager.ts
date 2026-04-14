import type { Ref } from 'vue'
import type {
  ApiResponse,
  ProjectResourceUploadChunkAck,
  ProjectResourceUploadSession,
  ProjectResourceUploadSessionListResult,
} from '~~/shared/types/domain'
import type {
  ProjectUploadActivityItem,
  ProjectUploadDrawerState,
  ProjectUploadSummary,
  ProjectUploadTask,
} from '~/types/project-upload'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { PROJECT_RESOURCE_UPLOAD_CHUNK_SIZE_BYTES } from '~~/shared/constants/project-resource-upload'

interface UseProjectUploadManagerInput {
  projectId: Ref<string>
  endpoint: (path: string) => string
  currentUserId?: Ref<string>
  currentUsername?: Ref<string>
  currentUserAvatarUrl?: Ref<string | null | undefined>
  realtimeConnected?: Ref<boolean>
  getUsedBytes?: () => number
  validateFiles?: (files: File[], usedBytes: number) => string | null
  onStatusLine?: (text: string) => void
  onRequireRefresh?: () => Promise<void> | void
}

interface ProjectUploadEnqueueOptions {
  parentResourceId?: string | null
}

type AbortReason = 'pause' | 'cancel' | 'switch'
type DrawerOpenSource = ProjectUploadDrawerState['source']

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

async function parseApiResponse<T>(response: Response, fallbackMessage: string): Promise<ApiResponse<T>> {
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw new Error(String(payload?.message || fallbackMessage))
  return payload
}

function toSafeInteger(value: unknown, fallback = 0): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return fallback
  return Math.max(0, Math.trunc(normalized))
}

function toSafePercent(value: unknown): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return 0
  return Math.max(0, Math.min(100, normalized))
}

function createLocalTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getLocalStorageKey(projectId: string): string {
  return `workspace.project-upload-tasks.${projectId}`
}

function cloneTaskForPersist(task: ProjectUploadTask): Omit<ProjectUploadTask, 'sourceFile'> {
  return {
    localTaskId: task.localTaskId,
    sessionId: task.sessionId,
    projectId: task.projectId,
    fileName: task.fileName,
    fileSize: task.fileSize,
    mimeType: task.mimeType,
    lastModified: task.lastModified,
    chunkSize: task.chunkSize,
    status: task.status,
    progressPercent: task.progressPercent,
    uploadedBytes: task.uploadedBytes,
    uploadedChunkCount: task.uploadedChunkCount,
    chunkCount: task.chunkCount,
    errorMessage: task.errorMessage,
    previewStatus: task.previewStatus,
    resourceId: task.resourceId,
    needsFileRebind: task.needsFileRebind,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

function createTaskFromSession(session: ProjectResourceUploadSession, projectId: string, sourceFile?: File): ProjectUploadTask {
  const uploadedBytes = toSafeInteger(session.uploadedBytes)
  const fileSize = Math.max(0, toSafeInteger(session.fileSize))
  return {
    localTaskId: createLocalTaskId(),
    sessionId: session.id,
    projectId,
    fileName: session.fileName,
    fileSize,
    mimeType: session.mimeType,
    lastModified: toSafeInteger(session.lastModified),
    chunkSize: Math.max(1, toSafeInteger(session.chunkSize, PROJECT_RESOURCE_UPLOAD_CHUNK_SIZE_BYTES)),
    status: session.status,
    progressPercent: fileSize > 0
      ? toSafePercent((uploadedBytes / fileSize) * 100)
      : 0,
    uploadedBytes,
    uploadedChunkCount: toSafeInteger(session.uploadedChunkCount),
    chunkCount: Math.max(1, toSafeInteger(session.chunkCount, 1)),
    errorMessage: normalizeString(session.errorMessage),
    previewStatus: session.previewStatus,
    resourceId: normalizeString(session.resourceId) || undefined,
    needsFileRebind: !sourceFile && session.status !== 'completed' && session.status !== 'canceled',
    sourceFile,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

async function digestBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash))
    .map(item => item.toString(16).padStart(2, '0'))
    .join('')
}

function isActiveTaskStatus(status: ProjectUploadTask['status']): boolean {
  return status === 'queued'
    || status === 'uploading'
    || status === 'paused'
    || status === 'failed'
    || status === 'finalizing'
}

function isProjectSessionPollingActive(session: ProjectResourceUploadSession): boolean {
  return session.status === 'queued'
    || session.status === 'uploading'
    || session.status === 'finalizing'
}

function sortTasks(items: ProjectUploadTask[]): ProjectUploadTask[] {
  return [...items].sort((left, right) => {
    const leftActive = isActiveTaskStatus(left.status)
    const rightActive = isActiveTaskStatus(right.status)
    if (leftActive !== rightActive)
      return leftActive ? -1 : 1
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })
}

function sortProjectSessions(items: ProjectResourceUploadSession[]): ProjectResourceUploadSession[] {
  return [...items].sort((left, right) => {
    const leftActive = isActiveTaskStatus(left.status)
    const rightActive = isActiveTaskStatus(right.status)
    if (leftActive !== rightActive)
      return leftActive ? -1 : 1
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })
}

function areProjectSessionsEqual(
  left: ProjectResourceUploadSession,
  right: ProjectResourceUploadSession,
): boolean {
  return left.id === right.id
    && left.projectId === right.projectId
    && left.fileName === right.fileName
    && left.fileSize === right.fileSize
    && left.mimeType === right.mimeType
    && left.lastModified === right.lastModified
    && left.chunkSize === right.chunkSize
    && left.status === right.status
    && left.uploadedBytes === right.uploadedBytes
    && left.uploadedChunkCount === right.uploadedChunkCount
    && left.chunkCount === right.chunkCount
    && left.errorMessage === right.errorMessage
    && left.previewStatus === right.previewStatus
    && left.resourceId === right.resourceId
    && left.actorUserId === right.actorUserId
    && left.actorUsername === right.actorUsername
    && left.actorAvatarUrl === right.actorAvatarUrl
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.completedAt === right.completedAt
}

function areProjectSessionListsEqual(
  left: readonly ProjectResourceUploadSession[],
  right: readonly ProjectResourceUploadSession[],
): boolean {
  if (left.length !== right.length)
    return false
  return left.every((session, index) => {
    const rightSession = right[index]
    return Boolean(rightSession) && areProjectSessionsEqual(session, rightSession)
  })
}

function sortActivityItems(items: ProjectUploadActivityItem[]): ProjectUploadActivityItem[] {
  return [...items].sort((left, right) => {
    const leftPriority = left.isOwnedByCurrentUser ? 0 : 1
    const rightPriority = right.isOwnedByCurrentUser ? 0 : 1
    if (leftPriority !== rightPriority)
      return leftPriority - rightPriority

    const leftActive = isActiveTaskStatus(left.status)
    const rightActive = isActiveTaskStatus(right.status)
    if (leftActive !== rightActive)
      return leftActive ? -1 : 1

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })
}

function getCommittedProgressPercent(task: Pick<ProjectUploadTask, 'fileSize' | 'uploadedBytes'>): number {
  if (task.fileSize <= 0)
    return 0
  return toSafePercent((task.uploadedBytes / task.fileSize) * 100)
}

export function useProjectUploadManager(input: UseProjectUploadManagerInput) {
  const tasks = ref<ProjectUploadTask[]>([])
  const projectSessions = ref<ProjectResourceUploadSession[]>([])
  const projectSessionHistoryLoaded = ref(false)
  const drawerState = ref<ProjectUploadDrawerState>({
    open: false,
    source: 'manual',
  })
  const restoring = ref(false)
  const runningRequests = new Map<string, XMLHttpRequest>()
  const abortReasons = new Map<string, AbortReason>()
  const processingSessions = new Set<string>()
  let lastProjectId = ''
  let projectSessionPollTimer: ReturnType<typeof setTimeout> | null = null
  let autoCollapseTimer: ReturnType<typeof setTimeout> | null = null

  function getProjectId(): string {
    return normalizeString(input.projectId.value)
  }

  function getCurrentUserId(): string {
    return normalizeString(input.currentUserId?.value)
  }

  function getCurrentUsername(): string {
    return normalizeString(input.currentUsername?.value)
  }

  function getCurrentUserAvatarUrl(): string | null {
    return normalizeString(input.currentUserAvatarUrl?.value) || null
  }

  function isOwnedSession(session: ProjectResourceUploadSession): boolean {
    const currentUserId = getCurrentUserId()
    if (!currentUserId)
      return false
    return normalizeString(session.actorUserId) === currentUserId
  }

  function getLocalTasksForProject(projectId = getProjectId()): ProjectUploadTask[] {
    return tasks.value.filter(task => task.projectId === projectId && task.status !== 'canceled')
  }

  function clearProjectSessionPollTimer(): void {
    if (!projectSessionPollTimer)
      return
    clearTimeout(projectSessionPollTimer)
    projectSessionPollTimer = null
  }

  function clearAutoCollapseTimer(): void {
    if (!autoCollapseTimer)
      return
    clearTimeout(autoCollapseTimer)
    autoCollapseTimer = null
  }

  function shouldAutoCollapseDrawer(): boolean {
    const localTasks = getLocalTasksForProject()
    if (!drawerState.value.open || drawerState.value.source !== 'auto' || localTasks.length === 0)
      return false

    return localTasks.every(task => task.status === 'completed')
  }

  function syncAutoCollapseState(): void {
    if (!shouldAutoCollapseDrawer()) {
      clearAutoCollapseTimer()
      return
    }

    if (autoCollapseTimer)
      return

    autoCollapseTimer = setTimeout(() => {
      autoCollapseTimer = null
      if (!shouldAutoCollapseDrawer())
        return
      setDrawerState(false, 'manual')
      scheduleProjectSessionPoll()
    }, 1500)
  }

  const hasProjectActiveSessions = computed(() => {
    return projectSessions.value.some(session => isProjectSessionPollingActive(session))
  })

  function scheduleProjectSessionPoll(): void {
    clearProjectSessionPollTimer()
    if (!import.meta.client)
      return

    const projectId = getProjectId()
    if (!projectId)
      return

    const delay = drawerState.value.open || hasProjectActiveSessions.value ? 3000 : 15000
    projectSessionPollTimer = setTimeout(() => {
      projectSessionPollTimer = null
      void refreshProjectSessions()
    }, delay)
  }

  function applyProjectSessions(sessions: ProjectResourceUploadSession[]): void {
    const nextSessions = sortProjectSessions(
      sessions.filter(session => session.projectId === getProjectId()),
    )
    if (areProjectSessionListsEqual(projectSessions.value, nextSessions))
      return
    projectSessions.value = nextSessions
  }

  function setDrawerState(open: boolean, source: DrawerOpenSource): void {
    const nextState: ProjectUploadDrawerState = {
      open,
      source: open ? source : 'manual',
    }
    if (drawerState.value.open === nextState.open && drawerState.value.source === nextState.source)
      return
    drawerState.value = nextState
  }

  function upsertProjectSessions(nextSessions: ProjectResourceUploadSession[]): void {
    const merged = new Map<string, ProjectResourceUploadSession>()
    projectSessions.value.forEach((session) => {
      merged.set(session.id, session)
    })
    nextSessions.forEach((session) => {
      if (session.projectId === getProjectId())
        merged.set(session.id, session)
    })
    applyProjectSessions([...merged.values()])
  }

  function createActivityItemFromSession(session: ProjectResourceUploadSession): ProjectUploadActivityItem {
    const uploadedBytes = Math.max(0, toSafeInteger(session.uploadedBytes))
    const fileSize = Math.max(0, toSafeInteger(session.fileSize))
    const isOwnedByCurrentUser = isOwnedSession(session)
    return {
      sessionId: session.id,
      projectId: session.projectId,
      fileName: session.fileName,
      fileSize,
      mimeType: session.mimeType,
      status: session.status,
      progressPercent: fileSize > 0
        ? toSafePercent((uploadedBytes / fileSize) * 100)
        : 0,
      uploadedBytes,
      uploadedChunkCount: Math.max(0, toSafeInteger(session.uploadedChunkCount)),
      chunkCount: Math.max(1, toSafeInteger(session.chunkCount, 1)),
      errorMessage: normalizeString(session.errorMessage),
      actorUserId: session.actorUserId || null,
      actorUsername: normalizeString(session.actorUsername) || (isOwnedByCurrentUser ? getCurrentUsername() : '') || undefined,
      actorAvatarUrl: normalizeString(session.actorAvatarUrl) || (isOwnedByCurrentUser ? getCurrentUserAvatarUrl() : null),
      isOwnedByCurrentUser,
      isActionable: false,
      needsFileRebind: false,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt || null,
    }
  }

  function createActivityItemFromTask(task: ProjectUploadTask): ProjectUploadActivityItem {
    return {
      sessionId: task.sessionId,
      projectId: task.projectId,
      localTaskId: task.localTaskId,
      fileName: task.fileName,
      fileSize: task.fileSize,
      mimeType: task.mimeType,
      status: task.status,
      progressPercent: task.progressPercent,
      uploadedBytes: task.uploadedBytes,
      uploadedChunkCount: task.uploadedChunkCount,
      chunkCount: task.chunkCount,
      errorMessage: task.errorMessage,
      actorUserId: getCurrentUserId() || null,
      actorUsername: getCurrentUsername() || undefined,
      actorAvatarUrl: getCurrentUserAvatarUrl(),
      isOwnedByCurrentUser: true,
      isActionable: true,
      needsFileRebind: task.needsFileRebind,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: null,
    }
  }

  function overlayLocalTaskOnActivityItem(
    base: ProjectUploadActivityItem | undefined,
    task: ProjectUploadTask,
  ): ProjectUploadActivityItem {
    const fallback = createActivityItemFromTask(task)
    return {
      ...(base || fallback),
      localTaskId: task.localTaskId,
      fileName: task.fileName,
      fileSize: task.fileSize,
      mimeType: task.mimeType,
      status: task.status,
      progressPercent: task.progressPercent,
      uploadedBytes: task.uploadedBytes,
      uploadedChunkCount: task.uploadedChunkCount,
      chunkCount: task.chunkCount,
      errorMessage: task.errorMessage,
      actorUserId: base?.actorUserId || fallback.actorUserId,
      actorUsername: base?.actorUsername || fallback.actorUsername,
      actorAvatarUrl: base?.actorAvatarUrl || fallback.actorAvatarUrl,
      isOwnedByCurrentUser: true,
      isActionable: true,
      needsFileRebind: task.needsFileRebind,
      updatedAt: task.updatedAt,
      completedAt: task.status === 'completed' ? task.updatedAt : base?.completedAt || null,
    }
  }

  const activityItems = computed<ProjectUploadActivityItem[]>(() => {
    const projectId = getProjectId()
    if (!projectId)
      return []

    const merged = new Map<string, ProjectUploadActivityItem>()
    projectSessions.value
      .filter(session => session.projectId === projectId)
      .forEach((session) => {
        merged.set(session.id, createActivityItemFromSession(session))
      })

    getLocalTasksForProject(projectId).forEach((task) => {
      const existing = merged.get(task.sessionId)
      merged.set(task.sessionId, overlayLocalTaskOnActivityItem(existing, task))
    })

    return sortActivityItems([...merged.values()])
  })

  function persistTasks(): void {
    if (!import.meta.client)
      return
    const projectId = getProjectId()
    if (!projectId)
      return
    const serializable = tasks.value
      .filter(task => task.projectId === projectId && task.status !== 'canceled')
      .map(cloneTaskForPersist)
    window.localStorage.setItem(getLocalStorageKey(projectId), JSON.stringify(serializable))
  }

  function loadPersistedTasks(projectId: string): ProjectUploadTask[] {
    if (!import.meta.client || !projectId)
      return []
    try {
      const raw = window.localStorage.getItem(getLocalStorageKey(projectId))
      if (!raw)
        return []
      const parsed = JSON.parse(raw) as Array<Partial<ProjectUploadTask>>
      if (!Array.isArray(parsed))
        return []
      return parsed.map((item) => {
        return {
          localTaskId: normalizeString(item.localTaskId) || createLocalTaskId(),
          sessionId: normalizeString(item.sessionId),
          projectId,
          fileName: normalizeString(item.fileName),
          fileSize: toSafeInteger(item.fileSize),
          mimeType: normalizeString(item.mimeType) || 'application/octet-stream',
          lastModified: toSafeInteger(item.lastModified),
          chunkSize: Math.max(1, toSafeInteger(item.chunkSize, PROJECT_RESOURCE_UPLOAD_CHUNK_SIZE_BYTES)),
          status: item.status || 'queued',
          progressPercent: toSafePercent(item.progressPercent),
          uploadedBytes: toSafeInteger(item.uploadedBytes),
          uploadedChunkCount: toSafeInteger(item.uploadedChunkCount),
          chunkCount: Math.max(1, toSafeInteger(item.chunkCount, 1)),
          errorMessage: normalizeString(item.errorMessage),
          previewStatus: item.previewStatus,
          resourceId: normalizeString(item.resourceId) || undefined,
          needsFileRebind: Boolean(item.needsFileRebind),
          createdAt: normalizeString(item.createdAt) || new Date().toISOString(),
          updatedAt: normalizeString(item.updatedAt) || new Date().toISOString(),
        }
      }).filter(task => task.sessionId && task.fileName)
    }
    catch {
      return []
    }
  }

  function replaceTask(nextTask: ProjectUploadTask): void {
    const index = tasks.value.findIndex(task => task.sessionId === nextTask.sessionId)
    if (index >= 0)
      tasks.value.splice(index, 1, nextTask)
    else
      tasks.value.unshift(nextTask)
    tasks.value = sortTasks(tasks.value)
  }

  function patchTask(sessionId: string, updater: (task: ProjectUploadTask) => ProjectUploadTask | null): void {
    const index = tasks.value.findIndex(task => task.sessionId === sessionId)
    if (index < 0)
      return
    const current = tasks.value[index]!
    const next = updater(current)
    if (!next)
      tasks.value.splice(index, 1)
    else
      tasks.value.splice(index, 1, next)
    tasks.value = sortTasks(tasks.value)
  }

  function syncTaskFromSession(session: ProjectResourceUploadSession, sourceFile?: File): void {
    const existing = tasks.value.find(task => task.sessionId === session.id)
    const nextTask = createTaskFromSession(session, getProjectId(), sourceFile || existing?.sourceFile)
    if (existing) {
      nextTask.localTaskId = existing.localTaskId
      nextTask.sourceFile = sourceFile || existing.sourceFile
      nextTask.needsFileRebind = !nextTask.sourceFile && session.status !== 'completed' && session.status !== 'canceled'
    }
    replaceTask(nextTask)
  }

  function abortRunningRequest(sessionId: string, reason: AbortReason): void {
    const request = runningRequests.get(sessionId)
    if (!request)
      return
    abortReasons.set(sessionId, reason)
    request.abort()
    runningRequests.delete(sessionId)
  }

  function abortAllRunningRequests(reason: AbortReason): void {
    Array.from(runningRequests.keys()).forEach(sessionId => abortRunningRequest(sessionId, reason))
  }

  async function requestSessionList(): Promise<ProjectResourceUploadSession[]> {
    const projectId = getProjectId()
    if (!projectId)
      return []
    const response = await fetch(String(input.endpoint(`/projects/${projectId}/resource-upload-sessions`)), {
      credentials: 'include',
    })
    const payload = await parseApiResponse<ProjectResourceUploadSessionListResult>(response, '上传会话列表加载失败。')
    return Array.isArray(payload.data?.items) ? payload.data.items : []
  }

  async function refreshProjectSessions(): Promise<ProjectResourceUploadSession[]> {
    const projectId = getProjectId()
    if (!projectId) {
      projectSessions.value = []
      projectSessionHistoryLoaded.value = false
      clearProjectSessionPollTimer()
      return []
    }

    try {
      const sessions = await requestSessionList()
      applyProjectSessions(sessions)
      projectSessionHistoryLoaded.value = true
      return sessions
    }
    catch (error) {
      projectSessionHistoryLoaded.value = false
      const statusCode = Number((error as { statusCode?: number })?.statusCode || (error as { response?: { status?: number } })?.response?.status || 0)
      const message = normalizeString((error as { data?: { message?: string } })?.data?.message)
      if (statusCode === 403)
        input.onStatusLine?.(message || '当前账号无权查看团队上传记录。')
      return []
    }
    finally {
      scheduleProjectSessionPoll()
    }
  }

  async function restoreSessions(): Promise<void> {
    const projectId = getProjectId()
    abortAllRunningRequests('switch')
    processingSessions.clear()
    tasks.value = []
    projectSessions.value = []
    projectSessionHistoryLoaded.value = false
    clearAutoCollapseTimer()
    clearProjectSessionPollTimer()
    if (!projectId || !import.meta.client)
      return

    restoring.value = true
    try {
      const persistedTasks = loadPersistedTasks(projectId)
      const persistedMap = new Map(persistedTasks.map(task => [task.sessionId, task]))
      const sessions = await refreshProjectSessions()
      const merged: ProjectUploadTask[] = []

      sessions
        .filter(session => isOwnedSession(session) || persistedMap.has(session.id))
        .forEach((session) => {
          const existing = persistedMap.get(session.id)
          const nextTask = createTaskFromSession(session, projectId, existing?.sourceFile)
          nextTask.localTaskId = existing?.localTaskId || nextTask.localTaskId
          nextTask.sourceFile = existing?.sourceFile
          nextTask.needsFileRebind = !nextTask.sourceFile && session.status !== 'completed' && session.status !== 'canceled'
          merged.push(nextTask)
          persistedMap.delete(session.id)
        })

      persistedMap.forEach((task) => {
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'paused')
          merged.push(task)
      })

      tasks.value = sortTasks(merged)
      persistTasks()
      syncAutoCollapseState()
      void pumpQueue()
    }
    finally {
      restoring.value = false
    }
  }

  async function initializeUploadSessions(
    files: File[],
    options?: ProjectUploadEnqueueOptions,
  ): Promise<ProjectUploadTask[]> {
    const projectId = getProjectId()
    const response = await fetch(String(input.endpoint(`/projects/${projectId}/resource-upload-sessions`)), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: files.map(file => ({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          lastModified: toSafeInteger(file.lastModified),
          category: 'templates',
          accessLevel: 'public',
          title: '',
          summary: '',
          parentResourceId: normalizeString(options?.parentResourceId) || null,
        })),
      }),
    })
    const payload = await parseApiResponse<ProjectResourceUploadSessionListResult>(response, '上传会话初始化失败。')
    const sessions = Array.isArray(payload.data?.items) ? payload.data.items : []
    upsertProjectSessions(sessions)
    return sessions.map((session, index) => createTaskFromSession(session, projectId, files[index]))
  }

  function matchTaskForRebind(file: File): ProjectUploadTask | undefined {
    const exact = tasks.value.find((task) => {
      return task.projectId === getProjectId()
        && task.needsFileRebind
        && task.fileName === file.name
        && task.fileSize === file.size
        && task.lastModified === toSafeInteger(file.lastModified)
    })
    if (exact)
      return exact
    return tasks.value.find((task) => {
      return task.projectId === getProjectId()
        && task.needsFileRebind
        && task.fileName === file.name
        && task.fileSize === file.size
    })
  }

  async function rebindTaskFile(sessionId: string, file: File): Promise<void> {
    patchTask(sessionId, (task) => {
      return {
        ...task,
        sourceFile: file,
        lastModified: toSafeInteger(file.lastModified),
        needsFileRebind: false,
        updatedAt: new Date().toISOString(),
      }
    })
    const target = tasks.value.find(task => task.sessionId === sessionId)
    if (!target)
      return
    void refreshProjectSessions()
    if (target.status === 'paused' || target.status === 'failed') {
      await resumeTask(sessionId).catch(() => undefined)
      return
    }
    void pumpQueue()
  }

  async function enqueueFiles(
    files: File[],
    options?: ProjectUploadEnqueueOptions,
  ): Promise<void> {
    const projectId = getProjectId()
    if (!projectId)
      return

    const normalizedFiles = Array.from(files || []).filter(file => file instanceof File)
    if (!normalizedFiles.length)
      return

    const pendingFiles: File[] = []
    normalizedFiles.forEach((file) => {
      const matchedTask = matchTaskForRebind(file)
      if (matchedTask) {
        void rebindTaskFile(matchedTask.sessionId, file)
        return
      }
      pendingFiles.push(file)
    })

    if (!pendingFiles.length)
      return

    const validationError = input.validateFiles?.(pendingFiles, input.getUsedBytes?.() || 0) || null
    if (validationError) {
      input.onStatusLine?.(validationError)
      return
    }

    const createdTasks = await initializeUploadSessions(pendingFiles, options)
    createdTasks.forEach((task) => {
      replaceTask(task)
    })
    persistTasks()
    input.onStatusLine?.(`已加入上传队列：${createdTasks.length} 个文件。`)
    setDrawerState(true, 'auto')
    syncAutoCollapseState()
    void refreshProjectSessions()
    void pumpQueue()
  }

  function buildChunkUrl(projectId: string, sessionId: string, chunkIndex: number): string {
    return input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/chunks/${chunkIndex}`)
  }

  async function uploadChunk(task: ProjectUploadTask, chunkIndex: number): Promise<ProjectResourceUploadChunkAck> {
    const projectId = getProjectId()
    const sourceFile = task.sourceFile
    if (!sourceFile)
      throw new Error('UPLOAD_FILE_MISSING')

    const start = chunkIndex * task.chunkSize
    const end = Math.min(start + task.chunkSize, sourceFile.size)
    const blob = sourceFile.slice(start, end)
    const checksum = await digestBlobSha256(blob)

    return await new Promise<ProjectResourceUploadChunkAck>((resolve, reject) => {
      const request = new XMLHttpRequest()
      runningRequests.set(task.sessionId, request)

      request.open('PUT', buildChunkUrl(projectId, task.sessionId, chunkIndex), true)
      request.setRequestHeader('X-Chunk-Size', String(blob.size))
      request.setRequestHeader('X-File-Size', String(task.fileSize))
      request.setRequestHeader('X-Chunk-Checksum', checksum)

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable)
          return
        patchTask(task.sessionId, current => ({
          ...current,
          status: 'uploading',
          progressPercent: current.fileSize > 0
            ? toSafePercent(((current.uploadedBytes + event.loaded) / current.fileSize) * 100)
            : 0,
          updatedAt: new Date().toISOString(),
        }))
      }

      request.onerror = () => {
        runningRequests.delete(task.sessionId)
        reject(new Error('NETWORK_ERROR'))
      }

      request.onabort = () => {
        runningRequests.delete(task.sessionId)
        const reason = abortReasons.get(task.sessionId)
        abortReasons.delete(task.sessionId)
        reject(new Error(reason ? `ABORT_${reason.toUpperCase()}` : 'ABORT'))
      }

      request.onload = () => {
        runningRequests.delete(task.sessionId)
        try {
          const parsed = JSON.parse(String(request.responseText || '{}')) as ApiResponse<ProjectResourceUploadChunkAck>
          if (request.status < 200 || request.status >= 300 || parsed.code !== 0 || !parsed.data)
            reject(new Error(normalizeString(parsed.message) || `HTTP ${request.status}`))
          else
            resolve(parsed.data)
        }
        catch {
          reject(new Error(`HTTP ${request.status}`))
        }
      }

      void blob.arrayBuffer().then((buffer) => {
        request.send(buffer)
      }).catch((error) => {
        runningRequests.delete(task.sessionId)
        reject(error instanceof Error ? error : new Error('CHUNK_READ_FAILED'))
      })
    })
  }

  async function finalizeTask(sessionId: string): Promise<void> {
    patchTask(sessionId, task => ({
      ...task,
      status: 'finalizing',
      progressPercent: 100,
      errorMessage: '',
      updatedAt: new Date().toISOString(),
    }))

    const projectId = getProjectId()
    const response = await fetch(String(input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/complete`)), {
      method: 'POST',
      credentials: 'include',
    })
    const payload = await parseApiResponse<{ session: ProjectResourceUploadSession }>(response, '上传会话收尾失败。')
    const session = payload.data?.session
    if (!session)
      throw new Error('UPLOAD_COMPLETE_EMPTY')

    upsertProjectSessions([session])
    syncTaskFromSession(session)
    patchTask(sessionId, task => ({
      ...task,
      status: 'completed',
      progressPercent: 100,
      uploadedBytes: task.fileSize,
      uploadedChunkCount: task.chunkCount,
      sourceFile: undefined,
      needsFileRebind: false,
      updatedAt: new Date().toISOString(),
    }))

    void refreshProjectSessions()
    if (input.realtimeConnected && !input.realtimeConnected.value)
      await input.onRequireRefresh?.()
  }

  async function processTask(sessionId: string): Promise<void> {
    if (processingSessions.has(sessionId))
      return

    processingSessions.add(sessionId)
    try {
      while (true) {
        const task = tasks.value.find(item => item.sessionId === sessionId)
        if (!task)
          return
        if (task.status === 'paused' || task.status === 'canceled' || task.status === 'completed' || task.needsFileRebind)
          return
        if (!task.sourceFile) {
          patchTask(sessionId, current => ({
            ...current,
            status: 'failed',
            needsFileRebind: true,
            progressPercent: getCommittedProgressPercent(current),
            errorMessage: '需要重新选择原文件后继续上传。',
            updatedAt: new Date().toISOString(),
          }))
          void refreshProjectSessions()
          return
        }
        if (task.uploadedChunkCount >= task.chunkCount) {
          await finalizeTask(sessionId)
          return
        }

        try {
          const ack = await uploadChunk(task, task.uploadedChunkCount)
          patchTask(sessionId, current => ({
            ...current,
            status: ack.status,
            uploadedBytes: ack.uploadedBytes,
            uploadedChunkCount: ack.uploadedChunkCount,
            progressPercent: ack.progressPercent,
            errorMessage: '',
            updatedAt: new Date().toISOString(),
          }))
          persistTasks()
        }
        catch (error) {
          const message = error instanceof Error ? error.message : 'UPLOAD_FAILED'
          if (message === 'ABORT_PAUSE' || message === 'ABORT_CANCEL' || message === 'ABORT_SWITCH')
            return
          patchTask(sessionId, current => ({
            ...current,
            status: 'failed',
            progressPercent: getCommittedProgressPercent(current),
            errorMessage: normalizeString(message) || '上传失败，请重试。',
            updatedAt: new Date().toISOString(),
          }))
          persistTasks()
          void refreshProjectSessions()
          return
        }
      }
    }
    finally {
      processingSessions.delete(sessionId)
      persistTasks()
      syncAutoCollapseState()
      queueMicrotask(() => {
        void pumpQueue()
      })
    }
  }

  async function pumpQueue(): Promise<void> {
    const projectId = getProjectId()
    if (!projectId || restoring.value)
      return
    const availableSlots = Math.max(0, 3 - processingSessions.size)
    if (availableSlots <= 0)
      return
    const runnable = tasks.value
      .filter(task => task.projectId === projectId)
      .filter(task => (task.status === 'queued' || task.status === 'uploading') && !task.needsFileRebind && Boolean(task.sourceFile))
      .filter(task => !processingSessions.has(task.sessionId))
      .slice(0, availableSlots)
    runnable.forEach((task) => {
      void processTask(task.sessionId)
    })
  }

  async function pauseTask(sessionId: string): Promise<void> {
    const projectId = getProjectId()
    abortRunningRequest(sessionId, 'pause')
    patchTask(sessionId, task => ({
      ...task,
      status: 'paused',
      progressPercent: getCommittedProgressPercent(task),
      updatedAt: new Date().toISOString(),
    }))
    await fetch(String(input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/pause`)), {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined)
    persistTasks()
    syncAutoCollapseState()
    void refreshProjectSessions()
  }

  async function resumeTask(sessionId: string): Promise<void> {
    const projectId = getProjectId()
    const task = tasks.value.find(item => item.sessionId === sessionId)
    if (!task)
      return
    if (task.needsFileRebind && !task.sourceFile) {
      input.onStatusLine?.('请重新选择原文件后继续上传。')
      setDrawerState(true, 'manual')
      scheduleProjectSessionPoll()
      return
    }
    await fetch(String(input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/resume`)), {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined)
    patchTask(sessionId, current => ({
      ...current,
      status: 'uploading',
      errorMessage: '',
      updatedAt: new Date().toISOString(),
    }))
    persistTasks()
    void refreshProjectSessions()
    void pumpQueue()
  }

  async function retryTask(sessionId: string): Promise<void> {
    await resumeTask(sessionId)
  }

  async function cancelTask(sessionId: string): Promise<void> {
    const projectId = getProjectId()
    abortRunningRequest(sessionId, 'cancel')
    await fetch(String(input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/cancel`)), {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined)
    patchTask(sessionId, () => null)
    persistTasks()
    syncAutoCollapseState()
    void refreshProjectSessions()
  }

  function clearCompletedTasks(): void {
    tasks.value = tasks.value.filter(task => task.status !== 'completed')
    persistTasks()
    syncAutoCollapseState()
  }

  const summary = computed<ProjectUploadSummary>(() => {
    const visibleTasks = getLocalTasksForProject()
    const totalBytes = visibleTasks.reduce((sum, task) => sum + task.fileSize, 0)
    const uploadedBytes = visibleTasks.reduce((sum, task) => {
      let estimated = task.uploadedBytes
      if (task.status === 'uploading')
        estimated = Math.max(task.uploadedBytes, Math.round((task.progressPercent / 100) * task.fileSize))
      else if (task.status === 'finalizing' || task.status === 'completed')
        estimated = Math.max(task.uploadedBytes, task.fileSize)
      return sum + Math.min(task.fileSize, estimated)
    }, 0)

    return {
      totalCount: visibleTasks.length,
      activeCount: visibleTasks.filter(task => task.status === 'queued' || task.status === 'uploading' || task.status === 'finalizing').length,
      pausedCount: visibleTasks.filter(task => task.status === 'paused').length,
      failedCount: visibleTasks.filter(task => task.status === 'failed').length,
      completedCount: visibleTasks.filter(task => task.status === 'completed').length,
      progressPercent: totalBytes > 0 ? toSafePercent((uploadedBytes / totalBytes) * 100) : 0,
      uploadedBytes,
      totalBytes,
    }
  })

  watch(tasks, () => {
    persistTasks()
    syncAutoCollapseState()
  }, { deep: true })

  watch(() => drawerState.value, () => {
    syncAutoCollapseState()
    scheduleProjectSessionPoll()
  }, { deep: true })

  watch(hasProjectActiveSessions, () => {
    scheduleProjectSessionPoll()
  })

  watch(() => getProjectId(), async (nextProjectId) => {
    if (nextProjectId === lastProjectId)
      return
    lastProjectId = nextProjectId
    await restoreSessions()
  }, { immediate: true })

  onBeforeUnmount(() => {
    abortAllRunningRequests('switch')
    clearAutoCollapseTimer()
    clearProjectSessionPollTimer()
  })

  return {
    tasks: computed(() => sortTasks(getLocalTasksForProject())),
    summary,
    projectSessions: computed(() => projectSessions.value),
    projectSessionHistoryLoaded,
    activityItems,
    drawerState: computed(() => drawerState.value),
    drawerOpen: computed(() => drawerState.value.open),
    restoring,
    enqueueFiles,
    refreshProjectSessions,
    restoreSessions,
    pauseTask,
    resumeTask,
    retryTask,
    cancelTask,
    clearCompletedTasks,
    rebindTaskFile,
    openDrawer: (source: DrawerOpenSource = 'manual') => {
      setDrawerState(true, source)
      scheduleProjectSessionPoll()
    },
    closeDrawer: () => {
      setDrawerState(false, 'manual')
      clearAutoCollapseTimer()
      scheduleProjectSessionPoll()
    },
    toggleDrawer: () => {
      setDrawerState(!drawerState.value.open, 'manual')
      clearAutoCollapseTimer()
      scheduleProjectSessionPoll()
    },
    setDrawerOpen: (value: boolean, source: DrawerOpenSource = 'manual') => {
      setDrawerState(value, source)
      if (!value)
        clearAutoCollapseTimer()
      scheduleProjectSessionPoll()
    },
  }
}
