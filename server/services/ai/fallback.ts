import type {
  AiContestFilterRequest,
  AiContestFilterResult,
  AiDefenseRequest,
  AiDefenseResult,
  AiProjectChatRequest,
  AiProjectChatResult,
  AiTopicProposalRequest,
  AiTopicProposalResult,
  Contest,
  ContestFilterInput,
  ContestLevel,
  ProjectPayload,
  TopicProposalItem,
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

function toFallbackTopicItem(input: {
  index: number
  query: string
  major: string
}): TopicProposalItem {
  const suffix = input.index + 1
  const query = input.query || '智能化赛题'
  const major = input.major || '跨专业'
  return {
    title: `${query} 方向命题方案 ${suffix}`,
    reason: `结合${major}能力模型与竞赛评分维度，方案 ${suffix} 更容易形成可验证成果。`,
    innovationPoints: [
      '围绕真实业务痛点设计可量化指标。',
      '通过低成本原型快速验证核心假设。',
      '将评审标准直接映射到章节与证据材料。',
    ],
    techRouteSteps: [
      '拆解赛题约束，建立验收标准。',
      '构建最小可行数据与实验闭环。',
      '实现核心功能并准备演示脚本。',
      '补齐答辩证据：指标、对比、风险与备选。',
    ],
    scoringMapping: [
      '创新性 -> 差异化方法与实验对比',
      '可行性 -> 路线、资源与里程碑',
      '完整性 -> 文档规范与演示闭环',
    ],
    risks: [
      '数据获取周期不稳定影响实验进度',
      '功能范围膨胀导致答辩准备时间不足',
      '指标定义不清导致评委质疑可行性',
    ],
    references: [],
  }
}

export function runTopicProposalFallback(request: AiTopicProposalRequest): AiTopicProposalResult {
  const latestUserMessage = [...request.messages]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?.trim() || ''

  const topK = Math.max(1, Math.min(5, Number(request.topK || 3)))
  const proposals = Array.from({ length: topK }).map((_, index) => {
    return toFallbackTopicItem({
      index,
      query: latestUserMessage,
      major: request.context.major || '',
    })
  })

  const missingFields: string[] = []
  if (!request.context.contestId)
    missingFields.push('contestId')
  if (!request.context.trackId)
    missingFields.push('trackId')
  if (!request.context.major)
    missingFields.push('major')

  return {
    assistantReply: `已生成 ${proposals.length} 个候选命题，可继续追问细化技术路线与答辩策略。`,
    proposals,
    references: [],
    missingFields,
    webSearchEnabled: false,
  }
}

export function runDefenseFallback(request: AiDefenseRequest): AiDefenseResult {
  const latestUserMessage = [...request.messages]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?.trim() || '请基于当前方案进行模拟答辩。'

  const rounds: AiDefenseResult['rounds'] = [
    {
      judge: 'technical',
      question: '请说明核心技术路线与基线方案相比的优势。',
      score: 78,
      comment: '技术方向明确，但实验对比指标需要再量化。',
      followUp: '如果关键依赖失败，是否有可替代实现路径？',
    },
    {
      judge: 'business',
      question: '该方案在真实场景的落地路径和价值闭环是什么？',
      score: 74,
      comment: '场景描述清晰，但商业收益测算较粗。',
      followUp: '你如何证明方案在 3 个月内可被试点采用？',
    },
    {
      judge: 'expression',
      question: '请用 90 秒说明项目结论、证据与风险。',
      score: 80,
      comment: '表达结构较完整，建议减少术语堆叠。',
      followUp: '如果评委质疑创新性，你的第一反驳点是什么？',
    },
  ]

  const scorecard = {
    technical: 78,
    business: 74,
    expression: 80,
    total: 77,
    summary: '整体可答辩，建议优先补齐量化证据与业务价值测算。',
    materialGaps: [
      '缺少与公开基线的量化对比表',
      '商业价值与ROI估算不够具体',
    ],
    actionItems: [
      '补充核心指标对比图（精度、时延、成本）',
      '准备 3 个高频追问的 30 秒版本回答',
      '将风险与备选方案写成一页答辩卡',
    ],
  }

  const missingFields: string[] = []
  if (!request.context.contestId)
    missingFields.push('contestId')
  if (!request.context.trackId)
    missingFields.push('trackId')
  if (!request.context.major)
    missingFields.push('major')

  const judgeSummary = rounds
    .map(item => `${item.judge}(${item.score})`)
    .join(' / ')

  return {
    assistantReply: `模拟答辩已完成：${judgeSummary}\n用户输入：${latestUserMessage}\n总评：${scorecard.summary}`,
    rounds,
    scorecard,
    missingFields,
  }
}
