import type {
  AiWorkflowContextSource,
  AiWorkflowDefinitionPayload,
  AiWorkflowRunTriggerPayload,
  AiWorkflowStep,
  AiWorkflowTemplatePreset,
  AiWorkflowToolRef,
  AiWorkflowTrigger,
  AiWorkflowTriggerType,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const WORKFLOW_TRIGGER_TYPES: AiWorkflowTriggerType[] = ['manual', 'resource.batch']
const WORKFLOW_CONTEXT_SOURCES: AiWorkflowContextSource[] = [
  'project.settings',
  'project.outline',
  'project.resources',
  'project.knowledge',
  'resource.selection',
  'session.memory',
]
const WORKFLOW_AGENT_MODES = ['dialog_ask', 'auto_optimize', 'issue_discovery', 'document_assist', 'contextual_agent'] as const

const workflowTriggerSchema = z.object({
  type: z.enum(WORKFLOW_TRIGGER_TYPES),
})

const workflowStepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.enum(['prompt', 'tool', 'agent']),
  prompt: z.string().optional(),
  toolKey: z.string().optional(),
  toolInput: z.record(z.string(), z.unknown()).optional(),
  agentMode: z.enum(WORKFLOW_AGENT_MODES).optional(),
  continueOnError: z.boolean().optional(),
  requiresReview: z.boolean().optional(),
  contextSources: z.array(z.enum(WORKFLOW_CONTEXT_SOURCES)).optional(),
})

const workflowDefinitionSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  trigger: workflowTriggerSchema.optional(),
  contextSources: z.array(z.enum(WORKFLOW_CONTEXT_SOURCES)).optional(),
  toolAllowlist: z.array(z.string()).optional(),
  steps: z.array(workflowStepSchema).optional(),
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  const used = new Set<string>()
  const items: string[] = []
  for (const item of value) {
    const normalized = normalizeString(item)
    if (!normalized || used.has(normalized))
      continue
    used.add(normalized)
    items.push(normalized)
  }
  return items
}

function normalizeTrigger(source?: Partial<AiWorkflowTrigger> | null): AiWorkflowTrigger {
  const nextType = normalizeString(source?.type) as AiWorkflowTriggerType
  return {
    type: WORKFLOW_TRIGGER_TYPES.includes(nextType) ? nextType : 'manual',
  }
}

function defaultStepName(step: Pick<AiWorkflowStep, 'type' | 'toolKey' | 'agentMode'>, index: number): string {
  if (step.type === 'prompt')
    return `提示步骤 ${index + 1}`
  if (step.type === 'tool')
    return normalizeString(step.toolKey) || `工具步骤 ${index + 1}`
  if (step.type === 'agent')
    return normalizeString(step.agentMode) || `Agent 步骤 ${index + 1}`
  return `步骤 ${index + 1}`
}

function normalizeStep(source: Partial<AiWorkflowStep>, index: number): AiWorkflowStep {
  const type = source.type === 'tool' || source.type === 'agent' ? source.type : 'prompt'
  const toolKey = normalizeString(source.toolKey)
  const prompt = String(source.prompt || '').trim()
  const agentMode = WORKFLOW_AGENT_MODES.includes(source.agentMode as typeof WORKFLOW_AGENT_MODES[number])
    ? source.agentMode
    : 'dialog_ask'
  const contextSources = normalizeContextSources(source.contextSources)

  return {
    id: normalizeString(source.id) || randomUUID(),
    name: normalizeString(source.name) || defaultStepName({
      type,
      toolKey,
      agentMode,
    }, index),
    type,
    prompt: prompt || undefined,
    toolKey: type === 'tool' ? toolKey : undefined,
    toolInput: type === 'tool' && source.toolInput && typeof source.toolInput === 'object' && !Array.isArray(source.toolInput)
      ? source.toolInput
      : undefined,
    agentMode: type === 'agent' ? agentMode : undefined,
    continueOnError: Boolean(source.continueOnError),
    requiresReview: Boolean(source.requiresReview),
    contextSources: contextSources.length > 0 ? contextSources : undefined,
  }
}

export function normalizeContextSources(value: unknown): AiWorkflowContextSource[] {
  if (!Array.isArray(value))
    return []

  const used = new Set<AiWorkflowContextSource>()
  const items: AiWorkflowContextSource[] = []
  for (const item of value) {
    const normalized = normalizeString(item) as AiWorkflowContextSource
    if (!WORKFLOW_CONTEXT_SOURCES.includes(normalized) || used.has(normalized))
      continue
    used.add(normalized)
    items.push(normalized)
  }
  return items
}

export function normalizeAiWorkflowDefinitionPayload(input: unknown): AiWorkflowDefinitionPayload {
  const parsed = workflowDefinitionSchema.safeParse(input)
  if (!parsed.success)
    throw new Error('INVALID_WORKFLOW_DEFINITION')

  const source = parsed.data
  const steps = Array.isArray(source.steps)
    ? source.steps.map((step, index) => normalizeStep(step, index)).slice(0, 20)
    : []

  if (steps.length === 0)
    throw new Error('WORKFLOW_STEPS_REQUIRED')

  for (const step of steps) {
    if (step.type === 'tool' && !step.toolKey)
      throw new Error('WORKFLOW_TOOL_KEY_REQUIRED')
    if (step.type === 'agent' && !step.prompt)
      throw new Error('WORKFLOW_AGENT_PROMPT_REQUIRED')
    if (step.type === 'prompt' && !step.prompt)
      throw new Error('WORKFLOW_PROMPT_REQUIRED')
  }

  const derivedToolAllowlist = steps
    .filter(step => step.type === 'tool')
    .map(step => normalizeString(step.toolKey))
    .filter(Boolean)

  const toolAllowlist = normalizeStringArray(source.toolAllowlist)
  const mergedToolAllowlist = normalizeStringArray([
    ...toolAllowlist,
    ...derivedToolAllowlist,
  ])

  const contextSources = normalizeContextSources(source.contextSources)

  return {
    name: normalizeString(source.name) || '未命名智能工作流',
    description: normalizeString(source.description),
    trigger: normalizeTrigger(source.trigger),
    contextSources: contextSources.length > 0
      ? contextSources
      : ['project.settings', 'project.outline', 'resource.selection'],
    toolAllowlist: mergedToolAllowlist,
    steps,
  }
}

export function normalizeAiWorkflowRunTriggerPayload(value: unknown): AiWorkflowRunTriggerPayload {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

  const selectedResourceIds = normalizeStringArray(source.selectedResourceIds)
  const sessionId = normalizeString(source.sessionId)
  const note = normalizeString(source.note)

  return {
    ...source,
    selectedResourceIds,
    sessionId,
    note,
  }
}

export function createBuiltinProjectResourceWorkflowTemplate(): AiWorkflowTemplatePreset {
  return {
    key: 'organize_project_resources',
    name: '整理当前项目资源',
    description: '读取当前选中资源与项目上下文，输出资源分组、索引状态、缺口和下一步草案。',
    trigger: {
      type: 'resource.batch',
    },
    contextSources: ['project.settings', 'project.outline', 'resource.selection', 'project.knowledge'],
    toolAllowlist: ['context.get_workspace_context'],
    steps: [
      {
        id: randomUUID(),
        name: '整理目标',
        type: 'prompt',
        prompt: '先按资料用途与成熟度梳理当前项目资源，不要直接假设资料完整。',
        continueOnError: false,
      },
      {
        id: randomUUID(),
        name: '资源整理分析',
        type: 'agent',
        agentMode: 'dialog_ask',
        prompt: '请基于当前项目上下文与选中资源，输出四部分：1）资源分组与价值判断；2）当前索引/证据链状态；3）缺失资料与风险；4）下一步可生成的草案建议。涉及写操作时只给提案，不要直接改动项目数据。',
        continueOnError: false,
      },
    ],
  }
}

export function listBuiltinWorkflowTemplates(): AiWorkflowTemplatePreset[] {
  return [
    createBuiltinProjectResourceWorkflowTemplate(),
  ]
}

export function listWorkflowContextSourceOptions(): AiWorkflowContextSource[] {
  return [...WORKFLOW_CONTEXT_SOURCES]
}

export function listWorkflowAgentModes(): string[] {
  return [...WORKFLOW_AGENT_MODES]
}

export function buildWorkflowToolCatalogMap(tools: AiWorkflowToolRef[]): Map<string, AiWorkflowToolRef> {
  return new Map(tools.map(tool => [tool.key, tool]))
}
