import type {
  Contest,
  DocumentAnalysis,
  Resource,
  ResourceCategory,
  ResourceKnowledgeGovernanceStatus,
  ResourceKnowledgeProfile,
  ResourceQualityIssue,
  ResourceRelation,
  ResourceRelationType,
  ResourceSearchEvent,
  ResourceSearchSort,
} from '~~/shared/types/domain'
import {
  analyzeKnowledgeEntity,
  extractKnowledgeKeywords,
} from '~~/server/services/knowledge-ai'

interface SearchMetrics {
  searchCount7d: number
  clickCount7d: number
  searchCount30d: number
  clickCount30d: number
}

const CATEGORY_KEYWORDS: Record<ResourceCategory, string[]> = {
  basic_info: ['简介', '概述', '总览', '背景', 'overview', 'guide'],
  timeline: ['时间', '日程', '节点', '报名', '截止', 'schedule', 'timeline'],
  tracks: ['赛道', '方向', '组别', 'track', 'topic'],
  scoring: ['评分', '评审', '评奖', '标准', 'criteria', 'rubric'],
  past_questions: ['往届', '真题', '题目', '命题', 'case'],
  awarded_works: ['获奖', '优秀作品', '案例', 'award', 'winner'],
  templates: ['模板', '范文', '申报书', 'template', 'sample'],
  faq: ['faq', '常见问题', '问答', '答疑'],
  judge_guidelines: ['评委', '评审细则', '评审说明', 'judge'],
  track_details: ['赛道详解', '赛题说明', '任务书', '方向说明'],
  ai_prompts: ['提示词', 'prompt', 'system prompt'],
  submission_examples: ['示例', '样例', '示范', 'example'],
  policy_notice: ['通知', '公告', '政策', 'notice', 'policy'],
  compliance: ['版权', '授权', '原创', '合规', 'compliance', 'copyright'],
}

const STAGE_KEYWORDS: Array<{ tag: string, keywords: string[] }> = [
  { tag: 'registration', keywords: ['报名', '注册', 'registration'] },
  { tag: 'submission', keywords: ['提交', '提交材料', 'submission'] },
  { tag: 'preliminary', keywords: ['初赛', '海选', 'preliminary'] },
  { tag: 'final', keywords: ['决赛', '答辩', 'final', 'defense'] },
]

const RISKY_TERMS = ['侵权', '盗版', '未授权', '非原创', '违规', '投诉']

function clampScore(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeText(value: string): string {
  return normalizeString(value).toLowerCase()
}

function tokenizeQuery(value: string): string[] {
  return normalizeString(value)
    .toLowerCase()
    .split(/[\s,，、|/]+/g)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
}

function uniqueStrings(input: string[], limit = 20): string[] {
  return [...new Set(input.map(item => normalizeString(item)).filter(Boolean))].slice(0, limit)
}

function parseSeasonYear(contest: Contest): number {
  const direct = Number(String(contest.currentSeason || '').match(/\d{4}/)?.[0] || 0)
  if (Number.isFinite(direct) && direct >= 2000)
    return direct
  return new Date().getFullYear()
}

function flattenDocumentText(document: DocumentAnalysis | null | undefined): string {
  if (!document?.pages?.length)
    return ''
  const blocks = document.pages.flatMap(page => page.blocks.map(block => block.text))
  const fields = document.pages.flatMap(page => page.fields.map(field => `${field.key}:${field.value}`))
  return [...blocks, ...fields].map(item => normalizeString(item)).filter(Boolean).join('\n')
}

export function buildResourceKnowledgeText(input: {
  contest: Contest
  resource: Resource
  documentAnalysis?: DocumentAnalysis | null
}): string {
  const parts = [
    input.contest.name,
    ...(input.contest.keywords || []),
    ...(input.contest.recommendedFor || []),
    input.resource.title,
    input.resource.summary,
    input.resource.content || '',
    flattenDocumentText(input.documentAnalysis),
  ]
  return parts.map(item => normalizeString(item)).filter(Boolean).join('\n')
}

function scoreCategoryMatch(text: string, title: string, category: ResourceCategory): number {
  const keywords = CATEGORY_KEYWORDS[category] || []
  let score = 0
  for (const keyword of keywords) {
    const normalized = normalizeText(keyword)
    if (title.includes(normalized))
      score += 12
    else if (text.includes(normalized))
      score += 5
  }
  return score
}

function predictCategory(input: {
  resource: Resource
  combinedText: string
}): { category: ResourceCategory, confidence: number } {
  const title = normalizeText(input.resource.title)
  const text = normalizeText(input.combinedText)
  const entries = (Object.keys(CATEGORY_KEYWORDS) as ResourceCategory[]).map((category) => {
    let score = scoreCategoryMatch(text, title, category)
    if (input.resource.category === category)
      score += 8
    return { category, score }
  })
  entries.sort((a, b) => b.score - a.score)
  const picked = entries[0] || { category: input.resource.category || 'basic_info', score: 1 }
  const second = entries[1]?.score || 0
  const confidence = Math.max(0.35, Math.min(0.98, (picked.score + 4) / Math.max(8, picked.score + second + 4)))
  return {
    category: picked.category,
    confidence: Number(confidence.toFixed(2)),
  }
}

function detectStageTags(text: string): string[] {
  const normalized = normalizeText(text)
  const result: string[] = []
  for (const item of STAGE_KEYWORDS) {
    if (item.keywords.some(keyword => normalized.includes(normalizeText(keyword))))
      result.push(item.tag)
  }
  return uniqueStrings(result, 8)
}

function detectMajorTags(contest: Contest, text: string): string[] {
  const normalized = normalizeText(text)
  const candidates = [...(contest.recommendedFor || []), ...(contest.disciplines || [])]
  return uniqueStrings(candidates.filter(item => normalized.includes(normalizeText(item))), 10)
}

function buildQualityIssues(input: {
  resource: Resource
  predictedCategory: ResourceCategory
  combinedText: string
  documentAnalysis?: DocumentAnalysis | null
  searchMetrics: SearchMetrics
}): ResourceQualityIssue[] {
  const issues: ResourceQualityIssue[] = []
  const normalizedText = normalizeText(input.combinedText)
  const contentLength = normalizedText.length
  if (!normalizeString(input.resource.summary))
    issues.push({ code: 'summary_missing', message: '缺少摘要信息。', severity: 'warning', field: 'summary', scoreImpact: 8 })
  if (!normalizedText)
    issues.push({ code: 'content_missing', message: '缺少正文或文档解析结果。', severity: 'error', field: 'content', scoreImpact: 16 })
  if (!normalizeString(input.resource.copyrightNote))
    issues.push({ code: 'copyright_missing', message: '缺少版权说明。', severity: 'warning', field: 'copyrightNote', scoreImpact: 8 })
  if (contentLength > 0 && contentLength < 80)
    issues.push({ code: 'content_too_short', message: '内容过短，难以支持检索与推荐。', severity: 'warning', field: 'content', scoreImpact: 10 })
  if (input.resource.category && input.resource.category !== input.predictedCategory)
    issues.push({ code: 'category_mismatch', message: '现有分类与智能判定不一致，建议复核。', severity: 'warning', field: 'category', scoreImpact: 6 })
  if (RISKY_TERMS.some(term => normalizedText.includes(normalizeText(term))))
    issues.push({ code: 'compliance_risk', message: '检测到潜在合规风险词。', severity: 'error', field: 'content', scoreImpact: 18 })
  if (input.searchMetrics.searchCount30d >= 3 && input.searchMetrics.clickCount30d === 0)
    issues.push({ code: 'low_ctr', message: '有搜索曝光但无点击，可能标题或标签不匹配。', severity: 'info', scoreImpact: 4 })
  return issues
}

function computeQualityScore(input: {
  resource: Resource
  predictedCategory: ResourceCategory
  combinedText: string
  documentAnalysis?: DocumentAnalysis | null
  searchMetrics: SearchMetrics
  issues: ResourceQualityIssue[]
  aiQualityScore: number
  contest: Contest
}): { score: number, componentScores: Record<string, number> } {
  const summaryLength = normalizeString(input.resource.summary).length
  const contentLength = normalizeString(input.combinedText).length
  const hasUrl = Boolean(normalizeString(input.resource.sourceLink))
  const hasDocument = Boolean(input.documentAnalysis?.pages?.length)
  const completeness = Math.min(30, (summaryLength > 20 ? 8 : summaryLength > 0 ? 4 : 0)
    + (contentLength > 120 ? 10 : contentLength > 0 ? 5 : 0)
    + (hasUrl ? 6 : 0)
    + (hasDocument ? 6 : 0))

  let compliance = 30
  if (!normalizeString(input.resource.copyrightNote))
    compliance -= 8
  if (input.resource.status === 'invalid')
    compliance -= 20
  if (input.resource.availability === 'unavailable')
    compliance -= 6
  if (input.issues.some(issue => issue.code === 'compliance_risk'))
    compliance -= 16

  const totalBlocks = input.documentAnalysis?.pages?.reduce((sum, page) => sum + page.blocks.length + page.fields.length, 0) || 0
  const structural = Math.min(20, (hasDocument ? 8 : 0)
    + (totalBlocks >= 10 ? 8 : totalBlocks >= 3 ? 5 : 0)
    + (contentLength >= 400 ? 4 : contentLength >= 120 ? 2 : 0))

  const seasonYear = parseSeasonYear(input.contest)
  let consistency = input.resource.category === input.predictedCategory ? 12 : 7
  if (Number(input.resource.year || 0) >= seasonYear - 1)
    consistency += 4
  if (hasUrl)
    consistency += 4
  consistency = Math.min(20, consistency)

  const raw = completeness + Math.max(0, compliance) + structural + consistency
  const adjusted = Math.round((raw * 0.8) + (Math.max(0, Math.min(100, input.aiQualityScore)) * 0.2))

  return {
    score: clampScore(adjusted),
    componentScores: {
      completeness: clampScore((completeness / 30) * 100),
      compliance: clampScore((Math.max(0, compliance) / 30) * 100),
      structural: clampScore((structural / 20) * 100),
      consistency: clampScore((consistency / 20) * 100),
    },
  }
}

function computeValueScore(input: {
  contest: Contest
  resource: Resource
  documentAnalysis?: DocumentAnalysis | null
  aiTags: string[]
  searchMetrics: SearchMetrics
}): { score: number, componentScores: Record<string, number> } {
  const officialUrl = normalizeText(input.contest.officialUrl || '')
  const resourceLink = normalizeText(input.resource.sourceLink)
  let authority = input.resource.sourceType === 'official' ? 20 : 10
  if (officialUrl && resourceLink && resourceLink.includes(officialUrl.replace(/^https?:\/\//, '')))
    authority = 20
  else if (input.resource.sourceType === 'upload-document')
    authority = Math.max(authority, 14)

  const pageCount = input.documentAnalysis?.pages?.length || 0
  const contentLength = normalizeString(input.resource.content).length + normalizeString(input.resource.summary).length
  const depth = Math.min(25, (pageCount >= 8 ? 15 : pageCount >= 3 ? 10 : 4) + (contentLength >= 1000 ? 10 : contentLength >= 300 ? 6 : 3))

  const coverage = Math.min(25, (normalizeString(input.resource.summary) ? 6 : 0)
    + (normalizeString(input.resource.content) ? 8 : 0)
    + (input.aiTags.length >= 6 ? 6 : input.aiTags.length >= 3 ? 4 : input.aiTags.length > 0 ? 2 : 0)
    + (normalizeString(input.resource.copyrightNote) ? 5 : 0))

  const seasonYear = parseSeasonYear(input.contest)
  const year = Number(input.resource.year || seasonYear)
  const diff = Math.abs(seasonYear - year)
  const timeliness = diff <= 0 ? 15 : diff === 1 ? 11 : diff === 2 ? 7 : 4

  const usage = Math.min(15, Math.round(input.searchMetrics.searchCount30d * 1.5) + Math.round(input.searchMetrics.clickCount30d * 2))

  return {
    score: clampScore(authority + depth + coverage + timeliness + usage),
    componentScores: {
      authority: clampScore((authority / 20) * 100),
      depth: clampScore((depth / 25) * 100),
      coverage: clampScore((coverage / 25) * 100),
      timeliness: clampScore((timeliness / 15) * 100),
      usage: clampScore((usage / 15) * 100),
    },
  }
}

function computeHotScore(input: {
  contest: Contest
  resource: Resource
  searchMetrics: SearchMetrics
}): { score: number, componentScores: Record<string, number> } {
  const searchPart = Math.min(40, input.searchMetrics.searchCount7d * 8)
  const clickPart = Math.min(30, input.searchMetrics.clickCount7d * 10)
  const trendRatio = input.searchMetrics.searchCount30d > 0
    ? input.searchMetrics.searchCount7d / input.searchMetrics.searchCount30d
    : 0
  const trendPart = Math.min(20, Math.round(trendRatio * 80))
  const seasonYear = parseSeasonYear(input.contest)
  const freshnessPart = Math.max(0, 10 - (Math.max(0, seasonYear - Number(input.resource.year || seasonYear)) * 2))
  return {
    score: clampScore(searchPart + clickPart + trendPart + freshnessPart),
    componentScores: {
      demand: clampScore((searchPart / 40) * 100),
      click: clampScore((clickPart / 30) * 100),
      trend: clampScore((trendPart / 20) * 100),
      freshness: clampScore((freshnessPart / 10) * 100),
    },
  }
}

function resolveGovernanceStatus(input: {
  qualityScore: number
  valueScore: number
  hotScore: number
  issues: ResourceQualityIssue[]
  contest: Contest
  resource: Resource
}): ResourceKnowledgeGovernanceStatus {
  if (input.issues.some(issue => issue.code === 'compliance_risk'))
    return 'suggested_invalid'

  const seasonYear = parseSeasonYear(input.contest)
  const age = Math.max(0, seasonYear - Number(input.resource.year || seasonYear))
  if (age >= 3 && input.hotScore <= 20 && input.valueScore <= 35)
    return 'suggested_archive'

  if (input.qualityScore >= 75 && input.valueScore >= 60)
    return 'healthy'

  return 'review'
}

function applyManualOverrides<T extends Record<string, unknown>>(base: T, overrides: Record<string, unknown>): T {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(overrides || {}).filter(([, value]) => value !== undefined)),
  }
}

export async function analyzeResourceKnowledgeProfile(input: {
  contest: Contest
  resource: Resource
  documentAnalysis?: DocumentAnalysis | null
  searchMetrics?: Partial<SearchMetrics>
  existingProfile?: ResourceKnowledgeProfile | null
  event?: Parameters<typeof analyzeKnowledgeEntity>[0]['event']
}): Promise<{
  predictedCategory: ResourceCategory
  categoryConfidence: number
  aiTags: string[]
  majorTags: string[]
  stageTags: string[]
  qualityScore: number
  valueScore: number
  hotScore: number
  qualityIssues: ResourceQualityIssue[]
  governanceStatus: ResourceKnowledgeGovernanceStatus
  analysisVersion: string
  manualOverrides: Record<string, unknown>
  componentScores: Record<string, number>
  analysisPayload: Record<string, unknown>
}> {
  const metrics: SearchMetrics = {
    searchCount7d: Math.max(0, Number(input.searchMetrics?.searchCount7d || 0)),
    clickCount7d: Math.max(0, Number(input.searchMetrics?.clickCount7d || 0)),
    searchCount30d: Math.max(0, Number(input.searchMetrics?.searchCount30d || 0)),
    clickCount30d: Math.max(0, Number(input.searchMetrics?.clickCount30d || 0)),
  }

  const combinedText = buildResourceKnowledgeText({
    contest: input.contest,
    resource: input.resource,
    documentAnalysis: input.documentAnalysis,
  })
  const aiAnalysis = await analyzeKnowledgeEntity({
    scope: 'resource',
    text: combinedText,
    event: input.event,
    systemPrompt: '你是竞赛资料知识治理分析助手。请输出资源摘要、关键词、风险和建议动作，重点关注分类、质量、价值和检索可用性。',
  })
  const predicted = predictCategory({
    resource: input.resource,
    combinedText: `${combinedText}\n${aiAnalysis.summary}\n${aiAnalysis.keywords.join(' ')}`,
  })

  const aiTags = uniqueStrings([
    ...extractKnowledgeKeywords(`${input.resource.title}\n${input.resource.summary}\n${input.resource.content || ''}`, 12),
    ...aiAnalysis.keywords,
  ], 12)
  const majorTags = detectMajorTags(input.contest, `${combinedText}\n${aiTags.join(' ')}`)
  const stageTags = detectStageTags(`${combinedText}\n${aiTags.join(' ')}`)

  const issues = buildQualityIssues({
    resource: input.resource,
    predictedCategory: predicted.category,
    combinedText,
    documentAnalysis: input.documentAnalysis,
    searchMetrics: metrics,
  })
  const quality = computeQualityScore({
    resource: input.resource,
    predictedCategory: predicted.category,
    combinedText,
    documentAnalysis: input.documentAnalysis,
    searchMetrics: metrics,
    issues,
    aiQualityScore: aiAnalysis.qualityScore,
    contest: input.contest,
  })
  const value = computeValueScore({
    contest: input.contest,
    resource: input.resource,
    documentAnalysis: input.documentAnalysis,
    aiTags,
    searchMetrics: metrics,
  })
  const hot = computeHotScore({
    contest: input.contest,
    resource: input.resource,
    searchMetrics: metrics,
  })
  const governanceStatus = resolveGovernanceStatus({
    qualityScore: quality.score,
    valueScore: value.score,
    hotScore: hot.score,
    issues,
    contest: input.contest,
    resource: input.resource,
  })

  const manualOverrides = input.existingProfile?.manualOverrides || {}
  const merged = applyManualOverrides({
    predictedCategory: predicted.category,
    categoryConfidence: predicted.confidence,
    aiTags,
    majorTags,
    stageTags,
    qualityScore: quality.score,
    valueScore: value.score,
    hotScore: hot.score,
    qualityIssues: issues,
    governanceStatus,
  }, manualOverrides)

  return {
    predictedCategory: (merged.predictedCategory as ResourceCategory) || predicted.category,
    categoryConfidence: Math.max(0, Math.min(1, Number(merged.categoryConfidence ?? predicted.confidence))),
    aiTags: uniqueStrings((merged.aiTags as string[]) || aiTags, 12),
    majorTags: uniqueStrings((merged.majorTags as string[]) || majorTags, 10),
    stageTags: uniqueStrings((merged.stageTags as string[]) || stageTags, 8),
    qualityScore: clampScore(Number(merged.qualityScore ?? quality.score)),
    valueScore: clampScore(Number(merged.valueScore ?? value.score)),
    hotScore: clampScore(Number(merged.hotScore ?? hot.score)),
    qualityIssues: (Array.isArray(merged.qualityIssues) ? merged.qualityIssues : issues) as ResourceQualityIssue[],
    governanceStatus: (merged.governanceStatus as ResourceKnowledgeGovernanceStatus) || governanceStatus,
    analysisVersion: 'v1',
    manualOverrides,
    componentScores: {
      ...quality.componentScores,
      ...Object.fromEntries(Object.entries(value.componentScores).map(([key, valueScore]) => [`value_${key}`, valueScore])),
      ...Object.fromEntries(Object.entries(hot.componentScores).map(([key, hotScore]) => [`hot_${key}`, hotScore])),
    },
    analysisPayload: {
      summary: aiAnalysis.summary,
      keywords: aiAnalysis.keywords,
      risks: aiAnalysis.risks,
      suggestedActions: aiAnalysis.suggestedActions,
      searchMetrics: metrics,
    },
  }
}

function normalizeTitle(value: string): string {
  return normalizeString(value).toLowerCase().replace(/[\s\-_.,，。()（）[\]【】]+/g, '')
}

function computeOverlap(left: string[], right: string[]): number {
  const leftSet = new Set(left.map(item => normalizeText(item)).filter(Boolean))
  const rightSet = new Set(right.map(item => normalizeText(item)).filter(Boolean))
  if (leftSet.size === 0 || rightSet.size === 0)
    return 0
  let intersection = 0
  for (const item of leftSet) {
    if (rightSet.has(item))
      intersection += 1
  }
  return intersection / new Set([...leftSet, ...rightSet]).size
}

export function buildResourceRelations(input: {
  source: Resource
  sourceProfile: ResourceKnowledgeProfile
  targets: Array<{ resource: Resource, profile: ResourceKnowledgeProfile }>
}): ResourceRelation[] {
  const relations: ResourceRelation[] = []
  const normalizedSourceTitle = normalizeTitle(input.source.title)
  for (const target of input.targets) {
    if (target.resource.id === input.source.id)
      continue
    const tagOverlap = computeOverlap(input.sourceProfile.aiTags, target.profile.aiTags)
    const majorOverlap = computeOverlap(input.sourceProfile.majorTags, target.profile.majorTags)
    const stageOverlap = computeOverlap(input.sourceProfile.stageTags, target.profile.stageTags)
    let weight = 0
    if (input.source.category && input.source.category === target.resource.category)
      weight += 25
    weight += Math.round(tagOverlap * 45)
    weight += Math.round(majorOverlap * 15)
    weight += Math.round(stageOverlap * 10)
    if (Math.abs(Number(input.source.year || 0) - Number(target.resource.year || 0)) <= 1)
      weight += 10

    const normalizedTargetTitle = normalizeTitle(target.resource.title)
    let relationType: ResourceRelationType = 'recommended'
    if (normalizedSourceTitle && normalizedSourceTitle === normalizedTargetTitle) {
      relationType = 'duplicate'
      weight += 35
    }
    else if (tagOverlap >= 0.45) {
      relationType = 'similar'
    }
    else if (input.source.category !== target.resource.category && (majorOverlap > 0 || stageOverlap > 0)) {
      relationType = 'complementary'
    }

    if (weight < 40)
      continue

    relations.push({
      id: `${input.source.id}:${target.resource.id}:${relationType}`,
      contestId: input.source.contestId,
      sourceResourceId: input.source.id,
      targetResourceId: target.resource.id,
      relationType,
      weight: clampScore(weight),
      reason: relationType === 'duplicate'
        ? '标题高度相似，疑似重复资料。'
        : relationType === 'similar'
          ? '标签、分类和使用场景高度相近。'
          : relationType === 'complementary'
            ? '适用于相同人群或阶段，可作为互补资料。'
            : '与当前资料在标签和热度上存在较强相关性。',
      targetTitle: target.resource.title,
      targetCategory: target.resource.category,
    })
  }
  return relations
    .sort((a, b) => b.weight - a.weight || a.targetTitle!.localeCompare(b.targetTitle || ''))
    .slice(0, 6)
}

export function computeResourceMatchScore(input: {
  resource: Resource
  query: string
}): number {
  const tokens = tokenizeQuery(input.query)
  if (tokens.length === 0)
    return 0

  const title = normalizeText(input.resource.title)
  const summary = normalizeText(input.resource.summary)
  const content = normalizeText(input.resource.content || '')
  const tags = input.resource.aiProfile?.aiTags.map(item => normalizeText(item)) || []
  let score = 0
  for (const token of tokens) {
    if (title === token)
      score += 32
    else if (title.includes(token))
      score += 22
    if (summary.includes(token))
      score += 10
    if (content.includes(token))
      score += 6
    if (tags.some(tag => tag.includes(token)))
      score += 12
  }
  return clampScore(score)
}

export function filterAndSortResources(input: {
  items: Resource[]
  query?: string
  tags?: string[]
  minQuality?: number
  sort?: ResourceSearchSort
}): Resource[] {
  const normalizedTags = uniqueStrings(input.tags || [], 10).map(item => normalizeText(item))
  const query = normalizeString(input.query)
  const hasQuery = Boolean(query)
  const minQuality = Math.max(0, Number(input.minQuality || 0))

  const filtered = input.items.filter((item) => {
    const quality = Number(item.aiProfile?.qualityScore || 0)
    if (quality < minQuality)
      return false
    if (normalizedTags.length > 0) {
      const itemTags = (item.aiProfile?.aiTags || []).map(tag => normalizeText(tag))
      if (!normalizedTags.every(tag => itemTags.includes(tag)))
        return false
    }
    if (!hasQuery)
      return true
    return computeResourceMatchScore({ resource: item, query }) > 0
  })

  const sort = input.sort || (hasQuery ? 'relevance' : 'hot')
  return [...filtered].sort((left, right) => {
    const leftMatch = computeResourceMatchScore({ resource: left, query })
    const rightMatch = computeResourceMatchScore({ resource: right, query })
    const leftQuality = Number(left.aiProfile?.qualityScore || 0)
    const rightQuality = Number(right.aiProfile?.qualityScore || 0)
    const leftValue = Number(left.aiProfile?.valueScore || 0)
    const rightValue = Number(right.aiProfile?.valueScore || 0)
    const leftHot = Number(left.aiProfile?.hotScore || 0)
    const rightHot = Number(right.aiProfile?.hotScore || 0)

    const byFormula = () => {
      const leftScore = (leftMatch * 0.4) + (leftQuality * 0.2) + (leftValue * 0.2) + (leftHot * 0.2)
      const rightScore = (rightMatch * 0.4) + (rightQuality * 0.2) + (rightValue * 0.2) + (rightHot * 0.2)
      return rightScore - leftScore
    }

    if (sort === 'quality')
      return rightQuality - leftQuality || rightValue - leftValue || rightHot - leftHot
    if (sort === 'value')
      return rightValue - leftValue || rightQuality - leftQuality || rightHot - leftHot
    if (sort === 'hot')
      return rightHot - leftHot || rightValue - leftValue || rightQuality - leftQuality
    return byFormula() || rightHot - leftHot || rightValue - leftValue
  })
}

export function buildDemandInsights(events: ResourceSearchEvent[], limit = 20): ResourceDemandInsight[] {
  const searchEvents = events.filter(item => !item.clicked)
  const clickEvents = events.filter(item => item.clicked)
  const clicksByQuery = new Map<string, number>()
  const clickDedup = new Set<string>()
  for (const event of clickEvents) {
    const key = normalizeString(event.query).toLowerCase()
    if (!key)
      continue
    const dedupeKey = `${key}|${normalizeString(event.sessionId || event.id)}`
    if (clickDedup.has(dedupeKey))
      continue
    clickDedup.add(dedupeKey)
    clicksByQuery.set(key, (clicksByQuery.get(key) || 0) + 1)
  }

  const buckets = new Map<string, {
    query: string
    searchCount: number
    zeroResultCount: number
  }>()

  for (const event of searchEvents) {
    const query = normalizeString(event.query)
    if (!query)
      continue
    const key = query.toLowerCase()
    const current = buckets.get(key) || {
      query,
      searchCount: 0,
      zeroResultCount: 0,
    }
    current.searchCount += 1
    if (Number(event.resultCount || 0) === 0)
      current.zeroResultCount += 1
    buckets.set(key, current)
  }

  return [...buckets.values()]
    .map((item) => {
      const clickCount = Math.min(item.searchCount, clicksByQuery.get(item.query.toLowerCase()) || 0)
      const lowClickCount = Math.max(0, item.searchCount - item.zeroResultCount - clickCount)
      return {
        query: item.query,
        searchCount: item.searchCount,
        zeroResultCount: item.zeroResultCount,
        lowClickCount,
        clickCount,
        ctr: Number((clickCount / Math.max(1, item.searchCount)).toFixed(2)),
        suggestedCategories: (Object.keys(CATEGORY_KEYWORDS) as ResourceCategory[]).filter((category) => {
          return CATEGORY_KEYWORDS[category].some(keyword => normalizeText(item.query).includes(normalizeText(keyword)))
        }).slice(0, 3),
        missingTags: extractKnowledgeKeywords(item.query, 4),
      }
    })
    .sort((a, b) => (b.zeroResultCount + b.lowClickCount) - (a.zeroResultCount + a.lowClickCount) || b.searchCount - a.searchCount)
    .slice(0, Math.max(1, limit))
}
