import type {
  AiContestFilterRequest,
  AiContestFilterResult,
  AiProjectChatRequest,
  AiProjectChatResult,
  Contest,
  ContestFilterInput,
  ContestLevel,
  DefenseSession,
  ProjectPayload,
  ReviewReport,
  Rubric,
  TopicProposal,
  TopicProposalItem,
  Track,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
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

export function runTopicProposalFallback(input: {
  contest: Contest
  track: Track
  major?: string
}): TopicProposal {
  const major = String(input.major || '').trim() || '目标专业'

  const proposals: TopicProposalItem[] = [
    {
      title: `${input.track.name}：${major} 智能辅导决策平台`,
      reason: '结合竞赛评分口径与专业能力，具备可展示的工程成果。',
      innovationPoints: ['评分维度反向驱动迭代', '任务分解可追踪'],
      techRouteSteps: ['定义问题边界', '设计数据结构', '实现核心流程', '构建可视化评审面板'],
      scoringMapping: ['创新性', '可行性', '表达规范'],
      risks: ['数据样本不足', '时间排期冲突'],
      references: ['竞赛官网评分细则', '往届优秀作品关键词'],
    },
    {
      title: `${input.track.name}：竞赛资料智能检索与答辩演练`,
      reason: '从资料管理到答辩训练形成闭环，展示完整产品思路。',
      innovationPoints: ['多角色评委模拟', '结构化缺口识别'],
      techRouteSteps: ['聚合资料索引', '构建问答流程', '生成答辩清单'],
      scoringMapping: ['应用价值', '证据与数据'],
      risks: ['外部链接失效', '演示复杂度过高'],
      references: ['竞赛 FAQ', '行业最佳实践'],
    },
    {
      title: `${input.track.name}：${major} 项目质量评审助手`,
      reason: '聚焦“可执行修改清单”，直连竞赛交付目标。',
      innovationPoints: ['章节级建议生成', '工作量分级排期'],
      techRouteSteps: ['加载 rubric', '执行多维评估', '输出改进计划'],
      scoringMapping: ['可行性', '表达规范', '应用价值'],
      risks: ['评审口径偏差', '指标定义不清'],
      references: ['往届评审意见', '主办方评分标准'],
    },
  ]

  return {
    id: randomUUID(),
    contestId: input.contest.id,
    trackId: input.track.id,
    createdAt: new Date().toISOString(),
    proposals,
  }
}

export function runReviewFallback(input: {
  contestId: string
  trackId: string
  text: string
  rubric: Rubric
}): ReviewReport {
  const rawText = String(input.text || '').trim()
  const baseScore = Math.max(55, Math.min(93, Math.round(58 + rawText.length / 28)))

  const dimensionScores = input.rubric.dimensions.map((dimension) => {
    const variance = Math.min(8, Math.max(2, Math.round((dimension.weight || 0) / 5)))
    const score = Math.max(50, Math.min(96, baseScore + Math.round(((dimension.weight || 0) - 20) / 4) - variance))
    return {
      role: `${dimension.name}评委`,
      score,
      comment: dimension.description || `${dimension.name}维度建议补充更多可验证证据。`,
    }
  })

  const totalScore = Math.round(
    dimensionScores.reduce((sum, item, index) => {
      const weight = input.rubric.dimensions[index]?.weight || 0
      return sum + item.score * (weight / 100)
    }, 0),
  )

  return {
    id: randomUUID(),
    contestId: input.contestId,
    trackId: input.trackId,
    totalScore,
    dimensionScores,
    topPriorities: [
      '补齐核心指标定义与计算口径。',
      '增加实验对照或竞品对比证据。',
      '优化结论页与价值页，突出成果闭环。',
    ],
    chapterSuggestions: [
      { chapter: '摘要', suggestions: ['突出问题-方案-结果链路', '增加量化成果一句话总结'] },
      { chapter: '方法', suggestions: ['补充数据来源说明', '明确关键参数与实验配置'] },
      { chapter: '结果', suggestions: ['增加对照组', '展示失败案例与改进过程'] },
    ],
    actionItems: [
      { task: '补充指标口径与计算说明', workload: 'low' },
      { task: '完善实验对照和结果可视化', workload: 'medium' },
      { task: '重构答辩故事线与演示脚本', workload: 'high' },
    ],
    riskWarnings: ['存在“结论先行、证据不足”的风险', '交付物中技术细节与口头陈述可能不一致'],
    createdAt: new Date().toISOString(),
  }
}

export function runDefenseFallback(input: {
  contest: Contest
  track: Track
  strictness?: 'normal' | 'strict'
  rounds?: number
}): DefenseSession {
  const strictness = input.strictness || 'normal'
  const rounds = Math.max(1, Math.min(5, input.rounds || 3))

  return {
    id: randomUUID(),
    contestId: input.contest.id,
    trackId: input.track.id,
    topQuestions: [
      '你们方案相较于现有方案的核心差异是什么？',
      `为什么选择 ${input.track.name} 作为切入点，而不是其他赛道？`,
      '关键指标如何定义？是否有客观可复现的计算方式？',
      '若核心数据不可得，方案如何降级仍能完成演示？',
      '你们的结论是否存在样本偏差？如何证明结果稳定？',
      '若评委质疑创新点“只是功能叠加”，你将如何回应？',
      '技术路线中风险最高的一步是什么？应对策略是什么？',
      '项目落地后，如何衡量真实应用价值？',
      '团队分工如何保证在截止日前完成高质量交付？',
      `请在 ${strictness === 'strict' ? '30 秒内' : '90 秒内'} 给出最有说服力的总结陈述。`,
    ],
    answer30s: [
      '结论：我们解决的是高频、可量化、可复现的问题。',
      '依据：已有实验数据和对照分析支撑。',
      '方案：采用可落地的分阶段实施路线。',
      '指标：覆盖准确率、效率和用户价值三类关键指标。',
      '风险：已准备数据不足与资源受限两套降级方案。',
    ],
    answer90s: [
      '先明确问题背景与目标人群，再给出现有方案痛点。',
      '说明核心创新点与技术路线，并展示阶段性结果。',
      '补充对照实验、边界条件与失败案例复盘。',
      '给出落地路径、成本收益估算和后续迭代方向。',
    ],
    materialGaps: [
      '缺可复现的数据采样过程说明',
      '缺竞品对比基线和评价标准',
      '缺落地场景中成本与收益测算',
      `建议至少完成 ${rounds} 轮模拟答辩并记录修订项`,
    ],
    createdAt: new Date().toISOString(),
  }
}
