import type {
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeIndexSourceStatus,
  ProjectKnowledgeIndexTaskSnapshot,
  Resource,
  ResourceCategory,
  ResourceKind,
} from '~~/shared/types/domain'

const MOCK_SOURCE = 'loopy-data-showcase-mockup'
const MOCK_UPDATED_AT = '2026-05-06T15:21:17.000+08:00'

interface LoopyMockResourceSeed {
  id: string
  title: string
  category: ResourceCategory
  resourceKind: ResourceKind
  source: NonNullable<Resource['source']>
  summary: string
  chunkTotal: number
  chunkIndexed: number
  embeddingStatus: 'native' | 'derived'
}

const MOCK_RESOURCE_SEEDS: LoopyMockResourceSeed[] = [
  {
    id: 'loopy-mock-device-plan',
    title: '设备排布',
    category: 'basic_info',
    resourceKind: 'binary',
    source: 'collab',
    summary: '用于说明演示现场设备、屏幕、摄像头与答辩动线的排布资料。',
    chunkTotal: 18,
    chunkIndexed: 18,
    embeddingStatus: 'native',
  },
  {
    id: 'loopy-mock-roadshow-script',
    title: '终审路演稿 v7',
    category: 'submission_examples',
    resourceKind: 'markdown',
    source: 'collab',
    summary: '覆盖问题定义、方案机制、关键指标、演示节奏与收束句。',
    chunkTotal: 26,
    chunkIndexed: 26,
    embeddingStatus: 'native',
  },
  {
    id: 'loopy-mock-contest-notice',
    title: '“中国软件杯”大学生软件设计大赛 2024第十三届赛事通知',
    category: 'policy_notice',
    resourceKind: 'binary',
    source: 'library',
    summary: '提取赛事方向、提交要求、评审规则和时间节点。',
    chunkTotal: 22,
    chunkIndexed: 22,
    embeddingStatus: 'derived',
  },
  {
    id: 'loopy-mock-score-rubric',
    title: '评分细则与答辩要求',
    category: 'scoring',
    resourceKind: 'binary',
    source: 'library',
    summary: '拆解创新性、技术实现、应用价值、材料完整度与答辩表现。',
    chunkTotal: 24,
    chunkIndexed: 24,
    embeddingStatus: 'native',
  },
  {
    id: 'loopy-mock-pilot-metrics',
    title: '三轮试点数据与指标口径',
    category: 'basic_info',
    resourceKind: 'binary',
    source: 'upload',
    summary: '记录资料命中率、准备时长、用户留存和人工复核节省量。',
    chunkTotal: 20,
    chunkIndexed: 20,
    embeddingStatus: 'native',
  },
  {
    id: 'loopy-mock-risk-compliance',
    title: '合规与数据边界说明',
    category: 'compliance',
    resourceKind: 'markdown',
    source: 'collab',
    summary: '说明权限、日志脱敏、外部资料来源和生产调用边界。',
    chunkTotal: 16,
    chunkIndexed: 16,
    embeddingStatus: 'derived',
  },
  {
    id: 'loopy-mock-user-profile',
    title: '用户画像与团队能力记录',
    category: 'basic_info',
    resourceKind: 'markdown',
    source: 'collab',
    summary: '记录成员角色、技术栈、赛事偏好、可投入时间和材料短板。',
    chunkTotal: 15,
    chunkIndexed: 15,
    embeddingStatus: 'native',
  },
  {
    id: 'loopy-mock-contest-fit',
    title: '项目-赛事契合度评估表',
    category: 'scoring',
    resourceKind: 'binary',
    source: 'upload',
    summary: '按创新性、落地性、证据完整度、答辩优势和准备成本评分。',
    chunkTotal: 19,
    chunkIndexed: 19,
    embeddingStatus: 'derived',
  },
  {
    id: 'loopy-mock-defense-faq',
    title: '评委高频追问清单',
    category: 'past_questions',
    resourceKind: 'markdown',
    source: 'library',
    summary: '覆盖替代方案、获客成本、数据真实性、竞品差异和团队分工。',
    chunkTotal: 21,
    chunkIndexed: 21,
    embeddingStatus: 'native',
  },
  {
    id: 'loopy-mock-demo-flow',
    title: '演示路线与流程画布',
    category: 'templates',
    resourceKind: 'draw',
    source: 'collab',
    summary: '串联登录、资料检索、语义图谱、AI 问答和终审导出流程。',
    chunkTotal: 14,
    chunkIndexed: 14,
    embeddingStatus: 'derived',
  },
  {
    id: 'loopy-mock-design-draft',
    title: '设计稿',
    category: 'submission_examples',
    resourceKind: 'draw',
    source: 'collab',
    summary: '沉淀产品首屏、工作台、Loopy 数据页和移动端状态。',
    chunkTotal: 17,
    chunkIndexed: 17,
    embeddingStatus: 'derived',
  },
  {
    id: 'loopy-mock-review-summary',
    title: '终审复盘结论',
    category: 'faq',
    resourceKind: 'markdown',
    source: 'collab',
    summary: '汇总评委反馈、缺口优先级、下一轮材料补强动作。',
    chunkTotal: 13,
    chunkIndexed: 13,
    embeddingStatus: 'native',
  },
]

function normalizeProjectId(projectId: string): string {
  return String(projectId || '').trim() || 'loopy-mock-project'
}

export function createLoopyMockResources(projectId: string): Resource[] {
  const normalizedProjectId = normalizeProjectId(projectId)
  return MOCK_RESOURCE_SEEDS.map((seed, index) => ({
    id: `${normalizedProjectId}-${seed.id}`,
    projectId: normalizedProjectId,
    contestId: '',
    sortOrder: 1000 + index,
    resourceKind: seed.resourceKind,
    collabPurpose: seed.resourceKind === 'draw' ? (seed.id.includes('demo') ? 'workflow' : 'design') : seed.resourceKind === 'markdown' ? 'notes' : undefined,
    title: seed.title,
    type: seed.category,
    year: 2026,
    sourceLink: '',
    availability: 'login_required',
    summary: seed.summary,
    copyrightNote: '',
    metadata: {
      mock: true,
      source: MOCK_SOURCE,
      fileName: seed.resourceKind === 'markdown' ? `${seed.title}.md` : `${seed.title}.pdf`,
      mimeType: seed.resourceKind === 'markdown' ? 'text/markdown' : seed.resourceKind === 'draw' ? 'application/json' : 'application/pdf',
      fileSize: 368640 + index * 81920,
    },
    category: seed.category,
    sourceType: seed.source,
    source: seed.source,
    status: 'active',
    createdAt: MOCK_UPDATED_AT,
    updatedAt: MOCK_UPDATED_AT,
  }))
}

export function mergeLoopyMockResources(resources: Resource[], projectId: string): Resource[] {
  const current = Array.isArray(resources) ? resources : []
  const existingIds = new Set(current.map(resource => String(resource.id || '').trim()).filter(Boolean))
  const mocks = createLoopyMockResources(projectId).filter(resource => !existingIds.has(resource.id))
  return [...current, ...mocks]
}

export function shouldUseLoopyMockDashboard(dashboard: ProjectKnowledgeIndexDashboard | null | undefined): boolean {
  if (!dashboard)
    return true
  const chunkCount = Number(dashboard.diagnostics?.chunkCount || 0)
  const realEmbeddingCount = Number(dashboard.diagnostics?.realEmbeddedChunkCount || 0)
  const fallbackEmbeddingCount = Number(dashboard.diagnostics?.fallbackEmbeddedChunkCount || 0)
  const readyCount = Number(dashboard.summary?.readyCount || 0)
  return chunkCount <= 0 || (realEmbeddingCount + fallbackEmbeddingCount <= 0 && readyCount <= 0)
}

function buildSourceStatus(resource: Resource, index: number): ProjectKnowledgeIndexSourceStatus {
  const chunkTotal = MOCK_RESOURCE_SEEDS[index]?.chunkTotal || 16
  const chunkIndexed = MOCK_RESOURCE_SEEDS[index]?.chunkIndexed || chunkTotal
  const resourceKind = resource.resourceKind || 'binary'
  const resourceSource = resource.source || 'collab'
  const sourceId = `mock-source-${index + 1}`
  return {
    id: sourceId,
    scopeType: 'project_resource',
    projectId: resource.projectId || '',
    sourceResourceId: resource.id,
    linkedContestResourceId: null,
    resourceTitle: resource.title,
    resourceKind,
    resourceSource,
    status: 'ready',
    currentStage: 'finalizing',
    currentTaskStatus: 'succeeded',
    progressPercent: 100,
    etaSeconds: 0,
    estimatedFinishedAt: null,
    chunkTotal,
    chunkIndexed,
    sourceHash: `mock-${resource.id}`,
    indexVersion: 'mockup-v1',
    lastIndexedAt: MOCK_UPDATED_AT,
    lastError: '',
    lastErrorStage: '',
    lastTaskId: `mock-task-${index + 1}`,
    updatedAt: MOCK_UPDATED_AT,
    lastTask: {
      id: `mock-task-${index + 1}`,
      projectId: resource.projectId || '',
      scopeType: 'project_resource',
      sourceResourceId: resource.id,
      linkedContestResourceId: null,
      taskType: 'upsert',
      status: 'succeeded',
      stage: 'finalizing',
      attempt: 1,
      maxAttempt: 1,
      progressPercent: 100,
      etaSeconds: 0,
      payloadJson: { mock: true, source: MOCK_SOURCE },
      resultJson: { chunkTotal, chunkIndexed },
      errorMessage: '',
      resourceTitle: resource.title,
      startedAt: MOCK_UPDATED_AT,
      finishedAt: MOCK_UPDATED_AT,
      createdAt: MOCK_UPDATED_AT,
      updatedAt: MOCK_UPDATED_AT,
    },
  }
}

export function findLoopyMockSourceStatus(dashboard: ProjectKnowledgeIndexDashboard | null | undefined, resourceId: string): ProjectKnowledgeIndexSourceStatus | null {
  const normalizedResourceId = String(resourceId || '').trim()
  if (!normalizedResourceId)
    return null
  return (dashboard?.sources || []).find(source => String(source.sourceResourceId || '').trim() === normalizedResourceId) || null
}

export function createLoopyMockDashboard(projectId: string): ProjectKnowledgeIndexDashboard {
  const normalizedProjectId = normalizeProjectId(projectId)
  const resources = createLoopyMockResources(normalizedProjectId)
  const sources = resources.map(buildSourceStatus)
  const totalChunks = sources.reduce((sum, source) => sum + source.chunkTotal, 0)
  const nativeCount = sources.reduce((sum, source, index) => sum + (MOCK_RESOURCE_SEEDS[index]?.embeddingStatus === 'native' ? source.chunkIndexed : 0), 0)
  const derivedCount = totalChunks - nativeCount
  const tasks: ProjectKnowledgeIndexTaskSnapshot[] = sources.map(source => source.lastTask).filter(Boolean) as ProjectKnowledgeIndexTaskSnapshot[]

  return {
    summary: {
      projectId: normalizedProjectId,
      totalResources: resources.length,
      indexableResources: resources.length,
      pendingCount: 0,
      readyCount: resources.length,
      processingCount: 0,
      queuedCount: 0,
      failedCount: 0,
      staleCount: 0,
      skippedCount: 0,
      overallProgressPercent: 100,
      etaSeconds: 0,
      estimatedFinishedAt: null,
      lastRefreshedAt: MOCK_UPDATED_AT,
    },
    runtime: {
      clientType: 'langchain',
      embeddingConfigured: true,
      embeddingClientType: 'openai-compatible',
      embeddingApiStyle: 'openai-compatible-text',
      embeddingProvider: 'newapi',
      embeddingModel: 'tongyi-embedding-vision-plus',
      embeddingDimensions: 1024,
    },
    worker: {
      started: true,
      enabled: true,
      ticking: false,
      lastStartedAt: MOCK_UPDATED_AT,
      lastFinishedAt: MOCK_UPDATED_AT,
      lastSuccessAt: MOCK_UPDATED_AT,
      lastError: '',
    },
    diagnostics: {
      candidateResourceCount: resources.length,
      sourceCount: sources.length,
      taskCount: tasks.length,
      chunkCount: totalChunks,
      realEmbeddedChunkCount: nativeCount + derivedCount,
      fallbackEmbeddedChunkCount: 0,
      unknownEmbeddedChunkCount: 0,
      multimodalIndexedCount: resources.filter(resource => resource.resourceKind === 'draw' || resource.source === 'upload').length,
      multimodalBlockedCount: 0,
      healthState: 'healthy',
      healthMessage: '',
      embeddingHealthReason: 'mockup_ready',
      lastHealthyAt: MOCK_UPDATED_AT,
      issues: [
        {
          code: 'mockup_mode',
          severity: 'info',
          message: '真实知识索引暂无有效 chunk 时，自动接入本地 mockup 数据。',
        },
      ],
    },
    analytics: {
      relationsUpdatedAt: MOCK_UPDATED_AT,
      snapshotUpdatedAt: MOCK_UPDATED_AT,
      semanticLayoutUpdatedAt: MOCK_UPDATED_AT,
      latestSnapshotType: 'manual',
      relationsJobStatus: 'succeeded',
      snapshotJobStatus: 'succeeded',
      semanticLayoutJobStatus: 'succeeded',
      staleKinds: [],
      allReady: true,
    },
    processing: [],
    recentCompleted: sources.slice(0, 6),
    failed: [],
    sources,
    tasks,
    visuals: {
      stageFunnel: [
        { label: 'ingest', count: resources.length },
        { label: 'chunk', count: totalChunks },
        { label: 'embed', count: nativeCount + derivedCount },
        { label: 'relate', count: 36 },
      ],
      failureReasons: [],
      chunkKindDistribution: [
        { label: 'markdown_section', count: 72 },
        { label: 'document_page', count: 68 },
        { label: 'draw_summary', count: 28 },
        { label: 'resource_summary', count: totalChunks - 168 },
      ],
      resourceKindDistribution: [
        { label: 'binary', count: resources.filter(resource => resource.resourceKind === 'binary').length },
        { label: 'markdown', count: resources.filter(resource => resource.resourceKind === 'markdown').length },
        { label: 'draw', count: resources.filter(resource => resource.resourceKind === 'draw').length },
      ],
      embeddingComposition: [
        { label: 'native', count: nativeCount },
        { label: 'derived', count: derivedCount },
      ],
      taskTrend: [
        { day: '05/01', tasks: 8, succeeded: 8, failed: 0, successRate: 1 },
        { day: '05/02', tasks: 11, succeeded: 11, failed: 0, successRate: 1 },
        { day: '05/03', tasks: 14, succeeded: 13, failed: 1, successRate: 0.93 },
        { day: '05/04', tasks: 16, succeeded: 16, failed: 0, successRate: 1 },
        { day: '05/05', tasks: 18, succeeded: 18, failed: 0, successRate: 1 },
        { day: '05/06', tasks: 22, succeeded: 22, failed: 0, successRate: 1 },
      ],
      resourceStatusMatrix: {
        resourceKinds: ['binary', 'markdown', 'draw'],
        statuses: ['ready'],
        cells: [
          { resourceKind: 'binary', status: 'ready', count: resources.filter(resource => resource.resourceKind === 'binary').length },
          { resourceKind: 'markdown', status: 'ready', count: resources.filter(resource => resource.resourceKind === 'markdown').length },
          { resourceKind: 'draw', status: 'ready', count: resources.filter(resource => resource.resourceKind === 'draw').length },
        ],
      },
      topology: {
        nodes: sources.map((source, index) => ({
          id: `source:${source.id}`,
          label: source.resourceTitle,
          nodeType: 'source',
          status: 'ready',
          resourceKind: source.resourceKind,
          progressPercent: 100,
          chunkCount: source.chunkIndexed,
          updatedAt: MOCK_UPDATED_AT,
          size: 1 + Math.min(1.4, source.chunkIndexed / 18),
          depth: index % 3,
          realEmbeddingReady: true,
          fallbackOnly: false,
        })),
        links: sources.slice(1).map((source, index) => ({
          sourceId: `source:${sources[index]?.id}`,
          targetId: `source:${source.id}`,
        })),
      },
      starfieldNodes: sources.map((source, index) => ({
        id: `source:${source.id}`,
        label: source.resourceTitle,
        nodeType: 'source',
        status: 'ready',
        resourceKind: source.resourceKind,
        progressPercent: 100,
        chunkCount: source.chunkIndexed,
        updatedAt: MOCK_UPDATED_AT,
        size: 1 + Math.min(1.4, source.chunkIndexed / 18),
        depth: index % 3,
        realEmbeddingReady: true,
        fallbackOnly: false,
      })),
      healthMatrix: [
        { modality: 'text', embeddingStatus: 'native', count: nativeCount },
        { modality: 'image', embeddingStatus: 'derived', count: Math.round(derivedCount * 0.45) },
        { modality: 'draw', embeddingStatus: 'derived', count: Math.round(derivedCount * 0.28) },
        { modality: 'unknown', embeddingStatus: 'derived', count: Math.max(0, derivedCount - Math.round(derivedCount * 0.73)) },
      ],
      pipelineMetrics: [
        { stage: 'ingest', status: 'success', inputCount: resources.length, outputCount: resources.length, errorCount: 0, latencyMs: 180, modelName: 'resource-ingest', fallbackUsed: false, qualityScore: 0.98 },
        { stage: 'normalize', status: 'success', inputCount: resources.length, outputCount: totalChunks, errorCount: 0, latencyMs: 620, modelName: 'document-normalizer', fallbackUsed: false, qualityScore: 0.94 },
        { stage: 'chunk', status: 'success', inputCount: totalChunks, outputCount: totalChunks, errorCount: 0, latencyMs: 420, modelName: 'semantic-splitter', fallbackUsed: false, qualityScore: 0.93 },
        { stage: 'embed', status: 'success', inputCount: totalChunks, outputCount: nativeCount + derivedCount, errorCount: 0, latencyMs: 980, modelName: 'tongyi-embedding-vision-plus', fallbackUsed: false, qualityScore: 0.91 },
        { stage: 'relate', status: 'success', inputCount: nativeCount + derivedCount, outputCount: 36, errorCount: 0, latencyMs: 360, modelName: 'loopy-relations', fallbackUsed: false, qualityScore: 0.89 },
      ],
      clusterMetrics: {
        clusterCompactness: 0.82,
        nearestNeighborConsistency: 0.79,
        crossModalAlignmentScore: 0.74,
      },
    },
  }
}
