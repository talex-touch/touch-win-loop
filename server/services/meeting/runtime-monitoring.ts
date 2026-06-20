import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  AdminMeetingRuntimeCapacitySnapshot,
  AdminMeetingRuntimeContainerRow,
  AdminMeetingRuntimeEgressSnapshot,
  AdminMeetingRuntimeHostSnapshot,
  AdminMeetingRuntimeLiveKitSnapshot,
  AdminMeetingRuntimeServiceHealth,
  AdminMeetingRuntimeSnapshot,
  AdminMeetingRuntimeTrendPoint,
  AdminOperationsHealth,
} from '~~/shared/types/admin-operations'

interface PrometheusVectorResult {
  metric: Record<string, string>
  value?: [number, string]
}

interface PrometheusRangeResult {
  metric: Record<string, string>
  values?: Array<[number, string]>
}

interface PrometheusResponse<T> {
  status?: string
  data?: {
    result?: T[]
  }
  error?: string
}

interface PrometheusTarget {
  labels?: Record<string, string>
  discoveredLabels?: Record<string, string>
  health?: string
  lastScrape?: string
  lastError?: string
}

interface PrometheusTargetsResponse {
  status?: string
  data?: {
    activeTargets?: PrometheusTarget[]
  }
  error?: string
}

type MetricMatcher = (metric: Record<string, string>) => boolean

const EMPTY_HOST: AdminMeetingRuntimeHostSnapshot = {
  cpuUsagePercent: 0,
  memoryTotalBytes: 0,
  memoryUsedBytes: 0,
  memoryUsagePercent: 0,
  diskTotalBytes: 0,
  diskUsedBytes: 0,
  diskUsagePercent: 0,
  networkRxBytesPerSecond: 0,
  networkTxBytesPerSecond: 0,
  networkRxTotalBytes: 0,
  networkTxTotalBytes: 0,
}

const EMPTY_LIVEKIT: AdminMeetingRuntimeLiveKitSnapshot = {
  roomCount: 0,
  participantCount: 0,
  publishedTrackCount: 0,
  subscribedTrackCount: 0,
  inboundBytesPerSecond: 0,
  outboundBytesPerSecond: 0,
  packetLossPercent: 0,
  rttMs: 0,
}

const EMPTY_EGRESS: AdminMeetingRuntimeEgressSnapshot = {
  activeTaskCount: 0,
  failedTaskCount: 0,
  cpuUsagePercent: 0,
  memoryUsageBytes: 0,
  outboundBytesPerSecond: 0,
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function sumValues(results: PrometheusVectorResult[], matcher: MetricMatcher = () => true): number {
  return results
    .filter(item => matcher(item.metric || {}))
    .reduce((total, item) => total + toFiniteNumber(item.value?.[1]), 0)
}

function maxValue(results: PrometheusVectorResult[], matcher: MetricMatcher = () => true): number {
  return results
    .filter(item => matcher(item.metric || {}))
    .reduce((current, item) => Math.max(current, toFiniteNumber(item.value?.[1])), 0)
}

function firstValue(results: PrometheusVectorResult[], matcher: MetricMatcher = () => true): number {
  const matched = results.find(item => matcher(item.metric || {}))
  return toFiniteNumber(matched?.value?.[1])
}

function includesAny(value: unknown, needles: string[]): boolean {
  const text = normalizeString(value).toLowerCase()
  return needles.some(needle => text.includes(needle))
}

function isPhysicalNetwork(metric: Record<string, string>): boolean {
  const device = normalizeString(metric.device).toLowerCase()
  if (!device)
    return true
  return !/^(?:lo|docker|br-|veth|flannel|cali|tun|tap)/.test(device)
}

function isRootFilesystem(metric: Record<string, string>): boolean {
  return normalizeString(metric.mountpoint) === '/'
}

function isContainerMetric(metric: Record<string, string>, service: string): boolean {
  const needles = service === 'app'
    ? ['touch-win-loop-staging', 'winloop-1']
    : [service]
  return [
    metric.name,
    metric.container,
    metric.container_label_com_docker_compose_service,
    metric.container_label_com_docker_compose_project,
  ].some(value => includesAny(value, needles))
}

function classifyHealth(value: number, warning: number, critical: number): AdminOperationsHealth {
  if (value >= critical)
    return 'critical'
  if (value >= warning)
    return 'warning'
  return 'healthy'
}

function buildUnavailablePayload(input: {
  generatedAt: string
  configured: boolean
  issue: string
}): AdminMeetingRuntimeSnapshot {
  return {
    generatedAt: input.generatedAt,
    prometheusBaseUrlConfigured: input.configured,
    health: [
      {
        key: 'prometheus',
        label: 'Prometheus',
        health: input.configured ? 'critical' : 'idle',
        status: input.configured ? 'down' : 'idle',
        detail: input.issue,
        lastScrapeAt: null,
      },
    ],
    host: { ...EMPTY_HOST },
    containers: [],
    livekit: { ...EMPTY_LIVEKIT },
    egress: { ...EMPTY_EGRESS },
    capacity: {
      health: 'idle',
      maxExpectedParticipants: 5,
      estimatedSafeParticipantCount: 0,
      bottleneck: 'monitoring_unavailable',
      recommendation: input.issue,
    },
    trend: [],
    issues: [input.issue],
  }
}

async function prometheusFetch<T>(baseUrl: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${baseUrl.replace(/\/+$/g, '')}${path}`)
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value)

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  })
  const payload = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok)
    throw new Error(`PROMETHEUS_HTTP_${response.status}`)
  return payload
}

async function queryVector(baseUrl: string, query: string): Promise<PrometheusVectorResult[]> {
  const payload = await prometheusFetch<PrometheusResponse<PrometheusVectorResult>>(baseUrl, '/api/v1/query', { query })
  if (payload.status && payload.status !== 'success')
    throw new Error(payload.error || 'PROMETHEUS_QUERY_FAILED')
  return payload.data?.result || []
}

async function queryRange(baseUrl: string, query: string): Promise<PrometheusRangeResult[]> {
  const end = Math.floor(Date.now() / 1000)
  const payload = await prometheusFetch<PrometheusResponse<PrometheusRangeResult>>(baseUrl, '/api/v1/query_range', {
    query,
    start: String(end - 30 * 60),
    end: String(end),
    step: '60',
  })
  if (payload.status && payload.status !== 'success')
    throw new Error(payload.error || 'PROMETHEUS_RANGE_QUERY_FAILED')
  return payload.data?.result || []
}

async function queryTargets(baseUrl: string): Promise<PrometheusTarget[]> {
  const payload = await prometheusFetch<PrometheusTargetsResponse>(baseUrl, '/api/v1/targets', { state: 'active' })
  if (payload.status && payload.status !== 'success')
    throw new Error(payload.error || 'PROMETHEUS_TARGETS_FAILED')
  return payload.data?.activeTargets || []
}

function buildTargetHealth(targets: PrometheusTarget[]): AdminMeetingRuntimeServiceHealth[] {
  const specs = [
    { key: 'livekit', label: 'LiveKit', optional: false },
    { key: 'egress', label: 'Egress', optional: true },
    { key: 'node-exporter', label: 'Node Exporter', optional: false },
    { key: 'cadvisor', label: 'cAdvisor', optional: false },
    { key: 'prometheus', label: 'Prometheus', optional: false },
  ]

  return specs.map((spec) => {
    const target = targets.find((item) => {
      const labels = {
        ...(item.discoveredLabels || {}),
        ...(item.labels || {}),
      }
      return includesAny(labels.job, [spec.key])
        || includesAny(labels.instance, [spec.key])
        || includesAny(labels.__address__, [spec.key])
    })
    if (!target) {
      return {
        key: spec.key,
        label: spec.label,
        health: spec.optional ? 'idle' : 'warning',
        status: 'unknown',
        detail: spec.optional ? '未启动，首轮非录制验证可忽略。' : '未发现采集目标。',
        lastScrapeAt: null,
      }
    }
    const up = normalizeString(target.health).toLowerCase() === 'up'
    return {
      key: spec.key,
      label: spec.label,
      health: up ? 'healthy' : 'critical',
      status: up ? 'up' : 'down',
      detail: up ? '采集正常。' : normalizeString(target.lastError) || '采集异常。',
      lastScrapeAt: normalizeString(target.lastScrape) || null,
    }
  })
}

function buildHostSnapshot(input: {
  cpu: PrometheusVectorResult[]
  memoryTotal: PrometheusVectorResult[]
  memoryAvailable: PrometheusVectorResult[]
  filesystemSize: PrometheusVectorResult[]
  filesystemAvailable: PrometheusVectorResult[]
  networkRxRate: PrometheusVectorResult[]
  networkTxRate: PrometheusVectorResult[]
  networkRxTotal: PrometheusVectorResult[]
  networkTxTotal: PrometheusVectorResult[]
}): AdminMeetingRuntimeHostSnapshot {
  const cpuIdle = firstValue(input.cpu)
  const memoryTotal = maxValue(input.memoryTotal)
  const memoryAvailable = maxValue(input.memoryAvailable)
  const diskTotal = maxValue(input.filesystemSize, isRootFilesystem)
  const diskAvailable = maxValue(input.filesystemAvailable, isRootFilesystem)
  const memoryUsed = Math.max(0, memoryTotal - memoryAvailable)
  const diskUsed = Math.max(0, diskTotal - diskAvailable)
  return {
    cpuUsagePercent: clampPercent((1 - cpuIdle) * 100),
    memoryTotalBytes: memoryTotal,
    memoryUsedBytes: memoryUsed,
    memoryUsagePercent: memoryTotal > 0 ? clampPercent(memoryUsed / memoryTotal * 100) : 0,
    diskTotalBytes: diskTotal,
    diskUsedBytes: diskUsed,
    diskUsagePercent: diskTotal > 0 ? clampPercent(diskUsed / diskTotal * 100) : 0,
    networkRxBytesPerSecond: sumValues(input.networkRxRate, isPhysicalNetwork),
    networkTxBytesPerSecond: sumValues(input.networkTxRate, isPhysicalNetwork),
    networkRxTotalBytes: sumValues(input.networkRxTotal, isPhysicalNetwork),
    networkTxTotalBytes: sumValues(input.networkTxTotal, isPhysicalNetwork),
  }
}

function buildContainerRow(input: {
  key: string
  label: string
  service: string
  cpu: PrometheusVectorResult[]
  memory: PrometheusVectorResult[]
  rxRate: PrometheusVectorResult[]
  txRate: PrometheusVectorResult[]
  rxTotal: PrometheusVectorResult[]
  txTotal: PrometheusVectorResult[]
}): AdminMeetingRuntimeContainerRow {
  const matcher = (metric: Record<string, string>) => isContainerMetric(metric, input.service)
  const cpuUsagePercent = sumValues(input.cpu, matcher) * 100
  const memoryUsageBytes = sumValues(input.memory, matcher)
  return {
    key: input.key,
    label: input.label,
    service: input.service,
    health: memoryUsageBytes > 0 || cpuUsagePercent > 0 ? classifyHealth(cpuUsagePercent, 70, 90) : 'idle',
    cpuUsagePercent,
    memoryUsageBytes,
    networkRxBytesPerSecond: sumValues(input.rxRate, matcher),
    networkTxBytesPerSecond: sumValues(input.txRate, matcher),
    networkRxTotalBytes: sumValues(input.rxTotal, matcher),
    networkTxTotalBytes: sumValues(input.txTotal, matcher),
  }
}

function buildLiveKitSnapshot(input: {
  rooms: PrometheusVectorResult[]
  participants: PrometheusVectorResult[]
  publishedTracks: PrometheusVectorResult[]
  subscribedTracks: PrometheusVectorResult[]
  inbound: PrometheusVectorResult[]
  outbound: PrometheusVectorResult[]
  packetLoss: PrometheusVectorResult[]
  rtt: PrometheusVectorResult[]
  containerFallback?: AdminMeetingRuntimeContainerRow
}): AdminMeetingRuntimeLiveKitSnapshot {
  return {
    roomCount: maxValue(input.rooms),
    participantCount: maxValue(input.participants),
    publishedTrackCount: maxValue(input.publishedTracks),
    subscribedTrackCount: maxValue(input.subscribedTracks),
    inboundBytesPerSecond: sumValues(input.inbound) || input.containerFallback?.networkRxBytesPerSecond || 0,
    outboundBytesPerSecond: sumValues(input.outbound) || input.containerFallback?.networkTxBytesPerSecond || 0,
    packetLossPercent: maxValue(input.packetLoss),
    rttMs: maxValue(input.rtt),
  }
}

function buildEgressSnapshot(input: {
  activeTasks: PrometheusVectorResult[]
  failedTasks: PrometheusVectorResult[]
  containerFallback?: AdminMeetingRuntimeContainerRow
}): AdminMeetingRuntimeEgressSnapshot {
  return {
    activeTaskCount: maxValue(input.activeTasks),
    failedTaskCount: maxValue(input.failedTasks),
    cpuUsagePercent: input.containerFallback?.cpuUsagePercent || 0,
    memoryUsageBytes: input.containerFallback?.memoryUsageBytes || 0,
    outboundBytesPerSecond: input.containerFallback?.networkTxBytesPerSecond || 0,
  }
}

function buildCapacity(input: {
  host: AdminMeetingRuntimeHostSnapshot
  livekit: AdminMeetingRuntimeLiveKitSnapshot
}): AdminMeetingRuntimeCapacitySnapshot {
  const expected = 5
  const cpuSafe = input.host.cpuUsagePercent < 70
  const memorySafe = input.host.memoryUsagePercent < 80
  const outboundMbps = input.host.networkTxBytesPerSecond * 8 / 1_000_000
  const bandwidthSafe = outboundMbps < 250
  const health: AdminOperationsHealth = cpuSafe && memorySafe && bandwidthSafe
    ? 'healthy'
    : (input.host.cpuUsagePercent >= 90 || input.host.memoryUsagePercent >= 90 || outboundMbps >= 500 ? 'critical' : 'warning')
  const bottleneck = !cpuSafe
    ? 'cpu'
    : (!memorySafe ? 'memory' : (!bandwidthSafe ? 'bandwidth' : 'none'))
  const estimatedSafeParticipantCount = health === 'healthy'
    ? expected
    : Math.max(1, Math.floor(expected * 0.6))
  return {
    health,
    maxExpectedParticipants: expected,
    estimatedSafeParticipantCount,
    bottleneck,
    recommendation: health === 'healthy'
      ? '当前资源足以支撑 5 人以内非录制会议。'
      : '建议降低视频订阅数量或后置 Egress 录制，再观察 CPU 与出站带宽。',
  }
}

function mergeTrend(input: {
  hostRx: PrometheusRangeResult[]
  hostTx: PrometheusRangeResult[]
  livekitRx: PrometheusRangeResult[]
  livekitTx: PrometheusRangeResult[]
}): AdminMeetingRuntimeTrendPoint[] {
  const points = new Map<number, AdminMeetingRuntimeTrendPoint>()
  const add = (series: PrometheusRangeResult[], key: keyof Omit<AdminMeetingRuntimeTrendPoint, 'time'>, matcher: MetricMatcher = () => true) => {
    for (const item of series) {
      if (!matcher(item.metric || {}))
        continue
      for (const value of item.values || []) {
        const timestamp = Math.trunc(Number(value[0] || 0))
        if (!timestamp)
          continue
        const existing = points.get(timestamp) || {
          time: new Date(timestamp * 1000).toISOString(),
          hostTxBytesPerSecond: 0,
          hostRxBytesPerSecond: 0,
          livekitTxBytesPerSecond: 0,
          livekitRxBytesPerSecond: 0,
        }
        existing[key] += toFiniteNumber(value[1])
        points.set(timestamp, existing)
      }
    }
  }
  add(input.hostRx, 'hostRxBytesPerSecond', isPhysicalNetwork)
  add(input.hostTx, 'hostTxBytesPerSecond', isPhysicalNetwork)
  add(input.livekitRx, 'livekitRxBytesPerSecond')
  add(input.livekitTx, 'livekitTxBytesPerSecond')
  return [...points.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point)
}

function collectIssues(input: {
  health: AdminMeetingRuntimeServiceHealth[]
  host: AdminMeetingRuntimeHostSnapshot
  capacity: AdminMeetingRuntimeCapacitySnapshot
}): string[] {
  const issues = input.health
    .filter(item => item.health === 'critical')
    .map(item => `${item.label}：${item.detail}`)
  if (input.host.cpuUsagePercent >= 90)
    issues.push('宿主机 CPU 使用率超过 90%。')
  if (input.host.memoryUsagePercent >= 90)
    issues.push('宿主机内存使用率超过 90%。')
  if (input.capacity.health !== 'healthy')
    issues.push(input.capacity.recommendation)
  return issues
}

export async function buildAdminMeetingRuntimeSnapshot(runtime: RuntimeSettings): Promise<AdminMeetingRuntimeSnapshot> {
  const generatedAt = new Date().toISOString()
  const baseUrl = normalizeString(runtime.meeting.monitoring.prometheusBaseUrl)
  if (!baseUrl) {
    return buildUnavailablePayload({
      generatedAt,
      configured: false,
      issue: '会议监控 Prometheus 地址未配置。',
    })
  }

  try {
    const [
      targets,
      cpu,
      memoryTotal,
      memoryAvailable,
      filesystemSize,
      filesystemAvailable,
      hostRxRate,
      hostTxRate,
      hostRxTotal,
      hostTxTotal,
      containerCpu,
      containerMemory,
      containerRxRate,
      containerTxRate,
      containerRxTotal,
      containerTxTotal,
      livekitRooms,
      livekitParticipants,
      livekitPublishedTracks,
      livekitSubscribedTracks,
      livekitInbound,
      livekitOutbound,
      livekitPacketLoss,
      livekitRtt,
      egressActiveTasks,
      egressFailedTasks,
      trendHostRx,
      trendHostTx,
      trendLivekitRx,
      trendLivekitTx,
    ] = await Promise.all([
      queryTargets(baseUrl),
      queryVector(baseUrl, 'avg(rate(node_cpu_seconds_total{mode="idle"}[2m]))'),
      queryVector(baseUrl, 'node_memory_MemTotal_bytes'),
      queryVector(baseUrl, 'node_memory_MemAvailable_bytes'),
      queryVector(baseUrl, 'node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}'),
      queryVector(baseUrl, 'node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}'),
      queryVector(baseUrl, 'rate(node_network_receive_bytes_total[2m])'),
      queryVector(baseUrl, 'rate(node_network_transmit_bytes_total[2m])'),
      queryVector(baseUrl, 'node_network_receive_bytes_total'),
      queryVector(baseUrl, 'node_network_transmit_bytes_total'),
      queryVector(baseUrl, 'rate(container_cpu_usage_seconds_total[2m])'),
      queryVector(baseUrl, 'container_memory_working_set_bytes'),
      queryVector(baseUrl, 'rate(container_network_receive_bytes_total[2m])'),
      queryVector(baseUrl, 'rate(container_network_transmit_bytes_total[2m])'),
      queryVector(baseUrl, 'container_network_receive_bytes_total'),
      queryVector(baseUrl, 'container_network_transmit_bytes_total'),
      queryVector(baseUrl, 'livekit_room_total'),
      queryVector(baseUrl, 'livekit_participant_total'),
      queryVector(baseUrl, 'livekit_published_track_total or vector(0)'),
      queryVector(baseUrl, 'livekit_subscribed_track_total or vector(0)'),
      queryVector(baseUrl, 'rate(livekit_bytes_in_total[2m]) or vector(0)'),
      queryVector(baseUrl, 'rate(livekit_bytes_out_total[2m]) or vector(0)'),
      queryVector(baseUrl, 'livekit_packet_loss_percent or vector(0)'),
      queryVector(baseUrl, '(livekit_forward_latency * 1000) or vector(0)'),
      queryVector(baseUrl, 'egress_active_requests or vector(0)'),
      queryVector(baseUrl, 'egress_failed_requests_total or vector(0)'),
      queryRange(baseUrl, 'rate(node_network_receive_bytes_total[2m])'),
      queryRange(baseUrl, 'rate(node_network_transmit_bytes_total[2m])'),
      queryRange(baseUrl, 'rate(container_network_receive_bytes_total{name=~".*livekit.*"}[2m])'),
      queryRange(baseUrl, 'rate(container_network_transmit_bytes_total{name=~".*livekit.*"}[2m])'),
    ])

    const health = buildTargetHealth(targets)
    const host = buildHostSnapshot({
      cpu,
      memoryTotal,
      memoryAvailable,
      filesystemSize,
      filesystemAvailable,
      networkRxRate: hostRxRate,
      networkTxRate: hostTxRate,
      networkRxTotal: hostRxTotal,
      networkTxTotal: hostTxTotal,
    })
    const containerBase = {
      cpu: containerCpu,
      memory: containerMemory,
      rxRate: containerRxRate,
      txRate: containerTxRate,
      rxTotal: containerRxTotal,
      txTotal: containerTxTotal,
    }
    const containers = [
      buildContainerRow({ ...containerBase, key: 'livekit', label: 'LiveKit', service: 'livekit' }),
      buildContainerRow({ ...containerBase, key: 'egress', label: 'Egress', service: 'egress' }),
      buildContainerRow({ ...containerBase, key: 'redis', label: 'Meeting Redis', service: 'redis' }),
      buildContainerRow({ ...containerBase, key: 'prometheus', label: 'Prometheus', service: 'prometheus' }),
      buildContainerRow({ ...containerBase, key: 'app', label: 'WinLoop Staging', service: 'app' }),
    ]
    const livekitContainer = containers.find(item => item.key === 'livekit')
    const egressContainer = containers.find(item => item.key === 'egress')
    const livekit = buildLiveKitSnapshot({
      rooms: livekitRooms,
      participants: livekitParticipants,
      publishedTracks: livekitPublishedTracks,
      subscribedTracks: livekitSubscribedTracks,
      inbound: livekitInbound,
      outbound: livekitOutbound,
      packetLoss: livekitPacketLoss,
      rtt: livekitRtt,
      containerFallback: livekitContainer,
    })
    const egress = buildEgressSnapshot({
      activeTasks: egressActiveTasks,
      failedTasks: egressFailedTasks,
      containerFallback: egressContainer,
    })
    const capacity = buildCapacity({ host, livekit })
    const issues = collectIssues({ health, host, capacity })

    return {
      generatedAt,
      prometheusBaseUrlConfigured: true,
      health,
      host,
      containers,
      livekit,
      egress,
      capacity,
      trend: mergeTrend({
        hostRx: trendHostRx,
        hostTx: trendHostTx,
        livekitRx: trendLivekitRx,
        livekitTx: trendLivekitTx,
      }),
      issues,
    }
  }
  catch (error) {
    return buildUnavailablePayload({
      generatedAt,
      configured: true,
      issue: error instanceof Error ? normalizeString(error.message) : 'Prometheus 查询失败。',
    })
  }
}
