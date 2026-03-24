import type {
  AdminAgentArtifact,
  AdminAgentRunRequest,
  AdminAgentRunResult,
  AdminAgentTaskType,
  Contest,
  Rubric,
  Track,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { createDeepAgent } from 'deepagents'
import { tool } from 'langchain'
import { z } from 'zod'
import { fetchWebPageText, searchWithTavily } from '~~/server/services/admin-ai/web'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { getContestDetail, getContestPublishCheck, getPublishedRubricByTrack, previewContestImportCsv } from '~~/server/utils/contest-store'
import { listContestSyncRuns, listContestSyncSources } from '~~/server/utils/contest-sync-store'
import { withClient } from '~~/server/utils/db'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { runWithRetry } from '~~/server/utils/retry'

type EffectiveRuntime = Awaited<ReturnType<typeof readEffectiveRuntimeSettings>>['runtime']

export interface AdminAgentHooks {
  onProgress?: (message: string) => Promise<void> | void
  onTool?: (name: string, payload: Record<string, unknown>) => Promise<void> | void
  onDelta?: (text: string) => Promise<void> | void
  onArtifact?: (artifact: AdminAgentArtifact) => Promise<void> | void
}

export interface AdminAgentExecutionResult {
  data: Omit<AdminAgentRunResult, 'sessionId'>
  fallbackUsed: boolean
  attempts: number
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function chunkText(text: string, chunkSize = 24): string[] {
  const normalized = String(text || '')
  if (!normalized)
    return []

  const chunks: string[] = []
  for (let i = 0; i < normalized.length; i += chunkSize)
    chunks.push(normalized.slice(i, i + chunkSize))
  return chunks
}

function createArtifact(input: {
  type: AdminAgentArtifact['type']
  title: string
  summary: string
  payload: Record<string, unknown>
  module?: AdminAgentArtifact['module']
}): AdminAgentArtifact {
  return {
    id: randomUUID(),
    type: input.type,
    title: input.title,
    summary: input.summary,
    module: input.module,
    payload: input.payload,
  }
}

function resolveTaskType(taskType: AdminAgentTaskType, message: string): AdminAgentTaskType {
  if (taskType !== 'general')
    return taskType

  const text = message.toLowerCase()
  if (text.includes('导入') || text.includes('同步') || text.includes('csv'))
    return 'import_sync_analysis'
  return 'publish_assistant'
}

function resolveTrack(contest: Contest, trackId?: string): Track | null {
  if (!contest.tracks.length)
    return null
  if (!trackId)
    return contest.tracks[0] || null
  return contest.tracks.find(track => track.id === trackId) || contest.tracks[0] || null
}

function buildOverviewDraft(contest: Contest): AdminAgentArtifact {
  const payload = {
    name: contest.name || '',
    level: contest.level || 'national',
    organizer: contest.organizer || '',
    coOrganizer: contest.coOrganizer || '',
    officialUrl: contest.officialUrl || '',
    summary: contest.summary || '',
    participantRequirements: contest.participantRequirements || '',
    teamRule: contest.teamRule || '',
    currentSeason: contest.currentSeason || '',
    aliases: contest.aliases || [],
    keywords: contest.keywords || [],
    recommendedFor: contest.recommendedFor || [],
    hotScore: Number(contest.hotScore || 0),
    visibility: contest.visibility || 'internal',
    disciplines: contest.disciplines || [],
    faqItems: contest.faqItems || [],
  }

  return createArtifact({
    type: 'draft',
    module: 'overview',
    title: '基础信息草稿',
    summary: '可一键回填到基础信息编辑页，再手动保存。',
    payload,
  })
}

function buildTrackDraft(track: Track | null): AdminAgentArtifact {
  const payload = {
    name: track?.name || '',
    summary: track?.summary || '',
    suitableMajors: track?.suitableMajors || [],
    deliverableTypes: track?.deliverableTypes || [],
    rubricId: track?.rubricId || null,
    sortOrder: Number(track?.sortOrder || 0),
    status: track?.status || 'draft',
  }

  return createArtifact({
    type: 'draft',
    module: 'tracks',
    title: '赛道草稿',
    summary: '可回填到赛道新增/编辑页。',
    payload,
  })
}

function buildTimelineDraft(contest: Contest): AdminAgentArtifact {
  const registration = (contest.timelines || []).find(item => item.nodeType === 'registration')
  const payload = {
    year: Number(contest.currentSeason?.match(/\d{4}/)?.[0] || new Date().getFullYear()),
    nodeType: registration?.nodeType || 'registration',
    startAt: registration?.startAt || null,
    endAt: registration?.endAt || null,
    note: registration?.note || '建议补齐报名时间与来源链接。',
    sourceLink: registration?.sourceLink || contest.officialUrl || '',
  }

  return createArtifact({
    type: 'draft',
    module: 'timelines',
    title: '时间节点草稿',
    summary: '可回填到时间节点新增/编辑页。',
    payload,
  })
}

function buildRubricDraft(track: Track | null, rubric: Rubric | null): AdminAgentArtifact {
  const payload = {
    trackId: track?.id || '',
    scoringMode: rubric?.scoringMode || 'weighted',
    version: Number(rubric?.version || 1),
    status: rubric?.status || 'draft',
    scoringPoints: rubric?.scoringPoints || [],
    deductionItems: rubric?.deductionItems || [],
    evidenceRequirements: rubric?.evidenceRequirements || [],
    dimensions: rubric?.dimensions || [
      {
        key: 'innovation',
        name: '创新性',
        weight: 30,
        description: '方案差异化与技术亮点。',
      },
      {
        key: 'feasibility',
        name: '可行性',
        weight: 35,
        description: '技术路线与实施可落地性。',
      },
      {
        key: 'value',
        name: '应用价值',
        weight: 35,
        description: '应用场景价值与成果闭环。',
      },
    ],
  }

  return createArtifact({
    type: 'draft',
    module: 'rubrics',
    title: '评分规则草稿',
    summary: '可回填到评分规则新增/编辑页。',
    payload,
  })
}

function buildResourceDraft(contest: Contest): AdminAgentArtifact {
  const payload = {
    category: 'basic_info',
    title: `${contest.name} 官方资料入口`,
    year: Number(contest.currentSeason?.match(/\d{4}/)?.[0] || new Date().getFullYear()),
    url: contest.officialUrl || '',
    accessLevel: 'public',
    sourceType: 'official',
    summary: contest.summary || '建议补充赛事通知、FAQ、模板与往届资料链接。',
    copyrightNote: '引用官方公开资料，请遵循原链接版权要求。',
    status: 'active',
  }

  return createArtifact({
    type: 'draft',
    module: 'resources',
    title: '资料草稿',
    summary: '可回填到资料新增/编辑页。',
    payload,
  })
}

function buildPublishFixArtifact(input: {
  blockers: Array<{ code: string, message: string, field?: string }>
  warnings: Array<{ code: string, message: string, field?: string }>
}): AdminAgentArtifact {
  const fixMap: Record<string, { module: AdminAgentArtifact['module'], action: string }> = {
    CONTEST_NAME_REQUIRED: { module: 'overview', action: '补全赛事名称。' },
    CONTEST_LEVEL_REQUIRED: { module: 'overview', action: '补全赛事级别。' },
    CONTEST_ORGANIZER_REQUIRED: { module: 'overview', action: '补全主办方。' },
    CONTEST_OFFICIAL_URL_REQUIRED: { module: 'overview', action: '补全官网链接。' },
    CONTEST_SUMMARY_REQUIRED: { module: 'overview', action: '补全赛事简介。' },
    CONTEST_PARTICIPANT_REQUIREMENTS_REQUIRED: { module: 'overview', action: '补全参赛对象/限制。' },
    CONTEST_CURRENT_SEASON_REQUIRED: { module: 'overview', action: '补全当前届次。' },
    CONTEST_DISCIPLINES_REQUIRED: { module: 'overview', action: '至少选择 1 个学科门类。' },
    CONTEST_TRACKS_REQUIRED: { module: 'tracks', action: '新增至少 1 个赛道。' },
    CONTEST_TIMELINES_REQUIRED: { module: 'timelines', action: '新增至少 1 条时间节点。' },
    CONTEST_RUBRICS_REQUIRED: { module: 'rubrics', action: '新增至少 1 条评分规则。' },
    CONTEST_DUPLICATED: { module: 'overview', action: '核对名称+主办方+官网去重键。' },
  }

  const blockerFixes = input.blockers.map((item) => {
    const mapped = fixMap[item.code] || { module: 'overview' as const, action: '请按提示修复后再试。' }
    return {
      code: item.code,
      message: item.message,
      module: mapped.module,
      action: mapped.action,
    }
  })

  const warningFixes = input.warnings.map((item) => {
    const mapped = fixMap[item.code] || { module: 'overview' as const, action: '建议补充相关字段，降低发布风险。' }
    return {
      code: item.code,
      message: item.message,
      module: mapped.module,
      action: mapped.action,
    }
  })

  return createArtifact({
    type: 'publish_fix',
    title: '发布预检修复建议',
    summary: `阻断项 ${blockerFixes.length} 条，提示项 ${warningFixes.length} 条。`,
    payload: {
      blockerFixes,
      warningFixes,
    },
  })
}

function summarizeArtifacts(taskType: AdminAgentTaskType, artifacts: AdminAgentArtifact[], webEnabled: boolean): string {
  const lines: string[] = [
    `已完成任务：${taskType}`,
    `生成产物：${artifacts.length} 项。`,
  ]

  for (const artifact of artifacts) {
    lines.push(`- ${artifact.title}：${artifact.summary}`)
  }

  if (!webEnabled)
    lines.push('外网检索未启用（平台未配置联网检索密钥），本次结果仅基于站内数据与输入上下文。')

  lines.push('建议先在对应模块点击“应用 AI 草稿”，确认后再手动保存。')
  return lines.join('\n')
}

function extractAssistantText(payload: unknown): string {
  const source = payload as {
    messages?: Array<{ type?: string, role?: string, content?: unknown }>
  }

  const messages = source.messages || []
  const assistant = [...messages].reverse().find((item) => {
    const role = String(item.role || item.type || '').toLowerCase()
    return role.includes('assistant') || role.includes('ai')
  })

  const content = assistant?.content
  if (typeof content === 'string')
    return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

async function buildAssistantReplyWithDeepAgent(input: {
  runtime: EffectiveRuntime
  request: AdminAgentRunRequest
  resolvedTaskType: AdminAgentTaskType
  contest: Contest
  artifacts: AdminAgentArtifact[]
  channelPrompt?: string
  hooks: AdminAgentHooks
}): Promise<{ text: string, fallbackUsed: boolean, attempts: number }> {
  const fallback = summarizeArtifacts(input.resolvedTaskType, input.artifacts, Boolean(input.runtime.adminAi.tavilyApiKey))

  const onlyFallback = input.runtime.ai.provider === 'mock' || !input.runtime.ai.apiKey
  if (onlyFallback)
    return { text: fallback, fallbackUsed: true, attempts: 1 }

  const artifactsSnapshot = JSON.stringify(input.artifacts, null, 2)
  const webEnabled = Boolean(input.runtime.adminAi.tavilyApiKey)

  const getArtifactContext = tool(
    async () => artifactsSnapshot,
    {
      name: 'get_artifact_context',
      description: '读取当前任务已生成的结构化产物 JSON。',
      schema: z.object({}),
    },
  )

  const webSearch = tool(
    async ({ query }: { query: string }) => {
      if (!webEnabled)
        return JSON.stringify({ disabled: true, reason: '平台未配置联网检索密钥' })

      const items = await searchWithTavily({
        query,
        tavilyApiKey: input.runtime.adminAi.tavilyApiKey,
        maxResults: input.runtime.adminAi.maxWebResults,
        timeoutMs: input.runtime.adminAi.webTimeoutMs,
      })
      await input.hooks.onTool?.('web_search', {
        query,
        results: items.length,
      })
      return JSON.stringify(items)
    },
    {
      name: 'web_search',
      description: '联网检索公开信息（优先 Tavily）。',
      schema: z.object({
        query: z.string().min(2),
      }),
    },
  )

  const fetchWebPage = tool(
    async ({ url }: { url: string }) => {
      const text = await fetchWebPageText({
        url,
        timeoutMs: input.runtime.adminAi.webTimeoutMs,
        maxChars: input.runtime.adminAi.maxPageChars,
      })
      await input.hooks.onTool?.('fetch_web_page', { url, chars: text.length })
      return text
    },
    {
      name: 'fetch_web_page',
      description: '抓取指定公开网页文本（自动执行 SSRF 防护）。',
      schema: z.object({
        url: z.string().url(),
      }),
    },
  )

  const runOnce = async () => {
    await input.hooks.onProgress?.('调用 DeepAgent 生成总结中...')

    const agent = createDeepAgent({
      model: createChatModel(input.runtime.ai),
      tools: [getArtifactContext, webSearch, fetchWebPage],
      systemPrompt: [
        '你是 WinLoop 平台管理 AI 助手。',
        toText(input.channelPrompt) ? `[场景提示词]\n${toText(input.channelPrompt)}` : '',
        '你需要基于结构化产物给出明确、可执行、模块可落地的建议。',
        '禁止输出 SQL 或直接写库建议。必须强调“管理员确认后手动保存”。',
      ].filter(Boolean).join('\n'),
      subagents: [
        {
          name: 'publish-governor',
          description: '擅长发布预检、字段补全与赛事治理建议。',
          systemPrompt: '聚焦发布阻断项、字段缺口、模块级修复动作。',
          tools: [getArtifactContext, webSearch, fetchWebPage],
        },
        {
          name: 'ops-agent',
          description: '擅长运营治理、导入同步分析与配置诊断。',
          systemPrompt: '聚焦导入质量、同步状态、风险识别与可执行修复步骤。',
          tools: [getArtifactContext, webSearch, fetchWebPage],
        },
      ],
    })

    const prompt = [
      `任务类型：${input.resolvedTaskType}`,
      `竞赛：${input.contest.name}`,
      `用户输入：${toText(input.request.message)}`,
      '请先读取 get_artifact_context，再结合需要决定是否调用联网工具。',
      '输出要求：',
      '1) 先给结论（最多 3 行）',
      '2) 再给按模块执行清单（overview/tracks/timelines/rubrics/resources）',
      '3) 最后给风险提醒（最多 2 条）',
      '4) 明确提醒“应用草稿后需要手动保存”',
    ].join('\n')

    const response = await agent.invoke({
      messages: [{ role: 'user', content: prompt }],
    })

    const assistantText = extractAssistantText(response)
    return assistantText || fallback
  }

  const reply = await runWithRetry<string>({
    maxRetries: input.runtime.ai.maxRetries,
    run: runOnce,
    fallback: () => fallback,
  })

  return {
    text: reply.data,
    fallbackUsed: reply.fallbackUsed,
    attempts: reply.attempts,
  }
}

export async function executeAdminAgent(
  event: Parameters<typeof withClient>[0],
  request: AdminAgentRunRequest,
  hooks: AdminAgentHooks = {},
  options: {
    runtime?: EffectiveRuntime
    channelPrompt?: string
  } = {},
): Promise<AdminAgentExecutionResult> {
  const runtime = options.runtime || (await readEffectiveRuntimeSettings(event)).runtime

  await hooks.onProgress?.('加载赛事上下文...')

  const [detail, publishCheck, syncSources, syncRuns] = await withClient(event, async (db) => {
    const contestDetail = await getContestDetail(db, {
      contestId: request.contestId,
      includeInternal: true,
    })

    const check = await getContestPublishCheck(db, {
      contestId: request.contestId,
    })

    const sources = await listContestSyncSources(db)
    const runs = await listContestSyncRuns(db, {
      limit: 20,
    })

    return [contestDetail, check, sources, runs] as const
  })

  if (!detail || !publishCheck)
    throw new Error('CONTEST_NOT_FOUND')

  const contest = detail.contest
  const resolvedTaskType = resolveTaskType(request.taskType, request.message)
  const track = resolveTrack(contest, request.context?.trackId)

  const artifacts: AdminAgentArtifact[] = [
    buildOverviewDraft(contest),
    buildTrackDraft(track),
    buildTimelineDraft(contest),
    buildResourceDraft(contest),
  ]

  const rubric = await withClient(event, async (db) => {
    if (!track)
      return null

    return getPublishedRubricByTrack(db, {
      contestId: contest.id,
      trackId: track.id,
    })
  })
  artifacts.push(buildRubricDraft(track, rubric))

  if (resolvedTaskType === 'publish_assistant' || resolvedTaskType === 'general') {
    artifacts.push(buildPublishFixArtifact({
      blockers: publishCheck.blockers,
      warnings: publishCheck.warnings,
    }))
  }

  if (resolvedTaskType === 'import_sync_analysis') {
    await hooks.onProgress?.('分析导入与同步状态...')

    let previewSummary: Record<string, unknown> = {
      enabled: false,
    }

    const csvText = toText(request.context?.csvText)
    if (csvText) {
      const preview = await withClient(event, async (db) => {
        return previewContestImportCsv(db, { csvText })
      })

      previewSummary = {
        enabled: true,
        total: preview.total,
        validCount: preview.validCount,
        invalidCount: preview.invalidCount,
        sampleErrors: preview.rows
          .filter(row => row.errors.length > 0)
          .slice(0, 5)
          .map(row => ({ rowNumber: row.rowNumber, errors: row.errors })),
      }
    }

    artifacts.push(createArtifact({
      type: 'import_sync',
      title: '导入/同步分析',
      summary: `同步源 ${syncSources.length} 个，最近运行 ${syncRuns.length} 条。`,
      payload: {
        csvPreview: previewSummary,
        syncSources,
        syncRuns,
      },
    }))
  }

  for (const artifact of artifacts)
    await hooks.onArtifact?.(artifact)

  const missingFields: string[] = []
  if (!request.workspaceId)
    missingFields.push('workspaceId')
  if (!request.contestId)
    missingFields.push('contestId')

  const assistant = await buildAssistantReplyWithDeepAgent({
    runtime,
    request,
    resolvedTaskType,
    contest,
    artifacts,
    channelPrompt: options.channelPrompt,
    hooks,
  })

  for (const chunk of chunkText(assistant.text))
    await hooks.onDelta?.(chunk)

  return {
    data: {
      assistantReply: assistant.text,
      artifacts,
      missingFields,
      webSearchEnabled: Boolean(runtime.adminAi.tavilyApiKey),
    },
    fallbackUsed: assistant.fallbackUsed,
    attempts: assistant.attempts,
  }
}
