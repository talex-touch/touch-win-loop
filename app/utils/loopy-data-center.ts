import type {
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeIndexDiagnosticIssue,
  ProjectKnowledgeIndexSourceStatus,
  ProjectKnowledgeNodeDetail,
  ProjectKnowledgeRelationsPayload,
} from '~~/shared/types/domain'
import { formatWorkspaceDateTime as formatDateTime } from '~/utils/workspace-main-panel-formatters'

export type LoopyContractTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'muted'
export type LoopyViewStateTone = 'default' | 'loading' | 'success' | 'warning' | 'error'

export interface LoopyEmbeddingEntryContract {
  statusLabel: string
  statusTone: LoopyContractTone
  summary: string
  provider: string
  model: string
  dimensions: string
  client: string
  apiStyle: string
  freshness: string
  issue: string
}

export interface LoopyMetricCardContract {
  id: string
  label: string
  value: string
  note: string
  tone: LoopyContractTone
}

export interface LoopySourceCardContract {
  id: string
  title: string
  subtitle: string
  statusLabel: string
  statusTone: LoopyContractTone
  progressPercent: number
  progressLabel: string
  embeddingLabel: string
  embeddingTone: LoopyContractTone
  pipelineLabel: string
  issueLabel: string
  issueTone: LoopyContractTone
  updatedAtLabel: string
}

export interface LoopyInsightContract {
  id: string
  label: string
  value: string
  note: string
  tone: LoopyContractTone
}

export interface LoopyRecommendationContract {
  id: string
  title: string
  description: string
  tone: LoopyContractTone
}

export interface LoopyContractField {
  label: string
  source: string
  note: string
}

export interface LoopyContractSection {
  id: string
  title: string
  items: LoopyContractField[]
}

export interface LoopyStateLegendContract {
  id: string
  title: string
  description: string
  tone: LoopyViewStateTone
}

export interface LoopyOverviewContract {
  entry: LoopyEmbeddingEntryContract
  metrics: LoopyMetricCardContract[]
  sourceCards: LoopySourceCardContract[]
  composition: LoopyInsightContract[]
  pipeline: LoopyInsightContract[]
  clusters: LoopyInsightContract[]
  recommendations: LoopyRecommendationContract[]
  contractSections: LoopyContractSection[]
  stateLegends: LoopyStateLegendContract[]
}

export interface LoopyRelationNodeContract {
  id: string
  title: string
  subtitle: string
  statusLabel: string
  statusTone: LoopyContractTone
}

export interface LoopyNodeDetailContract {
  eyebrow: string
  title: string
  preview: string
  metrics: Array<{ label: string, value: string }>
}

function normalizeText(value: unknown, fallback: string | null | undefined = '-'): string {
  const normalized = String(value || '').trim()
  return normalized || String(fallback || '')
}

export function formatCompactNumber(value: number | string | null | undefined): string {
  const normalized = Math.max(0, Number(value || 0))
  if (normalized >= 1000000)
    return `${(normalized / 1000000).toFixed(normalized >= 10000000 ? 1 : 2)}M`
  if (normalized >= 1000)
    return new Intl.NumberFormat('zh-CN').format(Math.round(normalized))
  return String(Math.round(normalized))
}

export function clampPercent(value: number | string | null | undefined): number {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))))
}

export function formatPercent(value: number | string | null | undefined): string {
  return `${clampPercent(value)}%`
}

export function resolveHealthLabel(state: string | null | undefined): string {
  const normalized = normalizeText(state, '').toLowerCase()
  if (normalized === 'healthy')
    return '真实向量健康'
  if (normalized === 'fallback_only')
    return '降级可用'
  if (normalized === 'missing_runtime')
    return '缺少运行时'
  if (normalized === 'worker_inactive')
    return 'Worker 未启动'
  if (normalized === 'queued_but_not_running')
    return '队列阻塞'
  if (normalized === 'partial')
    return '部分可用'
  return '空项目'
}

export function resolveHealthTone(state: string | null | undefined): LoopyContractTone {
  const normalized = normalizeText(state, '').toLowerCase()
  if (normalized === 'healthy')
    return 'success'
  if (normalized === 'fallback_only' || normalized === 'partial')
    return 'warning'
  if (normalized === 'missing_runtime' || normalized === 'worker_inactive' || normalized === 'queued_but_not_running')
    return 'danger'
  return 'muted'
}

export function resolveEmbeddingStatusLabel(status: ProjectKnowledgeEmbeddingStatus | string | null | undefined): string {
  const normalized = normalizeText(status, '').toLowerCase()
  if (normalized === 'native')
    return '真实 embedding'
  if (normalized === 'derived')
    return '派生向量'
  if (normalized === 'fallback')
    return 'Fallback 向量'
  if (normalized === 'failed')
    return '产出失败'
  return '尚未产出'
}

export function resolveEmbeddingStatusTone(status: ProjectKnowledgeEmbeddingStatus | string | null | undefined): LoopyContractTone {
  const normalized = normalizeText(status, '').toLowerCase()
  if (normalized === 'native' || normalized === 'derived')
    return 'success'
  if (normalized === 'fallback')
    return 'warning'
  if (normalized === 'failed')
    return 'danger'
  return 'muted'
}

export function resolveSourceStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeText(status, '').toLowerCase()
  if (normalized === 'ready')
    return '已就绪'
  if (normalized === 'pending')
    return '待处理'
  if (normalized === 'queued')
    return '排队中'
  if (normalized === 'extracting')
    return '抽取中'
  if (normalized === 'chunking')
    return '切分中'
  if (normalized === 'embedding')
    return '向量化中'
  if (normalized === 'failed')
    return '失败'
  if (normalized === 'stale')
    return '待刷新'
  if (normalized === 'skipped')
    return '已跳过'
  return '未知状态'
}

export function resolveSourceStatusTone(status: string | null | undefined): LoopyContractTone {
  const normalized = normalizeText(status, '').toLowerCase()
  if (normalized === 'ready')
    return 'success'
  if (normalized === 'failed')
    return 'danger'
  if (normalized === 'stale')
    return 'warning'
  if (normalized === 'extracting' || normalized === 'chunking' || normalized === 'embedding')
    return 'primary'
  return 'muted'
}

function resolveClientLabel(value: string | null | undefined): string {
  const normalized = normalizeText(value, '').toLowerCase()
  if (normalized === 'bailian-native')
    return '百炼原生'
  if (normalized === 'coze-sdk')
    return 'Coze SDK'
  return 'OpenAI 兼容'
}

function resolveApiStyleLabel(value: string | null | undefined): string {
  const normalized = normalizeText(value, '').toLowerCase()
  if (normalized === 'bailian-multimodal')
    return '多模态原生'
  if (normalized === 'openai-compatible-text')
    return 'Text Embedding'
  if (normalized === 'openai-compatible-image')
    return 'Image Embedding'
  return normalizeText(value, '未配置')
}

function resolveIssueTone(issue: ProjectKnowledgeIndexDiagnosticIssue): LoopyContractTone {
  if (issue.severity === 'error')
    return 'danger'
  if (issue.severity === 'warning')
    return 'warning'
  return 'muted'
}

function formatSourceSubtitle(source: ProjectKnowledgeIndexSourceStatus): string {
  const chunks: string[] = []
  const resourceKind = normalizeText(source.resourceKind, '')
  const resourceSource = normalizeText(source.resourceSource, '')
  if (resourceKind)
    chunks.push(resourceKind)
  if (resourceSource)
    chunks.push(resourceSource)
  if (source.chunkTotal > 0)
    chunks.push(`${formatCompactNumber(source.chunkIndexed)}/${formatCompactNumber(source.chunkTotal)} chunk`)
  return chunks.join(' · ') || '资源节点'
}

function buildSourceCard(source: ProjectKnowledgeIndexSourceStatus): LoopySourceCardContract {
  const progressPercent = clampPercent(source.progressPercent)
  const pipelineBits: string[] = []
  const stageLabel = normalizeText(source.currentStage, '')
  const taskStatusLabel = normalizeText(source.currentTaskStatus, '')
  if (stageLabel)
    pipelineBits.push(stageLabel)
  if (taskStatusLabel)
    pipelineBits.push(taskStatusLabel)
  if (source.etaSeconds > 0)
    pipelineBits.push(`ETA ${source.etaSeconds}s`)

  const issueLabel = normalizeText(source.lastError, '')
    || (source.status === 'ready' ? '状态稳定，可用于关系图与语义空间' : '等待下一次索引调度')

  return {
    id: source.id,
    title: normalizeText(source.resourceTitle, '未命名资源'),
    subtitle: formatSourceSubtitle(source),
    statusLabel: resolveSourceStatusLabel(source.status),
    statusTone: resolveSourceStatusTone(source.status),
    progressPercent,
    progressLabel: progressPercent > 0 ? `${formatPercent(progressPercent)} · ${formatCompactNumber(source.chunkIndexed)}/${formatCompactNumber(source.chunkTotal || source.chunkIndexed)} 已入索引` : '尚未开始',
    embeddingLabel: source.status === 'ready'
      ? `${formatCompactNumber(source.chunkIndexed)} 个 chunk 可参与 embeddings / relations`
      : source.status === 'failed'
        ? '当前未形成稳定 embeddings 输出'
        : '等待 embeddings 任务完成',
    embeddingTone: source.status === 'ready' ? 'success' : source.status === 'failed' ? 'danger' : 'warning',
    pipelineLabel: pipelineBits.join(' · ') || '等待流水线启动',
    issueLabel,
    issueTone: issueLabel.includes('失败') || source.status === 'failed' ? 'danger' : source.status === 'stale' ? 'warning' : 'muted',
    updatedAtLabel: source.lastIndexedAt ? formatDateTime(source.lastIndexedAt) : formatDateTime(source.updatedAt),
  }
}

function buildRecommendations(dashboard: ProjectKnowledgeIndexDashboard): LoopyRecommendationContract[] {
  const recommendations: LoopyRecommendationContract[] = []
  const { diagnostics, runtime, analytics, summary, worker } = dashboard

  if (!runtime.embeddingConfigured) {
    recommendations.push({
      id: 'runtime',
      title: '先补齐 embeddings 运行时',
      description: '当前仍可展示存量资源状态，但不会产出真实向量、关系图和稳定语义布局。',
      tone: 'danger',
    })
  }

  if (!worker.started || !worker.enabled) {
    recommendations.push({
      id: 'worker',
      title: '恢复知识索引 Worker',
      description: 'Worker 未正常工作时，队列会堆积，主视图只能停留在旧快照。',
      tone: 'danger',
    })
  }

  if ((summary.failedCount || 0) > 0) {
    recommendations.push({
      id: 'failed',
      title: '优先处理失败资源',
      description: `${formatCompactNumber(summary.failedCount)} 个资源失败，建议先查最后错误，再重试单资源或 failed 重建。`,
      tone: 'warning',
    })
  }

  if ((summary.staleCount || 0) > 0 || (diagnostics.backfillPendingCount || 0) > 0) {
    recommendations.push({
      id: 'stale',
      title: '刷新 stale / backfill 资源',
      description: `${formatCompactNumber(summary.staleCount)} 个 stale，${formatCompactNumber(diagnostics.backfillPendingCount || 0)} 个待回填，可先做增量重建。`,
      tone: 'primary',
    })
  }

  if (!analytics.allReady) {
    recommendations.push({
      id: 'analytics',
      title: '刷新 relations / semantic analytics',
      description: '当前 analytics 快照未完全就绪，主视图会优先展示最新 dashboard 数据，但关系图和语义空间可能落后。',
      tone: 'warning',
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'healthy',
      title: '当前链路可直接接真实数据',
      description: 'Runtime、Worker、relations 与 semantic layout 已进入可用状态，可以继续扩大资源规模。',
      tone: 'success',
    })
  }

  return recommendations.slice(0, 4)
}

function buildContractSections(): LoopyContractSection[] {
  return [
    {
      id: 'embedding-entry',
      title: 'Embeddings 接入点',
      items: [
        {
          label: 'Provider / Model',
          source: 'dashboard.runtime.embeddingProvider / embeddingModel',
          note: '决定当前项目主视图、关系图和语义空间所依赖的向量来源。',
        },
        {
          label: 'Client / API Style',
          source: 'dashboard.runtime.embeddingClientType / embeddingApiStyle',
          note: '区分 OpenAI 兼容接入与百炼原生多模态接入，避免前端写死协议假设。',
        },
        {
          label: 'Freshness / Health',
          source: 'dashboard.analytics.semanticLayoutUpdatedAt / diagnostics.embeddingHealthReason',
          note: '用于判断当前 embeddings 是否只是“可展示”还是“可稳定驱动分析”。',
        },
      ],
    },
    {
      id: 'source-card',
      title: '卡片 / 节点契约',
      items: [
        {
          label: '标题',
          source: 'dashboard.sources[].resourceTitle / relations.nodes[].label',
          note: '主视图与关系节点共享统一命名来源，避免展示名和详情名不一致。',
        },
        {
          label: '状态',
          source: 'dashboard.sources[].status / currentStage / progressPercent',
          note: '统一映射 ready、processing、stale、failed，不再每个组件单独解释状态。',
        },
        {
          label: 'Embedding / Provenance',
          source: 'relations.nodes[].embeddingStatus / provenanceSourceType / metadata.embeddingModel',
          note: '关系图和节点详情统一说明是真实向量、fallback 还是缺失。',
        },
      ],
    },
    {
      id: 'state-contract',
      title: '状态态约定',
      items: [
        {
          label: '空态',
          source: '无 project / 无 source / 无 analytics 结果',
          note: '展示“当前还没有可分析数据”，而不是空白容器或占位图。',
        },
        {
          label: '加载态',
          source: 'loading=true 或 analytics 正在刷新',
          note: '首屏与后台刷新分开表达，避免用户误以为数据丢失。',
        },
        {
          label: '异常态',
          source: 'error / diagnostics.issues / source.lastError',
          note: '优先显示错误原因和推荐动作，避免只给红色样式不给处理路径。',
        },
      ],
    },
  ]
}

function buildStateLegends(): LoopyStateLegendContract[] {
  return [
    {
      id: 'loading',
      title: '加载态',
      description: '首屏或刷新阶段优先保留结构，占位文本明确说明正在读取 dashboard / analytics。',
      tone: 'loading',
    },
    {
      id: 'empty',
      title: '空态',
      description: '没有 source、没有 embeddings 或没有语义布局时，展示下一步操作，而不是静态插画。',
      tone: 'default',
    },
    {
      id: 'warning',
      title: '降级态',
      description: 'fallback_only、partial、stale 会继续展示数据，但会标明可靠性已下降。',
      tone: 'warning',
    },
    {
      id: 'error',
      title: '异常态',
      description: 'runtime 缺失、Worker 停止、source failed 都会进入异常态，并附上建议动作。',
      tone: 'error',
    },
  ]
}

function buildCompositionInsights(dashboard: ProjectKnowledgeIndexDashboard): LoopyInsightContract[] {
  const total = dashboard.visuals.embeddingComposition.reduce((sum, item) => sum + item.count, 0)
  return dashboard.visuals.embeddingComposition.slice(0, 4).map((item) => {
    const percent = total > 0 ? Math.round((item.count / total) * 100) : 0
    const lowerLabel = item.label.toLowerCase()
    const tone: LoopyContractTone = lowerLabel.includes('native')
      ? 'success'
      : lowerLabel.includes('fallback')
        ? 'warning'
        : lowerLabel.includes('missing') || lowerLabel.includes('failed')
          ? 'danger'
          : 'primary'

    return {
      id: item.label,
      label: item.label,
      value: formatCompactNumber(item.count),
      note: `${percent}%`,
      tone,
    }
  })
}

function buildPipelineInsights(dashboard: ProjectKnowledgeIndexDashboard): LoopyInsightContract[] {
  return dashboard.visuals.pipelineMetrics.slice(0, 5).map((item) => {
    const tone: LoopyContractTone = item.status === 'success'
      ? 'success'
      : item.status === 'failed' || item.status === 'blocked'
        ? 'danger'
        : item.status === 'degraded'
          ? 'warning'
          : item.status === 'running'
            ? 'primary'
            : 'muted'

    return {
      id: item.stage,
      label: item.stage,
      value: `${formatCompactNumber(item.outputCount)} / ${formatCompactNumber(item.inputCount)}`,
      note: `${Math.round(item.qualityScore * 100)}% 质量 · ${item.modelName || '系统阶段'}`,
      tone,
    }
  })
}

function buildClusterInsights(dashboard: ProjectKnowledgeIndexDashboard): LoopyInsightContract[] {
  const metrics = dashboard.visuals.clusterMetrics
  return [
    {
      id: 'compactness',
      label: 'Cluster 紧致度',
      value: formatPercent(metrics.clusterCompactness * 100),
      note: '来自 source / chunk 覆盖率与真实向量占比',
      tone: metrics.clusterCompactness >= 0.75 ? 'success' : metrics.clusterCompactness >= 0.45 ? 'warning' : 'danger',
    },
    {
      id: 'neighbor',
      label: '近邻一致性',
      value: formatPercent(metrics.nearestNeighborConsistency * 100),
      note: '用于判断语义空间中相邻节点是否可信',
      tone: metrics.nearestNeighborConsistency >= 0.75 ? 'success' : metrics.nearestNeighborConsistency >= 0.45 ? 'warning' : 'danger',
    },
    {
      id: 'cross-modal',
      label: '跨模态对齐',
      value: formatPercent(metrics.crossModalAlignmentScore * 100),
      note: '衡量文本 / 图像等多模态节点是否可在同一空间解释',
      tone: metrics.crossModalAlignmentScore >= 0.65 ? 'success' : metrics.crossModalAlignmentScore >= 0.35 ? 'warning' : 'danger',
    },
  ]
}

export function buildLoopyOverviewContract(dashboard: ProjectKnowledgeIndexDashboard): LoopyOverviewContract {
  const embeddedPointCount = Math.max(
    0,
    Number(dashboard.diagnostics.realEmbeddedChunkCount || 0)
    + Number(dashboard.diagnostics.fallbackEmbeddedChunkCount || 0)
    + Number(dashboard.diagnostics.unknownEmbeddedChunkCount || 0),
  )
  const readyRate = dashboard.summary.indexableResources > 0
    ? (dashboard.summary.readyCount / Math.max(1, dashboard.summary.indexableResources)) * 100
    : 0
  const healthLabel = resolveHealthLabel(dashboard.diagnostics.healthState)
  const healthTone = resolveHealthTone(dashboard.diagnostics.healthState)
  const issues = dashboard.diagnostics.issues.slice(0, 3)
  const issueText = issues.length > 0
    ? issues.map(issue => issue.message).join('；')
    : normalizeText(dashboard.diagnostics.healthMessage, '当前无异常')

  const metrics: LoopyMetricCardContract[] = [
    {
      id: 'sources',
      label: '数据源',
      value: formatCompactNumber(dashboard.diagnostics.candidateResourceCount || dashboard.summary.totalResources),
      note: `${formatCompactNumber(dashboard.summary.indexableResources)} 可索引`,
      tone: 'neutral',
    },
    {
      id: 'chunks',
      label: 'Chunk',
      value: formatCompactNumber(dashboard.diagnostics.chunkCount),
      note: `${formatCompactNumber(dashboard.diagnostics.multimodalIndexedCount)} 多模态资源已入索引`,
      tone: 'primary',
    },
    {
      id: 'embeddings',
      label: '向量数量',
      value: formatCompactNumber(embeddedPointCount),
      note: `${formatCompactNumber(dashboard.diagnostics.realEmbeddedChunkCount)} 真实 embedding`,
      tone: embeddedPointCount > 0 ? 'success' : 'warning',
    },
    {
      id: 'ready',
      label: '就绪率',
      value: formatPercent(readyRate),
      note: `${formatCompactNumber(dashboard.summary.readyCount)}/${formatCompactNumber(dashboard.summary.indexableResources)} ready`,
      tone: readyRate >= 80 ? 'success' : readyRate >= 45 ? 'warning' : 'danger',
    },
    {
      id: 'health',
      label: '健康状态',
      value: healthLabel,
      note: normalizeText(dashboard.diagnostics.embeddingHealthReason, dashboard.diagnostics.healthMessage),
      tone: healthTone,
    },
  ]

  const entry: LoopyEmbeddingEntryContract = {
    statusLabel: healthLabel,
    statusTone: healthTone,
    summary: dashboard.runtime.embeddingConfigured
      ? `${resolveClientLabel(dashboard.runtime.embeddingClientType)} · ${resolveApiStyleLabel(dashboard.runtime.embeddingApiStyle)}`
      : '当前项目尚未配置可产出真实 embeddings 的运行时',
    provider: normalizeText(dashboard.runtime.embeddingProvider, 'unconfigured'),
    model: normalizeText(dashboard.runtime.embeddingModel, '待配置模型'),
    dimensions: dashboard.runtime.embeddingDimensions > 0 ? `${dashboard.runtime.embeddingDimensions} 维` : '未声明维度',
    client: resolveClientLabel(dashboard.runtime.embeddingClientType),
    apiStyle: resolveApiStyleLabel(dashboard.runtime.embeddingApiStyle),
    freshness: normalizeText(dashboard.diagnostics.lastHealthyAt, dashboard.analytics.semanticLayoutUpdatedAt)
      ? formatDateTime(String(dashboard.diagnostics.lastHealthyAt || dashboard.analytics.semanticLayoutUpdatedAt || ''))
      : '暂无健康快照',
    issue: issueText,
  }

  const sourceCards = dashboard.sources
    .slice()
    .sort((left, right) => {
      const leftWeight = left.status === 'failed' ? 4 : left.status === 'stale' ? 3 : left.status === 'embedding' || left.status === 'chunking' || left.status === 'extracting' ? 2 : left.status === 'ready' ? 0 : 1
      const rightWeight = right.status === 'failed' ? 4 : right.status === 'stale' ? 3 : right.status === 'embedding' || right.status === 'chunking' || right.status === 'extracting' ? 2 : right.status === 'ready' ? 0 : 1
      if (leftWeight !== rightWeight)
        return rightWeight - leftWeight
      return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
    })
    .slice(0, 6)
    .map(buildSourceCard)

  const recommendations = [
    ...buildRecommendations(dashboard),
    ...issues.map((issue) => {
      return {
        id: issue.code,
        title: issue.code,
        description: issue.message,
        tone: resolveIssueTone(issue),
      } satisfies LoopyRecommendationContract
    }),
  ].slice(0, 6)

  return {
    entry,
    metrics,
    sourceCards,
    composition: buildCompositionInsights(dashboard),
    pipeline: buildPipelineInsights(dashboard),
    clusters: buildClusterInsights(dashboard),
    recommendations,
    contractSections: buildContractSections(),
    stateLegends: buildStateLegends(),
  }
}

export function buildLoopyRelationNodeContract(node: ProjectKnowledgeRelationsPayload['nodes'][number]): LoopyRelationNodeContract {
  const tone = resolveEmbeddingStatusTone(node.embeddingStatus)
  const provenance = normalizeText(node.provenanceSourceType, '')
  const kind = normalizeText(node.resourceKind, node.nodeType)
  const subtitleParts = [normalizeText(node.modality, 'unknown'), kind]
  if (provenance)
    subtitleParts.push(provenance)

  return {
    id: node.id,
    title: normalizeText(node.label, '未命名节点'),
    subtitle: subtitleParts.join(' · '),
    statusLabel: resolveEmbeddingStatusLabel(node.embeddingStatus),
    statusTone: tone,
  }
}

export function buildLoopyNodeDetailContract(detail: ProjectKnowledgeNodeDetail): LoopyNodeDetailContract {
  return {
    eyebrow: `${detail.nodeType} · ${resolveEmbeddingStatusLabel(detail.embeddingStatus)}`,
    title: normalizeText(detail.label, '未命名节点'),
    preview: normalizeText(detail.contentPreview, '暂无内容预览'),
    metrics: [
      {
        label: 'Embedding',
        value: `${normalizeText(detail.embeddingProvider)} / ${normalizeText(detail.embeddingModel)}`,
      },
      {
        label: '维度 / 质量',
        value: `${detail.embeddingDimensions || 0}d / ${Math.round((detail.embeddingQualityScore || 0) * 100)}%`,
      },
      {
        label: 'Confidence',
        value: `${Math.round((detail.sourceConfidence || 0) * 100)}%`,
      },
      {
        label: 'Neighborhood',
        value: `${Math.round((detail.neighborhoodConsistency || 0) * 100)}%`,
      },
    ],
  }
}
