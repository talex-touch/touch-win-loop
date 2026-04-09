import type { Queryable } from '~~/server/utils/db'
import type {
  AiDefenseAttachment,
  AiDefenseEvidenceRef,
  AiDefensePersona,
  AuthUser,
  ContestDetailPayload,
  DocumentAnalysis,
  Resource,
  RubricDimension,
} from '~~/shared/types/domain'
import { loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { getContestDetail, listContestResourcesByContestId, resolveAiPromptText } from '~~/server/utils/contest-store'
import { listProjectDefensePersonas, listProjectDefensePersonasByIds } from '~~/server/utils/project-defense-store'

export interface DefenseContextPack {
  contestName: string
  trackName: string
  promptText: string
  rubricDigest: string
  promptContextText: string
  evidenceRefs: AiDefenseEvidenceRef[]
  personas: AiDefensePersona[]
  detail: ContestDetailPayload | null
}

interface BuildDefenseContextPackInput {
  db: Queryable
  user: AuthUser
  workspaceId: string
  projectId?: string
  contestId?: string
  trackId?: string
  major?: string
  latestUserMessage?: string
  personaIds?: string[]
  attachments?: AiDefenseAttachment[]
  includeInternal: boolean
}

interface ProjectDocumentAnalysisRow {
  project_resource_id: string
  analysis_json: unknown
}

interface EvidenceCandidate {
  resourceId?: string
  resourceTitle: string
  excerpt: string
  page?: number | null
  sourceType: AiDefenseEvidenceRef['sourceType']
  category?: string
  score: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function splitKeywords(value: string): string[] {
  return normalizeString(value)
    .toLowerCase()
    .split(/[\s,，。.!！?？;；:：/\\|\-]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
}

function summarizeText(value: unknown, max = 180): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ')
  if (!normalized)
    return ''
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, max)}...`
}

function calcMatchScore(text: string, keywords: string[]): number {
  const normalized = normalizeString(text).toLowerCase()
  if (!normalized || keywords.length === 0)
    return 0

  let matched = 0
  for (const keyword of keywords) {
    if (normalized.includes(keyword))
      matched += 1
  }
  return matched / keywords.length
}

function normalizeDocumentAnalysis(value: unknown): DocumentAnalysis | null {
  const record = normalizeRecord(value)
  const pages = Array.isArray(record.pages) ? record.pages : []
  if (pages.length === 0)
    return null
  return record as unknown as DocumentAnalysis
}

function buildRubricDigest(detail: ContestDetailPayload | null, trackId: string): string {
  if (!detail)
    return '暂无评分规则。'

  const rubrics = detail.rubrics.filter(item => !trackId || item.trackId === trackId)
  const dimensions = rubrics.flatMap(item => item.dimensions || [])
  if (dimensions.length === 0)
    return '暂无评分规则。'

  const lines = dimensions.slice(0, 8).map((item, index) => {
    const parts = [
      `${index + 1}. ${item.name}`,
      item.weight ? `权重 ${item.weight}` : '',
      item.description,
      item.evidenceRequirement ? `证据：${item.evidenceRequirement}` : '',
    ].filter(Boolean)
    return parts.join('；')
  })

  return lines.join('\n')
}

function buildDefaultScoringRubric(summary: string, keyPrefix: string): RubricDimension[] {
  const normalizedSummary = normalizeString(summary) || '围绕项目可行性与证据完整性进行追问。'
  return [
    {
      key: `${keyPrefix}_core`,
      name: '核心判断',
      description: normalizedSummary,
      weight: 100,
    },
  ]
}

function buildDefaultDefensePersonas(input: {
  contestName?: string
  trackName?: string
  promptText?: string
  rubricDigest?: string
}): AiDefensePersona[] {
  const contestName = normalizeString(input.contestName) || '当前竞赛'
  const trackName = normalizeString(input.trackName) || '当前赛道'
  const promptText = normalizeString(input.promptText)
  const rubricDigest = normalizeString(input.rubricDigest)
  const commonSuffix = [
    `竞赛：${contestName}`,
    `赛道：${trackName}`,
    promptText ? `附加提示：${promptText}` : '',
    rubricDigest ? `评分规则：\n${rubricDigest}` : '',
  ].filter(Boolean).join('\n')

  return [
    {
      id: 'builtin-technical',
      projectId: '',
      sourceContestId: null,
      sourceTrackId: null,
      sourceTemplateKey: 'builtin:technical',
      judgeType: 'technical',
      name: '技术评委',
      summary: '关注技术路线、指标、实验与可替代方案。',
      systemPrompt: `你是技术评委，重点追问技术路线、基线对比、工程实现和风险兜底。\n${commonSuffix}`,
      focusAreas: ['技术路线', '核心指标', '实验对比', '风险兜底'],
      scoringRubric: buildDefaultScoringRubric('重点核验技术可行性、量化指标与工程落地。', 'technical'),
      enabled: true,
      sortOrder: 0,
      isCustomized: false,
      createdByUserId: '',
      updatedByUserId: '',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'builtin-business',
      projectId: '',
      sourceContestId: null,
      sourceTrackId: null,
      sourceTemplateKey: 'builtin:business',
      judgeType: 'business',
      name: '业务评委',
      summary: '关注场景价值、用户闭环、商业落地与ROI。',
      systemPrompt: `你是业务评委，重点追问应用场景、用户价值、推广路径和商业可持续性。\n${commonSuffix}`,
      focusAreas: ['应用场景', '目标用户', '价值闭环', '落地路径'],
      scoringRubric: buildDefaultScoringRubric('重点核验用户价值、落地路径与收益假设。', 'business'),
      enabled: true,
      sortOrder: 1,
      isCustomized: false,
      createdByUserId: '',
      updatedByUserId: '',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'builtin-expression',
      projectId: '',
      sourceContestId: null,
      sourceTrackId: null,
      sourceTemplateKey: 'builtin:expression',
      judgeType: 'expression',
      name: '表达评委',
      summary: '关注表达结构、证据组织、临场回应和说服力。',
      systemPrompt: `你是表达评委，重点追问表达结构、结论先行、证据组织和临场应对。\n${commonSuffix}`,
      focusAreas: ['表达结构', '结论先行', '证据组织', '临场应答'],
      scoringRubric: buildDefaultScoringRubric('重点核验表达清晰度、证据串联与反问应对。', 'expression'),
      enabled: true,
      sortOrder: 2,
      isCustomized: false,
      createdByUserId: '',
      updatedByUserId: '',
      createdAt: '',
      updatedAt: '',
    },
  ]
}

function buildPersonaPrompt(detail: {
  judgeType: AiDefensePersona['judgeType']
  contestName: string
  trackName: string
  promptText: string
  rubricLines: string[]
  guidelineSummary: string
  pastQuestionSummary: string
}): { summary: string, systemPrompt: string, focusAreas: string[], scoringRubric: RubricDimension[] } {
  const rubricText = detail.rubricLines.join('\n') || '暂无评分细则。'
  const guidelineSummary = detail.guidelineSummary || '暂无评委指引。'
  const pastQuestionSummary = detail.pastQuestionSummary || '暂无历史问题。'
  const promptText = detail.promptText ? `附加提示：${detail.promptText}` : ''

  if (detail.judgeType === 'technical') {
    return {
      summary: '关注技术路线、创新点、实验设计和工程可行性。',
      systemPrompt: [
        '你是技术评委。',
        `竞赛：${detail.contestName} / 赛道：${detail.trackName}`,
        '你必须优先围绕技术实现、对比基线、关键指标和风险兜底追问。',
        promptText,
        `评分规则：\n${rubricText}`,
        `评委指引：${guidelineSummary}`,
        `历史问题：${pastQuestionSummary}`,
      ].filter(Boolean).join('\n'),
      focusAreas: ['技术路线', '核心指标', '实验设计', '替代方案'],
      scoringRubric: buildDefaultScoringRubric('围绕技术可行性、创新性和工程实现质量评分。', 'technical'),
    }
  }

  if (detail.judgeType === 'business') {
    return {
      summary: '关注场景价值、落地路径、资源组织和商业闭环。',
      systemPrompt: [
        '你是业务评委。',
        `竞赛：${detail.contestName} / 赛道：${detail.trackName}`,
        '你必须优先围绕用户价值、落地路径、运营模式和竞争优势追问。',
        promptText,
        `评分规则：\n${rubricText}`,
        `评委指引：${guidelineSummary}`,
        `历史问题：${pastQuestionSummary}`,
      ].filter(Boolean).join('\n'),
      focusAreas: ['用户价值', '落地路径', '竞争优势', 'ROI'],
      scoringRubric: buildDefaultScoringRubric('围绕业务价值、市场落地与执行闭环评分。', 'business'),
    }
  }

  return {
    summary: '关注表达结构、逻辑推进、证据组织和临场答辩节奏。',
    systemPrompt: [
      '你是表达评委。',
      `竞赛：${detail.contestName} / 赛道：${detail.trackName}`,
      '你必须优先围绕表达结构、证据组织、答辩节奏和反问应对追问。',
      promptText,
      `评分规则：\n${rubricText}`,
      `评委指引：${guidelineSummary}`,
      `历史问题：${pastQuestionSummary}`,
    ].filter(Boolean).join('\n'),
    focusAreas: ['表达结构', '证据组织', '临场应答', '说服力'],
    scoringRubric: buildDefaultScoringRubric('围绕表达清晰度、逻辑性与现场控制力评分。', 'expression'),
  }
}

export async function buildContestDefensePersonaDrafts(
  db: Queryable,
  input: {
    contestId: string
    trackId?: string
    includeInternal: boolean
  },
): Promise<Array<Omit<AiDefensePersona, 'id' | 'projectId' | 'createdByUserId' | 'updatedByUserId' | 'createdAt' | 'updatedAt'>>> {
  const detail = await getContestDetail(db, {
    contestId: input.contestId,
    includeInternal: input.includeInternal,
  })
  if (!detail)
    return []

  const contestName = normalizeString(detail.contest?.name) || '当前竞赛'
  const trackName = normalizeString(detail.contest?.tracks.find(item => item.id === input.trackId)?.name) || '当前赛道'
  const promptText = await resolveAiPromptText(db, {
    contestId: input.contestId,
    trackId: input.trackId,
    target: 'defense',
  })

  const resources = await listContestResourcesByContestId(db, {
    contestId: input.contestId,
    includeInternal: input.includeInternal,
  })
  const rubricLines = detail.rubrics
    .filter(item => !input.trackId || item.trackId === input.trackId)
    .flatMap(item => item.dimensions || [])
    .slice(0, 8)
    .map(item => `${item.name}：${item.description}`)
  const guidelineSummary = resources
    .filter(item => item.category === 'judge_guidelines')
    .slice(0, 2)
    .map(item => summarizeText(item.summary || item.content, 160))
    .filter(Boolean)
    .join('；')
  const pastQuestionSummary = resources
    .filter(item => item.category === 'past_questions')
    .slice(0, 3)
    .map(item => summarizeText(item.summary || item.content, 120))
    .filter(Boolean)
    .join('；')

  return (['technical', 'business', 'expression'] as const).map((judgeType, index) => {
    const draft = buildPersonaPrompt({
      judgeType,
      contestName,
      trackName,
      promptText,
      rubricLines,
      guidelineSummary,
      pastQuestionSummary,
    })
    return {
      sourceContestId: input.contestId,
      sourceTrackId: normalizeString(input.trackId) || null,
      sourceTemplateKey: `contest:${input.contestId}:${normalizeString(input.trackId) || 'default'}:${judgeType}`,
      judgeType,
      name: judgeType === 'technical' ? '技术评委' : judgeType === 'business' ? '业务评委' : '表达评委',
      summary: draft.summary,
      systemPrompt: draft.systemPrompt,
      focusAreas: draft.focusAreas,
      scoringRubric: draft.scoringRubric,
      enabled: true,
      sortOrder: index,
      isCustomized: false,
    }
  })
}

export async function resolveDefensePersonas(
  db: Queryable,
  input: {
    projectId: string
    contestName?: string
    trackName?: string
    promptText?: string
    rubricDigest?: string
    personaIds?: string[]
  },
): Promise<AiDefensePersona[]> {
  const selected = input.personaIds && input.personaIds.length > 0
    ? await listProjectDefensePersonasByIds(db, {
        projectId: input.projectId,
        personaIds: input.personaIds,
      })
    : await listProjectDefensePersonas(db, {
        projectId: input.projectId,
        enabledOnly: true,
      })

  if (selected.length > 0)
    return selected

  return buildDefaultDefensePersonas({
    contestName: input.contestName,
    trackName: input.trackName,
    promptText: input.promptText,
    rubricDigest: input.rubricDigest,
  })
}

async function loadProjectDocumentAnalysisMap(
  db: Queryable,
  projectId: string,
  resourceIds: string[],
): Promise<Map<string, DocumentAnalysis>> {
  if (resourceIds.length === 0)
    return new Map()

  const result = await db.query<ProjectDocumentAnalysisRow>(
    `SELECT
      project_resource_id,
      analysis_json
     FROM project_resource_documents
     WHERE project_id = $1
       AND project_resource_id = ANY($2::TEXT[])
       AND parse_status = 'succeeded'`,
    [projectId, resourceIds],
  )

  const mapped = new Map<string, DocumentAnalysis>()
  for (const row of result.rows) {
    const analysis = normalizeDocumentAnalysis(row.analysis_json)
    if (analysis)
      mapped.set(row.project_resource_id, analysis)
  }
  return mapped
}

function collectEvidenceCandidates(input: {
  resources: Resource[]
  sourceType: EvidenceCandidate['sourceType']
  analysisMap?: Map<string, DocumentAnalysis>
  keywords: string[]
  attachmentResourceIds: Set<string>
}): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = []
  for (const resource of input.resources) {
    const resourceTitle = normalizeString(resource.title) || '未命名资料'
    const category = normalizeString(resource.category || resource.type)
    const baseText = [resource.title, resource.summary, resource.content, category].join('\n')
    let baseScore = calcMatchScore(baseText, input.keywords)
    if (input.attachmentResourceIds.has(resource.id))
      baseScore += 0.5

    const excerpt = summarizeText(resource.summary || resource.content, 180)
    if (excerpt) {
      candidates.push({
        resourceId: resource.id,
        resourceTitle,
        excerpt,
        page: null,
        sourceType: input.sourceType,
        category,
        score: baseScore,
      })
    }

    const analysis = input.analysisMap?.get(resource.id)
    if (!analysis)
      continue

    for (const page of analysis.pages || []) {
      for (const block of page.blocks || []) {
        const blockText = summarizeText(block.text, 180)
        if (!blockText)
          continue
        const score = calcMatchScore(blockText, input.keywords) + (input.attachmentResourceIds.has(resource.id) ? 0.5 : 0)
        if (score <= 0)
          continue
        candidates.push({
          resourceId: resource.id,
          resourceTitle,
          excerpt: blockText,
          page: Number.isFinite(Number(block.page)) ? Number(block.page) : page.page,
          sourceType: input.sourceType,
          category,
          score: score + 0.25,
        })
      }
    }
  }

  return candidates
}

export async function buildDefenseContextPack(input: BuildDefenseContextPackInput): Promise<DefenseContextPack> {
  const detail = normalizeString(input.contestId)
    ? await getContestDetail(input.db, {
        contestId: normalizeString(input.contestId),
        includeInternal: input.includeInternal,
      })
    : null
  const contestName = normalizeString(detail?.contest?.name)
  const trackName = normalizeString(detail?.contest?.tracks.find(item => item.id === input.trackId)?.name)
  const promptText = normalizeString(await resolveAiPromptText(input.db, {
    contestId: input.contestId,
    trackId: input.trackId,
    target: 'defense',
  }))
  const rubricDigest = buildRubricDigest(detail, normalizeString(input.trackId))

  const personas = await resolveDefensePersonas(input.db, {
    projectId: normalizeString(input.projectId),
    contestName,
    trackName,
    promptText,
    rubricDigest,
    personaIds: input.personaIds,
  })

  const projectResources = normalizeString(input.projectId)
    ? await loadVisibleProjectResourcesForAi(input.db, input.user, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      })
    : []
  const contestResources = normalizeString(input.contestId)
    ? await listContestResourcesByContestId(input.db, {
        contestId: normalizeString(input.contestId),
        includeInternal: input.includeInternal,
      })
    : []

  const attachmentResourceIds = new Set(
    (input.attachments || [])
      .map(item => normalizeString(item.resourceId))
      .filter(Boolean),
  )

  const keywords = [
    ...splitKeywords(contestName),
    ...splitKeywords(trackName),
    ...splitKeywords(input.major || ''),
    ...splitKeywords(input.latestUserMessage || ''),
    ...personas.flatMap(persona => persona.focusAreas || []).flatMap(splitKeywords),
    ...(input.attachments || []).flatMap(item => splitKeywords(item.caption || item.name || '')),
  ]

  const analysisMap = await loadProjectDocumentAnalysisMap(
    input.db,
    normalizeString(input.projectId),
    projectResources.map(item => item.id),
  )

  const projectCandidates = collectEvidenceCandidates({
    resources: projectResources,
    sourceType: 'project',
    analysisMap,
    keywords,
    attachmentResourceIds,
  })
  const contestCandidates = collectEvidenceCandidates({
    resources: contestResources.filter((item) => {
      const category = normalizeString(item.category)
      return category === 'judge_guidelines'
        || category === 'past_questions'
        || category === 'scoring'
        || category === 'track_details'
    }),
    sourceType: 'contest',
    keywords,
    attachmentResourceIds,
  })

  const evidenceRefs = [...projectCandidates, ...contestCandidates]
    .sort((left, right) => right.score - left.score)
    .reduce<AiDefenseEvidenceRef[]>((acc, item) => {
      if (acc.length >= 12)
        return acc
      const duplicated = acc.some((existing) => {
        return existing.resourceId === item.resourceId
          && existing.excerpt === item.excerpt
      })
      if (duplicated)
        return acc
      acc.push({
        resourceId: item.resourceId,
        resourceTitle: item.resourceTitle,
        excerpt: item.excerpt,
        page: item.page ?? null,
        sourceType: item.sourceType,
        category: item.category,
        score: Number(item.score.toFixed(3)),
      })
      return acc
    }, [])

  const promptContextText = evidenceRefs.length > 0
    ? evidenceRefs
        .slice(0, 8)
        .map((item, index) => {
          const meta = [
            item.sourceType || 'project',
            item.category || '资料',
            item.page ? `p.${item.page}` : '',
          ].filter(Boolean).join(' / ')
          return `${index + 1}. [${meta}] ${item.resourceTitle}\n${item.excerpt}`
        })
        .join('\n')
    : '暂无可用证据，请基于当前对话内容继续模拟答辩。'

  return {
    contestName: contestName || '未选择',
    trackName: trackName || '未选择',
    promptText,
    rubricDigest,
    promptContextText,
    evidenceRefs,
    personas,
    detail,
  }
}
