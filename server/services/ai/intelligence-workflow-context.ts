import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type {
  AiWorkflowContextSource,
  AuthUser,
  Resource,
} from '~~/shared/types/domain'
import { buildProjectKnowledgeLocalContext } from '~~/server/services/ai/project-knowledge-context'
import { buildProjectResourceLocalContext, loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { getAiChatSessionContext } from '~~/server/utils/chat-session-context-store'
import { getProjectSettingsSnapshot } from '~~/server/utils/platform-store'
import { getProjectOutlineSnapshot } from '~~/server/utils/project-outline-store'

export interface IntelligenceWorkflowContextBundle {
  sources: Record<AiWorkflowContextSource, string>
  allResources: Resource[]
  selectedResources: Resource[]
}

interface BuildIntelligenceWorkflowContextInput {
  event?: H3Event
  workspaceId: string
  projectId: string
  user: AuthUser
  selectedResourceIds?: string[]
  sessionId?: string
  query?: string
  contestName?: string
  trackName?: string
  major?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function summarizeProjectSettings(snapshot: Awaited<ReturnType<typeof getProjectSettingsSnapshot>>): string {
  if (!snapshot)
    return '暂无项目设置快照。'

  const project = snapshot.project
  const bindings = snapshot.contestBindings
  const adaptation = snapshot.currentAdaptation
  const lines: string[] = [
    `项目标题：${normalizeString(project.title) || '未命名'}`,
    `项目摘要：${normalizeString(project.summary) || '暂无'}`,
    `问题陈述：${normalizeString(project.problemStatement) || '暂无'}`,
    `竞赛绑定数：${bindings.length}`,
  ]

  if (adaptation) {
    lines.push(`当前适配赛道：${normalizeString(adaptation.trackId) || '未绑定'}`)
    lines.push(`适配摘要：${normalizeString(adaptation.summary) || '暂无'}`)
  }

  return lines.join('\n')
}

function summarizeOutline(snapshot: Awaited<ReturnType<typeof getProjectOutlineSnapshot>>): string {
  if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0)
    return '项目大纲暂无可用内容。'

  const lines = snapshot.items
    .slice(0, 12)
    .map(item => `- ${normalizeString(item.title)}（L${Number(item.level || 0)}）`)
  return `项目大纲摘要（${snapshot.items.length} 条）：\n${lines.join('\n')}`
}

function summarizeSessionMemory(source: Awaited<ReturnType<typeof getAiChatSessionContext>>): string {
  if (!source?.contextSnapshot)
    return '暂无可复用的 session memory。'

  const snapshot = source.contextSnapshot
  const lines = [
    snapshot.assistantLabel ? `助手：${normalizeString(snapshot.assistantLabel)}` : '',
    snapshot.resourceTitle ? `最近资源：${normalizeString(snapshot.resourceTitle)}` : '',
    snapshot.selectionText ? `最近选中文本：${normalizeString(snapshot.selectionText).slice(0, 240)}` : '',
    snapshot.activeTabId ? `最近激活标签：${normalizeString(snapshot.activeTabId)}` : '',
    snapshot.resourcePurpose ? `资源用途：${normalizeString(snapshot.resourcePurpose)}` : '',
  ].filter(Boolean)

  return lines.length > 0
    ? `Session memory：\n${lines.join('\n')}`
    : '暂无可复用的 session memory。'
}

function pickSelectedResources(resources: Resource[], selectedResourceIds?: string[]): Resource[] {
  if (!Array.isArray(selectedResourceIds) || selectedResourceIds.length === 0)
    return []

  const selected = new Set(selectedResourceIds.map(item => normalizeString(item)).filter(Boolean))
  return resources.filter(resource => selected.has(normalizeString(resource.id)))
}

export async function buildIntelligenceWorkflowContextBundle(
  db: Queryable,
  input: BuildIntelligenceWorkflowContextInput,
): Promise<IntelligenceWorkflowContextBundle> {
  const resources = await loadVisibleProjectResourcesForAi(db, input.user, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  })
  const selectedResources = pickSelectedResources(resources, input.selectedResourceIds)

  const [projectSettings, projectOutline, sessionMemory, knowledgeContext] = await Promise.all([
    getProjectSettingsSnapshot(db, input.user, input.projectId),
    getProjectOutlineSnapshot(db, input.projectId),
    input.sessionId
      ? getAiChatSessionContext(db, {
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
        })
      : Promise.resolve(null),
    buildProjectKnowledgeLocalContext(db, {
      projectId: input.projectId,
      query: normalizeString(input.query) || '项目资源整理',
      resources,
      contestName: input.contestName,
      trackName: input.trackName,
      major: input.major,
      limit: 6,
      event: input.event,
    }),
  ])

  return {
    sources: {
      'project.settings': summarizeProjectSettings(projectSettings),
      'project.outline': summarizeOutline(projectOutline),
      'project.resources': buildProjectResourceLocalContext(resources, {
        contestName: input.contestName,
        trackName: input.trackName,
        major: input.major,
        limit: 10,
      }),
      'project.knowledge': knowledgeContext.summaryText || '暂无项目知识索引摘要。',
      'resource.selection': selectedResources.length > 0
        ? buildProjectResourceLocalContext(selectedResources, {
            contestName: input.contestName,
            trackName: input.trackName,
            major: input.major,
            limit: Math.max(3, selectedResources.length),
          })
        : '当前没有选中的项目资源。',
      'session.memory': summarizeSessionMemory(sessionMemory),
    },
    allResources: resources,
    selectedResources,
  }
}

export function buildWorkflowContextSnapshot(
  contextBundle: IntelligenceWorkflowContextBundle,
  contextSources: AiWorkflowContextSource[],
): string {
  const lines: string[] = []
  for (const source of contextSources) {
    const content = normalizeString(contextBundle.sources[source])
    if (!content)
      continue
    lines.push(`[${source}]`)
    lines.push(content)
  }
  return lines.join('\n\n').trim() || '暂无可用工作流上下文。'
}
