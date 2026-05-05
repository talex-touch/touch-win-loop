<script setup lang="ts">
import type { AiChatSession, ChatMessage } from '~~/shared/types/domain'
import { resolveWorkspaceStreamSystemMessageView } from '~~/shared/utils/workspace-ai-stream'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: '对话',
})

const loading = ref(false)
const errorText = ref('')
const messageScrollRef = ref<HTMLDivElement | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const attachmentInputRef = ref<HTMLInputElement | null>(null)

type ComposerQuickActionId = 'attachment' | 'knowledge' | 'command'
type ComposerPanelId = 'knowledge' | 'command' | 'speed' | ''
type ResourceSearchScope = 'platform' | 'project'
type AiSpeedId = 'fast' | 'balanced' | 'deep'

interface LoopyMockProject {
  id: string
  title: string
}

interface LoopyMockResource {
  id: string
  title: string
  type: string
  year: number
  category?: string
  summary: string
}

interface LoopyMockSession extends AiChatSession {
  preview: string
  tag: string
}

interface LoopySelectedResourceContext {
  id: string
  title: string
  scope: ResourceSearchScope
  projectId: string
}

const activeComposerPanel = ref<ComposerPanelId>('')
const selectedLoopyProjectId = ref('')
const selectedResourceContext = ref<LoopySelectedResourceContext | null>(null)
const projectsLoading = ref(false)
const resourcesLoading = ref(false)
const resourceErrorText = ref('')
const resourceSearchScope = ref<ResourceSearchScope>('platform')
const resourceSearchQuery = ref('')
const selectedAiSpeed = ref<AiSpeedId>('fast')

const MOCK_WORKSPACE_ID = 'mock-workspace-loopy'
const MOCK_USER_ID = 'mock-user-admin'
const MOCK_PROJECTS: LoopyMockProject[] = [
  { id: 'mock-project-touchwin', title: 'Touch Win Loop 竞赛平台' },
  { id: 'mock-project-defense', title: '答辩实时智能体' },
  { id: 'mock-project-material', title: '送审材料自动化' },
  { id: 'mock-project-green-campus', title: '低碳校园能耗助手' },
  { id: 'mock-project-eldercare', title: '社区养老陪诊小程序' },
]

const MOCK_PLATFORM_RESOURCES: LoopyMockResource[] = [
  {
    id: 'mock-platform-rubric-2026',
    title: '2026 互联网+ 评分细则与答辩要求',
    type: '评分规则',
    year: 2026,
    category: 'scoring',
    summary: '强调创新性、商业价值、团队执行和现场答辩的一致性。',
  },
  {
    id: 'mock-platform-template-brief',
    title: '商业计划书终版模板',
    type: '模板资料',
    year: 2026,
    category: 'templates',
    summary: '适合终审前统一问题定义、市场规模、技术路径和落地指标。',
  },
  {
    id: 'mock-platform-defense-faq',
    title: '评委高频追问清单',
    type: 'FAQ',
    year: 2025,
    category: 'past_questions',
    summary: '覆盖可替代性、获客成本、数据真实性、合规风险和团队分工。',
  },
  {
    id: 'mock-platform-challenge-match',
    title: '挑战杯省赛申报指南',
    type: '赛事指南',
    year: 2026,
    category: 'judge_guidelines',
    summary: '更看重社会价值、调研深度、实践过程和成果可持续性。',
  },
  {
    id: 'mock-platform-aigc-track',
    title: 'AIGC 应用创新专项赛道说明',
    type: '赛道说明',
    year: 2026,
    category: 'track_details',
    summary: '适合围绕智能体、知识库、自动化流程和行业应用落地的项目。',
  },
]

const MOCK_PROJECT_RESOURCES: LoopyMockResource[] = [
  {
    id: 'mock-project-resource-roadshow',
    title: '路演稿 v7 终审版',
    type: '项目文档',
    year: 2026,
    category: 'submission_examples',
    summary: '包含问题背景、方案机制、关键指标、落地案例和答辩备用页。',
  },
  {
    id: 'mock-project-resource-metrics',
    title: '三轮试点数据与指标口径',
    type: '数据表',
    year: 2026,
    category: 'basic_info',
    summary: '记录用户留存、资料命中率、答辩准备时间和人工复核节省量。',
  },
  {
    id: 'mock-project-resource-risk',
    title: '合规与数据边界说明',
    type: '风险说明',
    year: 2026,
    category: 'compliance',
    summary: '说明权限、日志脱敏、资料来源和生产调用边界。',
  },
  {
    id: 'mock-project-resource-user-profile',
    title: '用户画像与团队能力记录',
    type: '调研记录',
    year: 2026,
    category: 'basic_info',
    summary: '记录团队成员角色、技术栈、项目经验、赛事偏好和可投入时间。',
  },
  {
    id: 'mock-project-resource-contest-fit',
    title: '项目-赛事契合度评估表',
    type: '评估表',
    year: 2026,
    category: 'scoring',
    summary: '按创新性、可落地、证据完整度、答辩优势和材料成本打分。',
  },
]

const projects = ref<LoopyMockProject[]>(MOCK_PROJECTS)
const platformResourceResults = ref<LoopyMockResource[]>(MOCK_PLATFORM_RESOURCES)
const projectResourceResults = ref<LoopyMockResource[]>(MOCK_PROJECT_RESOURCES)
selectedLoopyProjectId.value = MOCK_PROJECTS[0]?.id || ''

const suggestionPrompts = [
  {
    prompt: '帮我梳理当前工作空间里最值得优先关注的事项。',
    icon: 'edit_square',
  },
  {
    prompt: '模拟当前用户角色，帮我推荐最适合参与的比赛。',
    icon: 'open_in_new',
  },
  {
    prompt: '帮我分析 Touch Win Loop 和 AIGC 专项赛道的契合度。',
    icon: 'ink_pen',
  },
  {
    prompt: '推荐一个项目选择一个比赛，并说明需要补哪些资料。',
    icon: 'frame_inspect',
  },
]

const aiSpeedOptions: Array<{
  id: AiSpeedId
  label: string
  description: string
  temperature: number
}> = [
  {
    id: 'fast',
    label: '快速',
    description: '回答更直接，适合快速确认。',
    temperature: 0.2,
  },
  {
    id: 'balanced',
    label: '均衡',
    description: '兼顾结构和发散。',
    temperature: 0.35,
  },
  {
    id: 'deep',
    label: '深入',
    description: '更偏分析和方案展开。',
    temperature: 0.5,
  },
]

const commandItems = [
  {
    id: 'workspace-brief',
    label: '工作空间简报',
    description: '汇总当前空间最重要的问题和下一步。',
    prompt: '请基于当前工作空间，输出一份简洁的推进简报，包含重点事项、风险和下一步。',
  },
  {
    id: 'project-plan',
    label: '比赛推荐',
    description: '基于用户角色和项目状态推荐比赛。',
    prompt: '请模拟当前用户角色，推荐最适合报名的比赛，并说明推荐理由、风险和资料准备清单。',
  },
  {
    id: 'resource-scan',
    label: '契合度分析',
    description: '分析项目、比赛和资料的匹配程度。',
    prompt: '请分析当前项目与目标比赛的契合度，给出分数、理由、资料缺口和下一步动作。',
  },
  {
    id: 'question-list',
    label: '追问清单',
    description: '生成接下来该问 Loopy 的问题。',
    prompt: '请根据当前上下文生成一组高价值追问，按信息增益从高到低排序。',
  },
] as const

function formatSessionTitle(title: string | null | undefined): string {
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle)
    return '新对话'

  const trimmedTitle = normalizedTitle.replace(/^Loopy[\s\-_:：·]*/i, '').trim()
  if (!trimmedTitle || trimmedTitle === '对话')
    return '新对话'
  return trimmedTitle
}

function buildDialogTitlePreview(content: string | null | undefined): string {
  const compact = String(content || '').replace(/\s+/g, ' ').trim()
  if (!compact)
    return ''
  if (compact.length <= 16)
    return compact
  return `${compact.slice(0, 16)}…`
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function formatSessionClock(value: string | null | undefined): string {
  if (!value)
    return '--'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '--'

  if (isSameDay(date, new Date())) {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function formatSessionDate(value: string | null | undefined): string {
  if (!value)
    return '刚刚'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '刚刚'

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function formatSessionMeta(session: { messageCount: number, lastMessageAt: string | null, updatedAt: string }): string {
  return `${session.messageCount} 条消息 · ${formatSessionDate(session.lastMessageAt || session.updatedAt)}`
}

function formatMessageContent(message: { role: string, content: string }): string {
  const normalizedContent = String(message.content || '')
  if (message.role !== 'assistant')
    return normalizedContent

  if (normalizedContent === '我是 Loopy。当前没有可用工作区，暂时无法开始对话。')
    return '当前没有可用工作区，暂时无法开始对话。'
  if (normalizedContent === '我是 Loopy。当前工作空间已配备 AI 能力，你可以随时问我项目、赛事、资料和协作问题。')
    return '当前工作空间已接入 AI 能力，你可以随时询问项目、赛事、资料和协作问题。'
  return normalizedContent
}

function buildRenderedMessage(message: { role: 'system' | 'assistant' | 'user', content: string, metadata?: Record<string, unknown> }) {
  return {
    ...message,
    content: formatMessageContent(message),
  }
}

function resolveLoopySystemMessageIcon(message: { role: 'system' | 'assistant' | 'user', content: string, metadata?: Record<string, unknown> }): string {
  const view = resolveWorkspaceStreamSystemMessageView(message)
  if (!view)
    return 'info'
  return view.eventType === 'tool' ? 'terminal' : 'progress_activity'
}

const mockKnowledgeMetadata = {
  knowledge: {
    citations: [
      {
        sourceId: 'mock-source-roadshow',
        sourceResourceId: 'mock-project-resource-roadshow',
        chunkId: 'roadshow-p7-priority',
        resourceTitle: '路演稿 v7 终审版',
        label: '终审版路演稿',
        sourceScope: 'project_resource',
        modality: 'text',
        projectionType: 'document_text',
        page: 7,
        section: '关键证据与亮点',
        quote: '资料命中、答辩准备和人工复核时间是当前最能打动评委的三组指标。',
      },
      {
        sourceId: 'mock-source-rubric',
        sourceResourceId: 'mock-platform-rubric-2026',
        chunkId: 'rubric-defense-fit',
        resourceTitle: '2026 互联网+ 评分细则与答辩要求',
        label: '评分细则',
        sourceScope: 'platform_resource',
        modality: 'text',
        projectionType: 'document_text',
        page: 3,
        section: '终审评价维度',
        quote: '终审更关注证据闭环、可落地路径和团队对关键风险的掌控。',
      },
    ],
    retrievalPlan: {
      intent: 'evidence_trace',
      queryVariants: ['终审优先事项', '答辩证据链', '项目资料缺口'],
      preferredModalities: ['text'],
      preferredProjectionTypes: ['document_text'],
      preferredEmbeddingStatuses: ['ready'],
      relationTypes: ['supports', 'mentions'],
      retrievalBudget: 6,
      plannerSource: 'heuristic',
      reasoning: '固定展示真实引用面板结构，方便验证 Loopy 页面视觉与交互。',
    },
    evidencePaths: [
      {
        id: 'mock-path-1',
        relationType: 'supports',
        sourceNodeType: 'resource',
        sourceNodeId: 'mock-project-resource-roadshow',
        sourceLabel: '路演稿 v7 终审版',
        targetNodeType: 'topic',
        targetNodeId: 'priority',
        targetLabel: '优先事项',
        score: 0.91,
        evidenceMetric: 'mock-confidence',
        evidenceModel: 'loopy-mock',
        citationChunkId: 'roadshow-p7-priority',
        summary: '路演稿中的终审亮点可直接转成左侧会话和右侧回答的真实感证据。',
      },
    ],
  },
}

function createLoopyProgressMessage(seq: number, message: string): ChatMessage {
  return {
    role: 'system',
    content: `进度：${message}`,
    metadata: {
      eventType: 'progress',
      seq,
    },
  }
}

function createLoopyToolMessage(seq: number, toolName: string, payloadSummary: string): ChatMessage {
  return {
    role: 'system',
    content: `工具：${toolName} · ${payloadSummary}`,
    metadata: {
      eventType: 'tool',
      seq,
      toolName,
      payloadSummary,
    },
  }
}

function buildLoopyProcessMessages(content: string, startSeq = 1): ChatMessage[] {
  if (/项目.*比赛|比赛.*项目|选择.*比赛|冲奖|组合/.test(content)) {
    return [
      createLoopyProgressMessage(startSeq, '正在拆解项目候选池与比赛目标，优先按冲奖概率排序。'),
      createLoopyToolMessage(startSeq + 1, '检索赛事库', '收集到 3 个候选方向：AIGC 应用创新专项赛道、挑战杯应用实践方向、互联网+ 主赛道。'),
      createLoopyToolMessage(startSeq + 2, '读取项目资料', '收集到 5 份资料：路演稿 v7、三轮试点数据、用户画像、契合度评估表、合规边界说明。'),
      createLoopyProgressMessage(startSeq + 3, '正在合并项目证据、赛道评分项和材料准备成本。'),
    ]
  }

  if (/契合|匹配|分数|赛道/.test(content)) {
    return [
      createLoopyProgressMessage(startSeq, '正在分析目标赛道评分维度与项目能力映射。'),
      createLoopyToolMessage(startSeq + 1, '检索评分细则', '命中创新性、技术实现、应用价值、可推广性、材料完整度 5 个评价维度。'),
      createLoopyToolMessage(startSeq + 2, '检索项目资料', '收集到路演稿 v7、指标口径表、项目-赛事契合度评估表。'),
      createLoopyProgressMessage(startSeq + 3, '正在生成契合度分数、扣分点和资料缺口。'),
    ]
  }

  if (/角色|适合|推荐.*比赛|报名|参赛/.test(content)) {
    return [
      createLoopyProgressMessage(startSeq, '正在分析用户角色：年级、专业、团队结构、技术优势和材料短板。'),
      createLoopyToolMessage(startSeq + 1, '检索赛事库', '收集到 AIGC 专项、互联网+、挑战杯 3 类可报名比赛。'),
      createLoopyToolMessage(startSeq + 2, '读取团队资料', '收集到用户画像、团队能力记录、可投入时间、已有项目资产。'),
      createLoopyProgressMessage(startSeq + 3, '正在按拿奖概率、准备成本和材料缺口重新排序。'),
    ]
  }

  if (/追问|评委|风险|补齐/.test(content)) {
    return [
      createLoopyProgressMessage(startSeq, '正在从评委视角扫描可追问风险。'),
      createLoopyToolMessage(startSeq + 1, '检索追问库', '收集到 12 条高频追问，覆盖数据真实性、竞品替代、落地成本、合规边界。'),
      createLoopyToolMessage(startSeq + 2, '读取答辩资料', '收集到路演稿、答辩备用页、试点数据说明。'),
      createLoopyProgressMessage(startSeq + 3, '正在压缩成现场可回答的短句。'),
    ]
  }

  if (/资料|引用|文档|评估表/.test(content)) {
    return [
      createLoopyProgressMessage(startSeq, '正在识别资料类型与可引用片段。'),
      createLoopyToolMessage(startSeq + 1, '检索资料库', '收集到路演稿 v7、商业计划书模板、项目-赛事契合度评估表。'),
      createLoopyToolMessage(startSeq + 2, '抽取证据片段', '提取到 8 个可引用片段，其中 3 个适合放入答辩备用页。'),
      createLoopyProgressMessage(startSeq + 3, '正在整理资料缺口和下一步补齐动作。'),
    ]
  }

  return [
    createLoopyProgressMessage(startSeq, '正在分析提问意图与当前工作空间上下文。'),
    createLoopyToolMessage(startSeq + 1, '检索工作空间', '收集到项目概况、已关联资料、最近会话和待补事项。'),
    createLoopyProgressMessage(startSeq + 2, '正在生成可执行建议。'),
  ]
}

const mockSessionMessages = ref<Record<string, ChatMessage[]>>({
  'mock-session-role-fit': [
    {
      role: 'user',
      content: '模拟当前用户角色：我是大三软件工程学生，团队 4 人，有 AI 工具开发经验，但商业材料偏弱。先帮我判断适合参加什么比赛。',
    },
    ...buildLoopyProcessMessages('模拟当前用户角色，推荐适合报名的比赛', 1),
    {
      role: 'assistant',
      content: [
        '按这个角色画像，我会优先推荐 **AIGC 应用创新专项赛道**，其次是 **互联网+ 校赛 / 省赛预选**。',
        '',
        '| 维度 | 判断 | 说明 |',
        '| --- | --- | --- |',
        '| 技术能力 | 高 | 已有 AI 工具开发经验，能解释智能体、知识索引和工作流。 |',
        '| 商业材料 | 中低 | 需要补市场、付费场景、获客成本和竞品替代。 |',
        '| 证据基础 | 中 | 如果有真实演示、试点数据和用户访谈，就能支撑路演。 |',
        '| 时间成本 | 可控 | AIGC 专项材料更聚焦产品机制，商业计划书压力略小。 |',
        '',
        '推荐路径：先用 AIGC 专项赛道验证技术叙事，再把材料扩展到互联网+。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '如果这个用户更想拿奖，不是只想参赛，应该怎么选？',
    },
    ...buildLoopyProcessMessages('按拿奖概率重新推荐比赛', 5),
    {
      role: 'assistant',
      content: [
        '以“拿奖概率”为目标，我会这样排序：',
        '',
        '1. **AIGC 应用创新专项赛道**：匹配度 88/100。技术优势明显，材料可以围绕 Loopy 的真实演示展开。',
        '2. **挑战杯省赛应用实践方向**：匹配度 76/100。需要补社会调研和实践过程，准备成本更高。',
        '3. **互联网+ 主赛道**：匹配度 72/100。舞台更大，但商业模型、增长数据和落地订单会被问得更细。',
        '',
        '如果当前用户只有 2 周准备期，先选 AIGC；如果有 6 周以上，并且能补用户访谈和试点证明，再冲互联网+。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-contest-match': [
    {
      role: 'user',
      content: '帮我分析 Touch Win Loop 竞赛平台和 AIGC 应用创新专项赛道的契合度。',
    },
    ...buildLoopyProcessMessages('分析 Touch Win Loop 和 AIGC 赛道契合度', 1),
    {
      role: 'assistant',
      content: [
        '综合契合度：**86 / 100**。',
        '',
        '高匹配点：',
        '',
        '- **应用场景明确**：面向高校竞赛团队，不是泛泛的 AI 助手。',
        '- **AI 能力可展示**：Loopy 对话、资料索引、答辩模拟、工作流都能形成现场演示。',
        '- **落地路径短**：可以用项目工作台和资料中心作为完整闭环。',
        '',
        '扣分点：',
        '',
        '- 商业化证据不足，需要补“团队愿不愿付费、学校是否采购、服务成本多少”。',
        '- 竞品对比要更锋利，尤其要说清楚和通用知识库、飞书文档、ChatGPT 项目助手的差异。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '这个分析能不能更像评审表，给我按维度打分？',
    },
    ...buildLoopyProcessMessages('按评分维度生成契合度分数', 5),
    {
      role: 'assistant',
      content: [
        '| 维度 | 分数 | 评语 |',
        '| --- | ---: | --- |',
        '| 创新性 | 18/20 | 不是单点问答，而是把资料、流程和答辩串成作战系统。 |',
        '| 技术实现 | 17/20 | 有会话、引用、语义索引和工作流基础，现场可演示。 |',
        '| 应用价值 | 16/20 | 竞赛团队刚需明确，但需要更多真实团队使用证据。 |',
        '| 可推广性 | 15/20 | 可复制到不同赛事，需解释配置成本和资料治理。 |',
        '| 材料完整度 | 12/20 | 路演稿有基础，商业、调研、指标口径仍需补强。 |',
        '',
        '结论：适合报名，但送审前必须补“试点数据 + 用户访谈 + 竞品差异”三件套。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '优先补哪份资料？',
    },
    ...buildLoopyProcessMessages('检索资料缺口并推荐优先补齐资料', 9),
    {
      role: 'assistant',
      content: '优先补「项目-赛事契合度评估表」。它能把项目亮点、评分维度和缺口绑定起来，后续路演稿、答辩稿、商业计划书都能复用这份判断。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-project-picker': [
    {
      role: 'user',
      content: '请模拟用户推荐某个项目选择某一个比赛：从 Touch Win Loop、低碳校园能耗助手、社区养老陪诊小程序里选一个最适合冲奖的组合。',
    },
    ...buildLoopyProcessMessages('从多个项目里选择一个比赛组合', 1),
    {
      role: 'assistant',
      content: [
        '我会推荐：**Touch Win Loop 竞赛平台 -> AIGC 应用创新专项赛道**。',
        '',
        '原因：',
        '',
        '1. **项目和赛道主题直接对齐**：AIGC 应用、知识检索、智能工作流、答辩助手都能讲成一个系统能力。',
        '2. **演示确定性最高**：相比低碳和养老项目，Touch Win Loop 可以直接在现场展示页面、资料引用和连续对话。',
        '3. **材料复用率高**：现有路演稿、指标表、合规说明都能服务这个赛道。',
        '',
        '备选：社区养老陪诊小程序更适合挑战杯社会价值方向，但需要大量真实调研和服务过程证据。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '如果用户更擅长运营和调研，不擅长技术讲解呢？',
    },
    ...buildLoopyProcessMessages('按运营调研型用户重新匹配项目和比赛', 5),
    {
      role: 'assistant',
      content: [
        '那推荐会变成：**社区养老陪诊小程序 -> 挑战杯省赛应用实践方向**。',
        '',
        '判断逻辑：',
        '',
        '- 运营/调研型用户更容易讲清楚真实需求、服务流程和社会价值。',
        '- 挑战杯更吃调研质量、实践过程和可持续性。',
        '- 技术复杂度可以降低，重点讲服务网络、志愿者管理和老人体验改善。',
        '',
        '但要提醒用户：必须补至少 8-12 份访谈记录、服务流程照片、合作机构证明，否则会显得像概念项目。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-priority': [
    {
      role: 'user',
      content: '帮我梳理当前工作空间里最值得优先关注的事项。',
    },
    ...buildLoopyProcessMessages('梳理当前工作空间优先事项', 1),
    {
      role: 'assistant',
      content: [
        '当前最值得优先关注三件事：',
        '',
        '1. **终审材料一致性**：路演稿、商业计划书、指标表里的数字要保持同一口径，尤其是试点用户数、资料命中率和节省时长。',
        '2. **证据链补齐**：把“智能工作流节省人工复核时间”对应到可展示截图、日志和样例任务，避免只停留在描述。',
        '3. **答辩追问预案**：提前准备数据来源、合规边界、竞品差异和落地成本四类追问。',
        '',
        '建议今天先处理第 1 项，因为它会影响所有送审物料的可信度。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '那我今天只做 90 分钟，怎么安排？',
    },
    ...buildLoopyProcessMessages('把优先事项压缩成 90 分钟执行计划', 5),
    {
      role: 'assistant',
      content: [
        '90 分钟建议这样拆：',
        '',
        '- 0-25 分钟：核对路演稿、指标表、答辩稿里的核心数字。',
        '- 25-55 分钟：补 3 张证据截图，分别对应资料引用、工作流执行、答辩模拟。',
        '- 55-80 分钟：写 6 个评委追问的短答案。',
        '- 80-90 分钟：把缺口同步到项目台，标记负责人。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-defense': [
    {
      role: 'user',
      content: '从评委视角看，哪些问题最需要先补齐？',
    },
    ...buildLoopyProcessMessages('从评委视角扫描风险和补齐项', 1),
    {
      role: 'assistant',
      content: [
        '从评委视角，最容易被追问的是这几类：',
        '',
        '- **数据真实性**：三轮试点分别来自哪里，样本量、周期和异常值怎么处理。',
        '- **替代方案**：为什么不是普通知识库、流程工具或人工项目管理就能解决。',
        '- **规模化成本**：接入新团队、新比赛、新资料库时，人工配置量是多少。',
        '- **风险边界**：AI 建议什么时候只读，什么时候进入待审批变更。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '帮我模拟一个尖锐追问。',
    },
    ...buildLoopyProcessMessages('检索高频追问并生成尖锐版本', 5),
    {
      role: 'assistant',
      content: '尖锐追问：你们这个系统看起来像“知识库 + ChatGPT + 项目管理模板”，为什么学校或团队要单独使用你们，而不是直接用现有工具组合？',
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '给一个 30 秒回答。',
    },
    ...buildLoopyProcessMessages('把追问压缩成 30 秒回答', 8),
    {
      role: 'assistant',
      content: '30 秒回答：现有工具能分别解决资料存储、问答或任务管理，但竞赛团队真正痛的是“评分要求、项目材料、答辩追问和执行动作”彼此断开。Touch Win Loop 把资料引用、项目进度、智能工作流和答辩模拟放在同一个上下文里，Loopy 的建议可以追溯到具体资料和项目状态，因此不是泛问答，而是面向竞赛交付的闭环工作台。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-material': [
    {
      role: 'user',
      content: '@项目资料「路演稿 v7 终审版」请提炼一份检查清单。',
    },
    ...buildLoopyProcessMessages('读取路演稿资料并提炼检查清单', 1),
    {
      role: 'assistant',
      content: [
        '检查清单如下：',
        '',
        '1. 首页是否明确一句话价值主张。',
        '2. 痛点页是否有真实场景和成本数据。',
        '3. 方案页是否能解释 Loopy、资料索引、工作流之间的关系。',
        '4. 指标页是否能追溯到试点记录。',
        '5. 结尾页是否留出评委追问入口。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '哪些地方最容易被扣分？',
    },
    ...buildLoopyProcessMessages('结合评分细则检索扣分风险', 5),
    {
      role: 'assistant',
      content: '最容易扣分的是“指标没有来源”“竞品对比太弱”“商业化一句带过”。建议把指标页旁边加上数据来源脚注，把竞品页改成表格对比，并补一页学校/团队采购或订阅的假设模型。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-resource-collect': [
    {
      role: 'user',
      content: '我准备报名 AIGC 专项赛道，现在资料散在不同项目里。帮我先收集一版能支撑报名判断的资料清单。',
    },
    ...buildLoopyProcessMessages('收集 AIGC 专项赛道报名判断资料', 1),
    {
      role: 'assistant',
      content: [
        '我先把资料分成 4 组，方便你判断能不能报名：',
        '',
        '| 资料组 | 已收集 | 用途 | 缺口 |',
        '| --- | --- | --- | --- |',
        '| 赛道规则 | AIGC 应用创新专项赛道说明、评分细则 | 判断主题匹配和评分重点 | 需要确认报名截止时间 |',
        '| 项目证明 | 路演稿 v7、三轮试点数据 | 证明产品可演示、有初步效果 | 缺少用户访谈原文 |',
        '| 团队能力 | 用户画像与团队能力记录 | 说明为什么这个团队能做成 | 需要补成员分工截图 |',
        '| 风险边界 | 合规与数据边界说明 | 回答评委关于 AI 输出和数据的顾虑 | 需要补日志脱敏示例 |',
        '',
        '当前资料足够进入预报名判断，但还不够直接终审提交。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '如果只能补两份资料，补哪两份最划算？',
    },
    ...buildLoopyProcessMessages('按投入产出比筛选最值得补的资料', 5),
    {
      role: 'assistant',
      content: [
        '只补两份的话，我建议：',
        '',
        '1. **用户访谈摘要**：最能补应用价值和真实需求，挑战评委质疑时也好用。',
        '2. **项目-赛事契合度评估表**：能把赛道评分项、现有证据、缺口和负责人放在一张表里。',
        '',
        '先不要补很长的商业计划书，收益低且容易拖慢节奏。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-user-persona': [
    {
      role: 'user',
      content: '请模拟一个真实用户进来：他不知道自己适合什么比赛，只上传了团队能力记录和项目草稿。Loopy 应该怎么问、怎么推荐？',
    },
    ...buildLoopyProcessMessages('模拟新用户进入后的角色判断和追问', 1),
    {
      role: 'assistant',
      content: [
        '我会先问 4 个很短的问题，避免用户一上来就填复杂表单：',
        '',
        '1. 你们更强的是技术、调研、运营，还是设计表达？',
        '2. 当前项目有没有真实用户、试点数据或合作方？',
        '3. 你们准备周期是 2 周、1 个月，还是更久？',
        '4. 目标是练手、校内奖、省赛奖，还是冲国赛？',
        '',
        '基于他上传的团队能力记录，如果识别到“技术强、材料弱、周期短”，我会先推荐 AIGC 专项赛道，并把下一步动作限制在 3 件事内。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '那如果他回答：技术一般，但调研很多，想冲省赛奖？',
    },
    ...buildLoopyProcessMessages('根据用户补充回答重新匹配比赛方向', 5),
    {
      role: 'assistant',
      content: [
        '推荐会切换到 **挑战杯应用实践方向**。',
        '',
        '理由：',
        '',
        '- 技术一般不是硬伤，挑战杯更看重问题洞察、实践过程和社会价值。',
        '- 调研很多是优势，可以直接转成需求证据、用户画像和实践路径。',
        '- 如果想冲省赛奖，必须把调研从“数量多”整理成“结论可信”。',
        '',
        '下一步我会让他补：访谈样本结构、典型用户故事、实践照片/记录、合作方证明。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-material-fit': [
    {
      role: 'user',
      content: '帮我看一下这些资料和比赛要求的契合度：路演稿、指标表、合规说明、商业计划书模板。',
    },
    ...buildLoopyProcessMessages('评估资料与比赛要求的契合度', 1),
    {
      role: 'assistant',
      content: [
        '资料契合度初评：**78 / 100**。',
        '',
        '| 资料 | 契合度 | 可直接使用 | 需要补强 |',
        '| --- | ---: | --- | --- |',
        '| 路演稿 v7 | 86 | 场景、方案、演示路径 | 指标来源脚注 |',
        '| 三轮试点数据 | 82 | 效果证明、答辩支撑 | 样本说明、异常处理 |',
        '| 合规边界说明 | 75 | 回答 AI 输出和数据风险 | 日志脱敏示例 |',
        '| 商业计划书模板 | 62 | 结构可用 | 市场规模、付费假设、竞品对比 |',
        '',
        '整体判断：适合先报技术应用类赛道，商业强评审场景还需要补材料。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    {
      role: 'user',
      content: '把它转成下一步任务。',
    },
    ...buildLoopyProcessMessages('把资料缺口转成任务清单', 5),
    {
      role: 'assistant',
      content: [
        '下一步任务可以这样拆：',
        '',
        '- 张同学：补指标来源脚注，今天 18:00 前完成。',
        '- 李同学：整理 5 条用户访谈摘要，明天中午前完成。',
        '- 王同学：做竞品对比表，重点对比通用知识库和项目管理工具。',
        '- 你：把契合度评估表放进答辩备用页，准备 30 秒解释。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-deadline-risk': [
    { role: 'user', content: '报名截止还有 9 天，帮我判断 Touch Win Loop 现在冲 AIGC 专项赛道最大的时间风险。' },
    ...buildLoopyProcessMessages('分析报名截止时间和材料完成度风险', 1),
    {
      role: 'assistant',
      content: [
        '最大时间风险不是写不完，而是 **关键证据来不及统一口径**。',
        '',
        '| 风险 | 当前状态 | 处理建议 |',
        '| --- | --- | --- |',
        '| 指标口径 | 路演稿、指标表、答辩稿有轻微差异 | 今天先冻结 5 个核心数字 |',
        '| 用户访谈 | 有摘要，但缺原始记录 | 明天补 5 条真实访谈摘录 |',
        '| 竞品对比 | 只有一句描述 | 48 小时内补表格 |',
        '| 合规说明 | 有边界说明，缺示例 | 补一张日志脱敏截图 |',
        '',
        '9 天内可以冲，但必须先收口证据，不要继续扩功能。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '那今天必须完成什么？' },
    ...buildLoopyProcessMessages('把 9 天风险压缩成今日必做项', 5),
    {
      role: 'assistant',
      content: '今天只抓三件：冻结核心数字、补竞品对比表第一版、确定 5 条用户访谈来源。完成这三件，后面 8 天才有稳定材料基础。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-budget-cost': [
    { role: 'user', content: '评委如果问我们落地成本和学校采购预算，怎么准备？' },
    ...buildLoopyProcessMessages('检索预算成本资料并生成答辩口径', 1),
    {
      role: 'assistant',
      content: [
        '建议准备两个口径：**团队版订阅** 和 **学校版采购**。',
        '',
        '| 版本 | 适用对象 | 计费逻辑 | 评委关心点 |',
        '| --- | --- | --- | --- |',
        '| 团队版 | 单个参赛团队 | 按项目周期订阅 | 是否比人工辅导更划算 |',
        '| 学校版 | 创新创业学院/教务处 | 按账号数或项目数采购 | 是否能支撑多赛事管理 |',
        '',
        '30 秒回答：我们先从团队版切入，验证高频刚需；学校版面向集中管理和资料沉淀，成本主要在资料索引、模型调用和人工审核配置。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '能给一个不虚的数字区间吗？' },
    ...buildLoopyProcessMessages('估算模型调用、资料索引和人工配置成本', 5),
    {
      role: 'assistant',
      content: '可以给区间，不要给死数：团队版建议按 199-499 元/项目周期验证；学校版按 2-8 万/年试点，取决于账号数、赛事数量和是否需要私有知识库配置。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-team-division': [
    { role: 'user', content: '团队 4 个人，怎么分工准备 AIGC 专项赛道材料最稳？' },
    ...buildLoopyProcessMessages('读取团队能力记录并拆分材料任务', 1),
    {
      role: 'assistant',
      content: [
        '建议按“材料可信度”而不是按页面模块分工：',
        '',
        '- A：负责技术演示链路，确保 Loopy 对话、资料引用、工作流能连续演示。',
        '- B：负责数据口径，统一试点数据、样本说明、指标来源。',
        '- C：负责用户证据，整理访谈、典型团队故事、使用前后对比。',
        '- D：负责路演表达，把评分维度映射进 PPT 和答辩备用页。',
        '',
        '这样每个人都对一个证据类型负责，不容易互相等材料。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '谁最适合负责答辩？' },
    ...buildLoopyProcessMessages('根据角色能力匹配答辩分工', 5),
    {
      role: 'assistant',
      content: '主讲建议给能讲清业务闭环的人，不一定是技术最强的人；技术同学负责 2 个备用回答：系统架构和数据边界。这样现场节奏更稳。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-competitor-compare': [
    { role: 'user', content: '帮我做一版竞品对比，尤其是和 ChatGPT、飞书文档、普通知识库怎么区分。' },
    ...buildLoopyProcessMessages('检索竞品维度并生成对比表', 1),
    {
      role: 'assistant',
      content: [
        '| 对比对象 | 能解决什么 | 解决不了什么 | Touch Win Loop 差异 |',
        '| --- | --- | --- | --- |',
        '| ChatGPT | 单轮问答、生成文案 | 不知道项目资料和比赛节点 | 基于项目上下文、资料引用和任务状态回答 |',
        '| 飞书文档 | 协作文档、资料沉淀 | 不会主动映射评分项和答辩风险 | 把资料转成比赛行动建议 |',
        '| 普通知识库 | 检索资料 | 不处理项目进度和材料缺口 | 能联动会话、项目、资料和工作流 |',
        '',
        '一句话：我们不是“问答工具”，而是竞赛项目交付工作台。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '哪一句最适合放路演稿？' },
    ...buildLoopyProcessMessages('压缩竞品差异为路演稿表达', 5),
    {
      role: 'assistant',
      content: '建议放这句：通用 AI 只能回答问题，Touch Win Loop 会围绕比赛规则、项目资料和答辩风险，把回答转成可执行的参赛动作。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-business-model': [
    { role: 'user', content: '商业化这块太虚，帮我生成一个评委能接受的版本。' },
    ...buildLoopyProcessMessages('检索商业计划书模板并生成商业化口径', 1),
    {
      role: 'assistant',
      content: [
        '商业化建议讲三层，不要一上来讲大平台：',
        '',
        '1. **参赛团队订阅**：按项目周期付费，解决短期材料和答辩准备。',
        '2. **学院工作台**：面向创新创业学院，管理多团队、多赛事和资料库。',
        '3. **赛事服务包**：给校内赛、训练营、孵化项目提供标准化辅导工作台。',
        '',
        '评委更容易接受“先团队、再学院、最后赛事服务”的路径。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '怎么避免被问获客成本？' },
    ...buildLoopyProcessMessages('生成获客成本回答和风险补充', 5),
    {
      role: 'assistant',
      content: '不要回避获客成本。建议说：早期通过校内导师、竞赛社群和训练营合作获客，重点验证复购和转介绍；规模化后再做学院级采购，降低单团队获客成本。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-roadshow-order': [
    { role: 'user', content: '路演稿现在顺序有点散，按 AIGC 专项赛道帮我重排一下。' },
    ...buildLoopyProcessMessages('读取路演稿结构并按赛道重排', 1),
    {
      role: 'assistant',
      content: [
        '建议顺序改成：',
        '',
        '1. 竞赛团队准备痛点：资料散、评分要求难对齐、答辩风险不可见。',
        '2. Touch Win Loop 闭环：项目、资料、Loopy 对话、工作流、答辩模拟。',
        '3. 关键 AI 能力：资料引用、契合度分析、追问模拟、任务拆解。',
        '4. 试点指标：准备时间、资料命中率、人工复核节省。',
        '5. 商业与推广：团队订阅到学院工作台。',
        '6. 风险边界：只读建议、审批机制、数据脱敏。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '第一页标题怎么写？' },
    ...buildLoopyProcessMessages('生成路演首页标题候选', 5),
    {
      role: 'assistant',
      content: '推荐标题：Touch Win Loop：面向高校竞赛团队的 AI 参赛工作台。副标题：把资料、评分、项目推进和答辩准备连成一个可追溯闭环。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-defense-bank': [
    { role: 'user', content: '帮我生成 8 个答辩备用问题，按危险程度排序。' },
    ...buildLoopyProcessMessages('检索答辩追问库并按危险程度排序', 1),
    {
      role: 'assistant',
      content: [
        '危险程度从高到低：',
        '',
        '1. 你们和 ChatGPT 加资料库有什么本质区别？',
        '2. 试点数据是不是只来自自己团队？',
        '3. 如果比赛规则变化，系统怎么维护？',
        '4. 学校为什么要采购，而不是让老师继续人工指导？',
        '5. AI 建议出错谁负责？',
        '6. 资料上传后如何保证权限和隐私？',
        '7. 你们的商业模式是否依赖高模型成本？',
        '8. 团队毕业后项目怎么持续？',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '第 1 个给我一个强回答。' },
    ...buildLoopyProcessMessages('为最高风险追问生成强回答', 5),
    {
      role: 'assistant',
      content: '强回答：ChatGPT 是通用问答入口，而我们的核心是“比赛交付上下文”。Loopy 不是单独生成答案，而是读取项目资料、评分规则、会话历史和任务状态，再把建议落到资料缺口、答辩风险和下一步动作上。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-gap-board': [
    { role: 'user', content: '把当前项目缺口整理成一个优先级看板。' },
    ...buildLoopyProcessMessages('检索项目缺口并生成优先级看板', 1),
    {
      role: 'assistant',
      content: [
        '| 优先级 | 缺口 | 负责人建议 | 截止 |',
        '| --- | --- | --- | --- |',
        '| P0 | 核心指标口径不一致 | 数据负责人 | 今天 |',
        '| P0 | 竞品对比缺表格 | 产品负责人 | 明天上午 |',
        '| P1 | 用户访谈缺原文 | 运营负责人 | 明天晚上 |',
        '| P1 | 合规说明缺示例 | 技术负责人 | 2 天内 |',
        '| P2 | 商业计划书市场规模偏虚 | 主讲人 | 3 天内 |',
        '',
        '建议先清 P0，否则路演稿和答辩都会被牵连。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '帮我把 P0 转成今天的时间块。' },
    ...buildLoopyProcessMessages('把 P0 缺口转成今日时间块', 5),
    {
      role: 'assistant',
      content: '今天 14:00-15:00 冻结核心数字；15:10-16:10 做竞品对比表；16:20-16:50 把两处改动同步到路演稿；17:00 前发给导师确认。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-cross-project': [
    { role: 'user', content: '低碳校园能耗助手和 Touch Win Loop 能不能组合成一个更强的参赛项目？' },
    ...buildLoopyProcessMessages('分析跨项目组合可行性和风险', 1),
    {
      role: 'assistant',
      content: [
        '不建议强行合并成一个项目，但可以做成“平台案例”。',
        '',
        '原因：',
        '',
        '- Touch Win Loop 的主线是竞赛团队工作台。',
        '- 低碳校园能耗助手是行业应用项目，问题域不同。',
        '- 强行合并会让评委不知道你到底解决谁的问题。',
        '',
        '更好的做法：保留 Touch Win Loop 主项目，把低碳助手作为“多赛道项目管理和资料评审”的示例案例。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '那它能帮 Touch Win Loop 加分吗？' },
    ...buildLoopyProcessMessages('判断跨项目案例对主项目的加分价值', 5),
    {
      role: 'assistant',
      content: '能加分，但只能作为扩展性证据：说明平台不只服务一个比赛，也能管理不同主题项目的资料、风险和答辩准备。不要让它抢主叙事。',
      metadata: mockKnowledgeMetadata,
    },
  ],
  'mock-session-mentor-review': [
    { role: 'user', content: '模拟导师看完材料后的反馈，帮我挑 5 个最可能被批评的点。' },
    ...buildLoopyProcessMessages('模拟导师视角复盘材料问题', 1),
    {
      role: 'assistant',
      content: [
        '导师最可能批评这 5 点：',
        '',
        '1. 你们讲了很多功能，但用户为什么离不开还不够强。',
        '2. 竞品对比太软，没有把“不可替代性”打出来。',
        '3. 试点数据缺样本说明，看起来像内部体验数据。',
        '4. 商业化有方向，但缺第一批付费用户画像。',
        '5. 风险边界说了原则，缺具体审批和脱敏例子。',
        '',
        '这些不是推翻项目，而是终审前最该补的可信度材料。',
      ].join('\n'),
      metadata: mockKnowledgeMetadata,
    },
    { role: 'user', content: '帮我生成给导师看的修改计划。' },
    ...buildLoopyProcessMessages('生成导师复盘后的修改计划', 5),
    {
      role: 'assistant',
      content: '修改计划：今天统一指标和竞品对比；明天补用户访谈、样本说明和日志脱敏截图；后天重排路演稿，把“不可替代性”和“证据链”提前到前 5 页。',
      metadata: mockKnowledgeMetadata,
    },
  ],
})

const loopySelectedWorkspaceId = ref(MOCK_WORKSPACE_ID)
const loopySessions = ref<LoopyMockSession[]>([
  {
    id: 'mock-session-role-fit',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '用户角色比赛推荐',
    messageCount: mockSessionMessages.value['mock-session-role-fit'].length,
    lastMessageAt: '2026-05-05T10:42:00+08:00',
    createdAt: '2026-05-05T10:02:00+08:00',
    updatedAt: '2026-05-05T10:42:00+08:00',
    preview: '大三软件工程学生更适合先冲 AIGC 专项赛道。',
    tag: '角色画像',
  },
  {
    id: 'mock-session-contest-match',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '项目赛道契合度',
    messageCount: mockSessionMessages.value['mock-session-contest-match'].length,
    lastMessageAt: '2026-05-05T10:39:00+08:00',
    createdAt: '2026-05-05T09:54:00+08:00',
    updatedAt: '2026-05-05T10:39:00+08:00',
    preview: 'Touch Win Loop 与 AIGC 专项赛道契合度 86 分。',
    tag: '契合度',
  },
  {
    id: 'mock-session-project-picker',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '项目比赛组合选择',
    messageCount: mockSessionMessages.value['mock-session-project-picker'].length,
    lastMessageAt: '2026-05-05T10:34:00+08:00',
    createdAt: '2026-05-05T09:36:00+08:00',
    updatedAt: '2026-05-05T10:34:00+08:00',
    preview: '推荐 Touch Win Loop 选择 AIGC 应用创新专项赛道。',
    tag: '比赛选择',
  },
  {
    id: 'mock-session-resource-collect',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '报名资料收集',
    messageCount: mockSessionMessages.value['mock-session-resource-collect'].length,
    lastMessageAt: '2026-05-05T10:28:00+08:00',
    createdAt: '2026-05-05T09:22:00+08:00',
    updatedAt: '2026-05-05T10:28:00+08:00',
    preview: '收集赛道规则、项目证明、团队能力和风险边界资料。',
    tag: '资料收集',
  },
  {
    id: 'mock-session-user-persona',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '新用户画像推荐',
    messageCount: mockSessionMessages.value['mock-session-user-persona'].length,
    lastMessageAt: '2026-05-05T10:20:00+08:00',
    createdAt: '2026-05-05T09:08:00+08:00',
    updatedAt: '2026-05-05T10:20:00+08:00',
    preview: '先问 4 个短问题，再推荐适合的比赛方向。',
    tag: '用户画像',
  },
  {
    id: 'mock-session-material-fit',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '资料契合度转任务',
    messageCount: mockSessionMessages.value['mock-session-material-fit'].length,
    lastMessageAt: '2026-05-05T10:16:00+08:00',
    createdAt: '2026-05-05T08:58:00+08:00',
    updatedAt: '2026-05-05T10:16:00+08:00',
    preview: '把路演稿、指标表、合规说明转成补齐任务。',
    tag: '任务拆解',
  },
  {
    id: 'mock-session-deadline-risk',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '报名截止风险',
    messageCount: mockSessionMessages.value['mock-session-deadline-risk'].length,
    lastMessageAt: '2026-05-05T10:11:00+08:00',
    createdAt: '2026-05-05T08:46:00+08:00',
    updatedAt: '2026-05-05T10:11:00+08:00',
    preview: '9 天内先统一证据口径，不要继续扩功能。',
    tag: '截止风险',
  },
  {
    id: 'mock-session-budget-cost',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '落地成本口径',
    messageCount: mockSessionMessages.value['mock-session-budget-cost'].length,
    lastMessageAt: '2026-05-05T10:07:00+08:00',
    createdAt: '2026-05-05T08:38:00+08:00',
    updatedAt: '2026-05-05T10:07:00+08:00',
    preview: '团队版订阅和学校版采购两套回答口径。',
    tag: '商业化',
  },
  {
    id: 'mock-session-team-division',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '团队分工安排',
    messageCount: mockSessionMessages.value['mock-session-team-division'].length,
    lastMessageAt: '2026-05-05T10:01:00+08:00',
    createdAt: '2026-05-05T08:31:00+08:00',
    updatedAt: '2026-05-05T10:01:00+08:00',
    preview: '按证据类型分工，技术、数据、访谈、表达各自负责。',
    tag: '团队分工',
  },
  {
    id: 'mock-session-competitor-compare',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '竞品对比表达',
    messageCount: mockSessionMessages.value['mock-session-competitor-compare'].length,
    lastMessageAt: '2026-05-05T09:55:00+08:00',
    createdAt: '2026-05-05T08:24:00+08:00',
    updatedAt: '2026-05-05T09:55:00+08:00',
    preview: '和 ChatGPT、飞书文档、普通知识库做差异化。',
    tag: '竞品对比',
  },
  {
    id: 'mock-session-business-model',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '商业化路径',
    messageCount: mockSessionMessages.value['mock-session-business-model'].length,
    lastMessageAt: '2026-05-05T09:47:00+08:00',
    createdAt: '2026-05-05T08:12:00+08:00',
    updatedAt: '2026-05-05T09:47:00+08:00',
    preview: '先团队订阅，再学院工作台，最后赛事服务包。',
    tag: '商业模式',
  },
  {
    id: 'mock-session-roadshow-order',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '路演稿重排',
    messageCount: mockSessionMessages.value['mock-session-roadshow-order'].length,
    lastMessageAt: '2026-05-05T09:39:00+08:00',
    createdAt: '2026-05-05T08:04:00+08:00',
    updatedAt: '2026-05-05T09:39:00+08:00',
    preview: '按痛点、闭环、AI 能力、指标、商业、风险重排。',
    tag: '路演结构',
  },
  {
    id: 'mock-session-defense-bank',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '答辩备用题库',
    messageCount: mockSessionMessages.value['mock-session-defense-bank'].length,
    lastMessageAt: '2026-05-05T09:30:00+08:00',
    createdAt: '2026-05-05T07:58:00+08:00',
    updatedAt: '2026-05-05T09:30:00+08:00',
    preview: '8 个高风险追问，优先准备通用 AI 差异回答。',
    tag: '答辩题库',
  },
  {
    id: 'mock-session-gap-board',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '项目缺口看板',
    messageCount: mockSessionMessages.value['mock-session-gap-board'].length,
    lastMessageAt: '2026-05-05T09:22:00+08:00',
    createdAt: '2026-05-05T07:44:00+08:00',
    updatedAt: '2026-05-05T09:22:00+08:00',
    preview: '把核心数字、竞品对比、访谈原文排成 P0/P1。',
    tag: '缺口看板',
  },
  {
    id: 'mock-session-cross-project',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '跨项目组合判断',
    messageCount: mockSessionMessages.value['mock-session-cross-project'].length,
    lastMessageAt: '2026-05-05T09:14:00+08:00',
    createdAt: '2026-05-05T07:35:00+08:00',
    updatedAt: '2026-05-05T09:14:00+08:00',
    preview: '低碳助手适合作为扩展案例，不要抢主叙事。',
    tag: '组合判断',
  },
  {
    id: 'mock-session-mentor-review',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '导师视角复盘',
    messageCount: mockSessionMessages.value['mock-session-mentor-review'].length,
    lastMessageAt: '2026-05-05T09:05:00+08:00',
    createdAt: '2026-05-05T07:26:00+08:00',
    updatedAt: '2026-05-05T09:05:00+08:00',
    preview: '导师最可能批评用户价值、竞品、数据和商业化。',
    tag: '导师复盘',
  },
  {
    id: 'mock-session-priority',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '终审优先事项梳理',
    messageCount: mockSessionMessages.value['mock-session-priority'].length,
    lastMessageAt: '2026-05-05T10:38:00+08:00',
    createdAt: '2026-05-05T09:40:00+08:00',
    updatedAt: '2026-05-05T10:38:00+08:00',
    preview: '先冻结数字口径，再补齐证据链和追问预案。',
    tag: '优先级',
  },
  {
    id: 'mock-session-defense',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '评委追问风险扫描',
    messageCount: mockSessionMessages.value['mock-session-defense'].length,
    lastMessageAt: '2026-05-05T10:12:00+08:00',
    createdAt: '2026-05-05T08:50:00+08:00',
    updatedAt: '2026-05-05T10:12:00+08:00',
    preview: '数据真实性、替代方案和规模化成本最容易被问。',
    tag: '追问模拟',
  },
  {
    id: 'mock-session-material',
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '路演稿终审检查',
    messageCount: mockSessionMessages.value['mock-session-material'].length,
    lastMessageAt: '2026-05-04T22:24:00+08:00',
    createdAt: '2026-05-04T21:50:00+08:00',
    updatedAt: '2026-05-04T22:24:00+08:00',
    preview: '首页价值主张、痛点数据、方案关系和指标追溯。',
    tag: '资料检查',
  },
])
const loopyActiveSessionId = ref('mock-session-role-fit')
const loopyMessages = ref<ChatMessage[]>([...mockSessionMessages.value['mock-session-role-fit']])
const loopyChatInput = ref('')
const loopyChatLoading = ref(false)
const loopyStatusText = ref('')
const loopyErrorText = ref('')
const loopyCanSend = computed(() => Boolean(loopySelectedWorkspaceId.value) && !loopyChatLoading.value)
const loopyShowSuggestions = computed(() => !loopyChatLoading.value && loopyMessages.value.length === 0)

const route = useRoute()
const normalizedPath = computed(() => route.path.replace(/\/+$/, '') || '/')
const isDashboardIndex = computed(() => normalizedPath.value === '/dashboard')

const activeSession = computed(() => {
  return loopySessions.value.find(item => item.id === loopyActiveSessionId.value) || null
})

const firstUserMessageTitle = computed(() => {
  const firstUserMessage = loopyMessages.value.find(item => item.role === 'user')
  return buildDialogTitlePreview(firstUserMessage?.content)
})

function resolveVisibleSessionTitle(session: { id: string, title: string } | null | undefined): string {
  const normalizedTitle = formatSessionTitle(session?.title)
  if (normalizedTitle !== '新对话')
    return normalizedTitle
  if (session?.id && session.id === loopyActiveSessionId.value && firstUserMessageTitle.value)
    return firstUserMessageTitle.value
  return normalizedTitle
}

const chatPanelTitle = computed(() => {
  return resolveVisibleSessionTitle(activeSession.value) || '新对话'
})

const chatPanelSubtitle = computed(() => {
  if (!loopySelectedWorkspaceId.value)
    return '当前没有可用工作区，暂时无法开始对话。'
  return ''
})

const shouldHideGreetingMessage = computed(() => {
  return loopyShowSuggestions.value
    && loopyMessages.value.length > 0
    && loopyMessages.value[0]?.role === 'assistant'
})

const visibleMessages = computed(() => {
  if (!shouldHideGreetingMessage.value)
    return loopyMessages.value
  return loopyMessages.value.slice(1)
})

const showSuggestionCards = computed(() => {
  return Boolean(loopySelectedWorkspaceId.value) && loopyShowSuggestions.value
})

const selectedLoopyProject = computed(() => {
  return projects.value.find(item => item.id === selectedLoopyProjectId.value) || null
})

const selectedAiSpeedOption = computed(() => {
  return aiSpeedOptions.find(item => item.id === selectedAiSpeed.value) || aiSpeedOptions[0]
})

const visibleResourceResults = computed(() => {
  if (resourceSearchScope.value === 'platform')
    return platformResourceResults.value

  const keyword = resourceSearchQuery.value.trim().toLowerCase()
  const resources = projectResourceResults.value
  if (!keyword)
    return resources.slice(0, 12)

  return resources
    .filter((resource) => {
      return [
        resource.title,
        resource.summary,
        resource.type,
        resource.category,
      ].some(value => String(value || '').toLowerCase().includes(keyword))
    })
    .slice(0, 12)
})

const composerQuickActions = [
  {
    id: 'attachment',
    label: '附件',
    icon: 'attach_file',
  },
  {
    id: 'knowledge',
    label: '@ 资料',
    icon: 'alternate_email',
  },
  {
    id: 'command',
    label: '/ 命令',
    icon: 'terminal',
  },
] as const

function focusComposer() {
  requestAnimationFrame(() => {
    composerRef.value?.focus()
  })
}

function compactText(value: unknown, maxLength = 120): string {
  const compact = String(value || '').replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength)
    return compact
  return `${compact.slice(0, maxLength)}…`
}

function appendComposerText(text: string) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText)
    return
  const current = String(loopyChatInput.value || '')
  const nextValue = current.trim()
    ? `${current.trimEnd()} ${normalizedText}`
    : normalizedText

  loopyChatInput.value = nextValue
  focusComposer()
}

function closeComposerPanel() {
  activeComposerPanel.value = ''
}

function toggleComposerPanel(panel: ComposerPanelId) {
  if (!loopySelectedWorkspaceId.value)
    return

  activeComposerPanel.value = activeComposerPanel.value === panel ? '' : panel
}

function handleQuickAction(actionId: ComposerQuickActionId) {
  if (!loopySelectedWorkspaceId.value)
    return

  if (actionId === 'attachment') {
    closeComposerPanel()
    attachmentInputRef.value?.click()
    return
  }

  toggleComposerPanel(actionId)
}

function resolveResourceMeta(resource: LoopyMockResource): string {
  return [
    resource.type,
    resource.year ? `${resource.year}` : '',
    resource.category,
  ].filter(Boolean).join(' · ')
}

function ensureSelectedProject(): LoopyMockProject | null {
  const current = selectedLoopyProject.value
  if (current)
    return current
  const firstProject = projects.value[0] || null
  if (firstProject)
    selectedLoopyProjectId.value = firstProject.id
  return firstProject
}

function changeResourceScope(scope: ResourceSearchScope) {
  resourceSearchScope.value = scope
  if (scope === 'project')
    ensureSelectedProject()
}

function selectProjectForResource(project: LoopyMockProject) {
  selectedLoopyProjectId.value = project.id
  resourceSearchScope.value = 'project'
}

function selectResourceContext(resource: LoopyMockResource) {
  const scope = resourceSearchScope.value
  selectedResourceContext.value = {
    id: resource.id,
    title: resource.title,
    scope,
    projectId: scope === 'project' ? selectedLoopyProjectId.value : '',
  }
  appendComposerText(`@${scope === 'platform' ? '平台资料' : '项目资料'}「${resource.title}」（ID: ${resource.id}）${resource.summary ? `：${compactText(resource.summary)}` : ''}`)
  closeComposerPanel()
}

function buildMockAssistantReply(content: string): string {
  const selectedProject = selectedLoopyProject.value
  const selectedResource = selectedResourceContext.value
  const speedLabel = selectedAiSpeedOption.value.label
  const normalizedContent = content.toLowerCase()

  if (/项目.*比赛|比赛.*项目|选择.*比赛|冲奖|组合/.test(content)) {
    return [
      '我会推荐这个组合：**Touch Win Loop 竞赛平台 -> AIGC 应用创新专项赛道**。',
      '',
      '选择理由：',
      '',
      '1. 赛道关键词和项目能力高度一致：AIGC、智能体、知识库、流程自动化。',
      '2. 当前页面就能展示 Loopy 的核心体验，演示成本低。',
      '3. 资料池里已经有路演稿、指标表、合规说明，补齐速度快。',
      '',
      '需要补的资料：',
      '',
      '- 用户画像与团队能力记录',
      '- 项目-赛事契合度评估表',
      '- 竞品对比表',
      '- 试点数据说明',
    ].join('\n')
  }

  if (/契合|匹配|分数|赛道/.test(content)) {
    return [
      `我把「${selectedProject?.title || 'Touch Win Loop 竞赛平台'}」按目标赛道做契合度评估：**86 / 100**。`,
      '',
      '高分项：',
      '',
      '- 产品场景明确：服务竞赛团队的资料、项目、答辩闭环。',
      '- AI 能力可演示：Loopy 对话、资料引用、智能工作流都能形成连贯现场演示。',
      '- 资料基础较完整：已有路演稿、指标表、合规说明和评分细则。',
      '',
      '缺口：',
      '',
      '- 缺少真实用户访谈摘要。',
      '- 缺少项目与赛道评分维度的一页式映射表。',
      '- 缺少竞品对比的量化口径。',
      '',
      selectedResource ? `建议优先围绕「${selectedResource.title}」补证据。` : '建议优先补「项目-赛事契合度评估表」。',
    ].join('\n')
  }

  if (/角色|适合|推荐.*比赛|报名|参赛/.test(content)) {
    return [
      `我先按当前用户画像做一轮“${speedLabel}”推荐。`,
      '',
      '假设用户画像：软件工程背景、能做 AI 工具演示、商业材料偏弱、准备周期偏短。',
      '',
      '| 推荐比赛 | 匹配度 | 推荐原因 | 主要风险 |',
      '| --- | ---: | --- | --- |',
      '| AIGC 应用创新专项赛道 | 88 | 技术主题强，能现场演示 Loopy 对话、资料引用、工作流。 | 需要讲清和通用 AI 工具差异。 |',
      '| 互联网+ 校赛/省赛预选 | 74 | 项目完整度高，平台化空间大。 | 商业模型、获客成本和试点数据会被追问。 |',
      '| 挑战杯应用实践方向 | 68 | 有教育协作价值。 | 需要更多调研和实践过程证据。 |',
      '',
      '结论：如果目标是短期冲奖，先选 AIGC；如果目标是长期打磨，再扩展到互联网+。',
    ].join('\n')
  }

  if (/追问|评委|风险|补齐/.test(content)) {
    return [
      `我按“${speedLabel}”模式先给出可直接用于答辩的版本。`,
      '',
      '最需要提前补齐的是四类问题：',
      '',
      '1. **数据来源**：试点样本、周期、采集口径和异常处理方式。',
      '2. **差异化**：Loopy 与普通知识库、项目管理工具、人工顾问的边界。',
      '3. **可落地性**：新团队接入时需要多少配置、多少人工复核。',
      '4. **合规边界**：哪些建议只读展示，哪些进入待审批变更。',
      '',
      selectedResource ? `这轮我会优先参考「${selectedResource.title}」里的证据表达。` : '这轮会先按资料池里的路演稿和评分细则组织回答。',
    ].join('\n')
  }

  if (/简报|总结|brief/.test(normalizedContent)) {
    return [
      `当前工作空间可以概括为：${selectedProject?.title || 'Touch Win Loop'} 正处于终审演示前的材料收束阶段。`,
      '',
      '资料侧已经有路演稿、指标表和合规边界说明；会话侧重点集中在优先事项、评委追问、证据链和比赛选择。下一步最适合先冻结指标口径，再把 Loopy 的资料引用、行动建议和追问预案串成一条闭环。',
    ].join('\n')
  }

  return [
    '收到，我先按当前工作空间给出一个可执行版本：',
    '',
    `- 当前项目：${selectedProject?.title || '暂未指定项目'}`,
    `- 引用资料：${selectedResource?.title || '资料池：路演稿、评分细则、指标表'}`,
    `- 回答策略：${speedLabel}`,
    '',
    '建议先做三件事：冻结终版数字口径、补齐可展示证据截图、准备评委追问的一页式回答。这个顺序最稳，因为它直接影响路演稿、答辩问答和终审材料的一致性。',
  ].join('\n')
}

function updateActiveMockSession(content: string) {
  const activeId = loopyActiveSessionId.value
  const sessionIndex = loopySessions.value.findIndex(item => item.id === activeId)
  if (sessionIndex < 0)
    return

  const now = new Date().toISOString()
  const current = loopySessions.value[sessionIndex]
  const nextSession = {
    ...current,
    title: current.title === '新对话' ? buildDialogTitlePreview(content) || '新对话' : current.title,
    preview: buildDialogTitlePreview(content) || current.preview,
    tag: resolveMockSessionTag(content, current.tag),
    messageCount: mockSessionMessages.value[activeId]?.length || current.messageCount,
    lastMessageAt: now,
    updatedAt: now,
  }
  loopySessions.value = [
    nextSession,
    ...loopySessions.value.filter(item => item.id !== activeId),
  ]
}

function resolveMockSessionTag(content: string, fallback: string): string {
  if (/角色|适合|推荐.*比赛|报名|参赛/.test(content))
    return '角色画像'
  if (/契合|匹配|分数|赛道/.test(content))
    return '契合度'
  if (/项目.*比赛|比赛.*项目|选择.*比赛|冲奖|组合/.test(content))
    return '比赛选择'
  if (/追问|评委|风险|补齐/.test(content))
    return '追问模拟'
  if (/资料|引用|文档|评估表/.test(content))
    return '资料分析'
  return fallback || '对话'
}

function switchLoopySession(sessionId: string) {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId || normalizedSessionId === loopyActiveSessionId.value)
    return
  loopyActiveSessionId.value = normalizedSessionId
  loopyMessages.value = [...(mockSessionMessages.value[normalizedSessionId] || [])]
  loopyStatusText.value = ''
  loopyErrorText.value = ''
  closeComposerPanel()
}

function startNewLoopySession() {
  const now = new Date().toISOString()
  const sessionId = `loopy-session-${Date.now()}`
  const session: LoopyMockSession = {
    id: sessionId,
    workspaceId: MOCK_WORKSPACE_ID,
    createdByUserId: MOCK_USER_ID,
    mode: 'loopy_page',
    title: '新对话',
    messageCount: 0,
    lastMessageAt: null,
    createdAt: now,
    updatedAt: now,
    preview: '等待第一轮提问。',
    tag: '新会话',
  }
  mockSessionMessages.value[sessionId] = []
  loopySessions.value = [session, ...loopySessions.value]
  loopyActiveSessionId.value = sessionId
  loopyMessages.value = []
  loopyChatInput.value = ''
  loopyStatusText.value = ''
  loopyErrorText.value = ''
  closeComposerPanel()
  focusComposer()
}

async function sendLoopyMessage(contentOverride = '') {
  const content = String(contentOverride || loopyChatInput.value || '').trim()
  if (!content || !loopyCanSend.value)
    return

  if (!loopyActiveSessionId.value)
    startNewLoopySession()

  const activeId = loopyActiveSessionId.value
  loopyChatInput.value = ''
  loopyErrorText.value = ''
  loopyStatusText.value = ''
  closeComposerPanel()

  const pendingMessages: ChatMessage[] = [
    ...loopyMessages.value,
    { role: 'user', content },
  ]
  loopyMessages.value = pendingMessages
  mockSessionMessages.value[activeId] = pendingMessages
  loopyChatLoading.value = true

  const processMessages = buildLoopyProcessMessages(content)
  for (const processMessage of processMessages) {
    await new Promise(resolve => setTimeout(resolve, 160))
    loopyMessages.value = [...loopyMessages.value, processMessage]
    mockSessionMessages.value[activeId] = loopyMessages.value
  }

  await new Promise(resolve => setTimeout(resolve, 220))

  const nextMessages: ChatMessage[] = [
    ...loopyMessages.value,
    {
      role: 'assistant',
      content: buildMockAssistantReply(content),
      metadata: mockKnowledgeMetadata,
    },
  ]
  loopyMessages.value = nextMessages
  mockSessionMessages.value[activeId] = nextMessages
  loopyChatLoading.value = false
  loopyStatusText.value = ''
  updateActiveMockSession(content)
}

function useLoopySuggestion(question: string) {
  loopyChatInput.value = String(question || '').trim()
  void sendLoopyMessage(loopyChatInput.value)
}

function applyCommandPrompt(prompt: string) {
  appendComposerText(prompt)
  closeComposerPanel()
}

function selectAiSpeed(speedId: AiSpeedId) {
  selectedAiSpeed.value = speedId
  closeComposerPanel()
  focusComposer()
}

function isTextLikeAttachment(file: File): boolean {
  const normalizedType = String(file.type || '').toLowerCase()
  const normalizedName = String(file.name || '').toLowerCase()
  return normalizedType.startsWith('text/')
    || /\.(md|markdown|txt|json|csv|tsv|yaml|yml|xml|html|css|js|ts|vue)$/i.test(normalizedName)
}

async function handleAttachmentInput(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (files.length === 0)
    return

  const blocks: string[] = []
  for (const file of files.slice(0, 4)) {
    if (!isTextLikeAttachment(file)) {
      blocks.push(`- ${file.name}（${Math.ceil(file.size / 1024)} KB，暂仅附加文件名）`)
      continue
    }

    const text = await file.slice(0, 12000).text().catch(() => '')
    blocks.push([
      `- ${file.name}`,
      '```',
      compactText(text, 1800),
      '```',
    ].join('\n'))
  }

  appendComposerText(`请结合以下附件内容回答：\n${blocks.join('\n\n')}`)
}

watch(
  () => [
    loopyMessages.value.length,
    loopyMessages.value[loopyMessages.value.length - 1]?.content || '',
    loopyChatLoading.value,
  ],
  async () => {
    await nextTick()
    if (messageScrollRef.value)
      messageScrollRef.value.scrollTop = messageScrollRef.value.scrollHeight
  },
)

onMounted(() => {
  loading.value = false
})
</script>

<template>
  <div class="contents">
    <NuxtPage v-if="!isDashboardIndex" />
    <section
      v-else
      class="bg-[linear-gradient(180deg,#f6f8fd_0%,#f4f7fb_100%)] flex h-full min-h-0 min-w-0 w-full overflow-hidden"
      data-testid="dashboard-loopy-home"
    >
      <div class="loopy-page-shell grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[308px_minmax(0,1fr)]">
        <aside
          data-testid="dashboard-loopy-sidebar"
          class="loopy-page-sidebar flex flex-col min-h-0 overflow-hidden lg:h-full"
        >
          <div class="px-3 py-3 border-b border-slate-200/80 flex shrink-0 gap-2 items-center justify-between">
            <p class="text-[12px] text-slate-500 font-semibold tabular-nums">
              {{ loopySessions.length }} 条会话
            </p>
            <button
              class="loopy-page-ghost-btn"
              type="button"
              @click="startNewLoopySession"
            >
              <span class="material-symbols-outlined text-[18px]">add</span>
              新建
            </button>
          </div>

          <div
            data-testid="dashboard-loopy-session-list"
            class="loopy-page-sidebar__body p-2 flex-1 min-h-0 overflow-y-auto"
          >
            <div v-if="loading" class="space-y-2">
              <div
                v-for="index in 6"
                :key="`dashboard-loopy-session-skeleton-${index}`"
                class="rounded-lg bg-slate-100/90 h-[68px] animate-pulse"
              />
            </div>

            <div v-else class="space-y-2">
              <button
                v-for="session in loopySessions"
                :key="session.id"
                class="loopy-page-session"
                :class="session.id === loopyActiveSessionId ? 'loopy-page-session--active' : ''"
                type="button"
                @click="switchLoopySession(session.id)"
              >
                <span class="loopy-page-session__icon" :class="session.id === loopyActiveSessionId ? 'loopy-page-session__icon--active' : ''">
                  <span class="material-symbols-outlined text-[18px]">chat_bubble</span>
                </span>
                <span class="loopy-page-session__content">
                  <span class="loopy-page-session__row">
                    <span class="loopy-page-session__title line-clamp-1">{{ resolveVisibleSessionTitle(session) }}</span>
                    <span class="loopy-page-session__time">{{ formatSessionClock(session.lastMessageAt || session.updatedAt) }}</span>
                  </span>
                  <span class="loopy-page-session__preview line-clamp-1">{{ session.preview }}</span>
                  <span class="loopy-page-session__meta-row">
                    <span class="loopy-page-session__tag">{{ session.tag }}</span>
                    <span class="loopy-page-session__meta line-clamp-1">{{ formatSessionMeta(session) }}</span>
                  </span>
                </span>
              </button>

              <p v-if="loopySessions.length === 0" class="text-xs text-slate-400 leading-6 px-3 py-4">
                还没有历史会话，发起第一轮提问即可。
              </p>
            </div>
          </div>
        </aside>

        <section class="loopy-page-main flex flex-col min-h-0 overflow-hidden lg:h-full">
          <header class="loopy-page-header">
            <div class="loopy-page-titlebox">
              <span class="loopy-page-titlebox__icon">
                <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
              </span>
              <div class="min-w-0">
                <h2 class="loopy-page-title truncate">
                  {{ chatPanelTitle }}
                </h2>
                <p v-if="chatPanelSubtitle" class="text-sm text-slate-400 leading-6 mt-1 truncate">
                  {{ chatPanelSubtitle }}
                </p>
              </div>
            </div>
          </header>

          <div v-if="loading" class="p-4 flex-1 space-y-3">
            <div class="rounded-xl bg-slate-100 h-24 animate-pulse" />
            <div class="gap-3 grid xl:grid-cols-2">
              <div class="rounded-xl bg-slate-100 h-28 animate-pulse" />
              <div class="rounded-xl bg-slate-100 h-28 animate-pulse" />
            </div>
            <div class="rounded-xl bg-slate-100 h-40 animate-pulse" />
          </div>

          <div v-else class="loopy-page-stage flex flex-1 flex-col min-h-0 overflow-hidden">
            <p v-if="loopyStatusText" class="loopy-page-banner loopy-page-banner--info">
              {{ loopyStatusText }}
            </p>
            <p v-if="errorText || loopyErrorText" class="loopy-page-banner loopy-page-banner--error">
              {{ errorText || loopyErrorText }}
            </p>

            <div
              ref="messageScrollRef"
              data-testid="dashboard-loopy-messages"
              class="loopy-page-scroll flex-1 min-h-0 overflow-y-auto"
            >
              <div class="loopy-page-scroll__inner">
                <section v-if="showSuggestionCards" class="loopy-page-suggestions">
                  <div class="loopy-page-section-label">
                    <span class="material-symbols-outlined text-[18px]">tips_and_updates</span>
                    <span>推荐提问</span>
                  </div>
                  <div class="loopy-page-suggestions__grid">
                    <button
                      v-for="item in suggestionPrompts"
                      :key="item.prompt"
                      data-testid="dashboard-loopy-suggestion"
                      class="loopy-page-suggestion"
                      type="button"
                      @click="useLoopySuggestion(item.prompt)"
                    >
                      <span class="loopy-page-suggestion__icon">
                        <span class="material-symbols-outlined text-[18px]">{{ item.icon }}</span>
                      </span>
                      <span class="loopy-page-suggestion__text">{{ item.prompt }}</span>
                      <span class="loopy-page-suggestion__arrow">
                        <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </span>
                    </button>
                  </div>
                </section>

                <div v-if="visibleMessages.length > 0" class="space-y-4">
                  <div
                    v-for="(message, index) in visibleMessages"
                    :key="`${loopyActiveSessionId}-${message.role}-${index}-${message.content.slice(0, 24)}`"
                    class="flex"
                    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                  >
                    <div
                      v-if="message.role === 'system' && resolveWorkspaceStreamSystemMessageView(message)"
                      class="loopy-page-system-message"
                      :class="`loopy-page-system-message--${resolveWorkspaceStreamSystemMessageView(message)?.eventType || 'progress'}`"
                    >
                      <span class="loopy-page-system-message__icon">
                        <span class="material-symbols-outlined text-[15px]">
                          {{ resolveLoopySystemMessageIcon(message) }}
                        </span>
                      </span>
                      <div class="loopy-page-system-message__body">
                        <div class="loopy-page-system-message__title-row">
                          <span class="loopy-page-system-message__badge">
                            {{ resolveWorkspaceStreamSystemMessageView(message)?.eventType === 'tool' ? '工具' : '进度' }}
                          </span>
                          <span class="loopy-page-system-message__title">
                            {{ resolveWorkspaceStreamSystemMessageView(message)?.title }}
                          </span>
                        </div>
                        <code
                          v-if="resolveWorkspaceStreamSystemMessageView(message)?.payloadSummary"
                          class="loopy-page-system-message__payload"
                        >
                          {{ resolveWorkspaceStreamSystemMessageView(message)?.payloadSummary }}
                        </code>
                      </div>
                    </div>

                    <article
                      v-else
                      class="loopy-page-bubble"
                      :class="message.role === 'user' ? 'loopy-page-bubble--user' : 'loopy-page-bubble--assistant'"
                    >
                      <template v-if="message.role === 'assistant'">
                        <WorkspaceAssistantMessageContent
                          class="loopy-page-bubble__assistant-content"
                          :message="buildRenderedMessage(message)"
                        />
                      </template>
                      <div v-else class="loopy-page-bubble__plain">
                        {{ formatMessageContent(message) }}
                      </div>
                    </article>
                  </div>
                </div>

                <p
                  v-else-if="!showSuggestionCards"
                  class="text-sm text-slate-400 leading-6 py-10"
                >
                  还没有消息，直接在底部输入问题即可开始。
                </p>
              </div>
            </div>

            <footer class="loopy-page-footer shrink-0">
              <div class="loopy-page-composer">
                <input
                  ref="attachmentInputRef"
                  class="sr-only"
                  type="file"
                  multiple
                  @change="handleAttachmentInput"
                >
                <textarea
                  ref="composerRef"
                  :value="loopyChatInput"
                  data-testid="dashboard-loopy-composer"
                  class="loopy-page-textarea"
                  :placeholder="loopySelectedWorkspaceId ? '直接输入内容，开始一轮新的对话' : '当前没有可用工作区，暂时无法发起对话'"
                  :disabled="!loopySelectedWorkspaceId"
                  @input="loopyChatInput = ($event.target as HTMLTextAreaElement).value"
                />
                <div
                  v-if="activeComposerPanel"
                  class="loopy-page-composer-panel"
                  :data-panel="activeComposerPanel"
                >
                  <template v-if="activeComposerPanel === 'knowledge'">
                    <div class="loopy-page-composer-panel__header">
                      <div class="loopy-page-panel-tabs" role="tablist" aria-label="资料来源">
                        <button
                          class="loopy-page-panel-tab"
                          type="button"
                          :data-active="resourceSearchScope === 'platform'"
                          @click="changeResourceScope('platform')"
                        >
                          平台资料
                        </button>
                        <button
                          class="loopy-page-panel-tab"
                          type="button"
                          :data-active="resourceSearchScope === 'project'"
                          @click="changeResourceScope('project')"
                        >
                          项目资料
                        </button>
                      </div>
                      <button class="loopy-page-panel-close" type="button" aria-label="关闭资料选择" @click="closeComposerPanel">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>

                    <div class="loopy-page-project-strip">
                      <button
                        v-for="project in projects.slice(0, 8)"
                        :key="project.id"
                        class="loopy-page-project-chip"
                        type="button"
                        :data-active="project.id === selectedLoopyProjectId"
                        @click="selectProjectForResource(project)"
                      >
                        <span class="material-symbols-outlined text-[15px]">folder_managed</span>
                        <span class="truncate">{{ project.title }}</span>
                      </button>
                      <span v-if="projectsLoading" class="loopy-page-panel-muted">项目加载中...</span>
                      <span v-else-if="projects.length === 0" class="loopy-page-panel-muted">暂无可选项目</span>
                    </div>

                    <label class="loopy-page-resource-search">
                      <span class="material-symbols-outlined text-[17px]">search</span>
                      <input
                        v-model="resourceSearchQuery"
                        type="search"
                        :placeholder="resourceSearchScope === 'platform' ? '搜索平台资料' : '搜索项目资料'"
                      >
                    </label>

                    <p v-if="resourceErrorText" class="loopy-page-panel-error">
                      {{ resourceErrorText }}
                    </p>
                    <div class="loopy-page-resource-list">
                      <button
                        v-for="resource in visibleResourceResults"
                        :key="`${resourceSearchScope}-${resource.id}`"
                        class="loopy-page-resource-row"
                        type="button"
                        @click="selectResourceContext(resource)"
                      >
                        <span class="loopy-page-resource-row__icon">
                          <span class="material-symbols-outlined text-[17px]">description</span>
                        </span>
                        <span class="loopy-page-resource-row__body">
                          <span class="loopy-page-resource-row__title">{{ resource.title }}</span>
                          <span class="loopy-page-resource-row__meta">{{ resolveResourceMeta(resource) || '资料' }}</span>
                        </span>
                      </button>
                      <p v-if="resourcesLoading" class="loopy-page-panel-empty">资料加载中...</p>
                      <p v-else-if="visibleResourceResults.length === 0" class="loopy-page-panel-empty">暂无匹配资料</p>
                    </div>
                  </template>

                  <template v-else-if="activeComposerPanel === 'command'">
                    <div class="loopy-page-composer-panel__header">
                      <span class="loopy-page-panel-title">命令</span>
                      <button class="loopy-page-panel-close" type="button" aria-label="关闭命令面板" @click="closeComposerPanel">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                    <div class="loopy-page-command-list">
                      <button
                        v-for="command in commandItems"
                        :key="command.id"
                        class="loopy-page-command-row"
                        type="button"
                        @click="applyCommandPrompt(command.prompt)"
                      >
                        <span>
                          <strong>{{ command.label }}</strong>
                          <small>{{ command.description }}</small>
                        </span>
                        <span class="material-symbols-outlined text-[17px]">arrow_forward</span>
                      </button>
                    </div>
                  </template>

                  <template v-else-if="activeComposerPanel === 'speed'">
                    <div class="loopy-page-composer-panel__header">
                      <span class="loopy-page-panel-title">回答速度</span>
                      <button class="loopy-page-panel-close" type="button" aria-label="关闭速度选择" @click="closeComposerPanel">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                    <div class="loopy-page-speed-list">
                      <button
                        v-for="option in aiSpeedOptions"
                        :key="option.id"
                        class="loopy-page-speed-row"
                        type="button"
                        :data-active="option.id === selectedAiSpeed"
                        @click="selectAiSpeed(option.id)"
                      >
                        <span>
                          <strong>{{ option.label }}</strong>
                          <small>{{ option.description }}</small>
                        </span>
                        <span v-if="option.id === selectedAiSpeed" class="material-symbols-outlined text-[17px]">check</span>
                      </button>
                    </div>
                  </template>
                </div>
                <div class="loopy-page-composer__footer">
                  <div class="loopy-page-composer__tools">
                    <button
                      v-for="action in composerQuickActions"
                      :key="action.id"
                      class="loopy-page-composer__tool"
                      type="button"
                      :disabled="!loopySelectedWorkspaceId"
                      @click="handleQuickAction(action.id)"
                    >
                      <span class="material-symbols-outlined text-[18px]">{{ action.icon }}</span>
                      <span>{{ action.label }}</span>
                    </button>
                  </div>

                  <div class="loopy-page-composer__controls">
                    <button
                      class="loopy-page-ai-selector"
                      type="button"
                      :disabled="!loopySelectedWorkspaceId"
                      @click="toggleComposerPanel('speed')"
                    >
                      <span class="material-symbols-outlined text-[16px]">auto_awesome</span>
                      <span>AI 回答速度</span>
                      <span class="loopy-page-ai-selector__value">{{ selectedAiSpeedOption.label }}</span>
                      <span class="material-symbols-outlined text-[16px]">expand_more</span>
                    </button>

                    <button
                      class="loopy-page-send"
                      type="button"
                      :disabled="!loopyCanSend || !loopyChatInput.trim()"
                      @click="sendLoopyMessage()"
                    >
                      <span class="material-symbols-outlined text-[18px]">{{ loopyChatLoading ? 'hourglass_top' : 'send' }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.loopy-page-shell {
  position: relative;
  border: none;
  border-radius: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%);
  box-shadow: none;
}

.loopy-page-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.68) 0%, rgba(239, 246, 255, 0.16) 100%);
  pointer-events: none;
}

.loopy-page-sidebar,
.loopy-page-main {
  position: relative;
  z-index: 1;
}

.loopy-page-sidebar {
  border-right: 1px solid #dbe4f2;
  background: linear-gradient(180deg, #fbfcff 0%, #f7faff 100%);
}

.loopy-page-sidebar__body {
  scrollbar-width: thin;
  scrollbar-color: #d9e1ef transparent;
}

.loopy-page-ghost-btn {
  height: 38px;
  padding: 0 12px;
  border: 1px solid #dbe4f2;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  color: #334155;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.loopy-page-ghost-btn:hover {
  border-color: #bfd2f8;
  color: #0f172a;
  background: #fff;
}

.loopy-page-session {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: #334155;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  text-align: left;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.loopy-page-session:hover {
  background: linear-gradient(180deg, #eff5ff 0%, #e7f0ff 100%);
  box-shadow: none;
}

.loopy-page-session--active {
  background: linear-gradient(180deg, #eff5ff 0%, #e7f0ff 100%);
  color: #0f172a;
  box-shadow: none;
}

.loopy-page-session__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: #edf3ff;
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.loopy-page-session__icon--active {
  background: #2f6af2;
  color: #fff;
}

.loopy-page-session:hover .loopy-page-session__icon {
  background: #2f6af2;
  color: #fff;
}

.loopy-page-session__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.loopy-page-session__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.loopy-page-session__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.loopy-page-session__time {
  font-size: 12px;
  line-height: 1.2;
  color: #94a3b8;
  flex-shrink: 0;
}

.loopy-page-session__meta {
  font-size: 12px;
  line-height: 1.45;
  color: #94a3b8;
}

.loopy-page-session__preview {
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

.loopy-page-session__meta-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.loopy-page-session__tag {
  padding: 1px 6px;
  border-radius: 999px;
  background: #eef4ff;
  color: #2f6af2;
  font-size: 10px;
  line-height: 1.45;
  font-weight: 700;
  white-space: nowrap;
}

.loopy-page-session--active .loopy-page-session__tag,
.loopy-page-session:hover .loopy-page-session__tag {
  background: #dbe9ff;
}

.loopy-page-main {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 251, 255, 0.98) 100%);
  font-size: 1rem;
}

.loopy-page-header {
  padding: 0.75rem 1rem;
  border-bottom: none;
}

.loopy-page-titlebox {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.loopy-page-titlebox__icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.625rem;
  background: #edf4ff;
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.loopy-page-title {
  margin: 0;
  color: #0f172a;
  font-size: 1.5rem;
  line-height: 1.15;
  font-weight: 600;
}

.loopy-page-stage {
  position: relative;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(250, 252, 255, 0.98) 100%);
}

.loopy-page-stage::after {
  content: '';
  position: absolute;
  right: -96px;
  bottom: -20px;
  width: min(52vw, 760px);
  height: 360px;
  background:
    repeating-radial-gradient(circle at 68% 72%, rgba(148, 163, 184, 0.22) 0 1px, transparent 1px 18px),
    radial-gradient(circle at 48% 55%, rgba(191, 219, 254, 0.34), transparent 42%),
    radial-gradient(circle at 70% 82%, rgba(96, 165, 250, 0.22), transparent 28%);
  opacity: 0.58;
  transform: rotate(-10deg);
  pointer-events: none;
}

.loopy-page-stage > * {
  position: relative;
  z-index: 1;
}

.loopy-page-banner {
  margin: 0;
  padding: 0.625rem 1rem;
  font-size: 0.75rem;
  line-height: 1.5;
  border-radius: 0;
}

.loopy-page-banner--info {
  color: #1d4ed8;
  background: rgba(239, 246, 255, 0.9);
  border: 1px solid rgba(191, 219, 254, 0.9);
  border-left: none;
  border-right: none;
}

.loopy-page-banner--error {
  color: #be123c;
  background: rgba(255, 241, 242, 0.94);
  border: 1px solid rgba(254, 205, 211, 0.96);
  border-left: none;
  border-right: none;
}

.loopy-page-scroll {
  scrollbar-width: thin;
  scrollbar-color: #d9e1ef transparent;
}

.loopy-page-scroll__inner {
  width: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 100%;
  padding: 0.75rem 1rem 1rem;
}

.loopy-page-suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.loopy-page-section-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #607596;
  font-size: 0.8125rem;
  font-weight: 600;
}

.loopy-page-suggestions__grid {
  display: grid;
  gap: 0.625rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.loopy-page-bubble {
  max-width: min(52rem, 80%);
  border-radius: 0.875rem;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.03);
}

.loopy-page-bubble--assistant {
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.loopy-page-bubble--user {
  background: linear-gradient(180deg, #eff5ff 0%, #e6efff 100%);
  color: #1e3a8a;
  border: 1px solid #c7dafc;
  padding: 0.75rem 0.875rem;
}

.loopy-page-bubble__plain {
  font-size: 0.875rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.loopy-page-bubble__assistant-content {
  --wl-ws-font-xs: 14px;
  --wl-ws-font-sm: 14px;
  --wl-ws-font-md: 14px;
  --wl-ws-font-lg: 14px;
  --wl-ws-font-xl: 15px;
  --wl-ws-font-2xl: 16px;
  width: 100%;
  padding: 0.875rem 1rem;
}

.loopy-page-bubble__assistant-content :deep(.workspace-chat-markdown) {
  line-height: 1.65;
}

.loopy-page-bubble__assistant-content :deep(.workspace-chat-markdown__paragraph) {
  color: #334155;
}

.loopy-page-bubble__assistant-content :deep(.workspace-chat-markdown__code-block) {
  margin-top: 0.625rem;
}

.loopy-page-bubble__assistant-content :deep(.workspace-assistant-message-content) {
  gap: 0.625rem;
}

.loopy-page-system-message {
  max-width: min(36rem, 78%);
  padding: 0.625rem 0.75rem;
  border: 1px solid rgba(214, 223, 238, 0.96);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: #475569;
  display: inline-flex;
  align-items: flex-start;
  gap: 0.625rem;
}

.loopy-page-system-message--progress {
  border-color: rgba(191, 219, 254, 0.96);
  background: rgba(248, 251, 255, 0.82);
}

.loopy-page-system-message--tool {
  border-color: rgba(226, 232, 240, 0.96);
  background: rgba(255, 255, 255, 0.8);
}

.loopy-page-system-message__icon {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.96);
  color: #2563eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.loopy-page-system-message--tool .loopy-page-system-message__icon {
  background: rgba(241, 245, 249, 0.96);
  color: #475569;
}

.loopy-page-system-message__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.loopy-page-system-message__title-row {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.loopy-page-system-message__badge {
  padding: 0.125rem 0.375rem;
  border-radius: 8px;
  background: rgba(37, 99, 235, 0.08);
  color: #2563eb;
  font-size: 0.6875rem;
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.loopy-page-system-message--tool .loopy-page-system-message__badge {
  background: rgba(15, 23, 42, 0.06);
  color: #475569;
}

.loopy-page-system-message__title {
  min-width: 0;
  color: #334155;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 600;
}

.loopy-page-system-message__payload {
  margin: 0;
  padding: 0.125rem 0;
  color: #64748b;
  font-size: 0.75rem;
  line-height: 1.45;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.loopy-page-suggestion {
  padding: 0.875rem 1rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.875rem;
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: left;
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) 1rem;
  gap: 0.75rem;
  align-items: center;
  min-height: 4.75rem;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.loopy-page-suggestion:hover {
  border-color: #c6d8fb;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.04);
  transform: translateY(-1px);
}

.loopy-page-suggestion__icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.75rem;
  background: #edf4ff;
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.loopy-page-suggestion__text {
  min-width: 0;
  font-weight: 600;
}

.loopy-page-suggestion__arrow {
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.loopy-page-footer {
  padding: 0;
  border-top: none;
  background: transparent;
}

.loopy-page-composer {
  position: relative;
  border: none;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  box-shadow: none;
  overflow: visible;
}

.loopy-page-composer-panel {
  position: absolute;
  left: 1rem;
  bottom: 4.25rem;
  width: min(42rem, calc(100% - 2rem));
  max-height: min(24rem, 48vh);
  padding: 0.75rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  overflow: hidden;
  z-index: 4;
}

.loopy-page-composer-panel[data-panel='speed'] {
  left: auto;
  right: 5rem;
  width: min(22rem, calc(100% - 2rem));
}

.loopy-page-composer-panel__header {
  min-height: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.loopy-page-panel-title {
  color: #0f172a;
  font-size: 0.8125rem;
  font-weight: 700;
}

.loopy-page-panel-tabs {
  display: inline-flex;
  padding: 0.1875rem;
  border-radius: 0.625rem;
  background: #f1f5f9;
  gap: 0.125rem;
}

.loopy-page-panel-tab,
.loopy-page-panel-close {
  border: none;
  background: transparent;
}

.loopy-page-panel-tab {
  height: 1.75rem;
  padding: 0 0.625rem;
  border-radius: 0.5rem;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
}

.loopy-page-panel-tab[data-active='true'] {
  background: #fff;
  color: #1d4ed8;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}

.loopy-page-panel-close {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
  color: #94a3b8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.loopy-page-panel-close:hover {
  color: #334155;
  background: #f1f5f9;
}

.loopy-page-project-strip {
  display: flex;
  gap: 0.375rem;
  overflow-x: auto;
  scrollbar-width: thin;
}

.loopy-page-project-chip {
  max-width: 11rem;
  height: 2rem;
  padding: 0 0.625rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.625rem;
  background: #fff;
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  flex: 0 0 auto;
  font-size: 0.75rem;
  font-weight: 700;
}

.loopy-page-project-chip[data-active='true'] {
  border-color: #93b7fd;
  background: #eff5ff;
  color: #1d4ed8;
}

.loopy-page-resource-search {
  height: 2.25rem;
  padding: 0 0.625rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.625rem;
  background: #fff;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.loopy-page-resource-search input {
  min-width: 0;
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: #0f172a;
  font-size: 0.8125rem;
}

.loopy-page-resource-list,
.loopy-page-command-list,
.loopy-page-speed-list {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  scrollbar-width: thin;
}

.loopy-page-resource-row,
.loopy-page-command-row,
.loopy-page-speed-row {
  width: 100%;
  border: none;
  border-radius: 0.625rem;
  background: transparent;
  color: #334155;
  text-align: left;
}

.loopy-page-resource-row {
  padding: 0.5rem;
  display: grid;
  grid-template-columns: 1.875rem minmax(0, 1fr);
  gap: 0.5rem;
  align-items: center;
}

.loopy-page-resource-row:hover,
.loopy-page-command-row:hover,
.loopy-page-speed-row:hover {
  background: #f5f8ff;
}

.loopy-page-resource-row__icon {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
  background: #edf4ff;
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.loopy-page-resource-row__body,
.loopy-page-command-row span,
.loopy-page-speed-row span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.loopy-page-resource-row__title {
  color: #0f172a;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loopy-page-resource-row__meta,
.loopy-page-command-row small,
.loopy-page-speed-row small,
.loopy-page-panel-muted,
.loopy-page-panel-empty {
  color: #94a3b8;
  font-size: 0.75rem;
  line-height: 1.4;
}

.loopy-page-command-row,
.loopy-page-speed-row {
  padding: 0.625rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.loopy-page-command-row strong,
.loopy-page-speed-row strong {
  color: #0f172a;
  font-size: 0.8125rem;
}

.loopy-page-speed-row[data-active='true'] {
  background: #eff5ff;
  color: #1d4ed8;
}

.loopy-page-panel-error {
  margin: 0;
  color: #be123c;
  font-size: 0.75rem;
  line-height: 1.5;
}

.loopy-page-panel-empty {
  margin: 0;
  padding: 0.75rem;
}

.loopy-page-textarea {
  width: 100%;
  min-height: 8.5rem;
  resize: none;
  border: none;
  background: transparent;
  color: #0f172a;
  font-size: 0.875rem;
  line-height: 1.55;
  padding: 0.875rem 1rem 4rem;
  outline: none;
}

.loopy-page-textarea:focus {
  box-shadow: none;
}

.loopy-page-composer__footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.625rem;
  padding: 0.5rem 1rem 0.75rem;
}

.loopy-page-composer__tools {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.loopy-page-composer__controls {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.loopy-page-composer__tool {
  height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.96);
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.loopy-page-composer__tool:hover:not(:disabled) {
  border-color: #bfd2f8;
  color: #1d4ed8;
  background: #fff;
}

.loopy-page-composer__tool:focus-visible,
.loopy-page-ai-selector:focus-visible,
.loopy-page-send:focus-visible,
.loopy-page-panel-tab:focus-visible,
.loopy-page-panel-close:focus-visible,
.loopy-page-project-chip:focus-visible,
.loopy-page-resource-row:focus-visible,
.loopy-page-command-row:focus-visible,
.loopy-page-speed-row:focus-visible {
  outline: 2px solid rgba(47, 106, 242, 0.28);
  outline-offset: 2px;
}

.loopy-page-composer__tool:disabled {
  opacity: 0.5;
}

.loopy-page-ai-selector {
  height: 2.375rem;
  padding: 0 0.75rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.96);
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.loopy-page-ai-selector:hover:not(:disabled) {
  border-color: #bfd2f8;
  color: #1d4ed8;
  background: #fff;
}

.loopy-page-ai-selector:disabled {
  opacity: 0.5;
}

.loopy-page-ai-selector__value {
  color: #2f6af2;
}

.loopy-page-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  border-radius: 0.75rem;
  background: linear-gradient(180deg, #8bb0ff 0%, #6e97f6 100%);
  color: #fff;
  box-shadow: 0 14px 26px rgba(79, 121, 227, 0.28);
}

.loopy-page-send:disabled {
  opacity: 0.45;
  box-shadow: none;
}

@media (max-width: 1279px) {
  .loopy-page-suggestions__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1023px) {
  .loopy-page-stage::after {
    width: 88vw;
    right: -120px;
    bottom: 30px;
  }

  .loopy-page-header {
    padding-left: 0.875rem;
    padding-right: 0.875rem;
  }
}

@media (max-width: 767px) {
  .loopy-page-header {
    padding: 0.75rem 0.75rem 0.625rem;
  }

  .loopy-page-titlebox__icon {
    width: 1.625rem;
    height: 1.625rem;
    border-radius: 0.625rem;
  }

  .loopy-page-title {
    font-size: 1.25rem;
  }

  .loopy-page-scroll__inner {
    gap: 0.625rem;
    padding: 0.5rem 0.75rem 0.875rem;
  }

  .loopy-page-suggestion {
    min-height: 4.25rem;
    padding: 0.75rem 0.875rem;
    grid-template-columns: 2rem minmax(0, 1fr) 1rem;
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  .loopy-page-system-message {
    max-width: 100%;
    padding: 0.5rem 0.625rem;
    border-radius: 14px;
  }

  .loopy-page-textarea {
    min-height: 8rem;
    padding: 0.75rem 0.75rem 5.5rem;
    font-size: 0.875rem;
  }

  .loopy-page-composer-panel,
  .loopy-page-composer-panel[data-panel='speed'] {
    left: 0.75rem;
    right: 0.75rem;
    bottom: 6rem;
    width: auto;
    max-height: min(24rem, 54vh);
  }

  .loopy-page-composer__footer {
    align-items: stretch;
    flex-direction: column;
    padding: 0.5rem 0.75rem 0.75rem;
  }

  .loopy-page-composer__tools {
    gap: 0.5rem;
  }

  .loopy-page-composer__controls {
    justify-content: flex-end;
  }

  .loopy-page-composer__tool {
    height: 2.25rem;
    padding: 0 0.75rem;
    font-size: 0.75rem;
  }

  .loopy-page-send {
    width: 2.625rem;
    height: 2.625rem;
  }
}
</style>
