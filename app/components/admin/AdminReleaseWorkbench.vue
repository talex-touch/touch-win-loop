<script setup lang="ts">
import type {
  AdminReleaseQueueResult,
  ApiResponse,
  AuthMeResult,
  ContestReleaseResourceSnapshot,
  ContestReleaseSnapshot,
  ContestReleaseTimelineSnapshot,
  ContestReleaseTrackSnapshot,
  ContestReleaseTrackTimelineSnapshot,
  ContestWorkflowTimelineItem,
  PolicyLibraryItemSnapshot,
  PolicyLibraryReleaseSnapshot,
  ReleaseQueueInsights,
  ReleaseQueueInsightsWindowDays,
  ReleaseQueueRecentReviewItem,
  ReleaseQueueReviewerRankingMode,
  ReleaseQueueReviewerStats,
  ReleaseQueueStatusStats,
  ReleaseReviewLog,
  ReleaseScopeKind,
  ReleaseSyncSource,
  ReleaseVersion,
  ReleaseVersionDetail,
  ReleaseVersionStatus,
  TimelineNodeType,
} from '~~/shared/types/domain'
import {
  syncPreservationSummarySections as buildSyncPreservationSummarySections,
  syncPreservationSummaryItemText,
} from '~/utils/release-sync-summary'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  fetchPath: string
  fetchQuery?: Record<string, string | number | undefined>
  scopeKind?: ReleaseScopeKind | ''
  compact?: boolean
  showClaimButton?: boolean
}>(), {
  description: '',
  fetchQuery: () => ({}),
  scopeKind: '',
  compact: false,
  showClaimButton: false,
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

type ApiRequestError = Error & {
  data?: {
    message?: string
  }
}

function createApiRequestError(message: string): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.data = { message }
  return error
}

async function requestApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST'
    query?: Record<string, string | number | undefined>
    body?: unknown
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const url = new URL(path, 'http://localhost')
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value === undefined || value === '')
      continue
    url.searchParams.set(key, String(value))
  }

  const headers = new Headers()
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(`${url.pathname}${url.search}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body,
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  return payload.data
}

const loading = ref(false)
const detailLoading = ref(false)
const actionLoading = ref(false)
const errorText = ref('')
const successText = ref('')
const rejectReason = ref('')
const detailVisible = ref(false)
const timelineVisible = ref(false)
const metadataDrawerVisible = ref(false)
const trackDetailVisible = ref(false)
const reviewLogDrawerVisible = ref(false)
const detail = ref<ReleaseVersionDetail | null>(null)
const versions = ref<ReleaseVersion[]>([])
const queueStats = ref<ReleaseQueueStatusStats | null>(null)
const queueTotal = ref<number | null>(null)
const insights = ref<ReleaseQueueInsights | null>(null)
const currentUserId = ref('')
const selectedTrack = ref<ContestReleaseTrackSnapshot | null>(null)
const selectedReviewLog = ref<ReleaseReviewLog | null>(null)

const statusFilter = ref<ReleaseVersionStatus | ''>('')
const insightWindowDays = ref<ReleaseQueueInsightsWindowDays>(0)
const reviewerRankingMode = ref<ReleaseQueueReviewerRankingMode>('total_actions')
const actionableFilter = ref<'all' | 'pending_first' | 'claimed_second' | 'ready_publish'>('all')
const selectedVersionId = ref('')
const failedCoverPreviewSources = ref<Record<string, true>>({})
const routeVersionId = computed(() => {
  const value = route.query.versionId
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim()
})

const statusOptions: Array<{ value: ReleaseVersionStatus | '', label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'pending_first_review', label: '待初审' },
  { value: 'pending_second_review', label: '待二审' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'superseded', label: '已替换' },
]

const insightWindowOptions: Array<{ value: ReleaseQueueInsightsWindowDays, label: string }> = [
  { value: 0, label: '累计' },
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
]

const reviewerRankingOptions: Array<{ value: ReleaseQueueReviewerRankingMode, label: string }> = [
  { value: 'total_actions', label: '按总审核' },
  { value: 'second_review_approved', label: '按二审通过' },
  { value: 'published', label: '按发布次数' },
]

const coverPreviewFrames = [
  { key: 'banner', label: '16:9 横幅', className: 'aspect-[16/9]' },
  { key: 'card', label: '4:3 卡片', className: 'aspect-[4/3]' },
  { key: 'square', label: '1:1 方图', className: 'aspect-square' },
]

const filteredVersions = computed(() => {
  return versions.value.filter((item) => {
    if (statusFilter.value && item.status !== statusFilter.value)
      return false
    if (actionableFilter.value === 'pending_first')
      return item.status === 'pending_first_review'
    if (actionableFilter.value === 'claimed_second')
      return item.status === 'pending_second_review' && item.secondReviewClaimedByUserId === currentUserId.value
    if (actionableFilter.value === 'ready_publish')
      return item.status === 'approved'
    return true
  })
})

const selectedVersion = computed(() => {
  return versions.value.find(item => item.id === selectedVersionId.value) || null
})

const summaryStats = computed(() => {
  return queueStats.value || {
    pendingFirst: versions.value.filter(item => item.status === 'pending_first_review').length,
    pendingSecond: versions.value.filter(item => item.status === 'pending_second_review').length,
    approved: versions.value.filter(item => item.status === 'approved').length,
    published: versions.value.filter(item => item.status === 'published').length,
    rejected: versions.value.filter(item => item.status === 'rejected').length,
    superseded: versions.value.filter(item => item.status === 'superseded').length,
    total: versions.value.length,
  }
})

const currentUserInsights = computed(() => insights.value?.currentUser || null)
const actionableInsights = computed(() => insights.value?.actionable || null)
const rankedReviewerInsights = computed(() => insights.value?.reviewers || [])
const recentReviewInsights = computed(() => insights.value?.recentReviews || [])

const insightsWindowLabel = computed(() => {
  return insightWindowOptions.find(item => item.value === insightWindowDays.value)?.label || '累计'
})

const actionableFilterLabel = computed(() => {
  if (actionableFilter.value === 'pending_first')
    return '当前仅查看可做初审'
  if (actionableFilter.value === 'claimed_second')
    return '当前仅查看我领的二审'
  if (actionableFilter.value === 'ready_publish')
    return '当前仅查看待发布'
  return ''
})

const queueLoadedText = computed(() => {
  if (queueTotal.value === null)
    return ''
  const loadedCount = versions.value.length
  const total = queueTotal.value
  if (total > loadedCount)
    return `共 ${total} 个匹配版本，当前加载 ${loadedCount} 条；顶部统计为全量口径。`
  return `共 ${total} 个匹配版本，已全部加载；顶部统计为全量口径。`
})

function formatDateTime(value?: string | null): string {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDate(value?: string | null): string {
  if (!value)
    return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function timelineNodeTypeLabel(type: TimelineNodeType): string {
  if (type === 'registration')
    return '报名'
  if (type === 'submission')
    return '提交'
  if (type === 'preliminary')
    return '初赛'
  if (type === 'final')
    return '决赛'
  return '其他'
}

function statusLabel(status: ReleaseVersionStatus): string {
  if (status === 'pending_first_review')
    return '待初审'
  if (status === 'pending_second_review')
    return '待二审'
  if (status === 'approved')
    return '待发布'
  if (status === 'rejected')
    return '已驳回'
  if (status === 'published')
    return '已发布'
  return '已替换'
}

function statusColor(status: ReleaseVersionStatus): string {
  if (status === 'pending_first_review')
    return 'gold'
  if (status === 'pending_second_review')
    return 'arcoblue'
  if (status === 'approved')
    return 'green'
  if (status === 'rejected')
    return 'red'
  if (status === 'published')
    return 'purple'
  return 'gray'
}

function scopeKindLabel(scopeKind: ReleaseScopeKind): string {
  return scopeKind === 'contest' ? '竞赛' : '政策库'
}

function actionLabel(action: ReleaseReviewLog['action']): string {
  if (action === 'sync_generated')
    return '飞书同步生成草稿'
  if (action === 'sync_draft_overwritten')
    return '飞书同步覆盖草稿'
  if (action === 'first_review_approved')
    return '初审通过'
  if (action === 'second_review_claimed')
    return '领取二审'
  if (action === 'second_review_approved')
    return '二审通过'
  if (action === 'rejected')
    return '驳回'
  return '发布'
}

function reviewActionTagColor(action: ReleaseQueueRecentReviewItem['action']): string {
  if (action === 'first_review_approved')
    return 'gold'
  if (action === 'second_review_claimed')
    return 'arcoblue'
  if (action === 'second_review_approved')
    return 'green'
  if (action === 'rejected')
    return 'red'
  return 'purple'
}

function reviewerMetricText(item: ReleaseQueueReviewerStats): string {
  return `总 ${item.totalActions} / 发布 ${item.publishedCount}`
}

function timelineSourceLabel(source: ContestWorkflowTimelineItem['source']): string {
  if (source === 'feishu')
    return '飞书同步'
  if (source === 'review')
    return '审核'
  if (source === 'publish')
    return '发布'
  if (source === 'repair')
    return '回补'
  return '人工'
}

function timelineSourceColor(source: ContestWorkflowTimelineItem['source']): string {
  if (source === 'feishu')
    return 'arcoblue'
  if (source === 'review')
    return 'gold'
  if (source === 'publish')
    return 'green'
  if (source === 'repair')
    return 'purple'
  return 'gray'
}

function diffSummaryText(version: ReleaseVersion): string {
  return `新增 ${version.diffSummary.createdCount} / 更新 ${version.diffSummary.updatedCount} / 移除 ${version.diffSummary.removedCount}`
}

function previewTitle(version: ReleaseVersion): string {
  return `${scopeKindLabel(version.scopeKind)} · ${version.scopeTitle || version.scopeId}`
}

function toContestSnapshot(snapshot: Record<string, unknown>): ContestReleaseSnapshot {
  const raw = snapshot as unknown as ContestReleaseSnapshot
  return {
    contestExternalId: raw.contestExternalId || '',
    contest: raw.contest || null,
    tracks: Array.isArray(raw.tracks) ? raw.tracks : [],
    timelines: Array.isArray(raw.timelines) ? raw.timelines : [],
    trackTimelines: Array.isArray(raw.trackTimelines) ? raw.trackTimelines : [],
    resources: Array.isArray(raw.resources) ? raw.resources : [],
  }
}

function toPolicySnapshot(snapshot: Record<string, unknown>): PolicyLibraryReleaseSnapshot {
  const raw = snapshot as unknown as PolicyLibraryReleaseSnapshot
  return {
    items: Array.isArray(raw.items) ? raw.items : [],
  }
}

const detailContestSnapshot = computed(() => {
  if (!detail.value || detail.value.version.scopeKind !== 'contest')
    return null
  return toContestSnapshot(detail.value.version.snapshot)
})

const detailPolicySnapshot = computed(() => {
  if (!detail.value || detail.value.version.scopeKind !== 'policy_library')
    return null
  return toPolicySnapshot(detail.value.version.snapshot)
})

const detailWorkflowTimeline = computed(() => detail.value?.workflowTimeline || [])
const canPublishCurrentDetail = computed(() => {
  if (!detail.value || detail.value.version.status !== 'approved')
    return false
  return detail.value.publishCheck?.canPublish !== false
})

function normalizeUserId(value?: string | null): string {
  return String(value || '').trim()
}

function isCurrentUser(userId?: string | null): boolean {
  const normalizedCurrentUserId = normalizeUserId(currentUserId.value)
  return Boolean(normalizedCurrentUserId && normalizeUserId(userId) === normalizedCurrentUserId)
}

function canReviewSecond(version: ReleaseVersion): boolean {
  return version.status === 'pending_second_review'
    && Boolean(normalizeUserId(currentUserId.value))
    && !isCurrentUser(version.firstReviewByUserId)
    && isCurrentUser(version.secondReviewClaimedByUserId)
}

function canRejectVersion(version: ReleaseVersion): boolean {
  if (version.status === 'pending_first_review' || version.status === 'approved')
    return true
  if (version.status === 'pending_second_review')
    return canReviewSecond(version)
  return false
}

function secondReviewNotice(version: ReleaseVersion): string {
  if (version.status !== 'pending_second_review')
    return ''
  if (!normalizeUserId(currentUserId.value))
    return '正在确认当前登录用户，暂不能处理二审。'
  if (isCurrentUser(version.firstReviewByUserId))
    return '你已完成初审，二审必须由其他管理员领取并处理。'
  if (!normalizeUserId(version.secondReviewClaimedByUserId))
    return '请先通过随机领取进入二审，再执行审批。'
  if (!isCurrentUser(version.secondReviewClaimedByUserId))
    return '该版本已被其他管理员领取二审。'
  return ''
}

function arrayText(items?: string[] | null): string {
  return Array.isArray(items) && items.length ? items.join('、') : '-'
}

function metadataText(value: unknown): string {
  return String(value || '').trim()
}

function encodeLocalImagePath(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function isBareCoverAttachmentName(value: string): boolean {
  const text = metadataText(value)
  return Boolean(text && !/[/:?#\\]/.test(text) && /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(text))
}

function isPreviewableRelativeImagePath(value: string): boolean {
  const text = metadataText(value)
  return /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(text)
    && (text.startsWith('/') || text.startsWith('./') || text.startsWith('../') || text.includes('/'))
}

function resolveCoverPreviewSource(value: string): string {
  const text = metadataText(value)
  if (!text || text === '-')
    return ''
  if (isBareCoverAttachmentName(text))
    return ''

  const directMatch = text.match(/(?:https?:)?\/\/[^\s|"',，]+|data:image\/[^\s|"',，]+|blob:[^\s|"',，]+|\/[^\s|"',，]+/)
  if (directMatch?.[0])
    return directMatch[0]

  const localImage = text
    .split(/[\s|,，]+/)
    .map(item => item.trim())
    .find(item => isPreviewableRelativeImagePath(item))
  if (!localImage)
    return ''
  if (localImage.startsWith('/'))
    return localImage
  return `/${encodeLocalImagePath(localImage.replace(/^\.\/+/, ''))}`
}

function isCoverPreviewUrl(value: string): boolean {
  return Boolean(resolveCoverPreviewSource(value))
}

function coverPreviewFailed(value: string, previewSource = ''): boolean {
  const source = previewSource || resolveCoverPreviewSource(value)
  return Boolean(source && failedCoverPreviewSources.value[source])
}

function markCoverPreviewFailed(value: string, previewSource = ''): void {
  const source = previewSource || resolveCoverPreviewSource(value)
  if (!source)
    return
  failedCoverPreviewSources.value = {
    ...failedCoverPreviewSources.value,
    [source]: true,
  }
}

function coverPreviewUnavailableText(value: string, previewSource = ''): string {
  if (previewSource && coverPreviewFailed(value, previewSource)) {
    if (previewSource.includes('/api/admin/integrations/feishu/bitable/attachments/resolve?'))
      return '封面附件预览暂不可访问，请检查飞书附件权限或重新同步。'
    return '封面图片地址暂不可访问。'
  }
  if (isBareCoverAttachmentName(value))
    return '封面字段只有附件文件名，缺少可访问图片地址。'
  if (coverPreviewFailed(value))
    return '封面图片地址暂不可访问。'
  return ''
}

function buildMappedCoverPreviewSource(
  value: string,
  syncSource: ReleaseSyncSource | undefined,
  targetKey: string,
): string {
  const text = metadataText(value)
  if (!isBareCoverAttachmentName(text) || !syncSource?.syncItemId || !syncSource.recordId)
    return ''
  const params = new URLSearchParams({
    syncItemId: syncSource.syncItemId,
    recordId: syncSource.recordId,
    targetKey,
    name: text,
  })
  return `/api/admin/integrations/feishu/bitable/attachments/resolve?${params.toString()}`
}

function contestMetadataFormRows(snapshot: ContestReleaseSnapshot | null) {
  if (!snapshot)
    return []

  const contest = snapshot.contest

  return [
    { key: 'name', label: '赛事名称', value: metadataText(contest?.name) || '-', source: '概览字段' },
    { key: 'level', label: '赛事级别', value: metadataText(contest?.level) || '-', source: '概览字段' },
    { key: 'officialUrl', label: '官网地址', value: metadataText(contest?.officialUrl) || '-', source: '概览字段' },
    { key: 'summary', label: '竞赛简介', value: metadataText(contest?.summary) || '-', source: '概览字段' },
  ]
}

function formatTimelineSnapshotItem(item: ContestReleaseTimelineSnapshot | ContestReleaseTrackTimelineSnapshot): string {
  const startAt = formatDate(item.startAt)
  const endAt = formatDate(item.endAt)
  const dateText = startAt && endAt
    ? `${startAt} 至 ${endAt}`
    : startAt
      ? `开始 ${startAt}`
      : endAt
        ? `截至 ${endAt}`
        : ''
  const note = metadataText(item.note)
  if (!dateText)
    return note || '-'

  const label = item.nodeType === 'other' ? '' : timelineNodeTypeLabel(item.nodeType)
  return [
    label,
    dateText,
    note,
  ].filter(Boolean).join(' · ') || '-'
}

function isTimelineSnapshotAutoRecognized(item: ContestReleaseTimelineSnapshot | ContestReleaseTrackTimelineSnapshot): boolean {
  return Boolean(formatDate(item.startAt) || formatDate(item.endAt))
}

function trackTimelineText(items: ContestReleaseTrackTimelineSnapshot[]) {
  return items
    .map(formatTimelineSnapshotItem)
    .join('\n') || '-'
}

function trackTimelineReviewSections(items: ContestReleaseTrackTimelineSnapshot[], fallbackText?: string) {
  const autoRecognized = items
    .filter(isTimelineSnapshotAutoRecognized)
    .map(formatTimelineSnapshotItem)
    .filter(item => item && item !== '-')
  const pendingConfirmation = items
    .filter(item => !isTimelineSnapshotAutoRecognized(item))
    .map(item => metadataText(item.note) || formatTimelineSnapshotItem(item))
    .filter(item => item && item !== '-')
  const fallback = metadataText(fallbackText)
  if (!items.length && fallback)
    pendingConfirmation.push(fallback)

  return [
    autoRecognized.length ? `自动识别：\n${autoRecognized.join('\n')}` : '',
    pendingConfirmation.length ? `待人工确认：\n${pendingConfirmation.join('\n')}` : '',
  ].filter(Boolean)
}

function trackTimelineReviewText(items: ContestReleaseTrackTimelineSnapshot[], fallbackText?: string) {
  return trackTimelineReviewSections(items, fallbackText).join('\n\n') || '-'
}

function identityTokens(value: unknown): string[] {
  const text = metadataText(value)
  if (!text)
    return []
  return [
    text,
    ...text.split(/[|,，\n\r\t]+/).map(item => item.trim()).filter(Boolean),
  ]
}

function trackIdentityCandidates(item: ContestReleaseTrackSnapshot): string[] {
  const candidates = [
    item.externalId,
    item.liveId || '',
    item.liveId ? `manual:track:${item.liveId}` : '',
    item.name,
    item.syncSource?.recordId,
    item.syncSource?.syncItemId,
  ]
  return [...new Set(candidates.flatMap(identityTokens))]
}

function timelineIdentityCandidates(timeline: ContestReleaseTrackTimelineSnapshot): string[] {
  const candidates = [
    timeline.trackExternalId,
    timeline.trackLiveId,
    timeline.externalId,
    timeline.syncSource?.recordId,
    timeline.syncSource?.syncItemId,
  ]
  return [...new Set(candidates.flatMap(identityTokens))]
}

function timelineIdentityMatches(candidate: string, timelineIdentity: string): boolean {
  return timelineIdentity === candidate
    || timelineIdentity.startsWith(`derived:track:${candidate}:`)
    || timelineIdentity.startsWith(`legacy:track:${candidate}:`)
}

function isTrackTimelineForTrack(timeline: ContestReleaseTrackTimelineSnapshot, item: ContestReleaseTrackSnapshot): boolean {
  const candidates = trackIdentityCandidates(item)
  const timelineCandidates = timelineIdentityCandidates(timeline)
  return timelineCandidates.some(timelineIdentity =>
    candidates.some(candidate => timelineIdentityMatches(candidate, timelineIdentity)),
  )
}

function mergedContestTimelineReviewText(snapshot: ContestReleaseSnapshot | null) {
  if (!snapshot)
    return '-'

  const sections: string[] = []
  const contestText = contestTimelineText(snapshot.timelines)
  if (contestText !== '-')
    sections.push(contestText)

  const matchedTrackTimelineIds = new Set<string>()
  for (const track of snapshot.tracks) {
    const trackTimelines = snapshot.trackTimelines.filter((timeline) => {
      const matched = isTrackTimelineForTrack(timeline, track)
      if (matched)
        matchedTrackTimelineIds.add(timeline.externalId)
      return matched
    })
    const text = trackTimelineReviewText(trackTimelines, track.timelineText)
    if (text === '-')
      continue
    const trackName = metadataText(track.name) || metadataText(track.externalId) || '未命名赛道'
    sections.push(`${trackName}：\n${text}`)
  }

  const unmatchedTrackTimelines = snapshot.trackTimelines.filter(item => !matchedTrackTimelineIds.has(item.externalId))
  if (unmatchedTrackTimelines.length > 0)
    sections.push(`未关联赛道：\n${trackTimelineText(unmatchedTrackTimelines)}`)

  return sections.join('\n\n') || '-'
}

interface TrackFormRow {
  label: string
  value: string
  kind?: 'cover'
  previewSource?: string
}

function trackFormRows(item: ContestReleaseTrackSnapshot | null, snapshot: ContestReleaseSnapshot | null) {
  if (!item)
    return []
  const trackTimelines = (snapshot?.trackTimelines || [])
    .filter(timeline => isTrackTimelineForTrack(timeline, item))
  const coverValue = item.coverImageUrl || '-'
  const coverPreviewSource = (isCoverPreviewUrl(coverValue) ? resolveCoverPreviewSource(coverValue) : '')
    || buildMappedCoverPreviewSource(coverValue, item.syncSource, 'coverImageUrl')
  const rows: TrackFormRow[] = [
    { label: '赛道编号', value: item.externalId || '-' },
    { label: '赛道名称', value: item.name || '-' },
    { label: '封面', value: coverValue, kind: 'cover', previewSource: coverPreviewSource },
    { label: '具体位置', value: item.location || '-' },
    { label: '主办方', value: item.organizer || '-' },
    { label: '承办方', value: item.undertaker || '-' },
    { label: '赛道简介', value: item.summary || '-' },
    { label: '参赛对象', value: item.participantRequirements || '-' },
    { label: '组队规则', value: item.teamRule || '-' },
    { label: '时间节点', value: trackTimelineReviewText(trackTimelines, item.timelineText) },
    { label: '相关专业', value: arrayText(item.suitableMajors) },
    { label: '获奖比例', value: item.awardRatio || '-' },
    { label: '必备项', value: arrayText(item.evidenceRequirements) },
    { label: '加分项', value: arrayText(item.scoringPoints) },
    { label: '扣分项', value: arrayText(item.deductionItems) },
    { label: '提交内容', value: arrayText(item.deliverableTypes) },
  ]
  return rows
}

function reviewLogPayloadText(item: ReleaseReviewLog | null): string {
  if (!item || !Object.keys(item.payload || {}).length)
    return '{}'
  return JSON.stringify(item.payload, null, 2)
}

function syncPreservationSummarySections(item: ContestWorkflowTimelineItem | ReleaseReviewLog | null) {
  return buildSyncPreservationSummarySections(item?.payload)
}

function isReleaseQueueResult(value: unknown): value is AdminReleaseQueueResult {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Array.isArray((value as AdminReleaseQueueResult).items)
    && (value as AdminReleaseQueueResult).stats,
  )
}

async function loadCurrentUser() {
  try {
    const data = await requestApi<AuthMeResult>(
      endpoint('/auth/me'),
      {},
      '当前用户加载失败。',
    )
    currentUserId.value = data.user.id || ''
  }
  catch {
    currentUserId.value = ''
  }
}

async function loadVersions() {
  loading.value = true
  errorText.value = ''
  try {
    const data = await requestApi<ReleaseVersion[] | AdminReleaseQueueResult>(
      endpoint(props.fetchPath),
      {
        query: {
          ...props.fetchQuery,
          statuses: statusFilter.value || undefined,
          rankingMode: reviewerRankingMode.value,
          windowDays: insightWindowDays.value,
        },
      },
      '版本列表加载失败。',
    )
    if (isReleaseQueueResult(data)) {
      versions.value = data.items || []
      queueStats.value = data.stats
      queueTotal.value = data.total
      insights.value = data.insights || null
      if (data.insights) {
        insightWindowDays.value = data.insights.windowDays
        reviewerRankingMode.value = data.insights.rankingMode
      }
      await openRouteVersionDetail(data.items)
    }
    else {
      versions.value = data || []
      queueStats.value = null
      queueTotal.value = null
      insights.value = null
    }
    if (!selectedVersion.value && versions.value[0])
      selectedVersionId.value = versions.value[0].id
  }
  catch (error: any) {
    versions.value = []
    queueStats.value = null
    queueTotal.value = null
    insights.value = null
    errorText.value = String(error?.data?.message || '版本列表加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function openDetail(versionId: string) {
  detailLoading.value = true
  errorText.value = ''
  rejectReason.value = ''
  timelineVisible.value = false
  metadataDrawerVisible.value = false
  trackDetailVisible.value = false
  reviewLogDrawerVisible.value = false
  selectedTrack.value = null
  selectedReviewLog.value = null
  try {
    const data = await requestApi<ReleaseVersionDetail>(
      endpoint(`/admin/releases/${encodeURIComponent(versionId)}`),
      {},
      '版本详情加载失败。',
    )
    detail.value = data
    detailVisible.value = true
  }
  catch (error: any) {
    detail.value = null
    errorText.value = String(error?.data?.message || '版本详情加载失败。')
  }
  finally {
    detailLoading.value = false
  }
}

function toggleActionableFilter(nextFilter: 'pending_first' | 'claimed_second' | 'ready_publish') {
  actionableFilter.value = actionableFilter.value === nextFilter ? 'all' : nextFilter
  if (actionableFilter.value === 'pending_first')
    statusFilter.value = 'pending_first_review'
  else if (actionableFilter.value === 'claimed_second')
    statusFilter.value = 'pending_second_review'
  else if (actionableFilter.value === 'ready_publish')
    statusFilter.value = 'approved'
  else
    statusFilter.value = ''
  selectedVersionId.value = ''
}

async function openRecentReview(item: ReleaseQueueRecentReviewItem) {
  selectedVersionId.value = item.releaseVersionId
  await openDetail(item.releaseVersionId)
}

async function openRouteVersionDetail(items: ReleaseVersion[] = versions.value) {
  const versionId = routeVersionId.value
  if (!versionId)
    return
  if (detailVisible.value && detail.value?.version.id === versionId)
    return

  const listedVersion = items.find(item => item.id === versionId)
  selectedVersionId.value = listedVersion?.id || versionId
  await openDetail(versionId)
}

function openTrackDetail(item: ContestReleaseTrackSnapshot) {
  selectedTrack.value = item
  trackDetailVisible.value = true
}

function openReviewLogDetail(item: ReleaseReviewLog) {
  selectedReviewLog.value = item
  reviewLogDrawerVisible.value = true
}

async function mutateVersion(
  versionId: string,
  action: 'approve' | 'reject' | 'publish',
  body?: Record<string, unknown>,
) {
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await requestApi<ReleaseVersion>(
      endpoint(`/admin/releases/${encodeURIComponent(versionId)}/${action}`),
      {
        method: 'POST',
        body,
      },
      '版本操作失败。',
    )
    successText.value = action === 'publish'
      ? '版本已发布，并替换旧版本。'
      : action === 'reject'
        ? '版本已驳回。'
        : body?.stage === 'second'
          ? '版本已通过二审。'
          : '版本已通过初审。'
    if (detail.value?.version.id === versionId)
      await openDetail(versionId)
    await loadVersions()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '版本操作失败。')
  }
  finally {
    actionLoading.value = false
  }
}

async function claimSecondReview() {
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const data = await requestApi<ReleaseVersion>(
      endpoint('/admin/releases/claim-second-review'),
      {
        method: 'POST',
        body: {
          scopeKind: props.scopeKind || undefined,
        },
      },
      '领取二审任务失败。',
    )
    successText.value = `已领取二审任务：${data.scopeTitle || data.scopeId}。`
    await loadVersions()
    await openDetail(data.id)
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '领取二审任务失败。')
  }
  finally {
    actionLoading.value = false
  }
}

function contestSummaryRows(snapshot: ContestReleaseSnapshot | null) {
  const contest = snapshot?.contest || null
  if (!contest)
    return []
  return [
    { label: '竞赛编号', value: contest.externalId || '-' },
    { label: '竞赛名称', value: contest.name || '-' },
    { label: '级别', value: contest.level || '-' },
    { label: '学科门类', value: (contest.disciplines || []).join('、') || '-' },
    { label: '官网地址', value: contest.officialUrl || '-' },
    { label: '竞赛简介', value: contest.summary || '-' },
    { label: '关键词', value: (contest.keywords || []).join('、') || '-' },
    { label: '时间节点', value: contestTimelineText(snapshot?.timelines || []) },
    { label: '适配人群', value: (contest.recommendedFor || []).join('、') || '-' },
  ]
}

function contestTimelineText(items: ContestReleaseTimelineSnapshot[]) {
  return items
    .map(formatTimelineSnapshotItem)
    .join('\n') || '-'
}

function resourceSummary(item: ContestReleaseResourceSnapshot): string {
  return [
    item.externalId,
    item.title,
    item.category,
    item.url,
    item.summary || '',
  ].filter(Boolean).join(' / ')
}

function policySummary(item: PolicyLibraryItemSnapshot): string {
  return [
    item.externalId,
    item.meetingName,
    item.conferenceDate || '',
    item.importance || '',
    item.officialMaterial || '',
    item.officialMaterialLink || '',
    item.wechatMaterial || '',
    item.wechatMaterialLink || '',
    item.weiboMaterial || '',
    item.weiboMaterialLink || '',
    item.douyinMaterial || '',
    item.douyinMaterialLink || '',
    item.xiaohongshuMaterial || '',
    item.xiaohongshuMaterialLink || '',
  ].filter(Boolean).join(' / ')
}

watch(statusFilter, (nextStatus) => {
  const expectedStatusByActionableFilter: Record<typeof actionableFilter.value, ReleaseVersionStatus | ''> = {
    all: '',
    pending_first: 'pending_first_review',
    claimed_second: 'pending_second_review',
    ready_publish: 'approved',
  }
  if (actionableFilter.value !== 'all' && expectedStatusByActionableFilter[actionableFilter.value] !== nextStatus)
    actionableFilter.value = 'all'
  selectedVersionId.value = ''
})

watch(
  [() => props.fetchPath, statusFilter, insightWindowDays, reviewerRankingMode],
  loadVersions,
  { immediate: true },
)

watch(routeVersionId, async () => {
  await openRouteVersionDetail(versions.value)
})

onMounted(() => {
  void loadCurrentUser()
})
</script>

<template>
  <section class="border border-slate-200 rounded-lg bg-white overflow-hidden">
    <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
      <div class="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 class="text-sm text-slate-900 font-semibold">
            {{ title }}
          </h2>
          <p v-if="description" class="text-xs text-slate-500 mt-1">
            {{ description }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <a-select v-model="statusFilter" size="small" class="w-[140px]">
            <a-option v-for="option in statusOptions" :key="option.value || 'all'" :value="option.value">
              {{ option.label }}
            </a-option>
          </a-select>
          <button v-if="showClaimButton" class="dense-btn" :disabled="actionLoading" @click="claimSecondReview">
            随机领取二审
          </button>
          <button class="dense-btn" :disabled="loading" @click="loadVersions">
            刷新
          </button>
        </div>
      </div>
      <div v-if="actionableFilterLabel" class="text-[11px] text-slate-500 mt-2 flex gap-2 items-center">
        <span>{{ actionableFilterLabel }}</span>
        <button class="text-slate-700 hover:text-slate-900" type="button" @click="actionableFilter = 'all'">
          清除
        </button>
      </div>
      <p v-if="queueLoadedText" class="text-[11px] text-slate-500 mt-2">
        {{ queueLoadedText }}
      </p>
    </div>

    <div class="gap-0 grid md:grid-cols-4">
      <div class="border-b border-slate-200 bg-slate-50/60 md:border-b-0 md:border-r">
        <div class="space-y-0">
          <div class="grid grid-cols-2">
            <div class="px-3 py-2 border-b border-r border-slate-200">
              <p class="text-[10px] text-slate-400 uppercase">
                待初审
              </p>
              <p class="text-sm text-slate-900 font-semibold mt-1">
                {{ summaryStats.pendingFirst }}
              </p>
            </div>
            <div class="px-3 py-2 border-b border-slate-200">
              <p class="text-[10px] text-slate-400 uppercase">
                待二审
              </p>
              <p class="text-sm text-slate-900 font-semibold mt-1">
                {{ summaryStats.pendingSecond }}
              </p>
            </div>
            <div class="px-3 py-2 border-b border-r border-slate-200">
              <p class="text-[10px] text-slate-400 uppercase">
                待发布
              </p>
              <p class="text-sm text-slate-900 font-semibold mt-1">
                {{ summaryStats.approved }}
              </p>
            </div>
            <div class="px-3 py-2 border-b border-slate-200">
              <p class="text-[10px] text-slate-400 uppercase">
                已发布
              </p>
              <p class="text-sm text-slate-900 font-semibold mt-1">
                {{ summaryStats.published }}
              </p>
            </div>
          </div>

          <section class="px-3 py-3 border-b border-slate-200">
            <div class="flex gap-2 items-center justify-between">
              <h3 class="text-xs text-slate-900 font-semibold">
                待我处理
              </h3>
              <span class="text-[11px] text-slate-500">
                {{ insightsWindowLabel }}
              </span>
            </div>
            <div v-if="actionableInsights" class="mt-3 text-center gap-2 grid grid-cols-3">
              <button
                class="px-2 py-2 text-left border rounded transition"
                :class="actionableFilter === 'pending_first' ? 'border-slate-900 bg-slate-100' : 'border-slate-200 hover:border-slate-300'"
                type="button"
                @click="toggleActionableFilter('pending_first')"
              >
                <p class="text-[10px] text-slate-400">
                  可做初审
                </p>
                <p class="text-sm text-slate-900 font-semibold mt-1">
                  {{ actionableInsights.pendingFirstCount }}
                </p>
              </button>
              <button
                class="px-2 py-2 text-left border rounded transition"
                :class="actionableFilter === 'claimed_second' ? 'border-slate-900 bg-slate-100' : 'border-slate-200 hover:border-slate-300'"
                type="button"
                @click="toggleActionableFilter('claimed_second')"
              >
                <p class="text-[10px] text-slate-400">
                  我领的二审
                </p>
                <p class="text-sm text-slate-900 font-semibold mt-1">
                  {{ actionableInsights.claimedSecondCount }}
                </p>
              </button>
              <button
                class="px-2 py-2 text-left border rounded transition"
                :class="actionableFilter === 'ready_publish' ? 'border-slate-900 bg-slate-100' : 'border-slate-200 hover:border-slate-300'"
                type="button"
                @click="toggleActionableFilter('ready_publish')"
              >
                <p class="text-[10px] text-slate-400">
                  待发布
                </p>
                <p class="text-sm text-slate-900 font-semibold mt-1">
                  {{ actionableInsights.readyToPublishCount }}
                </p>
              </button>
            </div>
            <a-empty v-else-if="!loading" description="暂无待处理项" class="py-4" />
          </section>

          <section class="px-3 py-3 border-b border-slate-200">
            <div class="flex items-center justify-between">
              <h3 class="text-xs text-slate-900 font-semibold">
                我的审核统计
              </h3>
              <span v-if="currentUserInsights" class="text-[11px] text-slate-500">
                {{ reviewerMetricText(currentUserInsights) }}
              </span>
            </div>
            <div v-if="currentUserInsights" class="text-[11px] mt-3 gap-x-3 gap-y-2 grid grid-cols-2">
              <div class="space-y-0.5">
                <p class="text-slate-400">
                  初审通过
                </p>
                <p class="text-slate-900 font-medium">
                  {{ currentUserInsights.firstReviewApprovedCount }}
                </p>
              </div>
              <div class="space-y-0.5">
                <p class="text-slate-400">
                  领取二审
                </p>
                <p class="text-slate-900 font-medium">
                  {{ currentUserInsights.secondReviewClaimedCount }}
                </p>
              </div>
              <div class="space-y-0.5">
                <p class="text-slate-400">
                  二审通过
                </p>
                <p class="text-slate-900 font-medium">
                  {{ currentUserInsights.secondReviewApprovedCount }}
                </p>
              </div>
              <div class="space-y-0.5">
                <p class="text-slate-400">
                  驳回
                </p>
                <p class="text-slate-900 font-medium">
                  {{ currentUserInsights.rejectedCount }}
                </p>
              </div>
              <div class="space-y-0.5">
                <p class="text-slate-400">
                  发布
                </p>
                <p class="text-slate-900 font-medium">
                  {{ currentUserInsights.publishedCount }}
                </p>
              </div>
              <div class="space-y-0.5">
                <p class="text-slate-400">
                  累计动作
                </p>
                <p class="text-slate-900 font-medium">
                  {{ currentUserInsights.totalActions }}
                </p>
              </div>
            </div>
            <p v-if="currentUserInsights?.lastActionAt" class="text-[11px] text-slate-500 mt-3">
              最近参与：{{ formatDateTime(currentUserInsights.lastActionAt) }}
            </p>
            <a-empty v-else-if="!loading" description="暂无个人审核记录" class="py-4" />
          </section>

          <section class="px-3 py-3 border-b border-slate-200">
            <div class="flex gap-2 items-center justify-between">
              <h3 class="text-xs text-slate-900 font-semibold">
                管理员审核排名
              </h3>
              <a-select v-model="reviewerRankingMode" size="mini" class="w-[110px]">
                <a-option v-for="option in reviewerRankingOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </a-option>
              </a-select>
            </div>
            <div v-if="rankedReviewerInsights.length" class="mt-3 space-y-2">
              <div v-for="(reviewer, index) in rankedReviewerInsights" :key="reviewer.userId" class="flex gap-2 items-center">
                <div class="text-[11px] text-slate-400 font-medium w-5">
                  {{ index + 1 }}
                </div>
                <a-avatar :size="24" :image-url="reviewer.avatarUrl || undefined">
                  {{ reviewer.actorName.slice(0, 1) }}
                </a-avatar>
                <div class="flex-1 min-w-0">
                  <p class="text-[11px] text-slate-900 font-medium truncate">
                    {{ reviewer.actorName }}
                  </p>
                  <p class="text-[11px] text-slate-500">
                    {{ reviewerMetricText(reviewer) }}
                  </p>
                </div>
              </div>
            </div>
            <a-empty v-else-if="!loading" description="暂无审核排名" class="py-4" />
          </section>

          <section class="px-3 py-3">
            <div class="flex gap-2 items-center justify-between">
              <h3 class="text-xs text-slate-900 font-semibold">
                近期审核
              </h3>
              <a-select v-model="insightWindowDays" size="mini" class="w-[96px]">
                <a-option v-for="option in insightWindowOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </a-option>
              </a-select>
            </div>
            <div v-if="recentReviewInsights.length" class="mt-3 space-y-3">
              <button
                v-for="item in recentReviewInsights"
                :key="item.id"
                class="px-2 py-2 text-left border border-transparent rounded w-full block transition space-y-1 hover:border-slate-200 hover:bg-white"
                type="button"
                @click="openRecentReview(item)"
              >
                <div class="flex gap-2 items-center">
                  <a-avatar :size="22" :image-url="item.avatarUrl || undefined">
                    {{ item.actorName.slice(0, 1) }}
                  </a-avatar>
                  <p class="text-[11px] text-slate-900 font-medium flex-1 min-w-0 truncate">
                    {{ item.actorName }}
                  </p>
                  <a-tag size="small" :color="reviewActionTagColor(item.action)">
                    {{ actionLabel(item.action) }}
                  </a-tag>
                </div>
                <p class="text-[11px] text-slate-600">
                  {{ item.scopeTitle || item.scopeId }} · V{{ item.versionNumber }}
                </p>
                <p class="text-[11px] text-slate-500">
                  {{ formatDateTime(item.createdAt) }}
                </p>
              </button>
            </div>
            <a-empty v-else-if="!loading" description="暂无近期审核" class="py-4" />
          </section>
        </div>
      </div>

      <div class="p-3 md:col-span-3">
        <div v-if="errorText" class="text-xs text-rose-600 mb-3 px-3 py-2 border border-rose-200 rounded bg-rose-50">
          {{ errorText }}
        </div>
        <div v-if="successText" class="text-xs text-emerald-700 mb-3 px-3 py-2 border border-emerald-200 rounded bg-emerald-50">
          {{ successText }}
        </div>

        <a-table
          v-if="filteredVersions.length"
          :data="filteredVersions"
          :pagination="false"
          :bordered="false"
          size="small"
          row-key="id"
        >
          <template #columns>
            <a-table-column title="版本" data-index="versionNumber" :width="92">
              <template #cell="{ record }">
                <button class="text-xs text-slate-900 font-semibold text-left hover:text-blue-600" @click="selectedVersionId = record.id; openDetail(record.id)">
                  V{{ record.versionNumber }}
                </button>
              </template>
            </a-table-column>

            <a-table-column title="范围" data-index="scopeTitle">
              <template #cell="{ record }">
                <div class="space-y-1">
                  <p class="text-xs text-slate-900 font-medium">
                    {{ record.scopeTitle || record.scopeId }}
                  </p>
                  <p class="text-[11px] text-slate-500">
                    {{ scopeKindLabel(record.scopeKind) }} / {{ record.scopeId }}
                  </p>
                </div>
              </template>
            </a-table-column>

            <a-table-column title="状态" data-index="status" :width="118">
              <template #cell="{ record }">
                <a-tag size="small" :color="statusColor(record.status)">
                  {{ statusLabel(record.status) }}
                </a-tag>
              </template>
            </a-table-column>

            <a-table-column title="变更摘要" data-index="diffSummary" :width="230">
              <template #cell="{ record }">
                <p class="text-xs text-slate-700">
                  {{ diffSummaryText(record) }}
                </p>
              </template>
            </a-table-column>

            <a-table-column title="同步批次" data-index="syncRunId" :width="170">
              <template #cell="{ record }">
                <p class="text-[11px] text-slate-500 break-all">
                  {{ record.syncRunId || '-' }}
                </p>
              </template>
            </a-table-column>

            <a-table-column title="更新时间" data-index="updatedAt" :width="168">
              <template #cell="{ record }">
                <p class="text-[11px] text-slate-500">
                  {{ formatDateTime(record.updatedAt) }}
                </p>
              </template>
            </a-table-column>

            <a-table-column title="操作" data-index="actions" :width="120" fixed="right">
              <template #cell="{ record }">
                <div class="flex flex-wrap gap-2">
                  <button class="dense-btn" :disabled="actionLoading" @click="selectedVersionId = record.id; openDetail(record.id)">
                    审核
                  </button>
                </div>
              </template>
            </a-table-column>
          </template>
        </a-table>

        <a-empty v-else-if="!loading" description="当前没有匹配的版本记录" />

        <a-skeleton v-if="loading" :animation="true">
          <a-skeleton-line :rows="6" />
        </a-skeleton>
      </div>
    </div>

    <a-drawer v-model:visible="detailVisible" width="920px" title="版本详情" unmount-on-close>
      <div v-if="detailLoading" class="p-2">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>
      </div>

      <div v-else-if="detail" class="text-xs space-y-4">
        <section class="p-3 border border-slate-200 rounded bg-slate-50">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <div>
              <p class="text-sm text-slate-900 font-semibold">
                {{ previewTitle(detail.version) }}
              </p>
              <p class="text-slate-500 mt-1">
                版本 V{{ detail.version.versionNumber }} · {{ detail.version.scopeId }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2 items-center justify-end">
              <a-tag size="small" :color="statusColor(detail.version.status)">
                {{ statusLabel(detail.version.status) }}
              </a-tag>
              <button class="dense-btn" type="button" @click="timelineVisible = true">
                查看流程时间线
              </button>
            </div>
          </div>
          <div class="mt-3 gap-2 grid md:grid-cols-2">
            <p class="text-slate-600">
              创建时间：{{ formatDateTime(detail.version.createdAt) }}
            </p>
            <p class="text-slate-600">
              更新时间：{{ formatDateTime(detail.version.updatedAt) }}
            </p>
            <p class="text-slate-600">
              初审人：{{ detail.version.firstReviewByUserId || '-' }}
            </p>
            <p class="text-slate-600">
              二审领取人：{{ detail.version.secondReviewClaimedByUserId || '-' }}
            </p>
            <p class="text-slate-600">
              二审人：{{ detail.version.secondReviewByUserId || '-' }}
            </p>
            <p class="text-slate-600">
              发布人：{{ detail.version.publishedByUserId || '-' }}
            </p>
          </div>
          <p class="text-slate-600 mt-2">
            变更摘要：{{ diffSummaryText(detail.version) }}
          </p>
          <p v-if="detail.version.rejectReason" class="text-rose-700 mt-2">
            驳回原因：{{ detail.version.rejectReason }}
          </p>
        </section>

        <section v-if="detailContestSnapshot" class="space-y-3">
          <div v-if="detail.publishCheck" class="p-3 border border-slate-200 rounded">
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <h3 class="text-sm text-slate-900 font-semibold">
                发布校验
              </h3>
              <a-tag size="small" :color="detail.publishCheck.canPublish ? 'green' : 'red'">
                完整度 {{ detail.publishCheck.completion }}%
              </a-tag>
            </div>
            <div v-if="detail.publishCheck.blockers.length" class="mt-3 space-y-2">
              <div v-for="item in detail.publishCheck.blockers" :key="item.code" class="p-2 border border-rose-200 rounded bg-rose-50">
                <p class="text-xs text-rose-700 font-medium">
                  {{ item.message }}
                </p>
                <p class="text-[11px] text-rose-500 mt-1">
                  blocker / {{ item.field || item.code }}
                </p>
              </div>
            </div>
            <div v-else class="text-xs text-emerald-700 mt-3">
              当前版本已满足发布前置条件。
            </div>
            <div v-if="detail.publishCheck.warnings.length" class="mt-3 space-y-2">
              <div v-for="item in detail.publishCheck.warnings" :key="item.code" class="p-2 border border-amber-200 rounded bg-amber-50">
                <p class="text-xs text-amber-700 font-medium">
                  {{ item.message }}
                </p>
                <p class="text-[11px] text-amber-500 mt-1">
                  warning / {{ item.field || item.code }}
                </p>
              </div>
            </div>
          </div>

          <div class="p-3 border border-slate-200 rounded">
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <h3 class="text-sm text-slate-900 font-semibold">
                竞赛库快照
              </h3>
              <button class="dense-btn" type="button" @click="metadataDrawerVisible = true">
                确认概览字段
              </button>
            </div>
            <div class="mt-3 gap-2 grid md:grid-cols-2">
              <p v-for="item in contestSummaryRows(detailContestSnapshot)" :key="item.label" class="text-slate-700 whitespace-pre-wrap">
                <span class="text-slate-400">{{ item.label }}：</span>{{ item.value }}
              </p>
            </div>
          </div>

          <div class="p-3 border border-slate-200 rounded">
            <h3 class="text-sm text-slate-900 font-semibold">
              赛道库快照
            </h3>
            <a-table
              v-if="detailContestSnapshot.tracks.length"
              class="mt-3"
              :data="detailContestSnapshot.tracks"
              :pagination="false"
              :bordered="false"
              size="small"
              row-key="externalId"
            >
              <template #columns>
                <a-table-column title="赛道编号" data-index="externalId" :width="160">
                  <template #cell="{ record }">
                    <p class="text-[11px] text-slate-600 break-all">
                      {{ record.externalId || '-' }}
                    </p>
                  </template>
                </a-table-column>
                <a-table-column title="赛道名称" data-index="name">
                  <template #cell="{ record }">
                    <p class="text-xs text-slate-900 font-medium">
                      {{ record.name || '-' }}
                    </p>
                  </template>
                </a-table-column>
                <a-table-column title="主办方" data-index="organizer" :width="180">
                  <template #cell="{ record }">
                    <p class="text-xs text-slate-600">
                      {{ record.organizer || '-' }}
                    </p>
                  </template>
                </a-table-column>
                <a-table-column title="位置" data-index="location" :width="160">
                  <template #cell="{ record }">
                    <p class="text-xs text-slate-600">
                      {{ record.location || '-' }}
                    </p>
                  </template>
                </a-table-column>
                <a-table-column title="操作" data-index="actions" :width="96" fixed="right">
                  <template #cell="{ record }">
                    <button class="dense-btn" type="button" @click="openTrackDetail(record)">
                      确认
                    </button>
                  </template>
                </a-table-column>
              </template>
            </a-table>
            <a-empty v-else description="当前版本没有赛道变更" />
          </div>

          <div class="p-3 border border-slate-200 rounded">
            <h3 class="text-sm text-slate-900 font-semibold">
              资料库快照
            </h3>
            <div v-if="detailContestSnapshot.resources.length" class="mt-3 space-y-2">
              <div v-for="item in detailContestSnapshot.resources" :key="item.externalId" class="p-2 border border-slate-200 rounded bg-slate-50">
                {{ resourceSummary(item) }}
              </div>
            </div>
            <a-empty v-else description="当前版本没有资料变更" />
          </div>
        </section>

        <section v-else-if="detailPolicySnapshot" class="p-3 border border-slate-200 rounded">
          <h3 class="text-sm text-slate-900 font-semibold">
            政策库快照
          </h3>
          <div v-if="detailPolicySnapshot.items.length" class="mt-3 space-y-2">
            <div v-for="item in detailPolicySnapshot.items" :key="item.externalId" class="p-2 border border-slate-200 rounded bg-slate-50">
              {{ policySummary(item) }}
            </div>
          </div>
          <a-empty v-else description="当前版本没有政策项" />
        </section>

        <section class="p-3 border border-slate-200 rounded">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <h3 class="text-sm text-slate-900 font-semibold">
              审批日志
            </h3>
            <p class="text-[11px] text-slate-500">
              点击查看详情
            </p>
          </div>
          <a-table
            v-if="detail.logs.length"
            class="mt-3"
            :data="detail.logs"
            :pagination="false"
            :bordered="false"
            size="small"
            row-key="id"
          >
            <template #columns>
              <a-table-column title="动作" data-index="action">
                <template #cell="{ record }">
                  <p class="text-xs text-slate-900 font-medium">
                    {{ actionLabel(record.action) }}
                  </p>
                </template>
              </a-table-column>
              <a-table-column title="操作人" data-index="actorUserId" :width="260">
                <template #cell="{ record }">
                  <p class="text-[11px] text-slate-500 break-all">
                    {{ record.actorUserId || '-' }}
                  </p>
                </template>
              </a-table-column>
              <a-table-column title="时间" data-index="createdAt" :width="160">
                <template #cell="{ record }">
                  <p class="text-[11px] text-slate-500">
                    {{ formatDateTime(record.createdAt) }}
                  </p>
                </template>
              </a-table-column>
              <a-table-column title="操作" data-index="actions" :width="96" fixed="right">
                <template #cell="{ record }">
                  <button class="dense-btn" type="button" @click="openReviewLogDetail(record)">
                    查看
                  </button>
                </template>
              </a-table-column>
            </template>
          </a-table>
          <a-empty v-else description="暂无审批日志" />
        </section>

        <section class="p-3 border border-slate-200 rounded space-y-3">
          <h3 class="text-sm text-slate-900 font-semibold">
            审批操作
          </h3>
          <a-textarea v-model="rejectReason" :auto-size="{ minRows: 3, maxRows: 6 }" placeholder="驳回时填写原因，审批日志会记录。" />
          <div class="flex flex-wrap gap-2">
            <button
              v-if="detail.version.status === 'pending_first_review'"
              class="dense-btn"
              :disabled="actionLoading"
              @click="mutateVersion(detail.version.id, 'approve', { stage: 'first' })"
            >
              初审通过
            </button>
            <button
              v-if="canReviewSecond(detail.version)"
              class="dense-btn"
              :disabled="actionLoading"
              @click="mutateVersion(detail.version.id, 'approve', { stage: 'second' })"
            >
              二审通过
            </button>
            <button
              v-if="canRejectVersion(detail.version)"
              class="dense-btn"
              :disabled="actionLoading"
              @click="mutateVersion(detail.version.id, 'reject', { reason: rejectReason })"
            >
              驳回
            </button>
            <button
              v-if="detail.version.status === 'approved'"
              class="dense-btn"
              :disabled="actionLoading || !canPublishCurrentDetail"
              @click="mutateVersion(detail.version.id, 'publish')"
            >
              发布替换
            </button>
          </div>
          <p v-if="secondReviewNotice(detail.version)" class="text-xs text-amber-700">
            {{ secondReviewNotice(detail.version) }}
          </p>
          <p v-if="detail.version.status === 'approved' && detail.publishCheck && !detail.publishCheck.canPublish" class="text-xs text-amber-700">
            当前版本仍存在发布阻断项，建议先驳回并补齐后再进入发布。
          </p>
        </section>
      </div>

      <a-empty v-else description="未加载到版本详情" />
    </a-drawer>

    <a-drawer
      v-model:visible="reviewLogDrawerVisible"
      width="640px"
      title="审批日志详情"
      unmount-on-close
    >
      <div v-if="selectedReviewLog" class="text-xs space-y-4">
        <section class="p-3 border border-slate-200 rounded bg-slate-50">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <h3 class="text-sm text-slate-900 font-semibold">
              {{ actionLabel(selectedReviewLog.action) }}
            </h3>
            <p class="text-slate-500">
              {{ formatDateTime(selectedReviewLog.createdAt) }}
            </p>
          </div>
          <div class="mt-3 gap-2 grid">
            <p class="text-slate-600 break-all">
              操作人：{{ selectedReviewLog.actorUserId || '-' }}
            </p>
            <p class="text-slate-600 break-all">
              日志 ID：{{ selectedReviewLog.id }}
            </p>
          </div>
        </section>

        <section class="p-3 border border-slate-200 rounded">
          <h3 class="text-sm text-slate-900 font-semibold">
            原始数据
          </h3>
          <pre class="text-[11px] text-slate-700 mt-3 p-2 border border-slate-200 rounded bg-slate-50 whitespace-pre-wrap break-words">{{ reviewLogPayloadText(selectedReviewLog) }}</pre>
        </section>
      </div>
      <a-empty v-else description="未选择审批日志" />
    </a-drawer>

    <a-drawer
      v-model:visible="metadataDrawerVisible"
      width="720px"
      title="赛事概览确认表单"
      unmount-on-close
    >
      <a-form v-if="detailContestSnapshot" :model="detailContestSnapshot" layout="vertical" class="text-xs space-y-4">
        <section class="p-3 border border-slate-200 rounded bg-slate-50">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <h3 class="text-sm text-slate-900 font-semibold">
              发布校验核心字段
            </h3>
            <a-tag size="small" color="arcoblue">
              核心字段
            </a-tag>
          </div>
          <div class="mt-3 gap-3 grid md:grid-cols-2">
            <a-form-item v-for="item in contestMetadataFormRows(detailContestSnapshot)" :key="item.key" :label="item.label">
              <a-textarea
                :model-value="item.value"
                :auto-size="{ minRows: item.value.length > 80 ? 2 : 1, maxRows: 6 }"
                readonly
              />
              <p class="text-[11px] text-slate-500 mt-1">
                审核口径：{{ item.source }}
              </p>
            </a-form-item>
          </div>
        </section>

        <section class="p-3 border border-slate-200 rounded">
          <h3 class="text-sm text-slate-900 font-semibold">
            同版本赛道/时间线
          </h3>
          <div class="mt-3 gap-2 grid md:grid-cols-2">
            <p class="text-slate-600">
              赛道数量：{{ detailContestSnapshot.tracks.length }}
            </p>
            <p class="text-slate-600">
              赛事时间节点：{{ detailContestSnapshot.timelines.length }}
            </p>
          </div>
          <div class="mt-3">
            <div>
              <p class="text-slate-400 mb-1">
                时间节点
              </p>
              <pre class="text-[11px] text-slate-700 p-2 border border-slate-200 rounded bg-slate-50 whitespace-pre-wrap break-words">{{ mergedContestTimelineReviewText(detailContestSnapshot) }}</pre>
            </div>
          </div>
        </section>

        <div class="pt-2 flex justify-end">
          <button class="dense-btn" type="button" @click="metadataDrawerVisible = false">
            确认
          </button>
        </div>
      </a-form>
      <a-empty v-else description="未加载到赛事快照" />
    </a-drawer>

    <a-modal
      v-model:visible="timelineVisible"
      :footer="false"
      title="流程时间线"
      width="760px"
      unmount-on-close
    >
      <div v-if="detailWorkflowTimeline.length" class="text-xs pr-1 max-h-[70vh] overflow-auto space-y-2">
        <div v-for="item in detailWorkflowTimeline" :key="item.id" class="p-2 border border-slate-200 rounded">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <div class="flex flex-wrap gap-2 items-center">
              <a-tag size="small" :color="timelineSourceColor(item.source)">
                {{ timelineSourceLabel(item.source) }}
              </a-tag>
              <p class="text-slate-900 font-medium">
                {{ item.title }}
              </p>
            </div>
            <p class="text-slate-500">
              {{ formatDateTime(item.createdAt) }}
            </p>
          </div>
          <p class="text-slate-500 mt-1">
            actor={{ item.actorUserId || '-' }} · version={{ item.versionNumber ? `V${item.versionNumber}` : '-' }} · syncRun={{ item.syncRunId || '-' }}
          </p>
          <p v-if="item.description" class="text-slate-600 mt-1">
            {{ item.description }}
          </p>
          <div v-if="syncPreservationSummarySections(item).length" class="mt-2 p-2 border border-slate-200 rounded bg-slate-50 space-y-2">
            <p class="text-slate-900 font-medium">
              同步保留摘要
            </p>
            <div v-for="section in syncPreservationSummarySections(item)" :key="section.key" class="space-y-1">
              <p class="text-slate-500">
                {{ section.title }}
              </p>
              <ul class="text-slate-700 pl-4 list-disc space-y-1">
                <li v-for="(summaryItem, index) in section.items" :key="`${section.key}-${index}`">
                  {{ syncPreservationSummaryItemText(summaryItem) }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <a-empty v-else description="暂无流程时间线" />
    </a-modal>

    <a-modal
      v-model:visible="trackDetailVisible"
      :footer="false"
      title="赛道确认表单"
      width="760px"
      unmount-on-close
    >
      <a-form v-if="selectedTrack" :model="selectedTrack" layout="vertical" class="text-xs">
        <div class="gap-3 grid md:grid-cols-2">
          <a-form-item
            v-for="item in trackFormRows(selectedTrack, detailContestSnapshot)"
            :key="item.label"
            :label="item.label"
            :class="item.kind === 'cover' ? 'md:col-span-2' : ''"
          >
            <div v-if="item.kind === 'cover' && item.previewSource && !coverPreviewFailed(item.value, item.previewSource)" class="mb-3 p-2 border border-slate-200 rounded bg-slate-50">
              <div class="border border-slate-200 rounded bg-white h-[180px] w-full overflow-hidden">
                <img :src="item.previewSource" alt="赛道封面原图" class="h-full w-full object-contain" loading="lazy" @error="markCoverPreviewFailed(item.value, item.previewSource)">
              </div>
              <div class="mt-2 gap-2 grid md:grid-cols-3">
                <div v-for="preview in coverPreviewFrames" :key="preview.key">
                  <p class="text-[11px] text-slate-500 mb-1">
                    {{ preview.label }}
                  </p>
                  <div class="border border-slate-200 rounded bg-white w-full overflow-hidden" :class="preview.className">
                    <img :src="item.previewSource" alt="赛道封面比例预览" class="h-full w-full object-cover" loading="lazy" @error="markCoverPreviewFailed(item.value, item.previewSource)">
                  </div>
                </div>
              </div>
            </div>
            <p v-else-if="item.kind === 'cover' && coverPreviewUnavailableText(item.value, item.previewSource)" class="text-[11px] text-amber-700 mb-2">
              {{ coverPreviewUnavailableText(item.value, item.previewSource) }}
            </p>
            <a-textarea
              :model-value="item.value"
              :auto-size="{ minRows: item.value.length > 80 ? 2 : 1, maxRows: 6 }"
              readonly
            />
          </a-form-item>
        </div>
        <div class="pt-2 flex justify-end">
          <button class="dense-btn" type="button" @click="trackDetailVisible = false">
            确认
          </button>
        </div>
      </a-form>
      <a-empty v-else description="未选择赛道" />
    </a-modal>
  </section>
</template>
