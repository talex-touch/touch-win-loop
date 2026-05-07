import type {
  AnalyticsAwardFeatureAnalysisPayload,
  AnalyticsAwardFeatureSample,
  AnalyticsAwardFeatureTag,
  AnalyticsCapabilityProfilePayload,
  AnalyticsCapabilityProjectItem,
  AnalyticsCapabilityRadarItem,
  AnalyticsDataGap,
  AnalyticsDifficultyBottleneckItem,
  AnalyticsDifficultyCompletionPayload,
  AnalyticsDifficultyStatusStat,
  AnalyticsDifficultyTrackItem,
  AnalyticsFilterInput,
  AnalyticsMetricCard,
  AnalyticsOverviewPayload,
  AnalyticsPreparationCadencePayload,
  AnalyticsPreparationStageStat,
  AnalyticsPreparationTimelineItem,
  AnalyticsResolvedFilters,
  AnalyticsTrendAnalysisPayload,
  AnalyticsTrendContestItem,
  AnalyticsUpcomingContestItem,
} from '~~/shared/types/analytics'

const MOCK_LAST_UPDATED_AT = '2026-05-05T21:29:00.000+08:00'

const mockMetricCards: AnalyticsMetricCard[] = [
  {
    id: 'contest-trends',
    label: '趋势样本',
    value: '196',
    tone: 'blue',
    helpText: '覆盖 42 个竞赛方向，近 90 天新增 58 条趋势信号。',
  },
  {
    id: 'projects',
    label: '可见项目',
    value: '28',
    tone: 'emerald',
    helpText: '其中 19 个项目已绑定题目对比板，7 个进入冲刺阶段。',
  },
  {
    id: 'documents',
    label: '资料解析',
    value: '134',
    tone: 'amber',
    helpText: '已解析申报书、答辩稿、评审反馈和作品说明等资料。',
  },
  {
    id: 'events',
    label: '行为事件',
    value: '8421',
    tone: 'violet',
    helpText: '近窗口累计筛选、查看、AI 辅助和导出行为事件。',
  },
]

const mockTrendPoints = [
  {
    label: 'AI 智能体编排',
    heatScore: 94,
    contestCount: 18,
    latestYear: 2026,
    summary: '围绕多智能体协作、自动任务拆解和可观测执行链路，近期题目密度最高。',
  },
  {
    label: '多模态设计生成',
    heatScore: 89,
    contestCount: 15,
    latestYear: 2026,
    summary: '作品更强调图文生成、交互原型和可解释评审证据的完整闭环。',
  },
  {
    label: '低代码数据分析',
    heatScore: 84,
    contestCount: 13,
    latestYear: 2026,
    summary: '数据采集、可视化洞察和业务动作建议成为项目展示的高频组合。',
  },
  {
    label: '机器人控制与仿真',
    heatScore: 78,
    contestCount: 11,
    latestYear: 2026,
    summary: '从仿真验证走向真实设备闭环，评审更关注控制稳定性和安全边界。',
  },
  {
    label: '城市治理感知',
    heatScore: 73,
    contestCount: 10,
    latestYear: 2026,
    summary: '面向交通、安防、应急和基层治理的场景化题目持续升温。',
  },
  {
    label: '医疗辅助诊断',
    heatScore: 69,
    contestCount: 8,
    latestYear: 2026,
    summary: '强调数据合规、模型解释和医生工作流嵌入，资料证明要求更高。',
  },
  {
    label: '碳中和预测',
    heatScore: 64,
    contestCount: 7,
    latestYear: 2026,
    summary: '能源调度、碳排核算和园区运营优化仍是稳定命题方向。',
  },
  {
    label: '校园数字孪生',
    heatScore: 61,
    contestCount: 6,
    latestYear: 2026,
    summary: '项目更偏向可运行平台和可复用数据资产，答辩需要清楚说明落地边界。',
  },
  {
    label: '隐私计算与合规',
    heatScore: 57,
    contestCount: 5,
    latestYear: 2026,
    summary: '联邦学习、脱敏评测和权限审计成为跨组织数据合作的加分项。',
  },
  {
    label: '产业知识库应用',
    heatScore: 54,
    contestCount: 5,
    latestYear: 2026,
    summary: '知识抽取、检索增强和业务流程结合紧密，适合形成稳定作品包。',
  },
]

const mockAwardFeatureTags: AnalyticsAwardFeatureTag[] = [
  {
    label: '证据链完整',
    weight: 92,
    evidenceCount: 36,
    description: '申报书、演示视频、测试记录和用户反馈之间能互相印证。',
  },
  {
    label: '场景问题清晰',
    weight: 88,
    evidenceCount: 31,
    description: '题目痛点、目标用户和使用频次明确，避免停留在技术展示。',
  },
  {
    label: '交互闭环可跑',
    weight: 84,
    evidenceCount: 29,
    description: '作品具备从输入、处理、反馈到复盘的完整可演示流程。',
  },
  {
    label: '指标口径稳定',
    weight: 81,
    evidenceCount: 25,
    description: '关键指标定义一致，评审材料中没有互相冲突的数据口径。',
  },
  {
    label: '团队分工可追溯',
    weight: 77,
    evidenceCount: 22,
    description: '成员职责、贡献记录和里程碑产出能支撑团队协作可信度。',
  },
  {
    label: '部署方案明确',
    weight: 74,
    evidenceCount: 20,
    description: '说明运行环境、资源成本、扩展方式和异常恢复策略。',
  },
  {
    label: '模型评测充分',
    weight: 71,
    evidenceCount: 18,
    description: '包含基线对比、失败样例和指标解释，而不是只展示单点效果。',
  },
  {
    label: '业务价值量化',
    weight: 68,
    evidenceCount: 17,
    description: '能用效率、成本、准确率或体验指标解释项目收益。',
  },
  {
    label: '风险边界说明',
    weight: 64,
    evidenceCount: 14,
    description: '主动交代数据合规、模型误判和人工复核机制。',
  },
  {
    label: '视觉表达统一',
    weight: 61,
    evidenceCount: 12,
    description: '材料、原型和现场演示保持一致的信息层级与术语。',
  },
  {
    label: '可持续迭代',
    weight: 58,
    evidenceCount: 10,
    description: '路线图围绕现有问题递进，而不是堆叠未验证的新功能。',
  },
  {
    label: '外部反馈真实',
    weight: 55,
    evidenceCount: 9,
    description: '有导师、用户或试点方反馈，并能对应到具体改进动作。',
  },
]

const mockCapabilityRadar: AnalyticsCapabilityRadarItem[] = [
  {
    key: 'problem-fit',
    label: '选题契合',
    score: 86,
    evidence: '题目方向与项目资料、团队履历和近期行为热度匹配度高。',
  },
  {
    key: 'evidence',
    label: '证据完备',
    score: 82,
    evidence: '多数项目已沉淀申报书、演示稿和阶段评审记录。',
  },
  {
    key: 'trend',
    label: '趋势把握',
    score: 78,
    evidence: '近期浏览、收藏和对比集中在智能体、多模态与数据分析方向。',
  },
  {
    key: 'team',
    label: '团队匹配',
    score: 74,
    evidence: '成员能力覆盖产品、算法、工程和视觉表达，但交付节奏仍需拉齐。',
  },
  {
    key: 'execution',
    label: '执行可行',
    score: 80,
    evidence: '冲刺任务拆解较完整，关键风险集中在部署和评测复现。',
  },
  {
    key: 'presentation',
    label: '答辩表达',
    score: 72,
    evidence: '答辩材料结构完整，仍需压缩技术细节并强化场景故事线。',
  },
]

const mockPreparationTimeline: AnalyticsPreparationTimelineItem[] = [
  {
    id: 'prep-2026-05-06-review',
    phase: 'review',
    label: '校内 AI 应用挑战赛材料初审',
    timeText: '05/06 14:00',
    intensity: 'high',
    source: '项目评审排期',
  },
  {
    id: 'prep-2026-05-08-submit',
    phase: 'submission',
    label: '多模态设计生成赛道作品包提交',
    timeText: '05/08 18:00',
    intensity: 'high',
    source: '竞赛日程同步',
  },
  {
    id: 'prep-2026-05-10-kickoff',
    phase: 'kickoff',
    label: '数据产品挑战赛题目说明会',
    timeText: '05/10 09:30',
    intensity: 'medium',
    source: '外部日历同步',
  },
  {
    id: 'prep-2026-05-12-review',
    phase: 'review',
    label: '导师二轮评审与答辩结构校准',
    timeText: '05/12 16:00',
    intensity: 'medium',
    source: '项目计划',
  },
  {
    id: 'prep-2026-05-15-submission',
    phase: 'submission',
    label: '智能体原型演示视频定稿',
    timeText: '05/15 20:00',
    intensity: 'high',
    source: '任务看板',
  },
  {
    id: 'prep-2026-05-18-preliminary',
    phase: 'preliminary',
    label: '低代码分析方向初赛答辩',
    timeText: '05/18 10:00',
    intensity: 'high',
    source: '竞赛节点',
  },
  {
    id: 'prep-2026-05-22-review',
    phase: 'review',
    label: '机器人仿真项目风险复盘',
    timeText: '05/22 15:30',
    intensity: 'medium',
    source: '项目会议',
  },
  {
    id: 'prep-2026-05-25-submission',
    phase: 'submission',
    label: '作品说明书与测试报告归档',
    timeText: '05/25 23:00',
    intensity: 'medium',
    source: '资料库任务',
  },
  {
    id: 'prep-2026-05-28-semifinal',
    phase: 'semifinal',
    label: '城市治理感知赛道复赛演练',
    timeText: '05/28 13:30',
    intensity: 'medium',
    source: '外部同步',
  },
  {
    id: 'prep-2026-06-03-final',
    phase: 'final',
    label: '智能体编排项目终评答辩',
    timeText: '06/03 09:00',
    intensity: 'high',
    source: '评审日程',
  },
  {
    id: 'prep-2026-06-08-award',
    phase: 'award',
    label: '拟获奖名单材料复核',
    timeText: '06/08 17:00',
    intensity: 'low',
    source: '竞赛公告',
  },
  {
    id: 'prep-2026-06-12-review',
    phase: 'review',
    label: '下阶段项目复盘与选题池更新',
    timeText: '06/12 11:00',
    intensity: 'low',
    source: '团队计划',
  },
  {
    id: 'prep-2026-06-18-registration',
    phase: 'registration',
    label: '产业知识库应用方向报名确认',
    timeText: '06/18 12:00',
    intensity: 'medium',
    source: '竞赛订阅',
  },
  {
    id: 'prep-2026-06-25-kickoff',
    phase: 'kickoff',
    label: '暑期创新实践赛题目拆解',
    timeText: '06/25 19:30',
    intensity: 'low',
    source: '项目计划',
  },
]

const mockDataGaps: AnalyticsDataGap[] = [
  {
    id: 'mock-sync-quality',
    title: '同步口径需要复核',
    description: '部分外部表格字段命名不一致，建议统一竞赛阶段、赛道和项目状态映射。',
    level: 'warning',
  },
  {
    id: 'mock-rubric-coverage',
    title: '评审矩阵覆盖不均',
    description: '智能体和多模态方向评分维度较完整，机器人与医疗方向仍需补齐评审细则。',
    level: 'warning',
  },
  {
    id: 'mock-funnel-sample',
    title: '行为漏斗可继续沉淀',
    description: '筛选、收藏和查看样本已足够展示趋势，导出和答辩复盘事件仍偏少。',
    level: 'info',
  },
]

const mockTrendContests: AnalyticsTrendContestItem[] = [
  {
    contestId: 'mock-contest-agent-innovation',
    contestName: '校园智能体应用创新挑战赛',
    hotScore: 93,
    trendCount: 28,
    topKeywords: ['智能体编排', 'RAG', '任务自动化'],
    signalSummary: '近期筛选和收藏集中，项目资料对智能体执行链路、权限控制和评测解释关注度最高。',
  },
  {
    contestId: 'mock-contest-multimodal-design',
    contestName: '多模态设计生成作品赛',
    hotScore: 88,
    trendCount: 24,
    topKeywords: ['图文生成', '交互原型', '视觉一致性'],
    signalSummary: '作品包更看重可运行原型和设计说明，获奖样本通常具备完整演示视频。',
  },
  {
    contestId: 'mock-contest-data-product',
    contestName: '高校数据产品实践挑战赛',
    hotScore: 84,
    trendCount: 21,
    topKeywords: ['指标体系', '低代码', '运营洞察'],
    signalSummary: '题目强调业务指标闭环，项目需要说明数据来源、清洗规则和可执行建议。',
  },
  {
    contestId: 'mock-contest-robot-sim',
    contestName: '机器人控制与仿真实训赛',
    hotScore: 77,
    trendCount: 17,
    topKeywords: ['仿真验证', '控制稳定', '安全边界'],
    signalSummary: '近期热度来自真实场景复现，卡点主要集中在硬件联调和异常恢复。',
  },
  {
    contestId: 'mock-contest-city-sensing',
    contestName: '城市治理感知创新赛',
    hotScore: 72,
    trendCount: 15,
    topKeywords: ['视觉感知', '应急响应', '数字治理'],
    signalSummary: '评审关注场景约束和数据合规，优秀样本会附带试点反馈或模拟数据说明。',
  },
  {
    contestId: 'mock-contest-health-ai',
    contestName: '健康数据智能辅助赛',
    hotScore: 69,
    trendCount: 13,
    topKeywords: ['辅助诊断', '隐私合规', '模型解释'],
    signalSummary: '资料解析样本显示，合规说明和人工复核机制是进入短名单的重要条件。',
  },
  {
    contestId: 'mock-contest-carbon',
    contestName: '园区低碳运营预测赛',
    hotScore: 65,
    trendCount: 11,
    topKeywords: ['能耗预测', '碳排核算', '调度优化'],
    signalSummary: '适合结合真实运营数据做趋势预测，但需要补齐基线模型和成本收益对比。',
  },
  {
    contestId: 'mock-contest-knowledge-base',
    contestName: '产业知识库应用实践赛',
    hotScore: 61,
    trendCount: 9,
    topKeywords: ['知识抽取', '检索增强', '流程助手'],
    signalSummary: '候选项目多，但高质量案例集中在有明确业务流程和权限边界的作品。',
  },
]

const mockAwardSamples: AnalyticsAwardFeatureSample[] = [
  {
    title: '面向科研团队的智能申报材料助手',
    source: '智能体应用方向 · 作品包',
    status: 'selected',
    score: 91,
    summary: '通过资料抽取、缺口提醒和答辩脚本生成减少重复整理时间，证据链完整。',
  },
  {
    title: '多模态校园导览与活动推荐系统',
    source: '多模态设计方向 · 演示视频',
    status: 'shortlisted',
    score: 87,
    summary: '图文理解、路径规划和活动推荐形成闭环，视觉语言统一，现场可演示性强。',
  },
  {
    title: '低代码经营指标诊断看板',
    source: '数据产品方向 · 评审记录',
    status: 'selected',
    score: 86,
    summary: '指标口径、异常归因和运营建议联动，材料中包含真实用户反馈和迭代记录。',
  },
  {
    title: '机器人仓储路径仿真与异常恢复平台',
    source: '机器人仿真方向 · 测试报告',
    status: 'shortlisted',
    score: 83,
    summary: '仿真场景覆盖拥堵、设备掉线和路径重规划，风险边界说明较充分。',
  },
  {
    title: '城市内涝风险感知与处置建议系统',
    source: '城市治理方向 · 申报书',
    status: 'candidate',
    score: 80,
    summary: '场景问题清楚，数据合规说明完整，仍需加强模型评测和多部门协作流程。',
  },
  {
    title: '健康问诊资料摘要与复核工作台',
    source: '医疗辅助方向 · 资料样本',
    status: 'resource',
    score: 78,
    summary: '强调医生复核和误判兜底，适合作为证据完备度分析的参考样本。',
  },
  {
    title: '园区碳排预测与节能策略推荐',
    source: '低碳运营方向 · 路演材料',
    status: 'candidate',
    score: 76,
    summary: '业务价值量化较好，但需要进一步补充数据来源和部署成本。',
  },
  {
    title: '产业知识库问答与流程导航助手',
    source: '知识库应用方向 · 原型链接',
    status: 'shortlisted',
    score: 82,
    summary: '检索增强和流程节点结合紧密，权限边界清楚，答辩表达仍可压缩。',
  },
  {
    title: '校园设备巡检视觉识别系统',
    source: '视觉感知方向 · 测试数据',
    status: 'candidate',
    score: 74,
    summary: '具备较完整的失败样例分析，但场景价值和真实部署条件仍需强化。',
  },
  {
    title: '创新创业项目风险评估面板',
    source: '数据分析方向 · 评审反馈',
    status: 'resource',
    score: 73,
    summary: '适合作为行为分析样本，展示了筛选、收藏和复盘动作如何影响决策。',
  },
]

const mockCapabilityProjects: AnalyticsCapabilityProjectItem[] = [
  {
    projectId: 'mock-project-agent-brief',
    title: '智能申报材料助手',
    averageTeamMatch: 88,
    averageContestFit: 91,
    collegeCount: 3,
    advisorCount: 2,
    deliverableCount: 9,
  },
  {
    projectId: 'mock-project-design-lab',
    title: '多模态设计生成工作台',
    averageTeamMatch: 84,
    averageContestFit: 87,
    collegeCount: 2,
    advisorCount: 2,
    deliverableCount: 8,
  },
  {
    projectId: 'mock-project-data-dashboard',
    title: '经营指标诊断看板',
    averageTeamMatch: 82,
    averageContestFit: 85,
    collegeCount: 4,
    advisorCount: 1,
    deliverableCount: 7,
  },
  {
    projectId: 'mock-project-robot-sim',
    title: '仓储机器人路径仿真平台',
    averageTeamMatch: 79,
    averageContestFit: 81,
    collegeCount: 2,
    advisorCount: 3,
    deliverableCount: 10,
  },
  {
    projectId: 'mock-project-city-water',
    title: '城市内涝风险感知系统',
    averageTeamMatch: 76,
    averageContestFit: 78,
    collegeCount: 3,
    advisorCount: 1,
    deliverableCount: 6,
  },
  {
    projectId: 'mock-project-health-summary',
    title: '健康资料摘要与复核工具',
    averageTeamMatch: 74,
    averageContestFit: 77,
    collegeCount: 2,
    advisorCount: 2,
    deliverableCount: 6,
  },
  {
    projectId: 'mock-project-carbon-plan',
    title: '园区低碳运营预测系统',
    averageTeamMatch: 72,
    averageContestFit: 75,
    collegeCount: 3,
    advisorCount: 1,
    deliverableCount: 5,
  },
  {
    projectId: 'mock-project-knowledge-flow',
    title: '产业知识库流程导航助手',
    averageTeamMatch: 80,
    averageContestFit: 83,
    collegeCount: 2,
    advisorCount: 2,
    deliverableCount: 8,
  },
  {
    projectId: 'mock-project-vision-inspection',
    title: '设备巡检视觉识别系统',
    averageTeamMatch: 69,
    averageContestFit: 72,
    collegeCount: 2,
    advisorCount: 1,
    deliverableCount: 5,
  },
  {
    projectId: 'mock-project-risk-panel',
    title: '创新项目风险评估面板',
    averageTeamMatch: 71,
    averageContestFit: 74,
    collegeCount: 3,
    advisorCount: 2,
    deliverableCount: 6,
  },
]

const mockGapNotes = [
  '智能体和数据分析方向的选题契合度较高，适合作为近期重点推进对象。',
  '多模态设计方向具备表达优势，但需要补充更稳定的评测口径和真实用户反馈。',
  '机器人与医疗方向材料完整度偏低，建议先补齐测试记录、合规说明和异常处理。',
  '团队工程能力覆盖较好，但答辩脚本仍需要把技术链路压缩成评审可快速理解的叙事。',
  '近期行为集中在筛选和查看，导出、复盘和评审反馈事件还需要继续沉淀。',
  '项目匹配度靠前的样本已经具备冲刺基础，可优先进入作品包打磨和视频定稿。',
]

const mockDifficultyTracks: AnalyticsDifficultyTrackItem[] = [
  {
    contestId: 'mock-contest-agent-innovation',
    contestName: '校园智能体应用创新挑战赛',
    trackId: 'agent-orchestration',
    trackName: '多智能体任务编排与执行观测',
    difficultyScore: 86,
    difficultyLevel: 'advanced',
    completionRate: 58,
    sampleProjectCount: 7,
    completedProjectCount: 2,
    inProgressProjectCount: 4,
    draftProjectCount: 1,
    rubricDimensionCount: 8,
    evidenceRequirementCount: 6,
    deliverableCount: 9,
    milestoneCount: 5,
    workloadPressure: 82,
    summary: '难点集中在权限边界、执行可观测性和失败恢复，适合工程能力强的团队。',
  },
  {
    contestId: 'mock-contest-multimodal-design',
    contestName: '多模态设计生成作品赛',
    trackId: 'multimodal-prototype',
    trackName: '图文生成与交互原型闭环',
    difficultyScore: 79,
    difficultyLevel: 'advanced',
    completionRate: 64,
    sampleProjectCount: 6,
    completedProjectCount: 2,
    inProgressProjectCount: 3,
    draftProjectCount: 1,
    rubricDimensionCount: 7,
    evidenceRequirementCount: 5,
    deliverableCount: 8,
    milestoneCount: 4,
    workloadPressure: 76,
    summary: '作品表达门槛高，需要同步打磨视觉一致性、原型流畅度和评审故事线。',
  },
  {
    contestId: 'mock-contest-data-product',
    contestName: '高校数据产品实践挑战赛',
    trackId: 'metric-diagnosis',
    trackName: '业务指标诊断与建议生成',
    difficultyScore: 71,
    difficultyLevel: 'challenging',
    completionRate: 72,
    sampleProjectCount: 8,
    completedProjectCount: 3,
    inProgressProjectCount: 4,
    draftProjectCount: 1,
    rubricDimensionCount: 6,
    evidenceRequirementCount: 4,
    deliverableCount: 7,
    milestoneCount: 4,
    workloadPressure: 68,
    summary: '题目结构清晰，但数据口径、异常归因和行动建议需要一致。',
  },
  {
    contestId: 'mock-contest-robot-sim',
    contestName: '机器人控制与仿真实训赛',
    trackId: 'robot-path',
    trackName: '仓储机器人路径规划与异常恢复',
    difficultyScore: 83,
    difficultyLevel: 'advanced',
    completionRate: 49,
    sampleProjectCount: 5,
    completedProjectCount: 1,
    inProgressProjectCount: 3,
    draftProjectCount: 1,
    rubricDimensionCount: 9,
    evidenceRequirementCount: 6,
    deliverableCount: 10,
    milestoneCount: 5,
    workloadPressure: 88,
    summary: '仿真和真实设备联调压力较高，需要保留异常场景测试证据。',
  },
  {
    contestId: 'mock-contest-city-sensing',
    contestName: '城市治理感知创新赛',
    trackId: 'city-risk',
    trackName: '城市风险感知与处置建议',
    difficultyScore: 68,
    difficultyLevel: 'challenging',
    completionRate: 66,
    sampleProjectCount: 4,
    completedProjectCount: 1,
    inProgressProjectCount: 2,
    draftProjectCount: 1,
    rubricDimensionCount: 6,
    evidenceRequirementCount: 5,
    deliverableCount: 6,
    milestoneCount: 4,
    workloadPressure: 63,
    summary: '场景价值容易讲清楚，主要风险在数据合规和跨部门流程设计。',
  },
  {
    contestId: 'mock-contest-health-ai',
    contestName: '健康数据智能辅助赛',
    trackId: 'health-review',
    trackName: '医疗资料摘要与人工复核',
    difficultyScore: 81,
    difficultyLevel: 'advanced',
    completionRate: 45,
    sampleProjectCount: 3,
    completedProjectCount: 0,
    inProgressProjectCount: 2,
    draftProjectCount: 1,
    rubricDimensionCount: 8,
    evidenceRequirementCount: 8,
    deliverableCount: 7,
    milestoneCount: 5,
    workloadPressure: 84,
    summary: '合规、解释和复核链路要求高，适合先做受控场景样本。',
  },
  {
    contestId: 'mock-contest-carbon',
    contestName: '园区低碳运营预测赛',
    trackId: 'carbon-forecast',
    trackName: '能耗预测与节能策略推荐',
    difficultyScore: 62,
    difficultyLevel: 'challenging',
    completionRate: 70,
    sampleProjectCount: 5,
    completedProjectCount: 2,
    inProgressProjectCount: 2,
    draftProjectCount: 1,
    rubricDimensionCount: 5,
    evidenceRequirementCount: 4,
    deliverableCount: 6,
    milestoneCount: 3,
    workloadPressure: 59,
    summary: '难度中等，关键是保证数据来源、预测基线和收益测算可信。',
  },
  {
    contestId: 'mock-contest-knowledge-base',
    contestName: '产业知识库应用实践赛',
    trackId: 'knowledge-flow',
    trackName: '知识库检索增强与流程导航',
    difficultyScore: 73,
    difficultyLevel: 'challenging',
    completionRate: 67,
    sampleProjectCount: 6,
    completedProjectCount: 2,
    inProgressProjectCount: 3,
    draftProjectCount: 1,
    rubricDimensionCount: 7,
    evidenceRequirementCount: 5,
    deliverableCount: 7,
    milestoneCount: 4,
    workloadPressure: 71,
    summary: '检索效果之外，还需要说明知识更新、权限控制和业务流程嵌入。',
  },
  {
    contestId: 'mock-contest-vision-inspection',
    contestName: '设备巡检视觉识别赛',
    trackId: 'vision-inspection',
    trackName: '设备异常识别与巡检报告生成',
    difficultyScore: 67,
    difficultyLevel: 'challenging',
    completionRate: 63,
    sampleProjectCount: 4,
    completedProjectCount: 1,
    inProgressProjectCount: 2,
    draftProjectCount: 1,
    rubricDimensionCount: 6,
    evidenceRequirementCount: 5,
    deliverableCount: 6,
    milestoneCount: 4,
    workloadPressure: 66,
    summary: '模型评测和失败样例分析决定上限，需要补齐现场可用性说明。',
  },
  {
    contestId: 'mock-contest-risk-panel',
    contestName: '创新项目风险评估赛',
    trackId: 'risk-dashboard',
    trackName: '项目风险预测与复盘看板',
    difficultyScore: 56,
    difficultyLevel: 'balanced',
    completionRate: 78,
    sampleProjectCount: 7,
    completedProjectCount: 3,
    inProgressProjectCount: 3,
    draftProjectCount: 1,
    rubricDimensionCount: 5,
    evidenceRequirementCount: 3,
    deliverableCount: 5,
    milestoneCount: 3,
    workloadPressure: 52,
    summary: '适合快速形成可演示版本，后续重点是提升预测解释和复盘动作质量。',
  },
]

const mockStatusStats: AnalyticsDifficultyStatusStat[] = [
  {
    status: 'draft',
    label: '草稿',
    count: 6,
  },
  {
    status: 'in_progress',
    label: '进行中',
    count: 15,
  },
  {
    status: 'completed',
    label: '已完成',
    count: 7,
  },
]

const mockBottlenecks: AnalyticsDifficultyBottleneckItem[] = [
  {
    id: 'rubric-proof',
    label: '评审证据不足',
    severity: 'high',
    affectedProjectCount: 9,
    description: '多个项目有演示结果但缺少测试记录、评分矩阵和失败样例说明。',
  },
  {
    id: 'deployment-risk',
    label: '部署复现风险',
    severity: 'high',
    affectedProjectCount: 7,
    description: '部分作品依赖本地环境或手工流程，现场演示稳定性仍需验证。',
  },
  {
    id: 'data-policy',
    label: '数据合规说明薄弱',
    severity: 'medium',
    affectedProjectCount: 6,
    description: '医疗、治理和视觉方向需要更清楚的数据来源、脱敏与授权说明。',
  },
  {
    id: 'storyline',
    label: '答辩主线分散',
    severity: 'medium',
    affectedProjectCount: 5,
    description: '技术模块较多但价值表达不够集中，建议统一成问题、方案、证据和收益。',
  },
  {
    id: 'baseline',
    label: '缺少基线对比',
    severity: 'medium',
    affectedProjectCount: 4,
    description: '模型类作品需要补充传统方法、开源方案或人工流程的对照结果。',
  },
  {
    id: 'team-rhythm',
    label: '团队节奏未对齐',
    severity: 'low',
    affectedProjectCount: 3,
    description: '任务拆解已完成，但资料归档和最终彩排的负责人仍需明确。',
  },
]

const mockStageStats: AnalyticsPreparationStageStat[] = [
  {
    phase: 'registration',
    count: 3,
  },
  {
    phase: 'kickoff',
    count: 4,
  },
  {
    phase: 'review',
    count: 8,
  },
  {
    phase: 'submission',
    count: 6,
  },
  {
    phase: 'preliminary',
    count: 4,
  },
  {
    phase: 'semifinal',
    count: 2,
  },
  {
    phase: 'final',
    count: 1,
  },
]

const mockUpcomingContests: AnalyticsUpcomingContestItem[] = [
  {
    contestId: 'mock-contest-agent-innovation',
    contestName: '校园智能体应用创新挑战赛',
    stage: '作品包提交',
    deadlineText: '2026/05/08 18:00',
    intensity: 'high',
  },
  {
    contestId: 'mock-contest-data-product',
    contestName: '高校数据产品实践挑战赛',
    stage: '题目说明会',
    deadlineText: '2026/05/10 09:30',
    intensity: 'medium',
  },
  {
    contestId: 'mock-contest-multimodal-design',
    contestName: '多模态设计生成作品赛',
    stage: '初赛提交',
    deadlineText: '2026/05/15 20:00',
    intensity: 'high',
  },
  {
    contestId: 'mock-contest-city-sensing',
    contestName: '城市治理感知创新赛',
    stage: '复赛演练',
    deadlineText: '2026/05/28 13:30',
    intensity: 'medium',
  },
  {
    contestId: 'mock-contest-health-ai',
    contestName: '健康数据智能辅助赛',
    stage: '资料复核',
    deadlineText: '2026/06/02 17:00',
    intensity: 'medium',
  },
  {
    contestId: 'mock-contest-knowledge-base',
    contestName: '产业知识库应用实践赛',
    stage: '报名确认',
    deadlineText: '2026/06/18 12:00',
    intensity: 'medium',
  },
  {
    contestId: 'mock-contest-carbon',
    contestName: '园区低碳运营预测赛',
    stage: '初稿提交',
    deadlineText: '2026/06/22 19:00',
    intensity: 'low',
  },
  {
    contestId: 'mock-contest-vision-inspection',
    contestName: '设备巡检视觉识别赛',
    stage: '赛题发布',
    deadlineText: '2026/06/25 10:00',
    intensity: 'low',
  },
]

function cloneFilters(filters: AnalyticsResolvedFilters): AnalyticsResolvedFilters {
  return { ...filters }
}

function resolveLastUpdatedAt(lastUpdatedAt: string): string {
  return lastUpdatedAt || MOCK_LAST_UPDATED_AT
}

function cloneItems<T>(items: T[]): T[] {
  return items.map(item => ({ ...item }))
}

function cloneTrendContests(items: AnalyticsTrendContestItem[]): AnalyticsTrendContestItem[] {
  return items.map(item => ({
    ...item,
    topKeywords: [...item.topKeywords],
  }))
}

function parseMetricValue(value: string): number {
  const parsed = Number.parseFloat(String(value || '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveOverviewEventCount(payload: Pick<AnalyticsOverviewPayload, 'metricCards'>): number {
  const eventMetric = payload.metricCards.find((item) => {
    return item.id === 'events' || /行为|事件/.test(item.label)
  })
  return eventMetric ? parseMetricValue(eventMetric.value) : 0
}

function createBaseFilters(filters: AnalyticsFilterInput | AnalyticsResolvedFilters): AnalyticsResolvedFilters {
  return {
    workspaceId: String(filters.workspaceId || ''),
    projectId: String(filters.projectId || ''),
    contestId: String(filters.contestId || ''),
    rangePreset: filters.rangePreset || '90d',
  }
}

export function createMockAnalyticsFilters(filters: AnalyticsFilterInput = {}): AnalyticsResolvedFilters {
  return createBaseFilters(filters)
}

export function shouldUseAnalyticsOverviewMockup(payload: AnalyticsOverviewPayload): boolean {
  return payload.trendSeries.points.length < 4
    || payload.capabilityRadar.length < 5
    || payload.awardFeatureTags.length < 6
    || resolveOverviewEventCount(payload) === 0
}

export function applyAnalyticsOverviewMockupFallback(payload: AnalyticsOverviewPayload): AnalyticsOverviewPayload {
  if (!shouldUseAnalyticsOverviewMockup(payload))
    return payload

  const filters = cloneFilters(payload.filters)
  return {
    filters,
    scopeSummary: '当前聚合 196 个竞赛趋势样本、28 个可见项目与 8421 条行为事件，适合做选题、备赛和作品打磨判断。',
    metricCards: cloneItems(mockMetricCards),
    trendSeries: {
      title: payload.trendSeries.title || '竞赛热度与趋势',
      summary: '智能体编排、多模态设计生成和低代码数据分析是近窗口最活跃方向。',
      points: cloneItems(mockTrendPoints.slice(0, 8)),
    },
    awardFeatureTags: cloneItems(mockAwardFeatureTags.slice(0, 10)),
    capabilityRadar: cloneItems(mockCapabilityRadar),
    preparationTimeline: cloneItems(mockPreparationTimeline.slice(0, 12)),
    dataGaps: cloneItems(mockDataGaps),
    lastUpdatedAt: resolveLastUpdatedAt(payload.lastUpdatedAt),
  }
}

export function shouldUseAnalyticsTrendMockup(payload: AnalyticsTrendAnalysisPayload): boolean {
  return payload.keywordSeries.points.length < 4 || payload.contests.length < 4
}

export function applyAnalyticsTrendMockupFallback(payload: AnalyticsTrendAnalysisPayload): AnalyticsTrendAnalysisPayload {
  if (!shouldUseAnalyticsTrendMockup(payload))
    return payload

  return {
    filters: cloneFilters(payload.filters),
    summary: '当前趋势最强的方向集中在 AI 智能体编排、多模态设计生成、低代码数据分析和机器人仿真。',
    keywordSeries: {
      title: payload.keywordSeries.title || '竞赛热度与趋势',
      summary: '近窗口热度由选题筛选、作品查看、资料解析和答辩复盘共同推动。',
      points: cloneItems(mockTrendPoints),
    },
    contests: cloneTrendContests(mockTrendContests),
    dataGaps: cloneItems(mockDataGaps),
    lastUpdatedAt: resolveLastUpdatedAt(payload.lastUpdatedAt),
  }
}

export function shouldUseAnalyticsAwardMockup(payload: AnalyticsAwardFeatureAnalysisPayload): boolean {
  return payload.featureTags.length < 6 || payload.samples.length < 4
}

export function applyAnalyticsAwardMockupFallback(payload: AnalyticsAwardFeatureAnalysisPayload): AnalyticsAwardFeatureAnalysisPayload {
  if (!shouldUseAnalyticsAwardMockup(payload))
    return payload

  return {
    filters: cloneFilters(payload.filters),
    summary: '当前高频获奖特征集中在证据链完整、场景问题清晰、交互闭环可跑和指标口径稳定。',
    featureTags: cloneItems(mockAwardFeatureTags),
    samples: cloneItems(mockAwardSamples),
    dataGaps: cloneItems(mockDataGaps),
    lastUpdatedAt: resolveLastUpdatedAt(payload.lastUpdatedAt),
  }
}

export function shouldUseAnalyticsProfileMockup(payload: AnalyticsCapabilityProfilePayload): boolean {
  return payload.radar.length < 5 || payload.projects.length < 4
}

export function applyAnalyticsProfileMockupFallback(payload: AnalyticsCapabilityProfilePayload): AnalyticsCapabilityProfilePayload {
  if (!shouldUseAnalyticsProfileMockup(payload))
    return payload

  return {
    filters: cloneFilters(payload.filters),
    summary: '当前匹配度较高的项目包括智能申报材料助手、多模态设计生成工作台和经营指标诊断看板。',
    radar: cloneItems(mockCapabilityRadar),
    gapNotes: [...mockGapNotes],
    projects: cloneItems(mockCapabilityProjects),
    dataGaps: cloneItems(mockDataGaps),
    lastUpdatedAt: resolveLastUpdatedAt(payload.lastUpdatedAt),
  }
}

export function shouldUseAnalyticsDifficultyMockup(payload: AnalyticsDifficultyCompletionPayload): boolean {
  return payload.tracks.length < 4 || payload.statusStats.length < 3 || payload.bottlenecks.length < 3
}

export function applyAnalyticsDifficultyMockupFallback(payload: AnalyticsDifficultyCompletionPayload): AnalyticsDifficultyCompletionPayload {
  if (!shouldUseAnalyticsDifficultyMockup(payload))
    return payload

  return {
    filters: cloneFilters(payload.filters),
    summary: '当前题目难度主要集中在智能体编排、机器人仿真和医疗资料复核方向，完成率受部署复现和评审证据影响明显。',
    tracks: cloneItems(mockDifficultyTracks),
    statusStats: cloneItems(mockStatusStats),
    bottlenecks: cloneItems(mockBottlenecks),
    dataGaps: cloneItems(mockDataGaps),
    lastUpdatedAt: resolveLastUpdatedAt(payload.lastUpdatedAt),
  }
}

export function shouldUseAnalyticsPreparationMockup(payload: AnalyticsPreparationCadencePayload): boolean {
  return payload.timeline.length < 6 || payload.stageStats.length < 4 || payload.upcomingContests.length < 4
}

export function applyAnalyticsPreparationMockupFallback(payload: AnalyticsPreparationCadencePayload): AnalyticsPreparationCadencePayload {
  if (!shouldUseAnalyticsPreparationMockup(payload))
    return payload

  return {
    filters: cloneFilters(payload.filters),
    summary: '当前备赛节奏集中在材料评审、作品提交、初赛答辩和复赛演练，近两周需要优先处理高强度节点。',
    timeline: cloneItems(mockPreparationTimeline),
    stageStats: cloneItems(mockStageStats),
    upcomingContests: cloneItems(mockUpcomingContests),
    dataGaps: cloneItems(mockDataGaps),
    lastUpdatedAt: resolveLastUpdatedAt(payload.lastUpdatedAt),
  }
}
