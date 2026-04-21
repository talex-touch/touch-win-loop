<script setup lang="ts">
import type {
  ApiResponse,
  FeishuBitableSyncItemEntityType,
  FeishuSyncedDataRecord,
  FeishuSyncedDataResult,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()
const router = useRouter()

const SCOPE_OPTIONS: Array<{ value: FeishuBitableSyncItemEntityType, label: string }> = [
  { value: 'contest', label: '竞赛' },
  { value: 'track', label: '赛道' },
  { value: 'track_timeline', label: '赛道时间线' },
  { value: 'resource', label: '资料' },
  { value: 'policy', label: '政策' },
  { value: 'persona', label: '人设' },
]

const resultColumns = [
  { title: '实体类型', dataIndex: 'scope', slotName: 'scope', width: 120 },
  { title: '同步信息', dataIndex: 'syncName', slotName: 'syncName', width: 200 },
  { title: '同步项', dataIndex: 'syncItemName', slotName: 'syncItemName', width: 220 },
  { title: '标题', dataIndex: 'title', slotName: 'title', width: 220 },
  { title: '摘要 / 正文片段', dataIndex: 'snippet', slotName: 'snippet', width: 320 },
  { title: 'externalId / entityId / recordId', dataIndex: 'identity', slotName: 'identity', width: 280 },
  { title: '最近 runId', dataIndex: 'runId', slotName: 'runId', width: 180 },
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', width: 170 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 110 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 180, fixed: 'right' as const },
]

type ApiRequestError = Error & {
  statusCode?: number
  data?: {
    message?: string
  }
}

const loading = ref(false)
const errorText = ref('')
function createEmptyResultPayload(): FeishuSyncedDataResult {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    metrics: {
      effectiveEntityTotal: 0,
      latestRunSourceRowTotal: 0,
      latestRunAutoFilteredTotal: 0,
      latestRunBusinessSkippedTotal: 0,
      rawCountBasis: 'latest_run_per_sync_item',
    },
    rawMetricAvailable: true,
    rawMetricNotice: '',
    syncOptions: [],
    syncItemOptions: [],
  }
}

const resultPayload = ref<FeishuSyncedDataResult>(createEmptyResultPayload())
const detailVisible = ref(false)
const detailRecord = ref<FeishuSyncedDataRecord | null>(null)
const filters = reactive({
  keyword: '',
  syncId: '',
  syncItemId: '',
  scope: '' as FeishuBitableSyncItemEntityType | '',
  externalId: '',
  recordId: '',
})

const hasActiveFilters = computed(() => Boolean(
  filters.keyword
  || filters.syncId
  || filters.syncItemId
  || filters.scope
  || filters.externalId
  || filters.recordId,
))

const showRawMetrics = computed(() => resultPayload.value.rawMetricAvailable)
const summaryMetricCards = computed(() => {
  const cards = [{
    key: 'effective',
    label: '当前有效实体数（当前仍可见）',
    value: resultPayload.value.metrics.effectiveEntityTotal,
    tone: 'text-slate-900',
    helper: '当前筛选条件下仍然可见的业务实体去重结果。',
  }]
  if (showRawMetrics.value) {
    cards.push(
      {
        key: 'source',
        label: '最近运行源行数（最近一次运行抓取）',
        value: resultPayload.value.metrics.latestRunSourceRowTotal,
        tone: 'text-blue-700',
        helper: '按各同步项最近一次运行聚合。',
      },
      {
        key: 'filtered',
        label: '规则过滤',
        value: resultPayload.value.metrics.latestRunAutoFilteredTotal,
        tone: 'text-amber-700',
        helper: '命中过滤规则、未进入业务处理的源行。',
      },
      {
        key: 'skipped',
        label: '业务跳过',
        value: resultPayload.value.metrics.latestRunBusinessSkippedTotal,
        tone: 'text-orange-700',
        helper: '进入业务处理但被校验跳过的记录。',
      },
    )
  }
  return cards
})

const currentFilterSummary = computed(() => {
  const parts = [
    filters.syncId ? `同步信息 ${filters.syncId}` : '',
    filters.syncItemId ? `同步项 ${filters.syncItemId}` : '',
    filters.scope ? `实体 ${scopeLabel(filters.scope)}` : '',
    filters.externalId ? `externalId ${filters.externalId}` : '',
    filters.recordId ? `recordId ${filters.recordId}` : '',
    filters.keyword ? `关键词 ${filters.keyword}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : '全部同步数据'
})

const emptyStateDescription = computed(() => {
  const prefix = hasActiveFilters.value
    ? '当前筛选没有已落库记录。'
    : '当前还没有已落库同步数据。'
  return `${prefix}这里仅展示已经进入平台落库的索引、external refs 或待审草稿；如果某次执行全部停在自动同步规则过滤阶段，规则过滤不会产生同步数据。`
})

function createApiRequestError(message: string, statusCode = 0): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.statusCode = statusCode
  error.data = { message }
  return error
}

async function requestApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    query?: Record<string, string | number | undefined>
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const queryString = options.query
    ? new URLSearchParams(
        Object.entries(options.query)
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([key, value]) => [key, String(value)]),
      ).toString()
    : ''
  const response = await fetch(queryString ? `${path}?${queryString}` : path, {
    method: options.method || 'GET',
    credentials: 'include',
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage), response.status)
  return payload.data
}

function readQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function normalizeScope(value: string): FeishuBitableSyncItemEntityType | '' {
  return SCOPE_OPTIONS.some(item => item.value === value as FeishuBitableSyncItemEntityType)
    ? value as FeishuBitableSyncItemEntityType
    : ''
}

function formatDateTime(value?: string | null): string {
  return String(value || '').trim() || '-'
}

function scopeLabel(scope?: FeishuBitableSyncItemEntityType | ''): string {
  return SCOPE_OPTIONS.find(item => item.value === scope)?.label || (scope || '-')
}

function statusLabel(status?: string): string {
  if (status === 'release_draft')
    return '草稿/待审数据'
  return status === 'ref_only' ? '仅映射' : '已建索引'
}

function statusColor(status?: string): string {
  if (status === 'release_draft')
    return 'arcoblue'
  return status === 'ref_only' ? 'gold' : 'green'
}

function buildSnippet(record: FeishuSyncedDataRecord): string {
  const summary = String(record.summary || '').trim()
  const body = String(record.body || '').trim()
  if (summary && body)
    return `${summary} / ${body.slice(0, 120)}`
  if (summary)
    return summary
  if (body)
    return body.slice(0, 160)
  return '-'
}

function formatJson(value: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(value || {}, null, 2)
}

function buildRowKey(record: FeishuSyncedDataRecord): string {
  return [
    record.status,
    record.scope,
    record.syncId,
    record.syncItemId,
    record.externalId || record.entityId,
    record.recordId,
    record.runId,
  ].join(':')
}

function syncFiltersFromRoute() {
  filters.keyword = readQueryValue(route.query.keyword)
  filters.syncId = readQueryValue(route.query.syncId)
  filters.syncItemId = readQueryValue(route.query.syncItemId)
  filters.scope = normalizeScope(readQueryValue(route.query.scope))
  filters.externalId = readQueryValue(route.query.externalId)
  filters.recordId = readQueryValue(route.query.recordId)
}

function currentPage(): number {
  return Math.max(1, Number(readQueryValue(route.query.page) || 1) || 1)
}

function buildRouteQuery(page = 1) {
  const query: Record<string, string> = {}
  if (filters.keyword)
    query.keyword = filters.keyword.trim()
  if (filters.syncId)
    query.syncId = filters.syncId.trim()
  if (filters.syncItemId)
    query.syncItemId = filters.syncItemId.trim()
  if (filters.scope)
    query.scope = filters.scope
  if (filters.externalId)
    query.externalId = filters.externalId.trim()
  if (filters.recordId)
    query.recordId = filters.recordId.trim()
  if (page > 1)
    query.page = String(page)
  if (readQueryValue(route.query.embed) === '1')
    query.embed = '1'
  return query
}

async function loadData() {
  loading.value = true
  errorText.value = ''
  try {
    resultPayload.value = await requestApi<FeishuSyncedDataResult>(
      endpoint('/admin/integrations/feishu/synced-data'),
      {
        query: {
          keyword: filters.keyword,
          syncId: filters.syncId,
          syncItemId: filters.syncItemId,
          scope: filters.scope,
          externalId: filters.externalId,
          recordId: filters.recordId,
          page: currentPage(),
          pageSize: 20,
        },
      },
      '飞书已同步数据加载失败。',
    )
  }
  catch (error: any) {
    resultPayload.value = {
      ...createEmptyResultPayload(),
      page: currentPage(),
      pageSize: 20,
    }
    errorText.value = String(error?.data?.message || '飞书已同步数据加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function applyFilters(page = 1) {
  await router.replace({
    path: '/admin/integrations/feishu/data',
    query: buildRouteQuery(page),
  })
}

async function resetFilters() {
  filters.keyword = ''
  filters.syncId = ''
  filters.syncItemId = ''
  filters.scope = ''
  filters.externalId = ''
  filters.recordId = ''
  await applyFilters(1)
}

function openDetail(record: FeishuSyncedDataRecord) {
  detailRecord.value = record
  detailVisible.value = true
}

function buildSyncConfigRoute(record: FeishuSyncedDataRecord) {
  const query: Record<string, string> = {}
  if (record.syncItemId)
    query.item = record.syncItemId
  if (readQueryValue(route.query.embed) === '1')
    query.embed = '1'
  return {
    path: `/admin/integrations/feishu/bitables/${record.syncId}`,
    query,
  }
}

function buildFilteredSyncConfigRoute() {
  const query: Record<string, string> = {}
  if (filters.syncItemId)
    query.item = filters.syncItemId
  if (readQueryValue(route.query.embed) === '1')
    query.embed = '1'
  return filters.syncId
    ? { path: `/admin/integrations/feishu/bitables/${filters.syncId}`, query }
    : { path: '/admin/integrations/feishu', query }
}

async function openSyncConfig(record: FeishuSyncedDataRecord) {
  if (!record.syncId)
    return
  await navigateTo(buildSyncConfigRoute(record))
}

async function openFilteredSyncConfig() {
  await navigateTo(buildFilteredSyncConfigRoute())
}

async function onPageChange(page: number) {
  await applyFilters(page)
}

watch(() => route.fullPath, () => {
  syncFiltersFromRoute()
  void loadData()
}, { immediate: true })
</script>

<template>
  <PageShell>
    <PageHeader title="飞书已同步数据" meta="只读查询台，集中查看飞书同步后的落库结果。">
      <template #actions>
        <a-button size="small" :loading="loading" @click="applyFilters(currentPage())">
          刷新
        </a-button>
      </template>
    </PageHeader>

    <SectionCard>
      <FilterBar class="gap-2 grid 2xl:grid-cols-7 md:grid-cols-2 xl:grid-cols-4">
        <a-input v-model="filters.keyword" size="small" allow-clear placeholder="关键词" />
        <a-select v-model="filters.syncId" size="small" allow-clear placeholder="同步信息" @change="() => { filters.syncItemId = '' }">
          <a-option v-for="item in resultPayload.syncOptions" :key="item.id" :value="item.id">
            {{ item.name }}
          </a-option>
        </a-select>
        <a-select v-model="filters.syncItemId" size="small" allow-clear placeholder="同步项">
          <a-option v-for="item in resultPayload.syncItemOptions" :key="item.id" :value="item.id">
            {{ item.syncName ? `${item.syncName} / ${item.name}` : item.name }}
          </a-option>
        </a-select>
        <a-select v-model="filters.scope" size="small" allow-clear placeholder="实体类型">
          <a-option v-for="item in SCOPE_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </a-option>
        </a-select>
        <a-input v-model="filters.externalId" size="small" allow-clear placeholder="externalId" />
        <a-input v-model="filters.recordId" size="small" allow-clear placeholder="recordId" />
        <div class="flex gap-2">
          <a-button size="small" type="primary" @click="applyFilters(1)">
            查询
          </a-button>
          <a-button size="small" @click="resetFilters">
            重置
          </a-button>
        </div>
      </FilterBar>
      <p class="text-[11px] text-slate-500 mb-0 mt-2">
        这页展示的是飞书同步后已经进入平台落库的当前结果，不是飞书原始导入行仓库；状态“仅映射”表示 external refs 已落库但索引文档尚未生成。
      </p>
      <p class="text-[11px] text-slate-500 mb-0 mt-1">
        同一业务实体的历史更新会在这里折叠为当前结果；`track / resource` 等会先合并进草稿快照再展开，规则过滤和业务跳过不会进入下方列表。
      </p>
      <p class="text-[11px] text-slate-500 mb-0 mt-1">
        “当前有效实体数（当前仍可见）”代表业务实体视角的去重结果，不等于最近一次抓取的源行数；已发布版本会保留，但不会再和当前草稿/索引重复计数。
      </p>
      <p class="text-[11px] text-slate-500 mb-0 mt-1">
        当前筛选：{{ currentFilterSummary }} / 当前有效实体数：{{ resultPayload.metrics.effectiveEntityTotal }}
      </p>
      <div class="mt-3 gap-3 grid md:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="card in summaryMetricCards"
          :key="card.key"
          class="px-3 py-3 border border-slate-200 rounded bg-slate-50"
        >
          <p class="text-[11px] text-slate-500 m-0">
            {{ card.label }}
          </p>
          <p class="text-[18px] font-semibold m-0 mt-1" :class="card.tone">
            {{ card.value }}
          </p>
          <p class="text-[10px] text-slate-500 m-0 mt-1">
            {{ card.helper }}
          </p>
        </div>
      </div>
      <p v-if="resultPayload.rawMetricNotice" class="text-[11px] mb-0 mt-3" :class="showRawMetrics ? 'text-slate-500' : 'text-amber-700'">
        {{ resultPayload.rawMetricNotice }}
      </p>
    </SectionCard>

    <SectionCard v-if="loading">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </SectionCard>

    <SectionCard v-else>
      <div
        v-if="!errorText && resultPayload.items.length === 0"
        class="text-[12px] text-amber-900 mb-4 p-4 border border-amber-200 rounded bg-amber-50 space-y-3"
      >
        <div class="flex flex-wrap gap-3 items-start justify-between">
          <div>
            <p class="font-semibold m-0">
              暂无可见同步数据
            </p>
            <p class="m-0 mt-1">
              {{ emptyStateDescription }}
            </p>
            <p class="m-0 mt-1">
              建议先回到同步配置查看执行日志，或在子表同步项 Drawer 里用“单行模拟”核对某一行的记录状态、同步信息与字段映射。
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <a-button size="small" type="primary" @click="openFilteredSyncConfig">
              返回同步配置
            </a-button>
            <a-button size="small" @click="applyFilters(currentPage())">
              刷新
            </a-button>
          </div>
        </div>
      </div>
      <a-table
        :columns="resultColumns"
        :data="resultPayload.items"
        :row-key="buildRowKey"
        size="small"
        :bordered="{ cell: true }"
        :pagination="{
          current: resultPayload.page,
          total: resultPayload.total,
          pageSize: resultPayload.pageSize,
          showTotal: true,
          size: 'mini',
        }"
        @page-change="onPageChange"
      >
        <template #scope="{ record }">
          <a-tag size="small" color="arcoblue">
            {{ scopeLabel(record.scope) }}
          </a-tag>
        </template>

        <template #syncName="{ record }">
          <div class="min-w-0">
            <p class="text-[11px] text-slate-900 font-semibold m-0 truncate">
              {{ record.syncName || '-' }}
            </p>
            <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 break-all">
              {{ record.syncId || '-' }}
            </p>
          </div>
        </template>

        <template #syncItemName="{ record }">
          <div class="min-w-0">
            <p class="text-[11px] text-slate-700 m-0 truncate">
              {{ record.syncItemName || '-' }}
            </p>
            <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 break-all">
              {{ record.syncItemId || '-' }}
            </p>
          </div>
        </template>

        <template #title="{ record }">
          <div class="min-w-0">
            <p class="text-[11px] text-slate-900 font-semibold m-0 break-words">
              {{ record.title || '-' }}
            </p>
          </div>
        </template>

        <template #snippet="{ record }">
          <p class="text-[11px] text-slate-600 m-0 break-words">
            {{ buildSnippet(record) }}
          </p>
        </template>

        <template #identity="{ record }">
          <div class="space-y-1">
            <p class="text-[10px] text-slate-600 font-mono m-0 break-all">
              externalId: {{ record.externalId || '-' }}
            </p>
            <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
              entityId: {{ record.entityId || '-' }}
            </p>
            <p class="text-[10px] text-slate-400 font-mono m-0 break-all">
              recordId: {{ record.recordId || '-' }}
            </p>
          </div>
        </template>

        <template #runId="{ record }">
          <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
            {{ record.runId || '-' }}
          </p>
        </template>

        <template #updatedAt="{ record }">
          <p class="text-[11px] text-slate-700 m-0">
            {{ formatDateTime(record.updatedAt) }}
          </p>
        </template>

        <template #status="{ record }">
          <a-tag size="small" :color="statusColor(record.status)">
            {{ statusLabel(record.status) }}
          </a-tag>
        </template>

        <template #actions="{ record }">
          <div class="flex flex-wrap gap-1">
            <a-button size="mini" type="outline" @click="openDetail(record)">
              查看详情
            </a-button>
            <a-button size="mini" type="primary" :disabled="!record.syncId" @click="openSyncConfig(record)">
              打开同步配置
            </a-button>
          </div>
        </template>
      </a-table>
    </SectionCard>

    <StateBlock v-if="errorText" tone="error" :description="errorText" />

    <a-drawer v-model:visible="detailVisible" width="760px" title="同步数据详情" unmount-on-close>
      <template v-if="detailRecord">
        <div class="text-[11px] space-y-3">
          <div class="gap-2 grid md:grid-cols-2">
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                scope
              </p>
              <p class="text-slate-700 m-0 mt-1">
                {{ scopeLabel(detailRecord.scope) }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                status
              </p>
              <p class="text-slate-700 m-0 mt-1">
                {{ statusLabel(detailRecord.status) }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                syncId / syncName
              </p>
              <p class="text-slate-700 m-0 mt-1 break-all">
                {{ detailRecord.syncId || '-' }} / {{ detailRecord.syncName || '-' }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                syncItemId / syncItemName
              </p>
              <p class="text-slate-700 m-0 mt-1 break-all">
                {{ detailRecord.syncItemId || '-' }} / {{ detailRecord.syncItemName || '-' }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                externalId / entityId
              </p>
              <p class="text-slate-700 m-0 mt-1 break-all">
                {{ detailRecord.externalId || '-' }} / {{ detailRecord.entityId || '-' }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                recordId / runId
              </p>
              <p class="text-slate-700 m-0 mt-1 break-all">
                {{ detailRecord.recordId || '-' }} / {{ detailRecord.runId || '-' }}
              </p>
            </div>
          </div>

          <div class="p-3 border border-slate-200 bg-white space-y-2">
            <div>
              <p class="text-slate-400 m-0 uppercase">
                title
              </p>
              <p class="text-slate-800 m-0 mt-1 break-words">
                {{ detailRecord.title || '-' }}
              </p>
            </div>
            <div>
              <p class="text-slate-400 m-0 uppercase">
                summary
              </p>
              <p class="text-slate-700 m-0 mt-1 whitespace-pre-wrap break-words">
                {{ detailRecord.summary || '-' }}
              </p>
            </div>
            <div>
              <p class="text-slate-400 m-0 uppercase">
                body
              </p>
              <p class="text-slate-700 m-0 mt-1 whitespace-pre-wrap break-words">
                {{ detailRecord.body || '-' }}
              </p>
            </div>
            <div>
              <p class="text-slate-400 m-0 uppercase">
                keywords
              </p>
              <p class="text-slate-700 m-0 mt-1 break-words">
                {{ detailRecord.keywords.length ? detailRecord.keywords.join(' / ') : '-' }}
              </p>
            </div>
          </div>

          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-slate-400 m-0 uppercase">
              metadata
            </p>
            <pre class="text-[11px] text-slate-700 mb-0 mt-2 p-3 rounded bg-slate-50 overflow-x-auto">{{ formatJson(detailRecord.metadata) }}</pre>
          </div>
        </div>
      </template>
    </a-drawer>
  </PageShell>
</template>
