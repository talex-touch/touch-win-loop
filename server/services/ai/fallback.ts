import type {
  AiContestFilterRequest,
  AiContestFilterResult,
  AiProjectChatRequest,
  AiProjectChatResult,
  Contest,
  ContestFilterInput,
  ContestLevel,
  ProjectPayload,
} from '~~/shared/types/domain'
import { filterContests, findContestById, findTrackById } from '~~/server/data/catalog'

const levelHints: Array<{ keyword: string, level: ContestLevel }> = [
  { keyword: '国赛', level: 'national' },
  { keyword: '国家级', level: 'national' },
  { keyword: '省赛', level: 'provincial' },
  { keyword: '校赛', level: 'school' },
  { keyword: '行业', level: 'industry' },
]

function inferLevelFromQuery(query: string): ContestLevel | '' {
  for (const hint of levelHints) {
    if (query.includes(hint.keyword))
      return hint.level
  }
  return ''
}

function splitKeywords(query: string): string[] {
  return query
    .split(/[\s,，、]+/)
    .map(keyword => keyword.trim())
    .filter(keyword => keyword.length >= 2)
    .slice(0, 6)
}

function scoreContest(contest: Contest, request: AiContestFilterRequest): number {
  const query = request.query.toLowerCase()
  const context = [contest.name, contest.organizer, ...contest.keywords, ...contest.recommendedFor].join(' ').toLowerCase()

  let score = 0
  for (const keyword of splitKeywords(request.query)) {
    if (context.includes(keyword.toLowerCase()))
      score += 4
  }

  if (request.major) {
    const hitMajor = contest.recommendedFor.some(major => major.includes(request.major!))
      || contest.tracks.some(track => track.suitableMajors.some(major => major.includes(request.major!)))
    if (hitMajor)
      score += 5
  }

  if (request.filters?.level && contest.level === request.filters.level)
    score += 5

  if (query.length > 0 && context.includes(query))
    score += 3

  score += Math.min(contest.tracks.length, 3)
  return score
}

export function runContestFilterFallback(request: AiContestFilterRequest, contests: Contest[]): AiContestFilterResult {
  const inferredLevel = inferLevelFromQuery(request.query)
  const normalizedFilters: ContestFilterInput = {
    discipline: request.filters?.discipline ?? '',
    level: (request.filters?.level || inferredLevel) ?? '',
    major: request.major ?? request.filters?.major ?? '',
    trackType: request.filters?.trackType ?? '',
    keyword: request.filters?.keyword?.length
      ? request.filters.keyword
      : splitKeywords(request.query),
  }

  const filtered = filterContests({
    q: request.query,
    discipline: normalizedFilters.discipline,
    level: normalizedFilters.level,
    major: normalizedFilters.major,
    trackType: normalizedFilters.trackType,
    keyword: normalizedFilters.keyword,
  })

  const ranked = (filtered.length > 0 ? filtered : contests)
    .map(contest => ({ contest, score: scoreContest(contest, request) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, request.topK ?? 6))
    .map(item => item.contest)

  const reasoningParts = [
    normalizedFilters.major ? `已优先匹配专业：${normalizedFilters.major}` : '未提供专业，按综合相关度排序',
    normalizedFilters.level ? `级别过滤：${normalizedFilters.level}` : '未限制竞赛级别',
    normalizedFilters.trackType ? `赛道偏好：${normalizedFilters.trackType}` : '未限制赛道类型',
  ]

  return {
    normalizedFilters,
    reasoning: reasoningParts.join('；'),
    contests: ranked,
  }
}

function buildDraftFromMessage(message: string, request: AiProjectChatRequest): ProjectPayload {
  const compact = message.replace(/\s+/g, ' ').trim()
  const titleSeed = compact.length >= 12 ? compact.slice(0, 12) : (compact || '智能竞赛助手')

  return {
    title: `${titleSeed} · 竞赛方案`,
    contestId: request.context.contestId ?? '',
    trackId: request.context.trackId ?? '',
    problemStatement: compact || '需要针对目标竞赛完成问题定义、方案验证与交付。',
    innovationPoints: [
      '引入可量化指标，避免仅停留在概念陈述。',
      '将竞赛评分维度映射到交付物章节，降低失分风险。',
      '设计可演示的最小可行原型，强化答辩说服力。',
    ],
    techRouteSteps: [
      '拆解竞赛要求与评分口径，建立验收清单。',
      '设计数据采集与验证方案，形成可追溯证据链。',
      '完成核心功能原型并记录实验过程。',
      '输出答辩材料：结论、依据、指标、风险与备选方案。',
    ],
    scoringMapping: [
      '创新性 -> 方案差异化与技术亮点',
      '可行性 -> 路线图、资源预算与里程碑',
      '表达规范 -> 结构化文档与图表一致性',
    ],
    risks: [
      '数据样本不足导致结论不稳定',
      'Demo 复杂度过高导致开发延期',
      '关键指标定义不清导致评委质疑',
    ],
    deliverables: ['方案书', '演示 PPT', '答辩问题清单'],
    summary: '通过评分口径驱动选题与交付，优先保证可验证、可展示、可答辩。',
  }
}

export function runProjectChatFallback(request: AiProjectChatRequest): AiProjectChatResult {
  const latestUserMessage = [...request.messages].reverse().find(message => message.role === 'user')?.content ?? ''
  const draft = buildDraftFromMessage(latestUserMessage, request)

  const missingFields: string[] = []
  if (!draft.contestId)
    missingFields.push('contestId')
  if (!draft.trackId)
    missingFields.push('trackId')
  if (!request.context.major)
    missingFields.push('major')

  const contest = draft.contestId ? findContestById(draft.contestId) : undefined
  const track = draft.contestId && draft.trackId ? findTrackById(draft.contestId, draft.trackId) : undefined

  const assistantReply = [
    '已基于当前对话生成项目草案，你可以直接回填到表单并保存。',
    contest ? `当前竞赛：${contest.name}` : '当前未锁定竞赛，可先在左侧筛选后再继续细化。',
    track ? `当前赛道：${track.name}` : '当前未锁定赛道，建议先选择赛道再细化技术路线。',
    missingFields.length > 0 ? `仍需补全字段：${missingFields.join(', ')}` : '核心字段已基本齐全。',
  ].join('\n')

  return {
    assistantReply,
    projectDraft: draft,
    missingFields,
  }
}
