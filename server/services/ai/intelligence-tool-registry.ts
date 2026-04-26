import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  AiProjectChangeType,
  AiWorkflowRunReviewContext,
  AiWorkflowToolRef,
  AuthUser,
  FeishuSyncRunMode,
  Project,
} from '~~/shared/types/domain'
import { fetchWebPageText, searchWithTavily } from '~~/server/services/admin-ai/web'
import { runWorkflow } from '~~/server/services/workflow/workflow-orchestrator'
import { createAiProjectChangeRequests } from '~~/server/utils/project-ai-store'

export interface WorkflowToolExecutionContext {
  event?: H3Event
  db: Queryable
  runtime: RuntimeSettings
  user: AuthUser
  project: Project
  workflowId: string
  runId: string
  sessionId: string
  contextSnapshot: string
}

export interface WorkflowToolExecutionResult {
  output: Record<string, unknown>
  reviewContext?: AiWorkflowRunReviewContext | null
}

interface WorkflowToolDefinition extends AiWorkflowToolRef {
  execute: (args: Record<string, unknown>, context: WorkflowToolExecutionContext) => Promise<WorkflowToolExecutionResult>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => normalizeString(item)).filter(Boolean)
}

function resolveProjectWorkspaceId(project: Project): string {
  const workspaceId = normalizeString(project.workspaceId || project.teamId)
  if (!workspaceId)
    throw new Error('PROJECT_WORKSPACE_REQUIRED')
  return workspaceId
}

function normalizeFeishuSyncRunMode(value: unknown): FeishuSyncRunMode | undefined {
  const mode = normalizeString(value)
  return mode === 'delta' || mode === 'full' ? mode : undefined
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeProviderOutput(result: unknown): Record<string, unknown> {
  if (result && typeof result === 'object' && !Array.isArray(result))
    return result as Record<string, unknown>
  if (Array.isArray(result))
    return { items: result }
  return {
    value: result,
  }
}

function normalizeProjectChangeDrafts(args: Record<string, unknown>): Array<{
  changeType: AiProjectChangeType
  title: string
  summary: string
  destructive?: boolean
  payload?: Record<string, unknown>
}> {
  const candidates = Array.isArray(args.changes) ? args.changes : [args]
  return candidates
    .map((item) => {
      const source = normalizeRecord(item)
      const changeType = normalizeString(source.changeType) as AiProjectChangeType
      if (!changeType)
        return null
      return {
        changeType,
        title: normalizeString(source.title) || 'AI 变更提案',
        summary: normalizeString(source.summary),
        destructive: Boolean(source.destructive),
        payload: normalizeRecord(source.payload),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.changeType && item.summary))
}

const workflowTools: WorkflowToolDefinition[] = [
  {
    key: 'context.get_workspace_context',
    label: '读取工作流上下文',
    description: '返回当前工作流构建出的项目上下文快照。',
    source: 'builtin',
    riskLevel: 'read',
    projectScoped: true,
    supportsWorkflow: true,
    resultSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    },
    async execute(_args, context) {
      return {
        output: {
          text: context.contextSnapshot,
        },
      }
    },
  },
  {
    key: 'web.search',
    label: '联网检索',
    description: '使用 Tavily 对公开网页做轻量检索。',
    source: 'builtin',
    riskLevel: 'read',
    projectScoped: false,
    supportsWorkflow: true,
    resultSchema: {
      type: 'object',
      properties: {
        items: { type: 'array' },
      },
    },
    async execute(args, context) {
      const query = normalizeString(args.query)
      if (!query)
        throw new Error('WORKFLOW_TOOL_QUERY_REQUIRED')

      if (!context.runtime.adminAi.tavilyApiKey) {
        return {
          output: {
            disabled: true,
            reason: '平台未配置联网检索密钥',
          },
        }
      }

      const items = await searchWithTavily({
        query,
        tavilyApiKey: context.runtime.adminAi.tavilyApiKey,
        maxResults: context.runtime.adminAi.maxWebResults,
        timeoutMs: context.runtime.adminAi.webTimeoutMs,
      })
      return {
        output: {
          items,
          total: items.length,
        },
      }
    },
  },
  {
    key: 'web.fetch_page',
    label: '抓取网页文本',
    description: '抓取公开网页文本并返回纯文本结果。',
    source: 'builtin',
    riskLevel: 'read',
    projectScoped: false,
    supportsWorkflow: true,
    resultSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    },
    async execute(args, context) {
      const url = normalizeString(args.url)
      if (!url)
        throw new Error('WORKFLOW_TOOL_URL_REQUIRED')

      const text = await fetchWebPageText({
        url,
        timeoutMs: context.runtime.adminAi.webTimeoutMs,
        maxChars: context.runtime.adminAi.maxPageChars,
      })
      return {
        output: {
          url,
          text,
        },
      }
    },
  },
  {
    key: 'project.propose_change',
    label: '创建项目变更提案',
    description: '基于结构化 payload 生成待审批的项目变更请求。',
    source: 'builtin',
    riskLevel: 'write',
    projectScoped: true,
    supportsWorkflow: true,
    resultSchema: {
      type: 'object',
      properties: {
        changeRequestIds: { type: 'array' },
      },
    },
    async execute(args, context) {
      const changes = normalizeProjectChangeDrafts(args)
      if (changes.length === 0)
        throw new Error('WORKFLOW_PROJECT_CHANGE_REQUIRED')

      const created = await createAiProjectChangeRequests(context.db, {
        workspaceId: resolveProjectWorkspaceId(context.project),
        projectId: context.project.id,
        sessionId: context.sessionId,
        mode: 'auto_optimize',
        createdByUserId: context.user.id,
        changes,
      })
      const changeRequestIds = created.map(item => item.id)
      return {
        output: {
          total: created.length,
          changeRequestIds,
          items: created,
        },
        reviewContext: changeRequestIds.length > 0
          ? {
              kind: 'project_change_request',
              changeRequestIds,
            }
          : null,
      }
    },
  },
  {
    key: 'provider.feishu_bitable_run',
    label: '运行飞书多维表 provider',
    description: '调用现有 Feishu Bitable workflow provider。',
    source: 'provider',
    riskLevel: 'read',
    projectScoped: true,
    supportsWorkflow: true,
    resultSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    },
    async execute(args, context) {
      const syncItemId = normalizeString(args.syncItemId)
      if (!syncItemId)
        throw new Error('WORKFLOW_PROVIDER_SYNC_ITEM_REQUIRED')

      const result = await runWorkflow({
        providerName: 'feishu_bitable',
        event: context.event,
        actorUserId: context.user.id,
        triggerSource: 'manual',
        syncItemId,
        mode: normalizeFeishuSyncRunMode(args.mode),
        recordIds: normalizeStringArray(args.recordIds),
      })
      return {
        output: {
          ok: true,
          providerName: 'feishu_bitable',
          result: normalizeProviderOutput(result),
        },
      }
    },
  },
  {
    key: 'provider.coze_workflow_run',
    label: '运行 Coze workflow provider',
    description: '调用现有 Coze workflow provider。',
    source: 'provider',
    riskLevel: 'read',
    projectScoped: true,
    supportsWorkflow: true,
    resultSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    },
    async execute(args, context) {
      const result = await runWorkflow({
        providerName: 'coze_workflow',
        event: context.event,
        actorUserId: context.user.id,
        triggerSource: 'manual',
        syncItemId: normalizeString(args.syncItemId) || undefined,
      })
      return {
        output: {
          ok: true,
          providerName: 'coze_workflow',
          result: normalizeProviderOutput(result),
        },
      }
    },
  },
]

const workflowToolRegistry = new Map<string, WorkflowToolDefinition>(
  workflowTools.map(tool => [tool.key, tool]),
)

export function listWorkflowTools(): AiWorkflowToolRef[] {
  return workflowTools.map(({ execute: _execute, ...tool }) => ({ ...tool }))
}

export function getWorkflowTool(toolKey: string): WorkflowToolDefinition | null {
  return workflowToolRegistry.get(normalizeString(toolKey)) || null
}

export async function executeWorkflowTool(
  toolKey: string,
  args: Record<string, unknown>,
  context: WorkflowToolExecutionContext,
): Promise<WorkflowToolExecutionResult> {
  const tool = getWorkflowTool(toolKey)
  if (!tool)
    throw new Error(`WORKFLOW_TOOL_NOT_FOUND:${toolKey}`)
  return tool.execute(args, context)
}
