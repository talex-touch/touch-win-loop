<script setup lang="ts">
import type {
  ApiResponse,
  ContestReleaseContestSnapshot,
  ContestReleaseResourceSnapshot,
  ContestReleaseSnapshot,
  ContestReleaseTimelineSnapshot,
  ContestReleaseTrackSnapshot,
  ContestReleaseTrackTimelineSnapshot,
  PolicyLibraryItemSnapshot,
  PolicyLibraryReleaseSnapshot,
  ReleaseReviewLog,
  ReleaseScopeKind,
  ReleaseVersion,
  ReleaseVersionDetail,
  ReleaseVersionStatus,
} from '~~/shared/types/domain'

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
const detail = ref<ReleaseVersionDetail | null>(null)
const versions = ref<ReleaseVersion[]>([])

const statusFilter = ref<ReleaseVersionStatus | ''>('')
const selectedVersionId = ref('')

const statusOptions: Array<{ value: ReleaseVersionStatus | '', label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'pending_first_review', label: '待初审' },
  { value: 'pending_second_review', label: '待二审' },
  { value: 'approved', label: '待发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'published', label: '已发布' },
  { value: 'superseded', label: '已替换' },
]

const filteredVersions = computed(() => {
  if (!statusFilter.value)
    return versions.value
  return versions.value.filter(item => item.status === statusFilter.value)
})

const selectedVersion = computed(() => {
  return versions.value.find(item => item.id === selectedVersionId.value) || null
})

const summaryStats = computed(() => {
  return {
    pendingFirst: versions.value.filter(item => item.status === 'pending_first_review').length,
    pendingSecond: versions.value.filter(item => item.status === 'pending_second_review').length,
    approved: versions.value.filter(item => item.status === 'approved').length,
    published: versions.value.filter(item => item.status === 'published').length,
  }
})

function formatDateTime(value?: string | null): string {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
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

async function loadVersions() {
  loading.value = true
  errorText.value = ''
  try {
    const data = await requestApi<ReleaseVersion[]>(
      endpoint(props.fetchPath),
      {
        query: props.fetchQuery,
      },
      '版本列表加载失败。',
    )
    versions.value = data || []
    if (!selectedVersion.value && versions.value[0])
      selectedVersionId.value = versions.value[0].id
  }
  catch (error: any) {
    versions.value = []
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

function contestSummaryRows(contest: ContestReleaseContestSnapshot | null) {
  if (!contest)
    return []
  return [
    { label: '竞赛编号', value: contest.externalId || '-' },
    { label: '竞赛名称', value: contest.name || '-' },
    { label: '级别', value: contest.level || '-' },
    { label: '官网地址', value: contest.officialUrl || '-' },
    { label: '学科门类', value: (contest.disciplines || []).join('、') || '-' },
    { label: '关键词', value: (contest.keywords || []).join('、') || '-' },
    { label: '适配人群', value: (contest.recommendedFor || []).join('、') || '-' },
    { label: '竞赛简介', value: contest.summary || '-' },
  ]
}

function contestTimelineText(items: ContestReleaseTimelineSnapshot[]) {
  return items
    .map(item => `${item.year} · ${item.nodeType} · ${item.startAt || '-'} ~ ${item.endAt || '-'}${item.note ? ` · ${item.note}` : ''}`)
    .join('\n') || '-'
}

function trackTimelineText(items: ContestReleaseTrackTimelineSnapshot[]) {
  return items
    .map(item => `${item.trackExternalId} · ${item.year} · ${item.nodeType} · ${item.startAt || '-'} ~ ${item.endAt || '-'}${item.note ? ` · ${item.note}` : ''}`)
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

function trackSummary(item: ContestReleaseTrackSnapshot): string {
  return [
    item.externalId,
    item.name,
    item.location || '',
    item.organizer || '',
    item.undertaker || '',
    item.participantRequirements || '',
    item.teamRule || '',
    (item.suitableMajors || []).join('、'),
    item.awardRatio || '',
    (item.evidenceRequirements || []).join('、'),
    (item.scoringPoints || []).join('、'),
    (item.deductionItems || []).join('、'),
    (item.deliverableTypes || []).join('、'),
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

watch(() => props.fetchPath, loadVersions, { immediate: true })
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
    </div>

    <div class="gap-0 grid md:grid-cols-4">
      <div class="border-b border-slate-200 bg-slate-50/60 md:border-b-0 md:border-r">
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
          <div class="px-3 py-2 border-r border-slate-200">
            <p class="text-[10px] text-slate-400 uppercase">
              待发布
            </p>
            <p class="text-sm text-slate-900 font-semibold mt-1">
              {{ summaryStats.approved }}
            </p>
          </div>
          <div class="px-3 py-2">
            <p class="text-[10px] text-slate-400 uppercase">
              已发布
            </p>
            <p class="text-sm text-slate-900 font-semibold mt-1">
              {{ summaryStats.published }}
            </p>
          </div>
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

            <a-table-column title="操作" data-index="actions" :width="250" fixed="right">
              <template #cell="{ record }">
                <div class="flex flex-wrap gap-2">
                  <button class="dense-btn" :disabled="actionLoading" @click="selectedVersionId = record.id; openDetail(record.id)">
                    查看
                  </button>
                  <button
                    v-if="record.status === 'pending_first_review'"
                    class="dense-btn"
                    :disabled="actionLoading"
                    @click="mutateVersion(record.id, 'approve', { stage: 'first' })"
                  >
                    初审通过
                  </button>
                  <button
                    v-if="record.status === 'pending_second_review'"
                    class="dense-btn"
                    :disabled="actionLoading"
                    @click="mutateVersion(record.id, 'approve', { stage: 'second' })"
                  >
                    二审通过
                  </button>
                  <button
                    v-if="record.status === 'approved'"
                    class="dense-btn"
                    :disabled="actionLoading"
                    @click="mutateVersion(record.id, 'publish')"
                  >
                    发布替换
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
            <a-tag size="small" :color="statusColor(detail.version.status)">
              {{ statusLabel(detail.version.status) }}
            </a-tag>
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
          <div class="p-3 border border-slate-200 rounded">
            <h3 class="text-sm text-slate-900 font-semibold">
              竞赛库快照
            </h3>
            <div class="mt-3 gap-2 grid md:grid-cols-2">
              <p v-for="item in contestSummaryRows(detailContestSnapshot.contest || null)" :key="item.label" class="text-slate-700">
                <span class="text-slate-400">{{ item.label }}：</span>{{ item.value }}
              </p>
            </div>
            <div class="mt-3">
              <p class="text-slate-400 mb-1">
                时间节点
              </p>
              <pre class="text-[11px] text-slate-700 p-2 border border-slate-200 rounded bg-slate-50 whitespace-pre-wrap break-words">{{ contestTimelineText(detailContestSnapshot.timelines) }}</pre>
            </div>
          </div>

          <div class="p-3 border border-slate-200 rounded">
            <h3 class="text-sm text-slate-900 font-semibold">
              赛道库快照
            </h3>
            <div v-if="detailContestSnapshot.tracks.length" class="mt-3 space-y-2">
              <div v-for="item in detailContestSnapshot.tracks" :key="item.externalId" class="p-2 border border-slate-200 rounded bg-slate-50">
                {{ trackSummary(item) }}
              </div>
            </div>
            <a-empty v-else description="当前版本没有赛道变更" />
            <div class="mt-3">
              <p class="text-slate-400 mb-1">
                赛道时间节点
              </p>
              <pre class="text-[11px] text-slate-700 p-2 border border-slate-200 rounded bg-slate-50 whitespace-pre-wrap break-words">{{ trackTimelineText(detailContestSnapshot.trackTimelines) }}</pre>
            </div>
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
          <h3 class="text-sm text-slate-900 font-semibold">
            审批日志
          </h3>
          <div v-if="detail.logs.length" class="mt-3 space-y-2">
            <div v-for="item in detail.logs" :key="item.id" class="p-2 border border-slate-200 rounded">
              <div class="flex flex-wrap gap-2 items-center justify-between">
                <p class="text-slate-900 font-medium">
                  {{ actionLabel(item.action) }}
                </p>
                <p class="text-slate-500">
                  {{ formatDateTime(item.createdAt) }}
                </p>
              </div>
              <p class="text-slate-500 mt-1">
                操作人：{{ item.actorUserId || '-' }}
              </p>
              <pre v-if="Object.keys(item.payload || {}).length" class="text-[11px] text-slate-700 mt-2 p-2 border border-slate-200 rounded bg-slate-50 whitespace-pre-wrap break-words">{{ JSON.stringify(item.payload, null, 2) }}</pre>
            </div>
          </div>
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
              v-if="detail.version.status === 'pending_second_review'"
              class="dense-btn"
              :disabled="actionLoading"
              @click="mutateVersion(detail.version.id, 'approve', { stage: 'second' })"
            >
              二审通过
            </button>
            <button
              v-if="['pending_first_review', 'pending_second_review', 'approved'].includes(detail.version.status)"
              class="dense-btn"
              :disabled="actionLoading"
              @click="mutateVersion(detail.version.id, 'reject', { reason: rejectReason })"
            >
              驳回
            </button>
            <button
              v-if="detail.version.status === 'approved'"
              class="dense-btn"
              :disabled="actionLoading"
              @click="mutateVersion(detail.version.id, 'publish')"
            >
              发布替换
            </button>
          </div>
        </section>
      </div>

      <a-empty v-else description="未加载到版本详情" />
    </a-drawer>
  </section>
</template>
