import type {
  AiTopicProposalResult,
  AiTopicReference,
  ProjectTopicBoardInput,
  Resource,
  TopicProposalCompareMatrixRow,
  TopicProposalCompareScores,
  TopicProposalDecisionStatus,
  TopicProposalEvidenceRef,
  TopicProposalItem,
  TopicProposalSimilarityAward,
  TopicProposalTrendSignal,
  Track,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ContestTrendRow {
  year: number
  summary: string
  hotTags: string[]
  evidenceSources: string[]
}

interface EnrichTopicProposalResultInput {
  result: AiTopicProposalResult
  boardInput: ProjectTopicBoardInput
  track?: Track | null
  projectResources?: Resource[]
  contestResources?: Resource[]
  contestTrends?: ContestTrendRow[]
  webReferences?: AiTopicReference[]
}

const SCORE_WEIGHTS = {
  contestFit: 25,
  noveltySimilarity: 20,
  evidenceReadiness: 15,
  trendHeat: 15,
  teamMatch: 15,
  workloadFeasibility: 10,
} as const

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return fallback
  return normalized
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values))
    return []
  const dedupe = new Set<string>()
  const result: string[] = []
  for (const item of values) {
    const normalized = normalizeText(item)
    if (!normalized)
      continue
    const key = normalized.toLowerCase()
    if (dedupe.has(key))
      continue
    dedupe.add(key)
    result.push(normalized)
  }
  return result
}

function summarizeText(value: unknown, max = 120): string {
  const normalized = normalizeText(value).replace(/\s+/g, ' ')
  if (!normalized)
    return ''
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, max)}...`
}

function tokenize(values: unknown[]): string[] {
  const dedupe = new Set<string>()
  const tokens: string[] = []

  for (const value of values) {
    const normalized = normalizeText(value).toLowerCase()
    if (!normalized)
      continue

    for (const token of normalized.split(/[\s,，、。.!！？?;；:：/\\|\-_()[\]{}"'`]+/)) {
      const item = token.trim()
      if (item.length < 2 || dedupe.has(item))
        continue
      dedupe.add(item)
      tokens.push(item)
    }
  }

  return tokens
}

function calcOverlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0)
    return 0

  const leftSet = new Set(left)
  const rightSet = new Set(right)
  let matched = 0
  for (const token of leftSet) {
    if (rightSet.has(token))
      matched += 1
  }

  return matched / Math.max(leftSet.size, rightSet.size, 1)
}

function normalizeDifficulty(value: string): string {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized)
    return ''
  if (normalized.includes('高') || normalized.includes('hard') || normalized.includes('困难'))
    return 'high'
  if (normalized.includes('低') || normalized.includes('easy') || normalized.includes('简单'))
    return 'low'
  return 'medium'
}

function scoreWorkloadFeasibility(workload: string, difficulty: string): number {
  const normalized = normalizeText(workload).toLowerCase()
  const targetDifficulty = normalizeDifficulty(difficulty)

  let score = 70
  if (normalized.includes('低') || normalized.includes('轻') || normalized.includes('两周') || normalized.includes('1-2'))
    score = 88
  else if (normalized.includes('中'))
    score = 74
  else if (normalized.includes('高') || normalized.includes('重') || normalized.includes('复杂') || normalized.includes('多阶段'))
    score = 46

  if (targetDifficulty === 'high')
    score -= 8
  else if (targetDifficulty === 'low')
    score += 6

  return clamp(score, 30, 95)
}

function scoreEvidenceReadiness(evidenceRefs: TopicProposalEvidenceRef[]): number {
  if (evidenceRefs.length === 0)
    return 28

  const avgConfidence = evidenceRefs.reduce((sum, item) => sum + clamp(item.confidence, 0, 1), 0) / evidenceRefs.length
  const sourceBonus = Math.min(18, evidenceRefs.length * 6)
  return clamp(Math.round(avgConfidence * 60 + sourceBonus + 18), 25, 96)
}

function scoreNovelty(similarAwards: TopicProposalSimilarityAward[]): number {
  if (similarAwards.length === 0)
    return 82

  const highestSimilarity = Math.max(...similarAwards.map(item => clamp(item.similarityScore, 0, 100)))
  return clamp(Math.round(100 - highestSimilarity * 0.72), 18, 92)
}

function scoreTrendHeat(trendSignals: TopicProposalTrendSignal[]): number {
  if (trendSignals.length === 0)
    return 52

  const avg = trendSignals.reduce((sum, item) => sum + clamp(item.heatScore, 0, 100), 0) / trendSignals.length
  return clamp(Math.round(avg), 35, 96)
}

function scoreContestFit(baseScore: number, evidenceCount: number, reasons: string[]): number {
  const normalizedBase = clamp(normalizeNumber(baseScore, 72), 35, 98)
  const reasonBonus = Math.min(10, reasons.length * 2)
  const evidenceBonus = Math.min(8, evidenceCount * 2)
  return clamp(normalizedBase + reasonBonus + evidenceBonus - 4, 30, 98)
}

function scoreTeamMatch(requiredSkills: string[], teamSkillTags: string[]): { score: number, gapNotes: string[] } {
  if (requiredSkills.length === 0 && teamSkillTags.length === 0) {
    return {
      score: 58,
      gapNotes: ['尚未录入团队技能标签，匹配分按中性值处理。'],
    }
  }

  if (requiredSkills.length === 0) {
    return {
      score: 66,
      gapNotes: ['候选题未显式给出所需技能，建议人工复核技术路线。'],
    }
  }

  const teamSet = new Set(teamSkillTags.map(item => item.toLowerCase()))
  const missing = requiredSkills.filter(item => !teamSet.has(item.toLowerCase()))
  const matched = requiredSkills.length - missing.length
  const ratio = matched / Math.max(requiredSkills.length, 1)
  const score = clamp(Math.round(35 + ratio * 60), 20, 95)

  return {
    score,
    gapNotes: missing.length > 0
      ? [`技能缺口：${missing.slice(0, 4).join('、')}`]
      : ['团队技能标签与题目所需能力基本匹配。'],
  }
}

function toCompareScores(input: {
  contestFit: number
  noveltySimilarity: number
  evidenceReadiness: number
  trendHeat: number
  teamMatch: number
  workloadFeasibility: number
}): TopicProposalCompareScores {
  return {
    contestFit: clamp(Math.round(input.contestFit), 0, 100),
    noveltySimilarity: clamp(Math.round(input.noveltySimilarity), 0, 100),
    evidenceReadiness: clamp(Math.round(input.evidenceReadiness), 0, 100),
    trendHeat: clamp(Math.round(input.trendHeat), 0, 100),
    teamMatch: clamp(Math.round(input.teamMatch), 0, 100),
    workloadFeasibility: clamp(Math.round(input.workloadFeasibility), 0, 100),
  }
}

function calcTotalScore(scores: TopicProposalCompareScores): number {
  return clamp(Math.round(
    scores.contestFit * SCORE_WEIGHTS.contestFit / 100
    + scores.noveltySimilarity * SCORE_WEIGHTS.noveltySimilarity / 100
    + scores.evidenceReadiness * SCORE_WEIGHTS.evidenceReadiness / 100
    + scores.trendHeat * SCORE_WEIGHTS.trendHeat / 100
    + scores.teamMatch * SCORE_WEIGHTS.teamMatch / 100
    + scores.workloadFeasibility * SCORE_WEIGHTS.workloadFeasibility / 100,
  ), 0, 100)
}

function buildCandidateTokens(item: TopicProposalItem, boardInput: ProjectTopicBoardInput, track?: Track | null): string[] {
  return tokenize([
    item.title,
    item.reason,
    ...item.innovationPoints,
    ...item.techRouteSteps,
    ...item.requiredSkills,
    boardInput.major,
    boardInput.discipline,
    boardInput.topicType,
    boardInput.expectedDifficulty,
    ...(boardInput.keywords || []),
    track?.name,
    track?.summary,
  ])
}

function buildResourceTokens(resource: Resource): string[] {
  return tokenize([
    resource.title,
    resource.summary,
    resource.content,
    resource.category,
    resource.type,
    resource.year,
  ])
}

function buildSimilarAwards(item: TopicProposalItem, boardInput: ProjectTopicBoardInput, track: Track | null | undefined, contestResources: Resource[]): TopicProposalSimilarityAward[] {
  const targetTokens = buildCandidateTokens(item, boardInput, track)
  if (contestResources.length === 0)
    return []

  return contestResources
    .filter(resource => resource.category === 'awarded_works' || resource.category === 'past_questions')
    .map((resource) => {
      const overlap = calcOverlapScore(targetTokens, buildResourceTokens(resource))
      const trackBonus = track && normalizeText(resource.title).includes(track.name) ? 0.12 : 0
      const similarityScore = clamp(Math.round((overlap + trackBonus) * 100), 0, 100)
      return {
        title: resource.title,
        summary: summarizeText(resource.summary || resource.content || ''),
        year: Number(resource.year || 0) || undefined,
        contestId: normalizeText(resource.contestId) || undefined,
        trackName: track?.name,
        similarityScore,
        reason: similarityScore >= 45
          ? '标题/摘要与当前候选题存在明显主题重叠。'
          : '仅存在局部方向相近，可作为边界参考。',
      }
    })
    .filter(item => item.similarityScore >= 18)
    .sort((left, right) => right.similarityScore - left.similarityScore)
    .slice(0, 3)
}

function buildEvidenceRefs(item: TopicProposalItem, boardInput: ProjectTopicBoardInput, track: Track | null | undefined, projectResources: Resource[], contestResources: Resource[], webReferences: AiTopicReference[]): TopicProposalEvidenceRef[] {
  const targetTokens = buildCandidateTokens(item, boardInput, track)
  const resourceMatches = [...projectResources, ...contestResources]
    .map((resource) => {
      const overlap = calcOverlapScore(targetTokens, buildResourceTokens(resource))
      const sourceType = projectResources.includes(resource) ? 'project_resource' : 'contest_resource'
      return {
        title: resource.title,
        summary: summarizeText(resource.summary || resource.content || ''),
        sourceType,
        sourceLabel: sourceType === 'project_resource' ? '项目资料' : `竞赛资料/${normalizeText(resource.category || resource.type || '未分类')}`,
        confidence: clamp(overlap + (sourceType === 'contest_resource' ? 0.18 : 0.1), 0.15, 0.95),
      } satisfies TopicProposalEvidenceRef
    })
    .filter(item => item.confidence >= 0.22)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 4)

  const webMatches = webReferences
    .map((reference) => {
      const overlap = calcOverlapScore(targetTokens, tokenize([reference.title, reference.snippet]))
      return {
        title: reference.title,
        summary: summarizeText(reference.snippet, 100),
        sourceType: 'web_search' as const,
        sourceLabel: '外网查证',
        url: normalizeText(reference.url) || undefined,
        confidence: clamp(overlap, 0.15, 0.82),
      }
    })
    .filter(item => item.confidence >= 0.2)
    .slice(0, 2)

  return [...resourceMatches, ...webMatches].slice(0, 5)
}

function buildTrendSignals(item: TopicProposalItem, boardInput: ProjectTopicBoardInput, contestTrends: ContestTrendRow[], contestResources: Resource[], webReferences: AiTopicReference[]): TopicProposalTrendSignal[] {
  const tokens = buildCandidateTokens(item, boardInput)
  if (contestTrends.length > 0) {
    const signals = contestTrends.flatMap((trend) => {
      const trendTokens = tokenize([trend.summary, ...trend.hotTags, ...trend.evidenceSources])
      const overlap = calcOverlapScore(tokens, trendTokens)
      if (overlap <= 0)
        return []

      const summary = normalizeText(trend.summary) || trend.hotTags.join('、')
      const labels = trend.hotTags.length > 0 ? trend.hotTags.slice(0, 2) : [`${trend.year} 趋势`]
      const currentYear = new Date().getFullYear()
      const age = Math.max(0, currentYear - trend.year)
      const recencyBonus = Math.max(0, 6 - age)
      return labels.map((label) => ({
        label,
        summary: summarizeText(summary, 110),
        heatScore: clamp(Math.round(62 + overlap * 30 + recencyBonus), 50, 96),
        source: 'contest_trends' as const,
        confidence: clamp(0.55 + overlap * 0.35, 0.55, 0.92),
      }))
    })

    return signals.slice(0, 3)
  }

  const internalSignals = contestResources
    .filter(resource => ['track_details', 'judge_guidelines', 'submission_examples', 'policy_notice'].includes(normalizeText(resource.category)))
    .map((resource) => {
      const overlap = calcOverlapScore(tokens, buildResourceTokens(resource))
      return {
        label: normalizeText(resource.title) || normalizeText(resource.category) || '内部资料',
        summary: summarizeText(resource.summary || resource.content || '', 110),
        heatScore: clamp(Math.round(48 + overlap * 34), 38, 78),
        source: 'internal_resource' as const,
        confidence: clamp(0.38 + overlap * 0.35, 0.35, 0.74),
      }
    })
    .filter(item => item.confidence >= 0.42)
    .slice(0, 2)

  const webSignals = webReferences
    .map((reference) => {
      const overlap = calcOverlapScore(tokens, tokenize([reference.title, reference.snippet]))
      return {
        label: normalizeText(reference.title) || '外网趋势',
        summary: summarizeText(reference.snippet, 100),
        heatScore: clamp(Math.round(54 + overlap * 36), 42, 82),
        source: 'web_search' as const,
        confidence: clamp(0.32 + overlap * 0.38, 0.3, 0.78),
      }
    })
    .filter(item => item.confidence >= 0.36)
    .slice(0, 1)

  return [...internalSignals, ...webSignals].slice(0, 3)
}

function normalizeCandidate(item: TopicProposalItem, boardInput: ProjectTopicBoardInput, track?: Track | null): TopicProposalItem {
  const recommendedTrackName = normalizeText(item.recommendedTrackName || track?.name)
  const recommendedTrackId = normalizeText(item.recommendedTrackId || track?.id)
  const requiredSkills = normalizeList(item.requiredSkills)

  return {
    ...item,
    id: normalizeText(item.id) || randomUUID(),
    estimatedWorkload: normalizeText(item.estimatedWorkload) || '中等工作量，建议 4-6 周完成 MVP 与验证。',
    recommendedTrackId,
    recommendedTrackName,
    contestFitScore: clamp(normalizeNumber(item.contestFitScore, 72), 0, 100),
    contestFitReasons: normalizeList(item.contestFitReasons).slice(0, 4),
    similarAwards: Array.isArray(item.similarAwards) ? item.similarAwards : [],
    trendSignals: Array.isArray(item.trendSignals) ? item.trendSignals : [],
    requiredSkills,
    teamMatchScore: clamp(normalizeNumber(item.teamMatchScore, 0), 0, 100),
    teamGapNotes: normalizeList(item.teamGapNotes),
    evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [],
    decisionStatus: (normalizeText(item.decisionStatus) as TopicProposalDecisionStatus) || 'candidate',
    compareScores: item.compareScores || {
      contestFit: 0,
      noveltySimilarity: 0,
      evidenceReadiness: 0,
      trendHeat: 0,
      teamMatch: 0,
      workloadFeasibility: 0,
    },
    totalScore: clamp(normalizeNumber(item.totalScore, 0), 0, 100),
    references: normalizeList(item.references),
  }
}

export function normalizeTopicBoardInput(input: Partial<ProjectTopicBoardInput> | null | undefined): ProjectTopicBoardInput {
  const candidateCount = clamp(Math.round(normalizeNumber(input?.candidateCount, 3)), 3, 5)
  return {
    contestId: normalizeText(input?.contestId),
    trackId: normalizeText(input?.trackId),
    major: normalizeText(input?.major),
    discipline: normalizeText(input?.discipline),
    topicType: normalizeText(input?.topicType),
    expectedDifficulty: normalizeText(input?.expectedDifficulty),
    keywords: normalizeList(input?.keywords),
    teamSkillTags: normalizeList(input?.teamSkillTags),
    candidateCount,
    source: input?.source || 'workspace_dashboard',
  }
}

export function buildTopicBoardPromptMessage(input: ProjectTopicBoardInput): string {
  return [
    '请基于当前竞赛上下文生成 AI 智能选题板。',
    input.discipline ? `所属领域：${input.discipline}` : '所属领域：未指定',
    input.topicType ? `题目类型：${input.topicType}` : '题目类型：未指定',
    input.expectedDifficulty ? `期望难度：${input.expectedDifficulty}` : '期望难度：未指定',
    input.keywords.length > 0 ? `关键词：${input.keywords.join('、')}` : '关键词：未指定',
    input.teamSkillTags.length > 0 ? `团队技能标签：${input.teamSkillTags.join('、')}` : '团队技能标签：未录入',
    `候选数：${input.candidateCount}`,
  ].join('\n')
}

export function enrichTopicProposalResult(input: EnrichTopicProposalResultInput): AiTopicProposalResult {
  const boardInput = normalizeTopicBoardInput(input.boardInput)
  const contestResources = Array.isArray(input.contestResources) ? input.contestResources : []
  const projectResources = Array.isArray(input.projectResources) ? input.projectResources : []
  const contestTrends = Array.isArray(input.contestTrends) ? input.contestTrends : []
  const webReferences = Array.isArray(input.webReferences) ? input.webReferences : []

  const normalizedCandidates = input.result.proposals
    .slice(0, boardInput.candidateCount)
    .map(item => normalizeCandidate(item, boardInput, input.track))
    .map((item) => {
      const similarAwards = buildSimilarAwards(item, boardInput, input.track, contestResources)
      const evidenceRefs = buildEvidenceRefs(item, boardInput, input.track, projectResources, contestResources, webReferences)
      const trendSignals = buildTrendSignals(item, boardInput, contestTrends, contestResources, webReferences)
      const teamMatch = scoreTeamMatch(item.requiredSkills, boardInput.teamSkillTags)
      const compareScores = toCompareScores({
        contestFit: scoreContestFit(item.contestFitScore, evidenceRefs.length, item.contestFitReasons),
        noveltySimilarity: scoreNovelty(similarAwards),
        evidenceReadiness: scoreEvidenceReadiness(evidenceRefs),
        trendHeat: scoreTrendHeat(trendSignals),
        teamMatch: teamMatch.score,
        workloadFeasibility: scoreWorkloadFeasibility(item.estimatedWorkload, boardInput.expectedDifficulty || ''),
      })

      return {
        ...item,
        similarAwards,
        trendSignals,
        teamMatchScore: teamMatch.score,
        teamGapNotes: teamMatch.gapNotes,
        evidenceRefs,
        compareScores,
        totalScore: calcTotalScore(compareScores),
      }
    })
    .sort((left, right) => right.totalScore - left.totalScore)

  const selectedCandidateId = normalizedCandidates[0]?.id

  const proposals = normalizedCandidates.map((item, index) => ({
    ...item,
    decisionStatus: item.id === selectedCandidateId ? 'selected' : item.decisionStatus,
  }))

  const compareMatrix: TopicProposalCompareMatrixRow[] = proposals.map((item, index) => ({
    candidateId: item.id,
    title: item.title,
    decisionStatus: item.decisionStatus,
    rank: index + 1,
    totalScore: item.totalScore,
    ...item.compareScores,
  }))

  const recommended = proposals[0]
  const boardSummary = recommended
    ? [
        `系统主推「${recommended.title}」`,
        `总分 ${recommended.totalScore}`,
        recommended.teamGapNotes[0] || '团队能力可覆盖当前候选题的核心要求。',
      ].join('；')
    : '暂无可用候选题，请补充竞赛与选题条件后重试。'

  return {
    ...input.result,
    proposals,
    compareMatrix,
    boardSummary,
    teamSkillProfile: boardInput.teamSkillTags,
    selectedCandidateId,
  }
}

export interface ProjectTopicBoardTrendRow extends ContestTrendRow {}
