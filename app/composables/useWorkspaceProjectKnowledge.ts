import type { ComputedRef, Ref } from 'vue'
import type {
  ApiResponse,
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeIndexDiagnostics,
  ProjectKnowledgeIndexHealthState,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useApiEndpoint } from '~/composables/useApiEndpoint'

type ProjectKnowledgeReindexTarget = 'all' | 'stale' | 'failed'
type MaybeRefString = Ref<string> | ComputedRef<string>

const EMPTY_PROJECT_KNOWLEDGE_DASHBOARD: ProjectKnowledgeIndexDashboard = {
  summary: {
    projectId: '',
    totalResources: 0,
    indexableResources: 0,
    pendingCount: 0,
    readyCount: 0,
    processingCount: 0,
    queuedCount: 0,
    failedCount: 0,
    staleCount: 0,
    skippedCount: 0,
    overallProgressPercent: 0,
    etaSeconds: 0,
    estimatedFinishedAt: null,
    lastRefreshedAt: '',
  },
  runtime: {
    clientType: 'langchain',
    embeddingConfigured: false,
    embeddingClientType: 'openai-compatible',
    embeddingApiStyle: 'openai-compatible-text',
    embeddingProvider: 'unconfigured',
    embeddingModel: '',
    embeddingDimensions: 0,
  },
  worker: {
    started: false,
    enabled: false,
    ticking: false,
    lastError: '',
  },
  diagnostics: {
    candidateResourceCount: 0,
    sourceCount: 0,
    taskCount: 0,
    chunkCount: 0,
    realEmbeddedChunkCount: 0,
    fallbackEmbeddedChunkCount: 0,
    unknownEmbeddedChunkCount: 0,
    multimodalIndexedCount: 0,
    multimodalBlockedCount: 0,
    healthState: 'empty_project',
    healthMessage: '当前项目没有可索引的活跃资源。',
    embeddingHealthReason: '',
    issues: [],
  },
  visuals: {
    stageFunnel: [],
    failureReasons: [],
    chunkKindDistribution: [],
    resourceKindDistribution: [],
    embeddingComposition: [],
    taskTrend: [],
    resourceStatusMatrix: {
      resourceKinds: [],
      statuses: [],
      cells: [],
    },
    topology: {
      nodes: [],
      links: [],
    },
    starfieldNodes: [],
  },
  processing: [],
  recentCompleted: [],
  failed: [],
  sources: [],
  tasks: [],
}

function normalizeProjectId(source: MaybeRefString): string {
  return String(source.value || '').trim()
}

function hasActiveKnowledgeWork(dashboard: ProjectKnowledgeIndexDashboard | null | undefined): boolean {
  const summary = dashboard?.summary || EMPTY_PROJECT_KNOWLEDGE_DASHBOARD.summary
  return summary.processingCount > 0 || summary.pendingCount > 0 || summary.queuedCount > 0 || summary.staleCount > 0
}

export function useWorkspaceProjectKnowledge(projectId: MaybeRefString) {
  const { endpoint } = useApiEndpoint()

  const dashboard = ref<ProjectKnowledgeIndexDashboard | null>(null)
  const loading = ref(false)
  const error = ref('')
  const reindexingTarget = ref<ProjectKnowledgeReindexTarget | ''>('')
  const retryingSourceId = ref('')
  let pollingTimer: ReturnType<typeof setInterval> | null = null

  const resolvedProjectId = computed(() => normalizeProjectId(projectId))
  const currentDashboard = computed(() => dashboard.value || EMPTY_PROJECT_KNOWLEDGE_DASHBOARD)
  const summary = computed(() => currentDashboard.value.summary)
  const runtime = computed(() => currentDashboard.value.runtime)
  const worker = computed(() => currentDashboard.value.worker)
  const diagnostics = computed<ProjectKnowledgeIndexDiagnostics>(() => currentDashboard.value.diagnostics)
  const visuals = computed(() => currentDashboard.value.visuals)
  const hasActiveProject = computed(() => Boolean(resolvedProjectId.value))
  const shouldPoll = computed(() => Boolean(resolvedProjectId.value) && hasActiveKnowledgeWork(currentDashboard.value))
  const hasActiveWork = computed(() => hasActiveKnowledgeWork(currentDashboard.value))
  const loopyDataTone = computed<'idle' | 'running' | 'warning' | 'error' | 'ready'>(() => {
    const state: ProjectKnowledgeIndexHealthState = diagnostics.value.healthState
    if (hasActiveWork.value)
      return 'running'
    if (state === 'healthy')
      return 'ready'
    if (state === 'empty_project')
      return 'idle'
    if (state === 'partial' || state === 'fallback_only')
      return 'warning'
    return 'error'
  })

  function stopPolling(): void {
    if (!pollingTimer)
      return
    clearInterval(pollingTimer)
    pollingTimer = null
  }

  function startPolling(): void {
    if (!import.meta.client || pollingTimer)
      return
    pollingTimer = setInterval(() => {
      if (loading.value)
        return
      void loadDashboard({ silent: true })
    }, 5000)
  }

  async function loadDashboard(options: { silent?: boolean } = {}): Promise<void> {
    const normalizedProjectId = resolvedProjectId.value
    if (!normalizedProjectId) {
      dashboard.value = null
      error.value = ''
      return
    }

    if (!options.silent)
      loading.value = true
    error.value = ''
    try {
      const response = await unsafeFetch<ApiResponse<ProjectKnowledgeIndexDashboard>>(
        endpoint(`/projects/${normalizedProjectId}/knowledge/index-status`),
      )
      dashboard.value = response.data || EMPTY_PROJECT_KNOWLEDGE_DASHBOARD
    }
    catch (fetchError: any) {
      dashboard.value = null
      error.value = String(fetchError?.data?.message || '加载 Loopy 数据失败，请稍后重试。').trim() || '加载 Loopy 数据失败，请稍后重试。'
    }
    finally {
      if (!options.silent)
        loading.value = false
    }
  }

  async function reindexProjectKnowledge(target: ProjectKnowledgeReindexTarget): Promise<void> {
    const normalizedProjectId = resolvedProjectId.value
    if (!normalizedProjectId || reindexingTarget.value)
      return

    reindexingTarget.value = target
    try {
      await unsafeFetch<ApiResponse<ProjectKnowledgeIndexDashboard>>(
        endpoint(`/projects/${normalizedProjectId}/knowledge/reindex`),
        {
          method: 'POST',
          body: { target },
        },
      )
      Message.success(target === 'all' ? '已提交全量重建任务。' : target === 'stale' ? '已提交 stale 重建任务。' : '已提交 failed 重建任务。')
      await loadDashboard()
    }
    catch (fetchError: any) {
      Message.error(String(fetchError?.data?.message || '项目知识索引重建失败，请稍后重试。').trim() || '项目知识索引重建失败，请稍后重试。')
    }
    finally {
      reindexingTarget.value = ''
    }
  }

  async function reindexKnowledgeSource(resourceId: string): Promise<void> {
    const normalizedProjectId = resolvedProjectId.value
    const normalizedResourceId = String(resourceId || '').trim()
    if (!normalizedProjectId || !normalizedResourceId || retryingSourceId.value)
      return

    retryingSourceId.value = normalizedResourceId
    try {
      await unsafeFetch(
        endpoint(`/projects/${normalizedProjectId}/resources/${normalizedResourceId}/knowledge/reindex`),
        {
          method: 'POST',
        },
      )
      Message.success('已提交资源重新索引任务。')
      await loadDashboard()
    }
    catch (fetchError: any) {
      Message.error(String(fetchError?.data?.message || '资源重新索引失败，请稍后重试。').trim() || '资源重新索引失败，请稍后重试。')
    }
    finally {
      retryingSourceId.value = ''
    }
  }

  watch(resolvedProjectId, async (next, previous) => {
    if (next === previous && dashboard.value)
      return
    stopPolling()
    dashboard.value = null
    error.value = ''
    if (!next)
      return
    await loadDashboard()
  }, { immediate: true })

  watch(shouldPoll, (next) => {
    if (next) {
      startPolling()
      return
    }
    stopPolling()
  }, { immediate: true })

  onBeforeUnmount(() => {
    stopPolling()
  })

  return {
    dashboard,
    currentDashboard,
    summary,
    runtime,
    worker,
    diagnostics,
    visuals,
    loading,
    error,
    reindexingTarget,
    retryingSourceId,
    hasActiveProject,
    hasActiveWork,
    loopyDataTone,
    reload: loadDashboard,
    reindexProjectKnowledge,
    reindexKnowledgeSource,
  }
}
