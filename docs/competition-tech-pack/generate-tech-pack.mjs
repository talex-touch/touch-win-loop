import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..', '..')
const OUT_DIR = path.join(ROOT, 'docs', 'competition-tech-pack')
const PAPER_DIR = path.join(OUT_DIR, 'figures', 'paper')
const PPT_DIR = path.join(OUT_DIR, 'figures', 'ppt')
const SOURCE_DIR = path.join(OUT_DIR, 'figures', 'source')

const FIGURES = [
  {
    id: 'F01',
    slug: 'overall-architecture',
    title: 'WinLoop 总体技术架构',
    subtitle: '面向竞赛团队的 AI 作战系统全景',
    guide: '以团队、项目、资源和智能运行时为核心，把资料沉淀、协作推进、知识推理与答辩准备收敛到同一工作台。',
    core: ['Team-First 空间', '项目工作台', '统一资源池', 'AI 运行时'],
    modules: ['Nuxt 应用壳', 'Nitro API', 'PostgreSQL', 'Redis / 配置缓存'],
    steps: ['团队创建项目', '资源进入索引', '场景化 AI 推理', '输出提案与答辩材料'],
    flow: ['竞赛输入', '项目沉淀', '智能推理', '可交付成果'],
    conclusion: '平台价值：把竞赛过程从“散乱资料协作”升级为“可追踪、可推理、可复盘”的系统化工作流。',
    evidence: ['README.md', 'docs/workspace-information-architecture.md', 'app/pages/team/[teamId]/project/[projectId].vue'],
    doc: '01-technical-overview.md',
  },
  {
    id: 'F02',
    slug: 'competition-loop',
    title: '竞赛业务闭环',
    subtitle: '从选赛到答辩的端到端链路',
    guide: '系统围绕竞赛团队的真实交付路径组织数据和操作，使选题、建项、资料、协作、终审与答辩形成闭环。',
    core: ['选赛推荐', '建项绑定', '资源沉淀', '答辩准备'],
    modules: ['竞赛库', '赛道 / 时间线', '项目设置', '提交与终审'],
    steps: ['筛选适配竞赛', '绑定项目与赛道', '沉淀资料与流程', '生成答辩证据'],
    flow: ['外部竞赛信息', '团队项目空间', '协作资产', '路演/答辩输出'],
    conclusion: '结果导向：每一次资料输入都服务于最终提交、评审与答辩。',
    evidence: ['README.md', 'server/utils/contest-store.ts', 'app/components/workspace/WorkspaceDefenseWorkbench.vue'],
    doc: '01-technical-overview.md',
  },
  {
    id: 'F03',
    slug: 'team-first-permission',
    title: '团队优先协作与权限',
    subtitle: '团队、成员、席位、配额和项目可见性',
    guide: 'Team 是协作和计费的边界，Project 是推进对象，成员关系决定可见性、角色权限和 AI 资源消耗范围。',
    core: ['团队空间', '成员角色', '项目对象', '配额边界'],
    modules: ['成员角色', '邀请链接', '席位管理', 'AI credits'],
    steps: ['加入团队', '创建项目', '自动绑定创建者', '按角色授权操作'],
    flow: ['用户身份', '团队上下文', '项目权限', '可见工作台'],
    conclusion: '权限闭环：项目不是孤立对象，所有访问都回到团队成员关系与角色策略。',
    evidence: ['server/utils/team-first.ts', 'server/utils/team-membership-store.ts', 'server/api/teams/[id]/members.get.ts'],
    doc: '05-workspace-resource-collaboration.md',
  },
  {
    id: 'F04',
    slug: 'project-resource-model',
    title: '项目资源统一模型',
    subtitle: '资料、文档、画布与协作用途的组合语义',
    guide: '所有项目资料先收敛为 ProjectResource，再通过 resourceKind 与 collabPurpose 决定入口、名称和交互方式。',
    core: ['资料文件', '协作文档', '画布资源', '协作用途'],
    modules: ['资料预览', '协作文档', '流程画布', '自由画布'],
    steps: ['创建或上传资源', '判定资源形态', '进入对应编辑器', '同步索引与预览'],
    flow: ['原始文件/草稿', '项目资源', '工作台入口', '协作与索引'],
    conclusion: '模型优势：减少文档、画布、文件三套对象并行带来的入口错位。',
    evidence: ['docs/collab-resource-model.md', 'server/api/projects/[id]/resources/collab.post.ts', 'server/utils/project-resource-store.ts'],
    doc: '05-workspace-resource-collaboration.md',
  },
  {
    id: 'F05',
    slug: 'ai-runtime-routing',
    title: '智能运行时与场景路由',
    subtitle: '按工作台、知识、答辩和会议分配模型能力',
    guide: 'AI 不再是全局单一配置，而是按场景解析 provider、model、能力和健康状态，降低错误默认值导致的不可控输出。',
    core: ['场景通道', '服务配置', '模型能力', '健康状态'],
    modules: ['工作台助手', '知识向量化', '答辩实时推理', '会议总结'],
    steps: ['识别当前场景', '解析候选模型', '检查配置健康', '执行并写回状态'],
    flow: ['用户意图', '场景路由', '模型/工具选择', '结构化结果'],
    conclusion: '治理重点：让每个智能场景都有明确来源、能力边界和降级原因。',
    evidence: ['server/utils/platform-ai-channels.ts', 'server/utils/ai-runtime.ts', 'server/api/user/ai/runtime.get.ts'],
    doc: '02-ai-intelligence-core.md',
  },
  {
    id: 'F06',
    slug: 'multimodal-knowledge-index',
    title: '多模态知识索引机制',
    subtitle: '来源、任务、片段、向量与后台任务的执行链',
    guide: '资源上传、文档同步、预览投影和会议转写都会进入项目级知识索引，由 worker 统一推进状态和向量化。',
    core: ['知识来源', '索引任务', '语义片段', '向量表示'],
    modules: ['文本抽取', 'OCR / 视觉投影', '会议转写', 'worker 观测'],
    steps: ['资源标记待更新', '任务入队领取', '抽取切片向量化', '状态进入就绪'],
    flow: ['项目资料', '索引任务', '语义片段', '可检索上下文'],
    conclusion: '能力闭环：多来源资料被统一压缩为可召回、可引用、可观测的知识片段。',
    evidence: ['docs/project-knowledge-rag-progress.md', 'server/utils/project-knowledge-store.ts', 'server/plugins/project-knowledge-worker.ts'],
    doc: '03-multimodal-knowledge-index.md',
  },
  {
    id: 'F07',
    slug: 'hybrid-retrieval-citation',
    title: '混合检索与可溯源引用',
    subtitle: '词法召回、向量预选、重排与引用可信链',
    guide: '回答前先构建项目知识上下文，结合 ready 优先、stale fallback 和结构化 citation，减少不可追溯结论。',
    core: ['词法召回', '向量预选', '结果重排', '证据引用'],
    modules: ['就绪优先', '过期兜底', '风险提示', '引用卡片'],
    steps: ['查询意图解析', '候选片段召回', '重排与证据选择', '写入消息元数据'],
    flow: ['用户问题', '项目知识上下文', '模型回答', '引用证据'],
    conclusion: '可信输出：模型答案必须带着资料来源、索引状态和不完整提示一起进入工作台。',
    evidence: ['server/services/ai/project-knowledge-context.ts', 'app/components/workspace/WorkspaceAssistantMessageContent.vue', 'scripts/tests/project-knowledge-focused-regression.test.mjs'],
    doc: '03-multimodal-knowledge-index.md',
  },
  {
    id: 'F08',
    slug: 'ai-session-persistence',
    title: '智能会话持久化',
    subtitle: '上下文快照、运行状态与智能体检查点',
    guide: '工作台 AI 会话不仅保存聊天消息，还保存上下文快照、运行状态和 DeepAgent checkpoint，支持续写与恢复。',
    core: ['聊天会话', '上下文快照', '运行状态', '检查点'],
    modules: ['会话上下文', '智能体检查点', '存储条目', '消息元数据'],
    steps: ['创建会话', '捕获上下文', '执行流式任务', '恢复运行状态'],
    flow: ['用户指令', '上下文快照', '智能执行', '断线续写'],
    conclusion: '连续性：AI 不再只是一次性问答，而是可恢复的项目协作参与者。',
    evidence: ['scripts/migrations/2026-04-21-ai-session-persistence.sql', 'server/services/ai/deepagent-factory.ts', 'server/utils/chat-session-context-store.ts'],
    doc: '02-ai-intelligence-core.md',
  },
  {
    id: 'F09',
    slug: 'intelligence-workflow-v1',
    title: '智能工作流第一版',
    subtitle: '定义、运行、步骤与提示/工具/智能体线性编排',
    guide: '工作流能力挂在 Loopy 数据中，保存项目级定义，按线性步骤执行，并通过审批机制处理写操作。',
    core: ['工作流定义', '运行历史', '运行步骤', '审批恢复'],
    modules: ['提示步骤', '工具步骤', '智能体步骤', '继续执行'],
    steps: ['保存定义', '触发运行', '执行步骤', '审批后继续'],
    flow: ['工作流模板', '运行历史', '变更提案', '项目更新'],
    conclusion: '编排边界：v1 保持线性和项目内上下文，优先把可靠执行闭环跑通。',
    evidence: ['docs/intelligence-workflow-v1.md', 'server/services/ai/intelligence-workflow-engine.ts', 'server/utils/project-intelligence-workflow-store.ts'],
    doc: '04-agent-workflow-runtime.md',
  },
  {
    id: 'F10',
    slug: 'loopy-data-semantic-space',
    title: '数据语义空间',
    subtitle: '知识健康、关系网络、语义空间与工作流入口',
    guide: 'Loopy Data 把索引状态、语义空间、关系网络和智能工作流统一到数据工作台，避免 AI 能力散落在设置页。',
    core: ['总览', '健康状态', '关系网络', '语义空间'],
    modules: ['索引健康', '节点详情', '关系图谱', '工作流运行'],
    steps: ['读取索引快照', '聚合节点关系', '展示语义布局', '触发智能工作流'],
    flow: ['项目资料', '数据工作台', '可视化洞察', '下一步动作'],
    conclusion: '数据中台化：AI 的输入状态、关系结构和行动入口集中呈现。',
    evidence: ['app/components/workspace/WorkspaceLoopyDataTab.vue', 'app/components/workspace/WorkspaceLoopyDataSemanticSpace.client.vue', 'server/api/projects/[id]/knowledge/semantic-layout.get.ts'],
    doc: '03-multimodal-knowledge-index.md',
  },
  {
    id: 'F11',
    slug: 'canvas-ai-collaboration',
    title: '流程/设计画布智能协作',
    subtitle: '画布快照、智能草案与人工确认写回',
    guide: '流程画布与设计画布复用资源模型，AI 先读取结构快照生成草案，再由用户确认写回，避免自动覆盖协作成果。',
    core: ['流程画布', '设计画布', '结构快照', '草案卡'],
    modules: ['单页写回', '基础哈希校验', '设备排布', '导出图片'],
    steps: ['保存画布 XML', '解析工作流快照', 'AI 生成草案', '人工确认写回'],
    flow: ['画布结构', 'AI 草案', '冲突校验', '可控写回'],
    conclusion: '协作安全：AI 可改图，但必须经过可预览、可校验、可拒绝的草案边界。',
    evidence: ['docs/collab-resource-model.md', 'app/components/workspace/WorkspaceFlowTab.vue', 'app/components/workspace/design/WorkspaceDesignCanvasKitHost.client.vue'],
    doc: '05-workspace-resource-collaboration.md',
  },
  {
    id: 'F12',
    slug: 'defense-realtime-agent',
    title: '答辩实时智能体',
    subtitle: '实时会议、语音识别、评委智能体与总结链路',
    guide: '答辩工作台把真实音视频会议、转写、评委 persona、实时问答和会后总结连成同一条链路。',
    core: ['实时会议', '语音识别网关', '通义桥接', '扣子桥接'],
    modules: ['音频帧', '视频帧抽样', '轮次入库', '总结与行动项'],
    steps: ['媒体采集', '实时转写', '评委智能体输出', '沉淀答辩证据'],
    flow: ['会议输入', '实时理解', '评委反馈', '复盘材料'],
    conclusion: '答辩价值：把临场问答转化为可回放、可总结、可改进的证据链。',
    evidence: ['docs/workspace-defense-workbench-progress.md', 'docs/meeting-runtime-setup.md', 'app/components/meeting/ProjectMeetingWebClient.vue'],
    doc: '06-defense-meeting-realtime-ai.md',
  },
  {
    id: 'F13',
    slug: 'feishu-sync-loop',
    title: '飞书数据同步闭环',
    subtitle: '主同步、同步项、样本分页、诊断与回填',
    guide: '飞书多维表以主同步信息为调度边界，同步项负责实体映射，运行样本和诊断数据用于解释真实同步口径。',
    core: ['同步信息', '同步项', '字段映射', '运行样本'],
    modules: ['预检', '手动执行', '定时调度', '状态回填'],
    steps: ['识别主库', '配置子表映射', '执行同步', '分页查看样本'],
    flow: ['飞书主库', '同步 worker', '平台实体', '诊断回填'],
    conclusion: '数据可信：同步结果不仅要入库，还要解释来源、数量口径和失败原因。',
    evidence: ['docs/feishu-bitable-sync-guide.md', 'server/services/feishu/bitable-sync.ts', 'app/components/admin/AdminFeishuBitableSyncEditor.vue'],
    doc: '07-data-integration-admin-ops.md',
  },
  {
    id: 'F14',
    slug: 'deployment-observability',
    title: '部署与可观测闭环',
    subtitle: '数据库、缓存、后台任务、监控与配置加密',
    guide: '运行时依赖以 PostgreSQL 为主存储，Redis 与后台配置承接运行态，worker 与 Sentry 提供异步任务和问题追踪能力。',
    core: ['主数据库', '运行缓存', '后台任务', '错误监控'],
    modules: ['配置加密', '后台健康页', '任务队列', '冒烟验收'],
    steps: ['加载运行配置', '执行业务任务', '记录状态与错误', '后台观测与告警'],
    flow: ['部署环境', '运行时服务', '观测事件', '恢复动作'],
    conclusion: '工程闭环：关键链路既要能跑，也要能诊断、能恢复、能证明状态。',
    evidence: ['README.md', 'server/api/admin/sentry/smoke.post.ts', 'server/utils/platform-ai-config-store.ts'],
    doc: '08-deployment-security-observability.md',
  },
]

const DOCS = [
  {
    file: '01-technical-overview.md',
    title: '系统总体技术白皮书',
    figures: ['F01', 'F02'],
    sections: [
      ['定位', 'WinLoop AI（赛帮帮）是一套面向竞赛团队的项目工作台，主链路是“选赛 -> 建项 -> 沉淀项目资源 -> 协作梳理 -> 提交与答辩准备”。当前实现已经围绕 Team、Project、ProjectResource、AI Runtime、知识索引和答辩工作台形成平台化架构，而不是单点聊天助手。'],
      ['核心对象', '系统以 Team 作为协作、权限、席位和 AI credits 的边界；以 Project 作为工作推进主对象；以 ProjectResource 统一承载上传资料、协作文档、流程画布和自由画布；以 ProjectOutline、Loopy Data 和 AI 会话作为派生视图与智能执行层。'],
      ['技术栈', '前端采用 Nuxt / Vue / Pinia / UnoCSS，服务端走 Nitro API 与 TypeScript 服务层，主要持久化依赖 PostgreSQL，运行配置和部分运行态能力预留 Redis。AI 能力通过平台级 channel 和 provider 配置解析，不把模型参数散落到具体页面。'],
      ['分层架构', '展示层由团队页、项目工作台、后台管理和分享页组成；业务层由资源、竞赛、会议、AI、飞书和通知服务组成；数据层围绕 PostgreSQL 表结构、资源文件引用、AI 会话上下文和 worker 状态展开。每一层都尽量保持单一职责，避免页面组件直接拼装跨域业务规则。'],
      ['主流程数据流', '用户从竞赛库或飞书同步数据进入选赛流程，创建项目后进入团队工作台；资料上传或协作文档变更会触发资源预览与知识索引；AI 侧栏、画布助手和答辩助手读取项目上下文生成建议；写操作进入变更提案或审批链路，最终沉淀为项目资源、会议纪要、答辩材料或导出包。'],
      ['关键接口面', '对外用户主入口集中在 `/team/:teamId/project/:projectId`，后台配置入口包括 AI provider、飞书集成、会议 provider、资源 worker 和 Sentry smoke。服务端 API 按领域拆分在 `server/api/projects/*`、`server/api/teams/*`、`server/api/admin/*`，便于按比赛材料解释系统边界。'],
      ['比赛表达', '在比赛材料中，建议把 WinLoop 描述为“竞赛团队的智能作战工作台”：它把资料、协作、知识推理、流程编排和答辩复盘连接为同一套可追踪系统。'],
      ['当前边界', '本资料包只描述当前仓库已落地或已有明确文档支撑的能力，不把未来计划包装为已完成能力。全仓历史类型债和未完成真实浏览器联调项需要在答辩时按“已知边界”呈现。'],
    ],
    evidence: ['README.md', 'docs/workspace-information-architecture.md', 'package.json'],
  },
  {
    file: '02-ai-intelligence-core.md',
    title: 'AI 内核与运行时技术文档',
    figures: ['F05', 'F08'],
    sections: [
      ['设计目标', 'AI 层的目标不是提供一个全局聊天入口，而是在不同工作场景下提供可配置、可观测、可恢复的智能能力。工作台问答、文档补齐、知识 embedding、视觉投影、答辩 realtime、会议总结和智能工作流都通过明确 channel 表达。'],
      ['场景路由', '运行时通过 platform AI channel 解析当前场景的 provider、model、capability 和健康状态。这样可以避免未配置模型时静默回退，也能把 degraded、writeBlocked、rebuildRecommended 等状态直接暴露给前端。'],
      ['会话连续性', 'AI 会话持久化不仅保存消息，还保存 contextSnapshot、runState、DeepAgent checkpoint 与 store item。刷新或断线后，项目页可以恢复上下文与运行状态，避免 AI 任务变成一次性不可追踪调用。'],
      ['工程边界', '只读链路可以降级提示，写链路必须显式失败或进入审批；progress/tool 等审计消息应与模型上下文分层，避免把系统事件重新喂给模型。'],
      ['关键模块', '`platform-ai-channels` 负责定义场景，`ai-runtime` 负责解析运行时配置，`workspace-agent-stream` 与 `workspace-orchestrator` 承接工作台流式任务，`deepagent-factory` 负责 DeepAgent checkpoint 读写。前端通过右侧 AI dock、状态栏 AI 配置提示和 assistant message metadata 展示运行结果。'],
      ['持久化设计', '会话上下文、checkpoint 和 store item 独立建表，避免把长运行状态塞进普通消息表。该设计让聊天消息、审计事件、上下文快照和执行恢复各自承担清晰职责，符合 KISS 与单一职责原则。'],
      ['失败与降级', '未配置 provider、模型能力不匹配、embedding 维度变化、写链路不可用等情况需要显式暴露原因。比赛讲述时应强调“可治理的智能运行时”，而不是只强调模型调用成功。'],
      ['验证建议', '修改 AI 运行时或会话链路时，优先跑 `scripts/tests/ai-session-persistence.test.mjs`、`scripts/tests/workspace-ai-stream-messages.test.mjs`、`scripts/tests/workspace-right-sidebar-ui.test.mjs` 等聚焦测试，不直接把全仓历史噪声作为当前改动结论。'],
    ],
    evidence: ['server/utils/ai-runtime.ts', 'server/utils/platform-ai-channels.ts', 'scripts/migrations/2026-04-21-ai-session-persistence.sql'],
  },
  {
    file: '03-multimodal-knowledge-index.md',
    title: '多模态知识索引与可信引用技术文档',
    figures: ['F06', 'F07', 'F10'],
    sections: [
      ['目标', '项目知识索引把上传资料、协作文档、文档预览、图片/OCR、会议纪要和转写统一转换为可检索的知识片段，服务工作台 AI、项目聊天、画布 AI 和答辩上下文。'],
      ['索引模型', '当前索引底座包含 project_knowledge_sources、project_knowledge_index_tasks 和 project_knowledge_chunks。source 是 UI 真相源，task 是 worker 调度真相源，chunk 是检索与引用真相源。'],
      ['多模态投影', 'V1 采用文本投影优先策略，不新建第二套向量表。图片摘要、OCR、会议纪要、会议转写和 Draw 摘要都被投影到统一文本 embedding 空间，降低系统复杂度。'],
      ['可信引用', '检索链路结合词法召回、向量预选、rerank、ready 优先和 stale fallback。AI 输出时把 citations、warning、usedFallback 写入 metadata，并由 WorkspaceAssistantMessageContent 渲染成可见引用卡片。'],
      ['Loopy Data', 'Loopy Data 将知识健康、关系网络、语义空间、节点详情和智能工作流集中到一个数据工作台，避免索引能力散落在项目设置页。'],
      ['执行状态', 'source 状态覆盖 pending、queued、extracting、chunking、embedding、ready、failed、stale、skipped；task 阶段覆盖 queued、extracting、chunking、embedding、finalizing。状态语义直接服务于 UI 展示、worker 调度和 AI warning。'],
      ['触发路径', '上传资源、创建协作文档、Markdown 内容同步、文档预览更新和会议产物生成都会进入知识索引链。触发点只负责标记和入队，真正执行由 worker 统一领取，避免同步请求被重任务阻塞。'],
      ['可视化与运维', '后台 knowledge worker 页面展示 backlog、recent runs、top errors、recent failures 和多模态片段分布；Loopy Data 页面展示项目级语义空间和关系网络。二者分别面向运维诊断和用户理解。'],
      ['当前边界', 'V1 默认使用文本投影优先，不做图搜图、音搜音和视频帧原生向量检索。citation 目前能打开资源，但页码/章节级定位和模型输出后验校验仍属于后续深化项。'],
      ['验证建议', '知识链路优先跑 `project-knowledge-focused-regression`、`project-knowledge-index-ui`、`project-knowledge-ai-context`、`project-knowledge-phase2` 等聚焦回归，验证入队、ready/fallback、metadata 写入和前端引用渲染。'],
    ],
    evidence: ['docs/project-knowledge-rag-progress.md', 'server/utils/project-knowledge-store.ts', 'server/services/knowledge-vision.ts'],
  },
  {
    file: '04-agent-workflow-runtime.md',
    title: 'Intelligence Workflow v1 技术文档',
    figures: ['F09'],
    sections: [
      ['目标', 'Intelligence Workflow v1 在项目工作台内提供可重复运行的智能主链，支持保存 workflow 定义、执行线性 prompt/tool/agent 步骤、记录 run 与 step 历史，并在写操作需要审核时暂停。'],
      ['数据模型', '当前采用 ai_workflow_definitions、ai_workflow_runs、ai_workflow_run_steps 三层持久化。definition_json 保存 trigger、contextSources、toolAllowlist 与 steps；run 保存触发信息与 definition snapshot；run step 保存状态、输入、输出和 review context。'],
      ['执行边界', 'V1 刻意保持线性，不做 DAG、条件分支编辑器或 cron。agent step 复用 executeWorkspaceAi，tool step 先走内置 registry 与 provider bridge，避免过早引入过宽 DSL。'],
      ['审批恢复', '项目写操作继续复用 ai_project_change_requests。关联提案 pending 时 run 进入 needs_review；提案批准后调用 continue；任一提案被拒绝则 run 失败，不做隐式跳过。'],
      ['上下文源', '当前上下文只限定在项目内，包括项目设置、项目大纲、项目资源、项目知识、用户显式选择的资源和会话记忆。这样避免把桌面 clipboard、前台应用和 secure-store 语义硬搬进 Web 项目工作台。'],
      ['工具目录', '内置工具包括工作台上下文读取、网页搜索、页面抓取和项目变更提案；provider bridge 当前覆盖飞书多维同步和 Coze workflow。工具注册表是扩展点，但 v1 不把 MCP credential UI 纳入首期范围。'],
      ['运行状态', 'run 状态包括 pending、running、completed、failed、needs_review；step 额外支持 skipped。状态需要同时服务 UI 历史、审批恢复和失败解释。'],
      ['验证建议', '修改 workflow v1 时优先跑 `scripts/tests/intelligence-workflow-v1.test.mjs`，它用 source-contract 方式绕开 Nuxt runtime import 噪声；如果触及工作台主链，再补 AI 会话和右侧栏测试。'],
    ],
    evidence: ['docs/intelligence-workflow-v1.md', 'server/services/ai/intelligence-workflow-engine.ts', 'scripts/migrations/2026-04-22-intelligence-workflow-v1.sql'],
  },
  {
    file: '05-workspace-resource-collaboration.md',
    title: '工作台协作与资源模型技术文档',
    figures: ['F03', 'F04', 'F11'],
    sections: [
      ['Team-First', 'Team 是成员、席位、邀请、权限和 AI 配额边界。项目创建、项目可见性、邀请加入和成员管理都应回到当前 Team 上下文，而不是隐式个人空间或旧 workspace-first 路径。'],
      ['统一资源模型', 'ProjectResource 是项目内一等资料对象。binary 表示上传资料或系统资源库引用，markdown + notes 表示协作文档，draw + workflow 表示项目唯一流程画布，draw + freeform 表示自由画布。'],
      ['协作入口', '固定 flow tab 与资源列表中的 workflow 资源指向同一底层对象。协作文档支持 AI 上下文补齐，画布类资源可进入 draw.io 或 CanvasKit Host，并继续复用资源预览、下载、分享和索引链路。'],
      ['画布 AI 安全边界', '流程画布通过 autosave/save 回传 XML 并解析为 workflowSnapshot。AI 生成、补全、续改或调样式时先生成草案卡，再由用户手动 apply；baseWorkflowHash 用于阻止旧草案覆盖用户新修改。'],
      ['资源操作', '资源侧栏提供上传、预览、下载、分享、复制、回收站、树结构调整和资源属性能力。分享链路复用 project_resource_shares，复制 contest-linked 资源时需要清理 linked contest id，避免唯一索引冲突。'],
      ['协同编辑', '协作文档基于 Markdown / 富文本投影与资源文档存储协作，画布类资源根据用途进入流程画布或自由设计画布。设计画布当前以 CanvasKit Host 推进，强调 frame 内编辑、图层顺序、基础图形、吸附、分组、设备排布和导出。'],
      ['权限模型', '资源读写必须先通过项目可见性和团队成员关系校验；分享页与 guest 入口使用独立 token 或 share key，不能直接绕过项目权限。'],
      ['验证建议', '资源模型变更时优先跑 workspace resource、collab markdown、drawio utils、canvas library、device arrangement 等聚焦测试，确保入口名称、resourceKind、collabPurpose 和预览行为一致。'],
    ],
    evidence: ['docs/workspace-information-architecture.md', 'docs/collab-resource-model.md', 'server/api/projects/[id]/resources/collab.post.ts'],
  },
  {
    file: '06-defense-meeting-realtime-ai.md',
    title: '答辩与会议实时智能技术文档',
    figures: ['F12'],
    sections: [
      ['目标', '答辩能力把项目会议、实时音视频、ASR、评委 persona、智能追问、turn 入库和会后总结连接成一条链路，用于模拟答辩、沉淀证据和改进路演材料。'],
      ['会议链路', '站内 Web 客户端以 LiveKit 为真实媒体实现。成员端支持入会、麦克风、摄像头、屏幕共享；guest 分享页复用同一客户端但权限更收敛。'],
      ['ASR 与会后产物', 'Web 客户端上传 PCM 音频帧，服务端转发给 ASR gateway。会议结束后由 transcript_finalize、meeting_summary、recording_finalize 后台任务沉淀会议纪要资源和录制资源。'],
      ['答辩 realtime', '答辩 sidecar 保留 LiveKit 会议壳，不把 Qwen/Coze 改成 RTC provider。Qwen 通过服务端 relay 解决浏览器鉴权头问题，Coze 作为正式依赖按需动态导入。'],
      ['数据模型', '会议领域包含 project_meetings、project_meeting_participants、project_meeting_utterances、project_meeting_jobs、project_meeting_invitees 和 guest share。答辩侧包含 persona、session、turn、round、summary 等结构，用于还原评委问答过程。'],
      ['工作台组织', 'defense 工作台是独立布局，左栏展示概述、会议状态和评委列表，中区展示比赛状态、时间线、评分、会话时间轴、证据缺口和实时控制台，右栏切到答辩语义助手。final_review 保持独立模式但复用聚合模型和 workspace chat。'],
      ['当前边界', '已验证会议链路可跑通，但真实字幕质量取决于 ASR 接法；Qwen/Coze 的浏览器端真实联调仍需继续做。当前不支持多 provider 并发、声纹识别和多评委多音色切换。'],
      ['验证建议', '优先用 `workspace-defense-ui`、`workspace-defense-realtime-ui`、`project-meeting-integration`、`admin-meeting-providers` 做静态与接口闭环，再进入 Chromium 真实设备权限和实时音视频联调。'],
    ],
    evidence: ['docs/workspace-defense-workbench-progress.md', 'docs/meeting-runtime-setup.md', 'server/services/meeting/project-meeting.ts'],
  },
  {
    file: '07-data-integration-admin-ops.md',
    title: '数据集成与后台运营技术文档',
    figures: ['F13'],
    sections: [
      ['飞书同步模型', '飞书多维同步分为“同步信息”和“同步项”。同步信息对应一个主库 appToken，并承担调度边界；同步项描述子表如何同步到 contest、track 或 resource 等平台实体。'],
      ['诊断能力', '预检会使用当前 Drawer 中尚未保存的草稿配置，方便管理员调整映射后立即确认结果。运行样本落库后支持分页查看，避免把固定 preview 上限误解为真实同步上限。'],
      ['后台配置', '管理员入口覆盖飞书集成、AI provider、会议 provider、资源 worker、通知、运营报表和发布队列等能力。后台配置应成为业务运行时真相源，敏感字段通过配置主密钥加密。'],
      ['通知边界', '平台通知、比赛临近提醒和成员变动适合进入通知中心；项目内部 activity feed 不应混入平台通知，避免用户把协作过程噪声误判为系统级事件。'],
      ['同步调度', '父级同步信息的 is_enabled 是真实执行闸门，事件同步、定时领取和手动执行都应受它控制。调度配置放在同步信息层，而不是散落在每个子表同步项中。'],
      ['字段治理', '同步项按 contest、track、resource 三类实体约束字段映射。关键字段会标重点，预检结果展示模拟同步结果，回填列从飞书字段列表选择，减少手工输入错误。'],
      ['运营分析', '后台 operations、billing、release queue、resource worker、knowledge worker 等页面提供平台运营与内容质量治理入口。它们不直接决定项目协作流程，但能证明平台具备规模化维护能力。'],
      ['验证建议', '飞书链路优先跑 bitable sync config、field guess、simulate record、sync run samples、synced data UI 等测试；通知链路跑 notification-center，避免把平台通知与项目内部动态混在一起。'],
    ],
    evidence: ['docs/feishu-bitable-sync-guide.md', 'server/services/feishu/bitable-sync.ts', 'server/utils/notification-store.ts'],
  },
  {
    file: '08-deployment-security-observability.md',
    title: '部署、安全与可观测性技术文档',
    figures: ['F14'],
    sections: [
      ['基础依赖', '运行时至少需要 PostgreSQL、Redis 和 WINLOOP_CONFIG_MASTER_KEY。PostgreSQL 是核心业务持久化依赖；Redis 主要用于运行时配置和预留能力；配置主密钥负责后台 secret 加密。'],
      ['部署链路', '仓库提供 Dockerfile、Jenkins 部署配置、1Panel webhook 示例和 smoke 脚本。开发态要求显式 WINLOOP_DEV_HOST / WINLOOP_DEV_PORT，避免静默回退造成环境误判。'],
      ['worker 可观测', '知识索引 worker、资源预览 worker、资源回收 worker、会议后处理任务和导出任务都应以后台状态页和 recent runs 证明链路可运行、可诊断。'],
      ['Sentry 与 smoke', 'Sentry 是可选能力。staging 可通过 /api/admin/sentry/smoke 对 Nitro 与 worker 两类上报路径做验证，响应头和 traceId 用于证明链路可观测。'],
      ['安全边界', 'AI、飞书、会议、OAuth 等敏感配置通过后台保存并使用 WINLOOP_CONFIG_MASTER_KEY 加密。用户可见 URL 应统一走 public app base URL 解析，避免页面随手拼 window.location.origin 造成公网入口不稳定。'],
      ['部署资产', '仓库包含 Dockerfile、Jenkins compose、pipeline、job bootstrap、1Panel webhook 示例和 smoke server 脚本。比赛材料可以把这些作为“具备工程落地条件”的证据，但不要声称所有环境都已自动化发布完成。'],
      ['恢复策略', '当 schema drift、worker 堵塞、Sentry 未初始化、AI provider 未配置或会议 provider 不可用时，系统应暴露明确错误、后台状态和 smoke 结果，而不是静默降级。'],
      ['验证建议', '部署前按 README 中的 dev、build、smoke、Sentry doctor 和会议 bring-up 路径逐项核验；如果全仓 typecheck 受历史债影响，应记录聚焦验证范围和残余风险。'],
    ],
    evidence: ['README.md', 'server/api/admin/sentry/smoke.post.ts', 'deploy/jenkins/README.zh-CN.md'],
  },
]

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function paperHtml(fig) {
  const colors = {
    blue: '#2f80ed',
    orange: '#f2994a',
    green: '#27ae60',
    gray: '#6b7280',
    ink: '#1f2937',
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f6f8; font-family: "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; }
  .canvas { width: 1800px; height: 1200px; background: #fbfcfd; color: ${colors.ink}; position: relative; overflow: hidden; }
  svg { width: 100%; height: 100%; display: block; }
  .title { font-size: 46px; font-weight: 800; letter-spacing: -1px; }
  .subtitle { font-size: 24px; font-weight: 600; fill: #4b5563; }
  .guide { font-size: 20px; fill: #5b6573; }
  .zone-title { font-size: 22px; font-weight: 800; fill: #202b3a; }
  .label { font-size: 20px; font-weight: 650; fill: #263241; }
  .small { font-size: 16px; fill: #566273; }
  .tiny { font-size: 14px; fill: #687386; }
  .num { font-size: 20px; font-weight: 800; fill: white; }
</style>
</head>
<body>
<div class="canvas">
<svg viewBox="0 0 1800 1200" role="img" aria-label="${esc(fig.title)}">
  <defs>
    <marker id="${fig.id}-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#637083"></path>
    </marker>
    <filter id="${fig.id}-shadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#9aa6b2" flood-opacity="0.18"/>
    </filter>
    <linearGradient id="${fig.id}-soft" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#eef4f9"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1800" height="1200" fill="#fbfcfd"/>
  <rect x="54" y="46" width="1692" height="1108" rx="34" fill="#ffffff" stroke="#dde5ee" stroke-width="2"/>
  <text class="title" x="90" y="114">${esc(fig.title)}</text>
  <text class="subtitle" x="90" y="154">${esc(fig.subtitle)}</text>
  <text class="guide" x="90" y="195">${esc(fig.guide)}</text>

  <rect x="90" y="245" width="650" height="590" rx="28" fill="url(#${fig.id}-soft)" stroke="#d8e2eb" filter="url(#${fig.id}-shadow)"/>
  <text class="zone-title" x="126" y="294">左侧：核心结构拆解</text>
  <circle cx="420" cy="536" r="150" fill="#edf5ff" stroke="${colors.blue}" stroke-width="5"/>
  <circle cx="420" cy="536" r="92" fill="#fff7ed" stroke="${colors.orange}" stroke-width="4"/>
  <circle cx="420" cy="536" r="38" fill="#eaf8f0" stroke="${colors.green}" stroke-width="4"/>
  ${fig.core.map((item, i) => {
    const positions = [
      { x: 126, y: 370, lx: 296, ly: 440, color: colors.blue },
      { x: 510, y: 370, lx: 500, ly: 440, color: colors.orange },
      { x: 126, y: 710, lx: 312, ly: 620, color: colors.green },
      { x: 510, y: 710, lx: 512, ly: 620, color: colors.gray },
    ]
    const p = positions[i]
    return `<rect x="${p.x}" y="${p.y - 38}" width="190" height="72" rx="18" fill="#ffffff" stroke="${p.color}" stroke-width="2"/>
      <text class="label" x="${p.x + 95}" y="${p.y + 7}" text-anchor="middle">${esc(item)}</text>
      <path d="M ${p.x + 95} ${p.y + 34} C ${p.x + 95} ${p.y + 80}, ${p.lx} ${p.ly - 40}, ${p.lx} ${p.ly}" fill="none" stroke="${p.color}" stroke-width="2.4" marker-end="url(#${fig.id}-arrow)"/>`
  }).join('')}
  <rect x="286" y="744" width="268" height="58" rx="16" fill="#ffffff" stroke="#cbd5e1"/>
  <text class="small" x="420" y="779" text-anchor="middle">局部放大：结构 — 机制 — 结果</text>

  <rect x="790" y="245" width="420" height="270" rx="28" fill="#ffffff" stroke="#d8e2eb" filter="url(#${fig.id}-shadow)"/>
  <text class="zone-title" x="826" y="294">右上：关键模块 / 条件</text>
  ${fig.modules.map((item, i) => `<rect x="${826 + (i % 2) * 188}" y="${330 + Math.floor(i / 2) * 78}" width="160" height="54" rx="16" fill="${i % 3 === 0 ? '#eaf3ff' : i % 3 === 1 ? '#fff1df' : '#eaf8f0'}" stroke="${i % 3 === 0 ? colors.blue : i % 3 === 1 ? colors.orange : colors.green}" stroke-width="1.6"/>
    <text class="small" x="${906 + (i % 2) * 188}" y="${364 + Math.floor(i / 2) * 78}" text-anchor="middle">${esc(item)}</text>`).join('')}

  <rect x="1248" y="245" width="460" height="590" rx="28" fill="#ffffff" stroke="#d8e2eb" filter="url(#${fig.id}-shadow)"/>
  <text class="zone-title" x="1284" y="294">右中：机制路径 / 工作原理</text>
  ${fig.steps.map((item, i) => {
    const y = 350 + i * 108
    const fill = [colors.blue, colors.orange, colors.green, '#8b5cf6'][i % 4]
    return `<circle cx="1316" cy="${y}" r="25" fill="${fill}"/><text class="num" x="1316" y="${y + 7}" text-anchor="middle">${i + 1}</text>
      <rect x="1360" y="${y - 32}" width="290" height="64" rx="18" fill="#f8fafc" stroke="#d6dee8"/>
      <text class="label" x="1505" y="${y + 7}" text-anchor="middle">${esc(item)}</text>
      ${i < fig.steps.length - 1 ? `<path d="M 1316 ${y + 31} L 1316 ${y + 75}" stroke="#7b8794" stroke-width="3" marker-end="url(#${fig.id}-arrow)"/>` : ''}`
  }).join('')}

  <rect x="90" y="880" width="1618" height="190" rx="28" fill="#f8fafc" stroke="#d8e2eb"/>
  <text class="zone-title" x="126" y="930">底部：输入 — 调控 — 输出关系</text>
  ${fig.flow.map((item, i) => {
    const x = 190 + i * 370
    const fills = ['#eaf3ff', '#fff1df', '#edf7ef', '#f0f2f5']
    const strokes = [colors.blue, colors.orange, colors.green, colors.gray]
    return `<rect x="${x}" y="962" width="230" height="58" rx="18" fill="${fills[i]}" stroke="${strokes[i]}" stroke-width="2"/>
      <text class="label" x="${x + 115}" y="998" text-anchor="middle">${esc(item)}</text>
      ${i < fig.flow.length - 1 ? `<path d="M ${x + 245} 991 L ${x + 345} 991" stroke="#7b8794" stroke-width="3" marker-end="url(#${fig.id}-arrow)"/>` : ''}`
  }).join('')}
  <text class="small" x="126" y="1108">${esc(fig.conclusion)}</text>
</svg>
</div>
</body>
</html>`
}

function pptHtml(fig) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #020617; font-family: "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; }
  .canvas { width: 1920px; height: 1080px; background: radial-gradient(circle at 72% 18%, #1f4f85 0%, transparent 30%), linear-gradient(135deg, #030712 0%, #0f172a 54%, #111827 100%); color: white; position: relative; overflow: hidden; }
  svg { width: 100%; height: 100%; display: block; }
  .kicker { font-size: 28px; fill: #93c5fd; font-weight: 700; letter-spacing: 3px; }
  .title { font-size: 72px; fill: #f8fafc; font-weight: 900; letter-spacing: -2px; }
  .subtitle { font-size: 30px; fill: #cbd5e1; font-weight: 600; }
  .label { font-size: 26px; fill: #f8fafc; font-weight: 800; }
  .small { font-size: 20px; fill: #cbd5e1; }
  .tiny { font-size: 17px; fill: #94a3b8; }
  .num { font-size: 23px; fill: #020617; font-weight: 900; }
</style>
</head>
<body>
<div class="canvas">
<svg viewBox="0 0 1920 1080" role="img" aria-label="${esc(fig.title)}">
  <defs>
    <marker id="${fig.id}-ppt-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8"></path>
    </marker>
    <filter id="${fig.id}-ppt-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="${fig.id}-ppt-card" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="transparent"/>
  <circle cx="1525" cy="155" r="290" fill="#0ea5e9" opacity="0.10"/>
  <circle cx="1480" cy="180" r="150" fill="#22c55e" opacity="0.08"/>
  <path d="M 80 905 C 420 760, 780 1040, 1160 880 S 1660 760, 1870 930" fill="none" stroke="#38bdf8" stroke-opacity="0.16" stroke-width="3"/>

  <text class="kicker" x="86" y="92">WINLOOP · 竞赛智能作战系统</text>
  <text class="title" x="86" y="176">${esc(fig.title)}</text>
  <text class="subtitle" x="90" y="226">${esc(fig.subtitle)}</text>

  <rect x="86" y="290" width="505" height="560" rx="36" fill="url(#${fig.id}-ppt-card)" stroke="#334155" stroke-width="2"/>
  <text class="label" x="128" y="352">核心结构</text>
  ${fig.core.map((item, i) => `<rect x="128" y="${394 + i * 96}" width="382" height="66" rx="22" fill="${i === 0 ? '#1d4ed8' : i === 1 ? '#c2410c' : i === 2 ? '#15803d' : '#475569'}" opacity="0.94"/>
    <text class="label" x="319" y="${436 + i * 96}" text-anchor="middle">${esc(item)}</text>`).join('')}

  <g filter="url(#${fig.id}-ppt-glow)">
    <circle cx="950" cy="575" r="180" fill="#082f49" stroke="#38bdf8" stroke-width="4" opacity="0.98"/>
    <circle cx="950" cy="575" r="112" fill="#0f172a" stroke="#f97316" stroke-width="4"/>
    <circle cx="950" cy="575" r="54" fill="#052e16" stroke="#22c55e" stroke-width="4"/>
  </g>
  <text class="label" x="950" y="548" text-anchor="middle">智能内核</text>
  <text class="small" x="950" y="585" text-anchor="middle">语义索引 · 场景路由</text>
  <text class="small" x="950" y="620" text-anchor="middle">实时推理 · 工作流编排</text>

  <rect x="1290" y="290" width="545" height="560" rx="36" fill="url(#${fig.id}-ppt-card)" stroke="#334155" stroke-width="2"/>
  <text class="label" x="1332" y="352">机制路径</text>
  ${fig.steps.map((item, i) => {
    const y = 412 + i * 100
    return `<circle cx="1360" cy="${y}" r="24" fill="${i % 2 === 0 ? '#38bdf8' : '#f97316'}"/>
      <text class="num" x="1360" y="${y + 8}" text-anchor="middle">${i + 1}</text>
      <text class="label" x="1410" y="${y + 9}">${esc(item)}</text>
      ${i < fig.steps.length - 1 ? `<path d="M 1360 ${y + 32} L 1360 ${y + 65}" stroke="#38bdf8" stroke-width="3" marker-end="url(#${fig.id}-ppt-arrow)"/>` : ''}`
  }).join('')}

  ${fig.modules.map((item, i) => {
    const x = 725 + (i % 2) * 455
    const y = 326 + Math.floor(i / 2) * 86
    return `<rect x="${x}" y="${y}" width="210" height="48" rx="16" fill="#0f172a" stroke="${i % 2 === 0 ? '#38bdf8' : '#f97316'}" stroke-width="2" opacity="0.92"/>
      <text class="small" x="${x + 105}" y="${y + 31}" text-anchor="middle">${esc(item)}</text>`
  }).join('')}

  <rect x="86" y="900" width="1749" height="112" rx="30" fill="#020617" fill-opacity="0.62" stroke="#1e293b"/>
  ${fig.flow.map((item, i) => {
    const x = 166 + i * 420
    return `<text class="label" x="${x}" y="956">${esc(item)}</text>
      ${i < fig.flow.length - 1 ? `<path d="M ${x + 190} 948 L ${x + 315} 948" stroke="#38bdf8" stroke-width="4" marker-end="url(#${fig.id}-ppt-arrow)"/>` : ''}`
  }).join('')}
  <text class="small" x="166" y="990">${esc(fig.conclusion)}</text>
</svg>
</div>
</body>
</html>`
}

function docMarkdown(doc) {
  const figureLinks = doc.figures.map(id => {
    const fig = FIGURES.find(item => item.id === id)
    return `![${fig.title}](./figures/paper/${fig.id}-${fig.slug}.png)\n\nPPT 版：![${fig.title} PPT](./figures/ppt/${fig.id}-${fig.slug}-ppt.png)`
  }).join('\n\n')
  const sections = doc.sections.map(([heading, body]) => `## ${heading}\n\n${body}`).join('\n\n')
  const evidence = doc.evidence.map(item => `- \`${item}\``).join('\n')
  return `# ${doc.title}\n\n> 本文档面向比赛技术评审、路演答辩和项目归档，内容基于当前仓库实现与已有文档整理。\n\n${sections}\n\n## 配套图\n\n${figureLinks}\n\n## 代码与文档依据\n\n${evidence}\n`
}

function readmeMarkdown() {
  const figureTable = FIGURES.map(fig => `| ${fig.id} | ${fig.title} | [paper](./figures/paper/${fig.id}-${fig.slug}.png) | [ppt](./figures/ppt/${fig.id}-${fig.slug}-ppt.png) | ${fig.doc} |`).join('\n')
  const docs = DOCS.map(doc => `- [${doc.title}](./${doc.file})`).join('\n')
  return `# WinLoop 比赛技术资料包\n\n本目录是一套面向比赛路演、技术评审和文章传播的资料包。交付形态为 Markdown 文档与 PNG 图片，不包含 PPTX 文件。\n\n## 推荐汇报主线\n\n1. 先讲总体架构与竞赛业务闭环，建立“竞赛团队智能作战系统”的定位。\n2. 再讲 AI 内核、多模态知识索引和可溯源引用，突出技术壁垒。\n3. 继续讲 Intelligence Workflow、Loopy Data、画布 AI 协作和答辩实时智能体，展示系统级智能闭环。\n4. 最后讲飞书同步、后台运营、部署安全和可观测性，证明平台可落地、可运行、可治理。\n\n## 技术文档\n\n${docs}\n\n## 图像索引\n\n| ID | 主题 | 论文/文章图 | PPT 图 | 关联文档 |\n| --- | --- | --- | --- | --- |\n${figureTable}\n\n## 目录说明\n\n- \`figures/paper/\`：白底科研机制图，适合技术文章、论文式材料和申报书。\n- \`figures/ppt/\`：16:9 深色路演图，适合直接插入比赛 PPT。\n- \`figures/source/\`：HTML 源文件和生成脚本，便于后续维护。\n- \`figures/figure-manifest.md\`：每张图的主题、用途和代码依据。\n\n## 生成与维护\n\n如需重新生成，请在仓库根目录执行：\n\n\`\`\`bash\nnode "docs/competition-tech-pack/generate-tech-pack.mjs"\n\`\`\`\n\n脚本只写入 \`docs/competition-tech-pack/\`，不修改应用运行时代码、数据库或 git 状态。\n`
}

function manifestMarkdown() {
  return `# Figure Manifest\n\n${FIGURES.map(fig => `## ${fig.id} ${fig.title}\n\n- 重点：${fig.subtitle}\n- 论文图：\`figures/paper/${fig.id}-${fig.slug}.png\`\n- PPT 图：\`figures/ppt/${fig.id}-${fig.slug}-ppt.png\`\n- 源文件：\`figures/source/${fig.id}-${fig.slug}.paper.html\` / \`figures/source/${fig.id}-${fig.slug}.ppt.html\`\n- 关联文档：\`${fig.doc}\`\n- 代码与文档依据：${fig.evidence.map(item => `\`${item}\``).join('、')}\n`).join('\n')}`
}

function contactSheetHtml() {
  const paperItems = FIGURES.map(fig => `<figure><img src="../paper/${fig.id}-${fig.slug}.png"><figcaption>${fig.id} paper · ${esc(fig.title)}</figcaption></figure>`).join('')
  const pptItems = FIGURES.map(fig => `<figure><img src="../ppt/${fig.id}-${fig.slug}-ppt.png"><figcaption>${fig.id} ppt · ${esc(fig.title)}</figcaption></figure>`).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{margin:0;background:#f8fafc;font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#111827}
.page{width:2400px;padding:36px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
h1{font-size:44px;margin:0 0 24px}h2{font-size:30px;margin:32px 0 18px}
figure{margin:0;background:white;border:1px solid #dbe2ea;border-radius:18px;padding:12px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
img{width:100%;display:block;border-radius:12px}figcaption{font-size:18px;margin-top:10px;color:#334155}
</style></head><body><main class="page"><h1>WinLoop 技术资料包图片总览</h1><h2>白底科研机制图</h2><section class="grid">${paperItems}</section><h2>深色 PPT 路演图</h2><section class="grid">${pptItems}</section></main></body></html>`
}

async function ensureDirs() {
  await fs.mkdir(PAPER_DIR, { recursive: true })
  await fs.mkdir(PPT_DIR, { recursive: true })
  await fs.mkdir(SOURCE_DIR, { recursive: true })
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

async function screenshotHtml(browser, htmlPath, pngPath, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' })
  await page.screenshot({ path: pngPath, fullPage: false })
  await page.close()
}

async function main() {
  await ensureDirs()

  await writeText(path.join(OUT_DIR, 'README.md'), readmeMarkdown())
  for (const doc of DOCS)
    await writeText(path.join(OUT_DIR, doc.file), docMarkdown(doc))
  await writeText(path.join(OUT_DIR, 'figures', 'figure-manifest.md'), manifestMarkdown())
  await writeText(path.join(SOURCE_DIR, 'figure-data.json'), `${JSON.stringify(FIGURES, null, 2)}\n`)

  for (const fig of FIGURES) {
    await writeText(path.join(SOURCE_DIR, `${fig.id}-${fig.slug}.paper.html`), paperHtml(fig))
    await writeText(path.join(SOURCE_DIR, `${fig.id}-${fig.slug}.ppt.html`), pptHtml(fig))
  }

  const browser = await chromium.launch({ headless: true })
  try {
    for (const fig of FIGURES) {
      await screenshotHtml(
        browser,
        path.join(SOURCE_DIR, `${fig.id}-${fig.slug}.paper.html`),
        path.join(PAPER_DIR, `${fig.id}-${fig.slug}.png`),
        { width: 1800, height: 1200 },
      )
      await screenshotHtml(
        browser,
        path.join(SOURCE_DIR, `${fig.id}-${fig.slug}.ppt.html`),
        path.join(PPT_DIR, `${fig.id}-${fig.slug}-ppt.png`),
        { width: 1920, height: 1080 },
      )
    }
    const contactHtmlPath = path.join(SOURCE_DIR, 'contact-sheet.html')
    await writeText(contactHtmlPath, contactSheetHtml())
    await screenshotHtml(
      browser,
      contactHtmlPath,
      path.join(OUT_DIR, 'figures', 'contact-sheet.png'),
      { width: 2400, height: 3600 },
    )
  }
  finally {
    await browser.close()
  }

  console.log(`Generated ${FIGURES.length * 2} PNG figures and ${DOCS.length + 1} markdown docs in ${OUT_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
