import type { Ref } from 'vue'
import type {
  ApiResponse,
  ProjectResourceUploadChunkAck,
  ProjectResourceUploadSession,
  ProjectResourceUploadSessionListResult,
} from '~~/shared/types/domain'
import type { ProjectUploadSummary, ProjectUploadTask } from '~/types/project-upload'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { PROJECT_RESOURCE_UPLOAD_CHUNK_SIZE_BYTES } from '~~/shared/constants/project-resource-upload'

interface UseProjectUploadManagerInput {
  projectId: Ref<string>
  endpoint: (path: string) => string
  realtimeConnected?: Ref<boolean>
  getUsedBytes?: () => number
  validateFiles?: (files: File[], usedBytes: number) => string | null
  onStatusLine?: (text: string) => void
  onRequireRefresh?: () => Promise<void> | void
}

type AbortReason = 'pause' | 'cancel' | 'switch'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
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

function sortTasks(items: ProjectUploadTask[]): ProjectUploadTask[] {
  return [...items].sort((left, right) => {
    const leftActive = left.status === 'queued' || left.status === 'uploading' || left.status === 'paused' || left.status === 'failed' || left.status === 'finalizing'
    const rightActive = right.status === 'queued' || right.status === 'uploading' || right.status === 'paused' || right.status === 'failed' || right.status === 'finalizing'
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
  const drawerOpen = ref(false)
  const restoring = ref(false)
  const runningRequests = new Map<string, XMLHttpRequest>()
  const abortReasons = new Map<string, AbortReason>()
  const processingSessions = new Set<string>()
  let lastProjectId = ''

  function getProjectId(): string {
    return normalizeString(input.projectId.value)
  }

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
    if (!next) {
      tasks.value.splice(index, 1)
    }
    else {
      tasks.value.splice(index, 1, next)
    }
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
    const response = await $fetch<ApiResponse<ProjectResourceUploadSessionListResult>>(input.endpoint(`/projects/${projectId}/resource-upload-sessions`))
    return Array.isArray(response.data?.items) ? response.data.items : []
  }

  async function restoreSessions(): Promise<void> {
    const projectId = getProjectId()
    abortAllRunningRequests('switch')
    processingSessions.clear()
    tasks.value = []
    if (!projectId || !import.meta.client)
      return

    restoring.value = true
    try {
      const persistedTasks = loadPersistedTasks(projectId)
      const persistedMap = new Map(persistedTasks.map(task => [task.sessionId, task]))
      const sessions = await requestSessionList().catch(() => [])
      const merged: ProjectUploadTask[] = []

      sessions.forEach((session) => {
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
      void pumpQueue()
    }
    finally {
      restoring.value = false
    }
  }

  async function initializeUploadSessions(files: File[]): Promise<ProjectUploadTask[]> {
    const projectId = getProjectId()
    const response = await $fetch<ApiResponse<ProjectResourceUploadSessionListResult>>(input.endpoint(`/projects/${projectId}/resource-upload-sessions`), {
      method: 'POST',
      body: {
        files: files.map(file => ({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          lastModified: toSafeInteger(file.lastModified),
          category: 'templates',
          accessLevel: 'public',
          title: '',
          summary: '',
        })),
      },
    })
    const sessions = Array.isArray(response.data?.items) ? response.data.items : []
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
    if (target.status === 'paused' || target.status === 'failed') {
      await resumeTask(sessionId).catch(() => undefined)
      return
    }
    void pumpQueue()
  }

  async function enqueueFiles(files: File[]): Promise<void> {
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

    const createdTasks = await initializeUploadSessions(pendingFiles)
    createdTasks.forEach((task) => {
      replaceTask(task)
    })
    persistTasks()
    input.onStatusLine?.(`已加入上传队列：${createdTasks.length} 个文件。`)
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
    const response = await $fetch<ApiResponse<{
      session: ProjectResourceUploadSession
    }>>(input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/complete`), {
      method: 'POST',
    })
    const session = response.data?.session
    if (!session)
      throw new Error('UPLOAD_COMPLETE_EMPTY')

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
          return
        }
      }
    }
    finally {
      processingSessions.delete(sessionId)
      persistTasks()
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
    await $fetch(input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/pause`), {
      method: 'POST',
    }).catch(() => undefined)
    persistTasks()
  }

  async function resumeTask(sessionId: string): Promise<void> {
    const projectId = getProjectId()
    const task = tasks.value.find(item => item.sessionId === sessionId)
    if (!task)
      return
    if (task.needsFileRebind && !task.sourceFile) {
      input.onStatusLine?.('请重新选择原文件后继续上传。')
      drawerOpen.value = true
      return
    }
    await $fetch(input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/resume`), {
      method: 'POST',
    }).catch(() => undefined)
    patchTask(sessionId, current => ({
      ...current,
      status: 'uploading',
      errorMessage: '',
      updatedAt: new Date().toISOString(),
    }))
    persistTasks()
    void pumpQueue()
  }

  async function retryTask(sessionId: string): Promise<void> {
    await resumeTask(sessionId)
  }

  async function cancelTask(sessionId: string): Promise<void> {
    const projectId = getProjectId()
    abortRunningRequest(sessionId, 'cancel')
    await $fetch(input.endpoint(`/projects/${projectId}/resource-upload-sessions/${sessionId}/cancel`), {
      method: 'POST',
    }).catch(() => undefined)
    patchTask(sessionId, () => null)
    persistTasks()
  }

  function clearCompletedTasks(): void {
    tasks.value = tasks.value.filter(task => task.status !== 'completed')
    persistTasks()
  }

  const summary = computed<ProjectUploadSummary>(() => {
    const visibleTasks = tasks.value.filter(task => task.projectId === getProjectId() && task.status !== 'canceled')
    const totalBytes = visibleTasks.reduce((sum, task) => sum + task.fileSize, 0)
    const uploadedBytes = visibleTasks.reduce((sum, task) => {
      let estimated = task.uploadedBytes
      if (task.status === 'uploading') {
        estimated = Math.max(task.uploadedBytes, Math.round((task.progressPercent / 100) * task.fileSize))
      }
      else if (task.status === 'finalizing' || task.status === 'completed') {
        estimated = Math.max(task.uploadedBytes, task.fileSize)
      }
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
  }, { deep: true })

  watch(() => getProjectId(), async (nextProjectId) => {
    if (nextProjectId === lastProjectId)
      return
    lastProjectId = nextProjectId
    await restoreSessions()
  }, { immediate: true })

  onBeforeUnmount(() => {
    abortAllRunningRequests('switch')
  })

  return {
    tasks: computed(() => sortTasks(tasks.value.filter(task => task.projectId === getProjectId() && task.status !== 'canceled'))),
    summary,
    drawerOpen,
    restoring,
    enqueueFiles,
    restoreSessions,
    pauseTask,
    resumeTask,
    retryTask,
    cancelTask,
    clearCompletedTasks,
    rebindTaskFile,
    setDrawerOpen: (value: boolean) => {
      drawerOpen.value = Boolean(value)
    },
  }
}
