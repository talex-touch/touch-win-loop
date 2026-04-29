<script setup lang="ts">
import type {
  ApiResponse,
  ContestAuditAggregates,
  ContestWorkflowTimelineItem,
  ContestWorkflowTimelineResult,
  ReleaseQueueInsightsWindowDays,
  ReleaseQueueRecentReviewItem,
  ReleaseQueueReviewerRankingMode,
  ReleaseQueueReviewerStats,
} from '~~/shared/types/domain'
import {
  syncPreservationSummarySections as buildSyncPreservationSummarySections,
  syncPreservationSummaryItemText,
} from '~/utils/release-sync-summary'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

type AuditReloadScope = 'initial' | 'manual' | 'timeline' | 'insights'

const initialLoading = ref(false)
const timelinePending = ref(false)
const insightsPending = ref(false)
const refreshPending = ref(false)
const hasLoaded = ref(false)
const errorText = ref('')
const logs = ref<ContestWorkflowTimelineItem[]>([])
const actionFilter = ref('')
const appliedActionFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const windowDays = ref<ReleaseQueueInsightsWindowDays>(0)
const rankingMode = ref<ReleaseQueueReviewerRankingMode>('total_actions')
const aggregates = ref<ContestAuditAggregates>(createEmptyAggregates())
let activeRequestId = 0

const windowOptions: Array<{ value: ReleaseQueueInsightsWindowDays, label: string }> = [
  { value: 0, label: '累计' },
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
]

const rankingOptions: Array<{ value: ReleaseQueueReviewerRankingMode, label: string }> = [
  { value: 'total_actions', label: '按总审核' },
  { value: 'second_review_approved', label: '按二审通过' },
  { value: 'published', label: '按发布次数' },
]

const currentUserStats = computed(() => aggregates.value.currentUser)
const reviewerRanking = computed(() => aggregates.value.reviewers || [])
const recentReviews = computed(() => aggregates.value.recentReviews || [])
const windowLabel = computed(() => windowOptions.find(item => item.value === windowDays.value)?.label || '累计')
const isReloading = computed(() => initialLoading.value || timelinePending.value || insightsPending.value)
const isActionFilterDirty = computed(() => actionFilter.value.trim() !== appliedActionFilter.value)

function createEmptyAggregates(): ContestAuditAggregates {
  return {
    windowDays: 0,
    rankingMode: 'total_actions',
    currentUser: null,
    reviewers: [],
    recentReviews: [],
  }
}

function startReload(scope: AuditReloadScope): number {
  const shouldShowInitial = scope === 'initial' || !hasLoaded.value
  if (shouldShowInitial)
    initialLoading.value = true
  if (shouldShowInitial || scope === 'manual' || scope === 'timeline')
    timelinePending.value = true
  if (shouldShowInitial || scope === 'manual' || scope === 'insights')
    insightsPending.value = true
  if (scope === 'manual')
    refreshPending.value = true
  activeRequestId += 1
  return activeRequestId
}

function finishReload(requestId: number) {
  if (requestId !== activeRequestId)
    return
  initialLoading.value = false
  timelinePending.value = false
  insightsPending.value = false
  refreshPending.value = false
}

async function loadLogs(scope: AuditReloadScope = 'manual') {
  const requestId = startReload(scope)
  errorText.value = ''
  try {
    const response = await unsafeFetch<ApiResponse<ContestWorkflowTimelineResult>>(endpoint(`/admin/contests/${contestId.value}/audit`), {
      query: {
        action: appliedActionFilter.value,
        page: page.value,
        pageSize: pageSize.value,
        rankingMode: rankingMode.value,
        windowDays: windowDays.value,
      },
    })
    if (requestId !== activeRequestId)
      return
    logs.value = response.data.items || []
    total.value = Number(response.data.total || 0)
    aggregates.value = response.data.aggregates || createEmptyAggregates()
    rankingMode.value = aggregates.value.rankingMode
    windowDays.value = aggregates.value.windowDays
    hasLoaded.value = true
  }
  catch (error: any) {
    if (requestId !== activeRequestId)
      return
    if (!hasLoaded.value) {
      logs.value = []
      total.value = 0
      aggregates.value = createEmptyAggregates()
    }
    errorText.value = String(error?.data?.message || '流程时间线加载失败。')
  }
  finally {
    finishReload(requestId)
  }
}

function refreshAudit() {
  void loadLogs('manual')
}

function applyActionFilter() {
  const nextActionFilter = actionFilter.value.trim()
  actionFilter.value = nextActionFilter
  if (appliedActionFilter.value === nextActionFilter) {
    if (page.value !== 1) {
      page.value = 1
      return
    }
    void loadLogs('timeline')
    return
  }
  appliedActionFilter.value = nextActionFilter
  if (page.value !== 1)
    page.value = 1
}

function formatTime(value?: string): string {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

function reviewActionLabel(action: ReleaseQueueRecentReviewItem['action']): string {
  if (action === 'sync_generated')
    return '飞书同步生成草稿'
  if (action === 'manual_generated')
    return '人工生成草稿'
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
  return '终审/发布'
}

function reviewActionColor(action: ReleaseQueueRecentReviewItem['action']): string {
  if (action === 'first_review_approved')
    return 'gold'
  if (action === 'second_review_claimed')
    return 'arcoblue'
  if (action === 'second_review_approved')
    return 'green'
  if (action === 'rejected')
    return 'red'
  if (action === 'published')
    return 'purple'
  return 'gray'
}

function reviewerMetricText(item: ReleaseQueueReviewerStats): string {
  return `总 ${item.totalActions} / 二审 ${item.secondReviewApprovedCount} / 终审 ${item.publishedCount}`
}

function sourceLabel(source: ContestWorkflowTimelineItem['source']): string {
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

function sourceColor(source: ContestWorkflowTimelineItem['source']): string {
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

function syncPreservationSummarySections(item: ContestWorkflowTimelineItem) {
  return buildSyncPreservationSummarySections(item.payload)
}

function syncPreservationSummarySectionTitle(section: { key: string, title: string }) {
  if (section.key === 'feishu')
    return 'Feishu 原值'
  if (section.key === 'fallbacks')
    return '本地沿用/兜底'
  return section.title
}

watch([page, pageSize, appliedActionFilter], () => {
  void loadLogs('timeline')
})

watch([rankingMode, windowDays], () => {
  void loadLogs('insights')
})

onMounted(() => loadLogs('initial'))
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            流程时间线
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            合并展示飞书同步、人工编辑、审核与发布事件，帮助追踪每次版本演进。
          </p>
        </div>
        <button class="dense-btn" :disabled="isReloading" @click="refreshAudit">
          {{ refreshPending ? '刷新中' : '刷新' }}
        </button>
      </div>
    </section>

    <div class="gap-4 grid lg:grid-cols-3">
      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="flex items-center justify-between">
          <h2 class="text-sm text-slate-900 font-semibold">
            我的审核统计
          </h2>
          <div class="flex gap-2 items-center">
            <span v-if="insightsPending && !initialLoading" class="text-[11px] text-slate-400">更新中</span>
            <span class="text-[11px] text-slate-500">{{ windowLabel }}</span>
          </div>
        </div>
        <div v-if="currentUserStats" class="text-xs mt-3 gap-3 grid grid-cols-3">
          <div>
            <p class="text-slate-400">
              初审通过
            </p>
            <p class="text-base text-slate-900 font-semibold mt-1">
              {{ currentUserStats.firstReviewApprovedCount }}
            </p>
          </div>
          <div>
            <p class="text-slate-400">
              二审通过
            </p>
            <p class="text-base text-slate-900 font-semibold mt-1">
              {{ currentUserStats.secondReviewApprovedCount }}
            </p>
          </div>
          <div>
            <p class="text-slate-400">
              终审/发布
            </p>
            <p class="text-base text-slate-900 font-semibold mt-1">
              {{ currentUserStats.publishedCount }}
            </p>
          </div>
          <div>
            <p class="text-slate-400">
              领取二审
            </p>
            <p class="text-base text-slate-900 font-semibold mt-1">
              {{ currentUserStats.secondReviewClaimedCount }}
            </p>
          </div>
          <div>
            <p class="text-slate-400">
              驳回
            </p>
            <p class="text-base text-slate-900 font-semibold mt-1">
              {{ currentUserStats.rejectedCount }}
            </p>
          </div>
          <div>
            <p class="text-slate-400">
              累计动作
            </p>
            <p class="text-base text-slate-900 font-semibold mt-1">
              {{ currentUserStats.totalActions }}
            </p>
          </div>
        </div>
        <p v-if="currentUserStats?.lastActionAt" class="text-[11px] text-slate-500 mt-3">
          最近参与：{{ formatTime(currentUserStats.lastActionAt) }}
        </p>
        <a-empty v-if="!currentUserStats && !initialLoading && !insightsPending" description="暂无个人审核记录" class="py-4" />
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="flex gap-2 items-center justify-between">
          <h2 class="text-sm text-slate-900 font-semibold">
            管理员审核排名
          </h2>
          <a-select v-model="rankingMode" size="mini" class="w-[112px]" :disabled="initialLoading || insightsPending">
            <a-option v-for="option in rankingOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-option>
          </a-select>
        </div>
        <div v-if="reviewerRanking.length" class="mt-3 space-y-2">
          <div v-for="(reviewer, index) in reviewerRanking" :key="reviewer.userId" class="flex gap-2 items-center">
            <div class="text-[11px] text-slate-400 font-medium w-5">
              {{ index + 1 }}
            </div>
            <a-avatar :size="24" :image-url="reviewer.avatarUrl || undefined">
              {{ reviewer.actorName.slice(0, 1) }}
            </a-avatar>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-slate-900 font-medium truncate">
                {{ reviewer.actorName }}
              </p>
              <p class="text-[11px] text-slate-500">
                {{ reviewerMetricText(reviewer) }}
              </p>
            </div>
          </div>
        </div>
        <a-empty v-else-if="!initialLoading && !insightsPending" description="暂无审核排名" class="py-4" />
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="flex gap-2 items-center justify-between">
          <h2 class="text-sm text-slate-900 font-semibold">
            近期审核流
          </h2>
          <a-select v-model="windowDays" size="mini" class="w-[96px]" :disabled="initialLoading || insightsPending">
            <a-option v-for="option in windowOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-option>
          </a-select>
        </div>
        <div v-if="recentReviews.length" class="mt-3 space-y-3">
          <div v-for="item in recentReviews" :key="item.id" class="space-y-1">
            <div class="flex gap-2 items-center">
              <a-avatar :size="22" :image-url="item.avatarUrl || undefined">
                {{ item.actorName.slice(0, 1) }}
              </a-avatar>
              <p class="text-xs text-slate-900 font-medium flex-1 min-w-0 truncate">
                {{ item.actorName }}
              </p>
              <a-tag size="small" :color="reviewActionColor(item.action)">
                {{ reviewActionLabel(item.action) }}
              </a-tag>
            </div>
            <p class="text-[11px] text-slate-600 truncate">
              {{ item.scopeTitle || item.scopeId }} · V{{ item.versionNumber }}
            </p>
            <p class="text-[11px] text-slate-500">
              {{ formatTime(item.createdAt) }}
            </p>
          </div>
        </div>
        <a-empty v-else-if="!initialLoading && !insightsPending" description="暂无近期审核" class="py-4" />
      </section>
    </div>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="gap-2 grid md:grid-cols-[1fr_auto]">
        <a-input
          v-model="actionFilter"
          size="small"
          allow-clear
          placeholder="按动作/来源模糊筛选，如 sync_generated / published / contest.patch"
          @press-enter="applyActionFilter"
        />
        <button class="dense-btn" :disabled="initialLoading || timelinePending" @click="applyActionFilter">
          {{ timelinePending ? '应用中' : (isActionFilterDirty ? '应用筛选' : '刷新筛选') }}
        </button>
      </div>
    </section>

    <section v-if="initialLoading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="text-[11px] text-slate-500 mb-3 flex items-center justify-between">
        <span>共 {{ total }} 条</span>
        <span v-if="timelinePending">更新时间线中</span>
      </div>
      <div v-if="logs.length === 0" class="text-sm text-slate-500">
        {{ timelinePending ? '正在更新筛选结果...' : '当前筛选下暂无流程事件。' }}
      </div>
      <div v-else class="space-y-2">
        <article
          v-for="item in logs"
          :key="item.id"
          class="p-3 border border-slate-200 rounded"
        >
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <div class="flex flex-wrap gap-2 items-center">
              <a-tag size="small" :color="sourceColor(item.source)">
                {{ sourceLabel(item.source) }}
              </a-tag>
              <p class="text-xs text-slate-900 font-semibold">
                {{ item.title }}
              </p>
            </div>
            <p class="text-xs text-slate-500">
              {{ formatTime(item.createdAt) }}
            </p>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            action={{ item.action }} · actor={{ item.actorUserId || '-' }} · version={{ item.versionNumber ? `V${item.versionNumber}` : '-' }}
          </p>
          <p v-if="item.description" class="text-xs text-slate-600 mt-1">
            {{ item.description }}
          </p>
          <p class="text-xs text-slate-500 mt-1">
            syncItemId={{ item.syncItemId || '-' }} · syncRunId={{ item.syncRunId || '-' }} · recordId={{ item.recordId || '-' }}
          </p>
          <div v-if="syncPreservationSummarySections(item).length" class="text-[11px] mt-2 p-2 border border-slate-200 rounded bg-slate-50 space-y-2">
            <p class="text-slate-900 font-medium">
              同步保留摘要
            </p>
            <div v-for="section in syncPreservationSummarySections(item)" :key="section.key" class="space-y-1">
              <p class="text-slate-500">
                {{ syncPreservationSummarySectionTitle(section) }}
              </p>
              <ul class="text-slate-700 pl-4 list-disc space-y-1">
                <li v-for="(summaryItem, index) in section.items" :key="`${section.key}-${index}`">
                  {{ syncPreservationSummaryItemText(summaryItem) }}
                </li>
              </ul>
            </div>
          </div>
          <pre class="text-[11px] text-slate-700 mt-2 p-2 rounded bg-slate-50 overflow-x-auto">{{ JSON.stringify(item.payload || {}, null, 2) }}</pre>
        </article>
      </div>

      <div class="mt-3 flex justify-end">
        <a-pagination
          :current="page"
          :page-size="pageSize"
          :page-size-options="[10, 20, 50]"
          :show-total="true"
          :total="total"
          size="small"
          @change="(value: number) => page = value"
          @page-size-change="(value: number) => { pageSize = value; page = 1 }"
        />
      </div>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
  </div>
</template>
