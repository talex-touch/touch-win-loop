<script setup lang="ts">
import type {
  AiProjectChangeRequest,
  AiWorkflowContextSource,
  AiWorkflowDefinition,
  AiWorkflowDefinitionPayload,
  AiWorkflowRun,
  AiWorkflowStep,
  AiWorkflowTemplatePreset,
  Project,
  Resource,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'

const props = withDefaults(defineProps<{
  activeProject?: Project | null
  activeProjectId?: string
  selectedResources?: Resource[]
}>(), {
  activeProject: null,
  activeProjectId: '',
  selectedResources: () => [],
})

const CONTEXT_SOURCE_OPTIONS: Array<{ id: AiWorkflowContextSource, label: string }> = [
  { id: 'project.settings', label: '项目设置' },
  { id: 'project.outline', label: '项目大纲' },
  { id: 'project.resources', label: '全部资源摘要' },
  { id: 'project.knowledge', label: '知识索引摘要' },
  { id: 'resource.selection', label: '当前选中资源' },
  { id: 'session.memory', label: 'Session memory' },
]

const AGENT_MODE_OPTIONS = [
  { id: 'dialog_ask', label: '对话分析' },
  { id: 'auto_optimize', label: '自动优化提案' },
  { id: 'issue_discovery', label: '问题发现' },
  { id: 'document_assist', label: '文稿助手' },
  { id: 'contextual_agent', label: '上下文 Agent' },
]
const TRIGGER_TYPE_OPTIONS = [
  { value: 'manual', label: 'manual' },
  { value: 'resource.batch', label: 'resource.batch' },
] as const
const STEP_TYPE_OPTIONS = [
  { value: 'prompt', label: 'prompt' },
  { value: 'tool', label: 'tool' },
  { value: 'agent', label: 'agent' },
] as const
const agentModeSelectOptions = AGENT_MODE_OPTIONS.map(mode => ({
  value: mode.id,
  label: mode.label,
}))

interface DraftState {
  id?: string
  definition: AiWorkflowDefinitionPayload
}

const projectId = computed(() => String(props.activeProjectId || '').trim())
const selectedResourceIds = computed(() => (props.selectedResources || []).map(item => String(item.id || '').trim()).filter(Boolean))
const {
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
  saveWorkflow,
  deleteWorkflow,
  runWorkflow,
  continueRun,
  approveChange,
  rejectChange,
  createDraftFromWorkflow,
  createDraftFromTemplate,
  reload,
} = useProjectIntelligenceWorkflows(projectId)

const selectedWorkflowId = ref('')
const editingDraft = ref<DraftState | null>(null)
const workflowChangeSecondConfirmIds = ref<string[]>([])
const workflowDeleteSecondConfirmId = ref('')
const toolInputDraftMap = reactive<Record<string, string>>({})

const toolSelectOptions = computed(() => [
  { value: '', label: '请选择工具' },
  ...availableTools.value.map(tool => ({
    value: tool.key,
    label: `${tool.label} · ${tool.source} · ${tool.riskLevel}`,
  })),
])

function createLocalId(): string {
  return globalThis.crypto?.randomUUID?.() || `workflow-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function createEmptyWorkflowDraft(): DraftState {
  return {
    definition: {
      name: '新的智能工作流',
      description: '',
      trigger: { type: 'manual' },
      contextSources: ['project.settings', 'project.outline', 'resource.selection'],
      toolAllowlist: [],
      steps: [
        {
          id: createLocalId(),
          name: '分析当前项目',
          type: 'agent',
          agentMode: 'dialog_ask',
          prompt: '请基于当前项目上下文给出结构化分析。',
          continueOnError: false,
        },
      ],
    },
  }
}

function cloneStep(step: AiWorkflowStep): AiWorkflowStep {
  return {
    ...step,
    contextSources: Array.isArray(step.contextSources) ? [...step.contextSources] : undefined,
    toolInput: step.toolInput ? { ...step.toolInput } : undefined,
  }
}

function applyDraft(nextDraft: DraftState | null): void {
  editingDraft.value = nextDraft
    ? {
        id: nextDraft.id,
        definition: {
          ...nextDraft.definition,
          trigger: { ...nextDraft.definition.trigger },
          contextSources: [...nextDraft.definition.contextSources],
          toolAllowlist: [...nextDraft.definition.toolAllowlist],
          steps: nextDraft.definition.steps.map(cloneStep),
        },
      }
    : null

  Object.keys(toolInputDraftMap).forEach((key) => {
    delete toolInputDraftMap[key]
  })

  for (const step of editingDraft.value?.definition.steps || []) {
    toolInputDraftMap[step.id] = step.toolInput ? JSON.stringify(step.toolInput, null, 2) : '{}'
  }
}

function selectWorkflow(workflow: AiWorkflowDefinition | null): void {
  workflowDeleteSecondConfirmId.value = ''
  selectedWorkflowId.value = workflow?.id || ''
  applyDraft(createDraftFromWorkflow(workflow))
}

function selectTemplate(template: AiWorkflowTemplatePreset | null): void {
  workflowDeleteSecondConfirmId.value = ''
  selectedWorkflowId.value = ''
  applyDraft(createDraftFromTemplate(template) as DraftState | null)
}

function createNewWorkflow(): void {
  workflowDeleteSecondConfirmId.value = ''
  selectedWorkflowId.value = ''
  applyDraft(createEmptyWorkflowDraft())
}

function ensureToolAllowlist(toolKey: string): void {
  const normalizedToolKey = String(toolKey || '').trim()
  const draft = editingDraft.value
  if (!draft || !normalizedToolKey)
    return
  if (draft.definition.toolAllowlist.includes(normalizedToolKey))
    return
  draft.definition.toolAllowlist.push(normalizedToolKey)
}

function addStep(type: AiWorkflowStep['type']): void {
  const draft = editingDraft.value
  if (!draft)
    return

  const step: AiWorkflowStep = {
    id: createLocalId(),
    name: type === 'prompt' ? '提示步骤' : type === 'tool' ? '工具步骤' : 'Agent 步骤',
    type,
    prompt: type === 'prompt' ? '补充本步骤的目标与约束。' : type === 'agent' ? '补充本步骤的 Agent 任务。' : undefined,
    toolKey: type === 'tool' ? draft.definition.toolAllowlist[0] || '' : undefined,
    toolInput: type === 'tool' ? {} : undefined,
    agentMode: type === 'agent' ? 'dialog_ask' : undefined,
    continueOnError: false,
  }
  draft.definition.steps.push(step)
  toolInputDraftMap[step.id] = '{}'
}

function removeStep(stepId: string): void {
  const draft = editingDraft.value
  if (!draft)
    return
  draft.definition.steps = draft.definition.steps.filter(step => step.id !== stepId)
  delete toolInputDraftMap[stepId]
}

function toggleWorkflowContext(sourceId: AiWorkflowContextSource): void {
  const draft = editingDraft.value
  if (!draft)
    return
  const current = new Set(draft.definition.contextSources)
  if (current.has(sourceId))
    current.delete(sourceId)
  else
    current.add(sourceId)
  draft.definition.contextSources = Array.from(current)
}

function toggleStepContext(step: AiWorkflowStep, sourceId: AiWorkflowContextSource): void {
  const current = new Set(step.contextSources || [])
  if (current.has(sourceId))
    current.delete(sourceId)
  else
    current.add(sourceId)
  step.contextSources = Array.from(current)
}

function toggleAllowlist(toolKey: string): void {
  const draft = editingDraft.value
  if (!draft)
    return
  const current = new Set(draft.definition.toolAllowlist)
  if (current.has(toolKey))
    current.delete(toolKey)
  else
    current.add(toolKey)
  draft.definition.toolAllowlist = Array.from(current)
}

function parseToolInput(step: AiWorkflowStep): Record<string, unknown> {
  const text = String(toolInputDraftMap[step.id] || '{}').trim() || '{}'
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }
  catch {
    throw new Error(`工具步骤「${step.name}」的 JSON 输入不合法。`)
  }
}

async function saveCurrentWorkflow(): Promise<void> {
  const draft = editingDraft.value
  if (!draft)
    return

  try {
    const nextDefinition: AiWorkflowDefinitionPayload = {
      ...draft.definition,
      trigger: { ...draft.definition.trigger },
      contextSources: [...draft.definition.contextSources],
      toolAllowlist: [...draft.definition.toolAllowlist],
      steps: draft.definition.steps.map((step) => {
        return {
          ...step,
          contextSources: Array.isArray(step.contextSources) && step.contextSources.length > 0
            ? [...step.contextSources]
            : undefined,
          toolInput: step.type === 'tool' ? parseToolInput(step) : undefined,
        }
      }),
    }
    const saved = await saveWorkflow({
      id: draft.id,
      definition: nextDefinition,
    })
    if (saved)
      selectWorkflow(saved)
  }
  catch (error: any) {
    Message.error(String(error?.message || '保存前校验失败。').trim() || '保存前校验失败。')
  }
}

async function runSelectedWorkflow(workflowId?: string): Promise<void> {
  const targetWorkflowId = String(workflowId || selectedWorkflowId.value || '').trim()
  if (!targetWorkflowId)
    return
  await runWorkflow(targetWorkflowId, {
    selectedResourceIds: selectedResourceIds.value,
    note: props.selectedResources?.length
      ? `当前运行携带 ${props.selectedResources.length} 条选中资源。`
      : '当前运行未显式选择项目资源。',
  })
}

async function deleteSelectedWorkflow(workflow: AiWorkflowDefinition | null): Promise<void> {
  const workflowId = String(workflow?.id || '').trim()
  if (!workflowId)
    return
  if (workflowDeleteSecondConfirmId.value !== workflowId) {
    workflowDeleteSecondConfirmId.value = workflowId
    Message.warning('删除会归档该智能工作流，请再次点击删除确认。')
    return
  }
  const deleted = await deleteWorkflow(workflowId, {
    destructiveConfirm: true,
  })
  if (deleted)
    workflowDeleteSecondConfirmId.value = ''
}

function formatDateTime(value?: string | null): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '暂无'
  const timestamp = Date.parse(normalized)
  if (!Number.isFinite(timestamp))
    return normalized
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function resolveStatusLabel(status: string): string {
  if (status === 'running')
    return '运行中'
  if (status === 'completed')
    return '已完成'
  if (status === 'failed')
    return '失败'
  if (status === 'needs_review')
    return '待审批'
  if (status === 'skipped')
    return '已跳过'
  return '待执行'
}

function hasPendingReview(run: AiWorkflowRun): boolean {
  return (run.steps || []).some(step => step.reviewContext?.changeRequests?.some(change => change.status === 'pending'))
}

function requiresWorkflowChangeSecondConfirm(change: AiProjectChangeRequest): boolean {
  return Boolean(change.destructive && workflowChangeSecondConfirmIds.value.includes(change.id))
}

async function approveWorkflowChange(change: AiProjectChangeRequest): Promise<void> {
  const changeId = String(change.id || '').trim()
  if (!changeId)
    return
  if (change.destructive && !workflowChangeSecondConfirmIds.value.includes(changeId)) {
    workflowChangeSecondConfirmIds.value = [...workflowChangeSecondConfirmIds.value, changeId]
    Message.warning('该提案包含破坏性操作，请再次点击批准确认执行。')
    return
  }
  const approved = await approveChange(changeId, {
    destructiveConfirm: Boolean(change.destructive),
  })
  if (approved)
    workflowChangeSecondConfirmIds.value = workflowChangeSecondConfirmIds.value.filter(item => item !== changeId)
}

async function rejectWorkflowChange(change: AiProjectChangeRequest): Promise<void> {
  const changeId = String(change.id || '').trim()
  if (!changeId)
    return
  workflowChangeSecondConfirmIds.value = workflowChangeSecondConfirmIds.value.filter(item => item !== changeId)
  await rejectChange(changeId)
}

const selectedWorkflow = computed(() => workflows.value.find(item => item.id === selectedWorkflowId.value) || null)
const filteredRuns = computed(() => {
  if (!selectedWorkflowId.value)
    return runs.value
  return runs.value.filter(run => run.workflowId === selectedWorkflowId.value)
})

watch(workflows, (items) => {
  if (items.length === 0) {
    if (!editingDraft.value)
      applyDraft(createEmptyWorkflowDraft())
    return
  }

  if (!selectedWorkflowId.value) {
    selectWorkflow(items[0] || null)
    return
  }

  const matched = items.find(item => item.id === selectedWorkflowId.value) || null
  if (!matched) {
    selectWorkflow(items[0] || null)
  }
}, { immediate: true })
</script>

<template>
  <section class="workflow-workbench">
    <header class="workflow-workbench__header">
      <div class="workflow-workbench__header-copy">
        <span class="workflow-workbench__eyebrow">Intelligence Workflow Center</span>
        <h2 class="workflow-workbench__title">
          项目级智能工作流
        </h2>
        <p class="workflow-workbench__subtitle">
          保存线性 workflow，绑定项目上下文，按 run 历史查看暂停、审批与恢复。
        </p>
      </div>

      <div class="workflow-workbench__header-side">
        <div class="workflow-workbench__stats" aria-label="工作流概览">
          <span><strong>{{ props.selectedResources?.length || 0 }}</strong> 资源</span>
          <span><strong>{{ workflows.length }}</strong> 工作流</span>
          <span><strong>{{ builtinTemplates.length }}</strong> 模板</span>
          <span><strong>{{ filteredRuns.length }}</strong> 历史</span>
        </div>
        <div class="workflow-workbench__actions">
          <button class="workflow-workbench__action" type="button" @click="reload()">
            刷新
          </button>
          <button class="workflow-workbench__action workflow-workbench__action--primary" type="button" @click="createNewWorkflow()">
            新建工作流
          </button>
        </div>
      </div>
    </header>

    <div class="workflow-workbench__selection">
      <div class="workflow-workbench__selection-summary">
        <span class="workflow-workbench__selection-label">当前选中资源</span>
        <strong>{{ props.selectedResources?.length || 0 }}</strong>
      </div>
      <div class="workflow-workbench__selection-list" aria-label="当前选中资源列表">
        <span
          v-for="resource in props.selectedResources"
          :key="resource.id"
          class="workflow-workbench__selection-chip"
        >
          {{ resource.title || '未命名资源' }}
        </span>
        <span v-if="!props.selectedResources?.length" class="workflow-workbench__selection-empty">
          当前没有显式选中资源，resource.batch 触发器将退化为项目级上下文运行。
        </span>
      </div>
    </div>

    <p v-if="error" class="workflow-workbench__error">
      {{ error }}
    </p>

    <div class="workflow-workbench__layout">
      <aside class="workflow-workbench__sidebar">
        <div class="workflow-workbench__sidebar-group">
          <div class="workflow-workbench__sidebar-head">
            <h3>已保存工作流</h3>
            <span>{{ workflows.length }}</span>
          </div>
          <button
            v-for="workflow in workflows"
            :key="workflow.id"
            class="workflow-workbench__sidebar-item"
            :data-active="workflow.id === selectedWorkflowId"
            type="button"
            @click="selectWorkflow(workflow)"
          >
            <strong>{{ workflow.name }}</strong>
            <small>{{ workflow.description || '暂无描述' }}</small>
          </button>
          <p v-if="loading" class="workflow-workbench__hint">
            正在加载工作流...
          </p>
        </div>

        <div class="workflow-workbench__sidebar-group">
          <div class="workflow-workbench__sidebar-head">
            <h3>内置模板</h3>
            <span>{{ builtinTemplates.length }}</span>
          </div>
          <button
            v-for="template in builtinTemplates"
            :key="template.key"
            class="workflow-workbench__sidebar-item workflow-workbench__sidebar-item--template"
            type="button"
            @click="selectTemplate(template)"
          >
            <strong>{{ template.name }}</strong>
            <small>{{ template.description }}</small>
          </button>
        </div>
      </aside>

      <section class="workflow-workbench__editor">
        <div v-if="editingDraft" class="workflow-editor">
          <div class="workflow-editor__toolbar">
            <div>
              <h3>{{ selectedWorkflow ? '编辑工作流' : '草稿工作流' }}</h3>
              <p>线性 step editor，不做 DAG，只保留当前 v1 所需字段。</p>
            </div>
            <div class="workflow-editor__toolbar-actions">
              <button
                v-if="selectedWorkflow?.id"
                class="workflow-editor__danger"
                type="button"
                :disabled="deletingWorkflowId === selectedWorkflow.id"
                @click="deleteSelectedWorkflow(selectedWorkflow)"
              >
                {{ deletingWorkflowId === selectedWorkflow?.id ? '删除中...' : workflowDeleteSecondConfirmId === selectedWorkflow?.id ? '再次确认删除' : '删除' }}
              </button>
              <button
                class="workflow-editor__secondary"
                type="button"
                :disabled="!selectedWorkflow?.id || runningWorkflowId === selectedWorkflow.id"
                @click="runSelectedWorkflow(selectedWorkflow?.id)"
              >
                {{ runningWorkflowId === selectedWorkflow?.id ? '运行中...' : '运行' }}
              </button>
              <button class="workflow-editor__primary" type="button" :disabled="saving" @click="saveCurrentWorkflow()">
                {{ saving ? '保存中...' : '保存工作流' }}
              </button>
            </div>
          </div>

          <div class="workflow-editor__panel">
            <label class="workflow-editor__field">
              <span>名称</span>
              <input v-model="editingDraft.definition.name" type="text">
            </label>
            <label class="workflow-editor__field">
              <span>描述</span>
              <textarea v-model="editingDraft.definition.description" rows="2" />
            </label>
            <label class="workflow-editor__field">
              <span>触发器</span>
              <UiSelect v-model="editingDraft.definition.trigger.type" :options="TRIGGER_TYPE_OPTIONS" size="xs" aria-label="触发器" />
            </label>
          </div>

          <div class="workflow-editor__panel">
            <div class="workflow-editor__section-head">
              <h4>工作流上下文</h4>
              <small>默认上下文源，可被单步覆盖。</small>
            </div>
            <div class="workflow-editor__chip-grid">
              <button
                v-for="option in CONTEXT_SOURCE_OPTIONS"
                :key="option.id"
                class="workflow-editor__chip"
                :data-active="editingDraft.definition.contextSources.includes(option.id)"
                type="button"
                @click="toggleWorkflowContext(option.id)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="workflow-editor__panel">
            <div class="workflow-editor__section-head">
              <h4>可用工具白名单</h4>
              <small>仅工具 step 会消费 allowlist。</small>
            </div>
            <div class="workflow-editor__tool-grid">
              <button
                v-for="tool in availableTools"
                :key="tool.key"
                class="workflow-editor__tool-card"
                :data-active="editingDraft.definition.toolAllowlist.includes(tool.key)"
                type="button"
                @click="toggleAllowlist(tool.key)"
              >
                <strong>{{ tool.label }}</strong>
                <span>{{ tool.source }} · {{ tool.riskLevel }}</span>
                <small>{{ tool.description }}</small>
              </button>
            </div>
          </div>

          <div class="workflow-editor__panel">
            <div class="workflow-editor__section-head">
              <h4>步骤</h4>
              <div class="workflow-editor__step-actions">
                <button type="button" @click="addStep('prompt')">
                  加提示步骤
                </button>
                <button type="button" @click="addStep('tool')">
                  加工具步骤
                </button>
                <button type="button" @click="addStep('agent')">
                  加 Agent 步骤
                </button>
              </div>
            </div>

            <article
              v-for="(step, index) in editingDraft.definition.steps"
              :key="step.id"
              class="workflow-editor__step-card"
            >
              <div class="workflow-editor__step-head">
                <strong>Step {{ index + 1 }}</strong>
                <button type="button" class="workflow-editor__step-remove" @click="removeStep(step.id)">
                  删除
                </button>
              </div>

              <div class="workflow-editor__step-grid">
                <label class="workflow-editor__field">
                  <span>步骤名称</span>
                  <input v-model="step.name" type="text">
                </label>
                <label class="workflow-editor__field">
                  <span>步骤类型</span>
                  <UiSelect v-model="step.type" :options="STEP_TYPE_OPTIONS" size="xs" aria-label="步骤类型" />
                </label>
              </div>

              <label v-if="step.type === 'agent'" class="workflow-editor__field">
                <span>Agent 模式</span>
                <UiSelect v-model="step.agentMode" :options="agentModeSelectOptions" size="xs" aria-label="Agent 模式" />
              </label>

              <label v-if="step.type === 'tool'" class="workflow-editor__field">
                <span>工具</span>
                <UiSelect
                  v-model="step.toolKey"
                  :options="toolSelectOptions"
                  size="xs"
                  aria-label="工具"
                  @change="value => ensureToolAllowlist(String(value || ''))"
                />
              </label>

              <label v-if="step.type === 'prompt' || step.type === 'agent'" class="workflow-editor__field">
                <span>Prompt</span>
                <textarea v-model="step.prompt" rows="4" />
              </label>

              <label v-if="step.type === 'tool'" class="workflow-editor__field">
                <span>工具输入 JSON</span>
                <textarea v-model="toolInputDraftMap[step.id]" rows="5" />
              </label>

              <div class="workflow-editor__field">
                <span>本步骤上下文</span>
                <div class="workflow-editor__chip-grid">
                  <button
                    v-for="option in CONTEXT_SOURCE_OPTIONS"
                    :key="option.id"
                    class="workflow-editor__chip"
                    :data-active="(step.contextSources || []).includes(option.id)"
                    type="button"
                    @click="toggleStepContext(step, option.id)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <label class="workflow-editor__checkbox">
                <input v-model="step.continueOnError" type="checkbox">
                <span>失败后继续下一步</span>
              </label>

              <p v-if="step.type === 'tool' && step.toolKey" class="workflow-editor__hint">
                {{ toolMap.get(step.toolKey)?.description || '当前工具暂无说明。' }}
              </p>
            </article>
          </div>
        </div>
      </section>

      <section class="workflow-runs">
        <div class="workflow-runs__head">
          <div>
            <h3>运行历史</h3>
            <p>查看 step 状态、审批对象和 continue 恢复入口。</p>
          </div>
          <span>{{ filteredRuns.length }} 条</span>
        </div>

        <p v-if="runsLoading" class="workflow-workbench__hint">
          正在加载运行历史...
        </p>

        <article
          v-for="run in filteredRuns"
          :key="run.id"
          class="workflow-runs__card"
        >
          <header class="workflow-runs__card-head">
            <div>
              <strong>{{ run.definitionSnapshot.name }}</strong>
              <p>{{ resolveStatusLabel(run.status) }} · {{ formatDateTime(run.createdAt) }}</p>
            </div>
            <button
              v-if="run.status === 'needs_review'"
              class="workflow-editor__secondary"
              type="button"
              :disabled="continuingRunId === run.id || hasPendingReview(run)"
              @click="continueRun(run.id)"
            >
              {{ continuingRunId === run.id ? '继续中...' : hasPendingReview(run) ? '等待审批完成' : '继续执行' }}
            </button>
          </header>

          <ol class="workflow-runs__steps">
            <li
              v-for="step in run.steps || []"
              :key="step.id"
              class="workflow-runs__step"
            >
              <div class="workflow-runs__step-main">
                <strong>{{ step.name }}</strong>
                <span>{{ step.type }} · {{ resolveStatusLabel(step.status) }}</span>
              </div>
              <p v-if="step.output?.assistantReply" class="workflow-runs__step-copy">
                {{ String(step.output.assistantReply || '') }}
              </p>
              <p v-else-if="step.output?.text" class="workflow-runs__step-copy">
                {{ String(step.output.text || '') }}
              </p>
              <p v-else-if="step.errorMessage" class="workflow-runs__step-error">
                {{ step.errorMessage }}
              </p>

              <div
                v-if="step.reviewContext?.changeRequests?.length"
                class="workflow-runs__reviews"
              >
                <article
                  v-for="change in step.reviewContext.changeRequests"
                  :key="change.id"
                  class="workflow-runs__review-card"
                >
                  <div>
                    <div class="workflow-runs__review-title">
                      <strong>{{ change.title }}</strong>
                      <span v-if="change.destructive" class="workflow-runs__destructive-pill">破坏性</span>
                    </div>
                    <p>{{ change.summary }}</p>
                  </div>
                  <div class="workflow-runs__review-actions">
                    <span>{{ resolveStatusLabel(change.status) }}</span>
                    <button
                      v-if="change.status === 'pending'"
                      type="button"
                      :disabled="mutatingChangeId === change.id"
                      @click="approveWorkflowChange(change)"
                    >
                      {{ requiresWorkflowChangeSecondConfirm(change) ? '再次确认批准' : '批准' }}
                    </button>
                    <button
                      v-if="change.status === 'pending'"
                      type="button"
                      :disabled="mutatingChangeId === change.id"
                      @click="rejectWorkflowChange(change)"
                    >
                      拒绝
                    </button>
                  </div>
                </article>
              </div>
            </li>
          </ol>
        </article>

        <p v-if="!filteredRuns.length && !runsLoading" class="workflow-workbench__hint">
          还没有运行历史，先保存并运行一个 workflow。
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.workflow-workbench {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #1b314d;
}

.workflow-workbench__header,
.workflow-runs__head,
.workflow-editor__toolbar,
.workflow-workbench__selection,
.workflow-runs__card-head,
.workflow-runs__review-card,
.workflow-runs__step-main,
.workflow-editor__section-head,
.workflow-editor__step-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workflow-workbench__header {
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid #e4ebf4;
}

.workflow-workbench__header-copy {
  min-width: 0;
}

.workflow-workbench__header-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  min-width: 360px;
}

.workflow-workbench__eyebrow {
  display: inline-block;
  color: #7b8da5;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workflow-workbench__title,
.workflow-runs__head h3,
.workflow-editor__toolbar h3 {
  margin: 6px 0 0;
  color: #152a45;
  font-size: 18px;
  font-weight: 900;
}

.workflow-workbench__subtitle,
.workflow-runs__head p,
.workflow-editor__toolbar p {
  margin: 8px 0 0;
  color: #627897;
  font-size: 12px;
  line-height: 1.6;
}

.workflow-workbench__stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.workflow-workbench__stats span {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid #e2eaf4;
  border-radius: 7px;
  background: #fbfdff;
  color: #6d8099;
  font-size: 11px;
  font-weight: 700;
}

.workflow-workbench__stats strong {
  color: #1e3654;
  font-size: 13px;
  font-weight: 900;
}

.workflow-workbench__actions,
.workflow-editor__toolbar-actions,
.workflow-editor__step-actions,
.workflow-runs__review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workflow-workbench__action,
.workflow-editor__primary,
.workflow-editor__secondary,
.workflow-editor__danger,
.workflow-editor__step-actions button,
.workflow-runs__review-actions button {
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid #d4dfed;
  border-radius: 7px;
  background: #fff;
  color: #244263;
  font-size: 12px;
  font-weight: 700;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
}

.workflow-workbench__action:hover,
.workflow-editor__primary:hover,
.workflow-editor__secondary:hover,
.workflow-editor__danger:hover,
.workflow-editor__step-actions button:hover,
.workflow-runs__review-actions button:hover {
  border-color: #b9c9dc;
  background: #f8fbff;
}

.workflow-workbench__action:disabled,
.workflow-editor__primary:disabled,
.workflow-editor__secondary:disabled,
.workflow-editor__danger:disabled,
.workflow-editor__step-actions button:disabled,
.workflow-runs__review-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.workflow-workbench__action--primary,
.workflow-editor__primary {
  border-color: #94b4ff;
  background: #eef4ff;
  color: #173f9f;
}

.workflow-workbench__action--primary:hover,
.workflow-editor__primary:hover {
  border-color: #7299f7;
  background: #e6efff;
}

.workflow-editor__danger {
  border-color: rgba(219, 59, 59, 0.22);
  color: #9a2b2b;
}

.workflow-workbench__selection {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  align-items: center;
  padding: 10px 0 12px;
  border-bottom: 1px solid #e8eef6;
}

.workflow-workbench__selection-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.workflow-workbench__selection-label {
  color: #607694;
  font-size: 12px;
  font-weight: 800;
}

.workflow-workbench__selection-summary strong {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 22px;
  border-radius: 6px;
  background: #eef4fb;
  color: #244263;
  font-size: 12px;
  font-weight: 900;
}

.workflow-workbench__selection-list {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
}

.workflow-workbench__selection-list::-webkit-scrollbar {
  height: 4px;
}

.workflow-workbench__selection-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #d6e1ef;
}

.workflow-workbench__selection-chip,
.workflow-editor__chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  min-height: 28px;
  max-width: 260px;
  padding: 0 10px;
  border: 1px solid #d7e2ef;
  border-radius: 7px;
  background: #fff;
  color: #315072;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
}

.workflow-workbench__selection-chip {
  flex: 0 0 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workflow-editor__chip[data-active='true'] {
  border-color: #9bb8ff;
  background: #eef4ff;
  color: #173567;
}

.workflow-workbench__selection-empty,
.workflow-workbench__hint,
.workflow-editor__hint {
  color: #7388a6;
  font-size: 12px;
  line-height: 1.6;
}

.workflow-workbench__error,
.workflow-runs__step-error {
  color: #b63b3b;
  font-size: 12px;
  line-height: 1.6;
}

.workflow-workbench__layout {
  display: grid;
  grid-template-columns: minmax(210px, 240px) minmax(520px, 1fr) minmax(300px, 360px);
  align-items: flex-start;
  gap: 18px;
}

.workflow-workbench__sidebar,
.workflow-runs {
  min-width: 0;
  max-height: calc(100vh - 190px);
  overflow: auto;
  position: sticky;
  top: 12px;
}

.workflow-workbench__sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-right: 16px;
  border-right: 1px solid #e7edf5;
}

.workflow-workbench__sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workflow-workbench__sidebar-head h3 {
  margin: 0;
  color: #20364f;
  font-size: 13px;
  font-weight: 800;
}

.workflow-workbench__sidebar-head span,
.workflow-runs__head span {
  color: #7388a6;
  font-size: 12px;
  font-weight: 700;
}

.workflow-workbench__sidebar-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 10px 10px 12px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  transition:
    background 0.16s ease,
    border-color 0.16s ease;
}

.workflow-workbench__sidebar-item:hover {
  background: #f8fbff;
}

.workflow-workbench__sidebar-item[data-active='true'] {
  border-color: #dbe7ff;
  border-left-color: #4f7cff;
  background: #f2f6ff;
}

.workflow-workbench__sidebar-item strong,
.workflow-runs__card-head strong,
.workflow-runs__review-card strong {
  color: #18304d;
  font-size: 13px;
  font-weight: 800;
}

.workflow-workbench__sidebar-item small,
.workflow-runs__card-head p,
.workflow-runs__review-card p {
  color: #6d84a1;
  font-size: 11px;
  line-height: 1.55;
}

.workflow-workbench__editor {
  min-width: 0;
}

.workflow-editor {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.workflow-editor__toolbar {
  align-items: center;
  padding-bottom: 14px;
}

.workflow-editor__toolbar-actions {
  flex: 0 0 auto;
  justify-content: flex-end;
}

.workflow-editor__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 0;
  border-top: 1px solid #e7edf5;
}

.workflow-editor__toolbar + .workflow-editor__panel {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(260px, 1.2fr) 170px;
  align-items: start;
  column-gap: 12px;
}

.workflow-editor__section-head h4 {
  margin: 0;
  color: #20364f;
  font-size: 14px;
  font-weight: 900;
}

.workflow-editor__section-head small {
  color: #7488a3;
  font-size: 12px;
  line-height: 1.5;
}

.workflow-editor__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workflow-editor__field span {
  color: #46627f;
  font-size: 12px;
  font-weight: 800;
}

.workflow-editor__field input,
.workflow-editor__field textarea,
.workflow-editor__field select {
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
  padding: 9px 11px;
  border: 1px solid #dbe4ef;
  border-radius: 7px;
  background: #fff;
  color: #213a58;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.workflow-editor__field input:focus,
.workflow-editor__field textarea:focus,
.workflow-editor__field select:focus {
  border-color: #8eabeb;
  box-shadow: 0 0 0 3px rgba(79, 124, 255, 0.1);
}

.workflow-editor__field textarea {
  resize: vertical;
}

.workflow-editor__chip-grid,
.workflow-editor__tool-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workflow-editor__chip-grid {
  gap: 7px;
}

.workflow-editor__tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}

.workflow-editor__tool-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #dbe4ef;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;
}

.workflow-editor__tool-card:hover {
  border-color: #bdcce0;
  background: #fbfdff;
  transform: translateY(-1px);
}

.workflow-editor__tool-card[data-active='true'] {
  border-color: #9bb8ff;
  background: #eef4ff;
}

.workflow-editor__tool-card strong {
  color: #18304d;
  font-size: 13px;
  font-weight: 800;
}

.workflow-editor__tool-card span,
.workflow-editor__tool-card small {
  color: #6f86a2;
  font-size: 11px;
  line-height: 1.5;
}

.workflow-editor__step-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px 14px 16px;
  border: 1px solid #e0e8f2;
  border-left: 3px solid #9bb8ff;
  border-radius: 8px;
  background: #fbfdff;
}

.workflow-editor__step-head strong {
  color: #1d3553;
  font-size: 13px;
  font-weight: 900;
}

.workflow-editor__step-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.workflow-editor__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #4d6785;
  font-size: 12px;
  font-weight: 700;
}

.workflow-editor__checkbox input {
  width: 14px;
  height: 14px;
  margin: 0;
}

.workflow-editor__step-remove {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #ead1d1;
  border-radius: 7px;
  background: #fff;
  color: #9a2b2b;
  font-size: 12px;
  font-weight: 700;
}

.workflow-runs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 16px;
  border-left: 1px solid #e7edf5;
}

.workflow-runs__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dfe8f3;
  border-radius: 8px;
  background: #fff;
}

.workflow-runs__steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workflow-runs__step {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 0 0;
  border-top: 1px solid #edf2f8;
}

.workflow-runs__step-main span,
.workflow-runs__review-actions span {
  color: #6b829f;
  font-size: 12px;
  font-weight: 700;
}

.workflow-runs__step-copy {
  margin: 0;
  color: #344f6f;
  font-size: 12px;
  line-height: 1.6;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.workflow-runs__reviews {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workflow-runs__review-card {
  padding: 10px;
  border: 1px solid #e0e7f1;
  border-radius: 8px;
  background: rgba(249, 251, 254, 0.96);
}

.workflow-runs__review-title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.workflow-runs__destructive-pill {
  padding: 2px 6px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #fff1f2;
  color: #be123c;
  font-size: 10px;
  font-weight: 800;
}

@media (max-width: 1380px) {
  .workflow-workbench__layout {
    grid-template-columns: minmax(190px, 230px) minmax(0, 1fr);
  }

  .workflow-runs {
    position: static;
    grid-column: 1 / -1;
    max-height: none;
    padding: 16px 0 0;
    border-top: 1px solid #e7edf5;
    border-left: 0;
  }
}

@media (max-width: 1080px) {
  .workflow-workbench__header,
  .workflow-editor__toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .workflow-workbench__header-side {
    align-items: stretch;
    width: 100%;
    min-width: 0;
  }

  .workflow-workbench__stats,
  .workflow-workbench__actions,
  .workflow-editor__toolbar-actions {
    justify-content: flex-start;
  }

  .workflow-workbench__layout {
    grid-template-columns: 1fr;
  }

  .workflow-workbench__sidebar {
    padding-right: 0;
    border-right: 0;
    border-bottom: 1px solid #e7edf5;
    padding-bottom: 14px;
  }

  .workflow-editor__toolbar + .workflow-editor__panel {
    grid-template-columns: 1fr;
  }

  .workflow-editor__step-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .workflow-workbench__selection {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .workflow-workbench__actions,
  .workflow-editor__toolbar-actions,
  .workflow-editor__step-actions,
  .workflow-runs__review-actions {
    width: 100%;
  }

  .workflow-workbench__action,
  .workflow-editor__primary,
  .workflow-editor__secondary,
  .workflow-editor__danger,
  .workflow-editor__step-actions button,
  .workflow-runs__review-actions button {
    flex: 1 1 auto;
  }

  .workflow-runs__card-head,
  .workflow-runs__review-card,
  .workflow-runs__step-main,
  .workflow-editor__section-head,
  .workflow-editor__step-head {
    align-items: flex-start;
    flex-direction: column;
  }
}

:global(html.dark) .workflow-workbench__selection,
:global(html.dark) .workflow-runs__card,
:global(html.dark) .workflow-workbench__sidebar-item,
:global(html.dark) .workflow-editor__tool-card,
:global(html.dark) .workflow-editor__step-card,
:global(html.dark) .workflow-runs__review-card {
  background: rgba(14, 21, 33, 0.86);
  border-color: rgba(98, 122, 161, 0.3);
}

:global(html.dark) .workflow-workbench__header,
:global(html.dark) .workflow-workbench__selection,
:global(html.dark) .workflow-workbench__sidebar,
:global(html.dark) .workflow-runs,
:global(html.dark) .workflow-editor__panel {
  border-color: rgba(98, 122, 161, 0.24);
}

:global(html.dark) .workflow-workbench__stats span,
:global(html.dark) .workflow-workbench__selection-summary strong,
:global(html.dark) .workflow-workbench__selection-chip,
:global(html.dark) .workflow-editor__chip,
:global(html.dark) .workflow-editor__field input,
:global(html.dark) .workflow-editor__field textarea,
:global(html.dark) .workflow-editor__field select,
:global(html.dark) .workflow-workbench__action,
:global(html.dark) .workflow-editor__primary,
:global(html.dark) .workflow-editor__secondary,
:global(html.dark) .workflow-editor__danger,
:global(html.dark) .workflow-editor__step-actions button,
:global(html.dark) .workflow-runs__review-actions button,
:global(html.dark) .workflow-editor__step-remove {
  background: rgba(10, 16, 26, 0.9);
  border-color: rgba(98, 122, 161, 0.32);
  color: #d8e5f8;
}

:global(html.dark) .workflow-workbench__title,
:global(html.dark) .workflow-runs__head h3,
:global(html.dark) .workflow-editor__toolbar h3,
:global(html.dark) .workflow-editor__section-head h4,
:global(html.dark) .workflow-workbench__sidebar-item strong,
:global(html.dark) .workflow-runs__card-head strong,
:global(html.dark) .workflow-runs__review-card strong,
:global(html.dark) .workflow-editor__tool-card strong,
:global(html.dark) .workflow-editor__step-head strong,
:global(html.dark) .workflow-workbench__stats strong {
  color: #edf4ff;
}

:global(html.dark) .workflow-workbench__subtitle,
:global(html.dark) .workflow-runs__head p,
:global(html.dark) .workflow-editor__toolbar p,
:global(html.dark) .workflow-workbench__selection-empty,
:global(html.dark) .workflow-workbench__hint,
:global(html.dark) .workflow-editor__hint,
:global(html.dark) .workflow-editor__section-head small,
:global(html.dark) .workflow-workbench__sidebar-item small,
:global(html.dark) .workflow-runs__card-head p,
:global(html.dark) .workflow-runs__review-card p,
:global(html.dark) .workflow-runs__step-copy {
  color: #9bb1cd;
}

:global(html.dark) .workflow-workbench__sidebar-item:hover,
:global(html.dark) .workflow-editor__tool-card:hover {
  background: rgba(30, 42, 61, 0.64);
}

:global(html.dark) .workflow-workbench__sidebar-item[data-active='true'],
:global(html.dark) .workflow-editor__chip[data-active='true'],
:global(html.dark) .workflow-editor__tool-card[data-active='true'],
:global(html.dark) .workflow-workbench__action--primary,
:global(html.dark) .workflow-editor__primary {
  border-color: rgba(117, 154, 255, 0.56);
  background: rgba(47, 82, 180, 0.24);
  color: #edf4ff;
}
</style>
