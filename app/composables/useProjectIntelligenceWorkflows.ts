import type { ComputedRef, Ref } from 'vue'
import type {
  AiWorkflowCatalogPayload,
  AiWorkflowDefinition,
  AiWorkflowDefinitionPayload,
  AiWorkflowRun,
  AiWorkflowRunTriggerPayload,
  AiWorkflowTemplatePreset,
  AiWorkflowToolRef,
  ApiResponse,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'
import { computed, ref, watch } from 'vue'
import { useApiEndpoint } from '~/composables/useApiEndpoint'

type MaybeRefString = Ref<string> | ComputedRef<string>

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function cloneDefinitionPayload(source: AiWorkflowDefinition | AiWorkflowTemplatePreset): AiWorkflowDefinitionPayload {
  return {
    name: source.name,
    description: source.description,
    trigger: {
      ...source.trigger,
    },
    contextSources: [...source.contextSources],
    toolAllowlist: [...source.toolAllowlist],
    steps: source.steps.map(step => ({
      ...step,
      contextSources: Array.isArray(step.contextSources) ? [...step.contextSources] : undefined,
      toolInput: step.toolInput ? { ...step.toolInput } : undefined,
    })),
  }
}

export function useProjectIntelligenceWorkflows(projectId: MaybeRefString) {
  const { endpoint } = useApiEndpoint()

  const workflows = ref<AiWorkflowDefinition[]>([])
  const availableTools = ref<AiWorkflowToolRef[]>([])
  const builtinTemplates = ref<AiWorkflowTemplatePreset[]>([])
  const runs = ref<AiWorkflowRun[]>([])
  const loading = ref(false)
  const runsLoading = ref(false)
  const saving = ref(false)
  const deletingWorkflowId = ref('')
  const runningWorkflowId = ref('')
  const continuingRunId = ref('')
  const mutatingChangeId = ref('')
  const error = ref('')

  const resolvedProjectId = computed(() => normalizeString(projectId.value))
  const toolMap = computed(() => new Map(availableTools.value.map(tool => [tool.key, tool])))

  async function loadCatalog(options: { silent?: boolean } = {}): Promise<void> {
    if (!resolvedProjectId.value) {
      workflows.value = []
      availableTools.value = []
      builtinTemplates.value = []
      return
    }

    if (!options.silent)
      loading.value = true
    error.value = ''
    try {
      const response = await unsafeFetch<ApiResponse<AiWorkflowCatalogPayload>>(
        endpoint(`/projects/${resolvedProjectId.value}/intelligence/workflows`),
      )
      workflows.value = response.data?.items || []
      availableTools.value = response.data?.availableTools || []
      builtinTemplates.value = response.data?.builtinTemplates || []
    }
    catch (fetchError: any) {
      workflows.value = []
      availableTools.value = []
      builtinTemplates.value = []
      error.value = String(fetchError?.data?.message || '加载智能工作流失败，请稍后重试。').trim() || '加载智能工作流失败，请稍后重试。'
    }
    finally {
      if (!options.silent)
        loading.value = false
    }
  }

  async function loadRuns(options: { silent?: boolean, workflowId?: string } = {}): Promise<void> {
    if (!resolvedProjectId.value) {
      runs.value = []
      return
    }

    if (!options.silent)
      runsLoading.value = true
    try {
      const query = options.workflowId ? `?workflowId=${encodeURIComponent(options.workflowId)}` : ''
      const response = await unsafeFetch<ApiResponse<{ items: AiWorkflowRun[] }>>(
        endpoint(`/projects/${resolvedProjectId.value}/intelligence/workflow-runs${query}`),
      )
      runs.value = response.data?.items || []
    }
    catch (fetchError: any) {
      runs.value = []
      Message.error(String(fetchError?.data?.message || '加载工作流运行历史失败，请稍后重试。').trim() || '加载工作流运行历史失败，请稍后重试。')
    }
    finally {
      if (!options.silent)
        runsLoading.value = false
    }
  }

  async function reload(): Promise<void> {
    await Promise.all([
      loadCatalog(),
      loadRuns(),
    ])
  }

  async function saveWorkflow(input: {
    id?: string
    definition: AiWorkflowDefinitionPayload
  }): Promise<AiWorkflowDefinition | null> {
    if (!resolvedProjectId.value || saving.value)
      return null

    saving.value = true
    try {
      const response = await unsafeFetch<ApiResponse<AiWorkflowDefinition>>(
        endpoint(`/projects/${resolvedProjectId.value}/intelligence/workflows`),
        {
          method: 'POST',
          body: {
            id: input.id || '',
            definition: input.definition,
          },
        },
      )
      Message.success(input.id ? '工作流已更新。' : '工作流已保存。')
      await reload()
      return response.data || null
    }
    catch (fetchError: any) {
      Message.error(String(fetchError?.data?.message || '保存工作流失败，请检查配置。').trim() || '保存工作流失败，请检查配置。')
      return null
    }
    finally {
      saving.value = false
    }
  }

  async function deleteWorkflow(workflowId: string): Promise<boolean> {
    const normalizedWorkflowId = normalizeString(workflowId)
    if (!resolvedProjectId.value || !normalizedWorkflowId || deletingWorkflowId.value)
      return false

    deletingWorkflowId.value = normalizedWorkflowId
    try {
      await unsafeFetch(
        endpoint(`/projects/${resolvedProjectId.value}/intelligence/workflows/${normalizedWorkflowId}`),
        {
          method: 'DELETE',
        },
      )
      Message.success('工作流已删除。')
      await reload()
      return true
    }
    catch (fetchError: any) {
      Message.error(String(fetchError?.data?.message || '删除工作流失败，请稍后重试。').trim() || '删除工作流失败，请稍后重试。')
      return false
    }
    finally {
      deletingWorkflowId.value = ''
    }
  }

  async function runWorkflow(workflowId: string, triggerPayload: AiWorkflowRunTriggerPayload): Promise<AiWorkflowRun | null> {
    const normalizedWorkflowId = normalizeString(workflowId)
    if (!resolvedProjectId.value || !normalizedWorkflowId || runningWorkflowId.value)
      return null

    runningWorkflowId.value = normalizedWorkflowId
    try {
      const response = await unsafeFetch<ApiResponse<AiWorkflowRun>>(
        endpoint(`/projects/${resolvedProjectId.value}/intelligence/workflows/${normalizedWorkflowId}/run`),
        {
          method: 'POST',
          body: {
            triggerPayload,
          },
        },
      )
      Message.success('工作流已开始执行。')
      await loadRuns()
      return response.data || null
    }
    catch (fetchError: any) {
      Message.error(String(fetchError?.data?.message || '启动工作流失败，请检查步骤配置。').trim() || '启动工作流失败，请检查步骤配置。')
      return null
    }
    finally {
      runningWorkflowId.value = ''
    }
  }

  async function continueRun(runId: string): Promise<AiWorkflowRun | null> {
    const normalizedRunId = normalizeString(runId)
    if (!resolvedProjectId.value || !normalizedRunId || continuingRunId.value)
      return null

    continuingRunId.value = normalizedRunId
    try {
      const response = await unsafeFetch<ApiResponse<AiWorkflowRun>>(
        endpoint(`/projects/${resolvedProjectId.value}/intelligence/workflow-runs/${normalizedRunId}/continue`),
        {
          method: 'POST',
        },
      )
      Message.success('工作流已继续执行。')
      await loadRuns()
      return response.data || null
    }
    catch (fetchError: any) {
      Message.error(String(fetchError?.data?.message || '当前工作流尚未满足继续条件。').trim() || '当前工作流尚未满足继续条件。')
      return null
    }
    finally {
      continuingRunId.value = ''
    }
  }

  async function approveChange(changeId: string, options: { destructiveConfirm?: boolean } = {}): Promise<boolean> {
    const normalizedChangeId = normalizeString(changeId)
    if (!resolvedProjectId.value || !normalizedChangeId || mutatingChangeId.value)
      return false

    mutatingChangeId.value = normalizedChangeId
    try {
      await unsafeFetch(
        endpoint(`/projects/${resolvedProjectId.value}/ai/changes/${normalizedChangeId}/approve`),
        {
          method: 'POST',
          body: {
            destructiveConfirm: Boolean(options.destructiveConfirm),
          },
        },
      )
      Message.success('提案已批准。')
      await loadRuns()
      return true
    }
    catch (fetchError: any) {
      Message.error(String(fetchError?.data?.message || '批准提案失败，请稍后重试。').trim() || '批准提案失败，请稍后重试。')
      return false
    }
    finally {
      mutatingChangeId.value = ''
    }
  }

  async function rejectChange(changeId: string): Promise<void> {
    const normalizedChangeId = normalizeString(changeId)
    if (!resolvedProjectId.value || !normalizedChangeId || mutatingChangeId.value)
      return

    mutatingChangeId.value = normalizedChangeId
    try {
      await unsafeFetch(
        endpoint(`/projects/${resolvedProjectId.value}/ai/changes/${normalizedChangeId}/reject`),
        {
          method: 'POST',
          body: {
            reason: '在工作流面板中手动拒绝。',
          },
        },
      )
      Message.success('提案已拒绝。')
      await loadRuns()
    }
    catch (fetchError: any) {
      Message.error(String(fetchError?.data?.message || '拒绝提案失败，请稍后重试。').trim() || '拒绝提案失败，请稍后重试。')
    }
    finally {
      mutatingChangeId.value = ''
    }
  }

  function createDraftFromWorkflow(workflow: AiWorkflowDefinition | null): { id?: string, definition: AiWorkflowDefinitionPayload } | null {
    if (!workflow)
      return null
    return {
      id: workflow.id,
      definition: cloneDefinitionPayload(workflow),
    }
  }

  function createDraftFromTemplate(template: AiWorkflowTemplatePreset | null): { definition: AiWorkflowDefinitionPayload } | null {
    if (!template)
      return null
    return {
      definition: cloneDefinitionPayload(template),
    }
  }

  watch(resolvedProjectId, async (next, previous) => {
    if (next === previous && workflows.value.length > 0)
      return
    workflows.value = []
    runs.value = []
    availableTools.value = []
    builtinTemplates.value = []
    error.value = ''
    if (!next)
      return
    await reload()
  }, { immediate: true })

  return {
    workflows,
    availableTools,
    builtinTemplates,
    runs,
    loading,
    runsLoading,
    saving,
    deletingWorkflowId,
    runningWorkflowId,
    continuingRunId,
    mutatingChangeId,
    error,
    toolMap,
    reload,
    loadRuns,
    saveWorkflow,
    deleteWorkflow,
    runWorkflow,
    continueRun,
    approveChange,
    rejectChange,
    createDraftFromWorkflow,
    createDraftFromTemplate,
  }
}
