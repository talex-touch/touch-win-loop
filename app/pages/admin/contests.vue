<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  Contest,
  ContestStatus,
  ContestSyncRun,
  ContestSyncSource,
  PlatformPermission,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface ImportPreviewRow {
  rowNumber: number
  action: 'create' | 'update' | 'invalid'
  inferredYear: number | null
  inferredYearSource?: string
  targetContestId?: string
  suggestedExecute: boolean
  suggestedOverwriteMode: ImportOverwriteMode
  errors: string[]
  warnings: string[]
  structuredWarnings: string[]
}

type ImportOverwriteMode = 'preserve_existing' | 'force_replace'

interface ImportExecutionRowDecision {
  rowNumber: number
  execute?: boolean
  overwriteMode?: ImportOverwriteMode
}

interface ImportExecutionPlan {
  defaultExecute?: boolean
  defaultOverwriteMode?: ImportOverwriteMode
  rowDecisions?: ImportExecutionRowDecision[]
}

interface ImportPreviewResult {
  total: number
  validCount: number
  invalidCount: number
  defaultExecutionPlan: ImportExecutionPlan
  rows: ImportPreviewRow[]
}

interface ImportCommitRowResult {
  rowNumber: number
  action: 'create' | 'update' | 'invalid'
  decision: 'executed' | 'skipped' | 'invalid' | 'error'
  overwriteMode: ImportOverwriteMode
  result: 'created' | 'updated' | 'skipped' | 'invalid' | 'error'
  contestId?: string
  message?: string
}

interface ImportCommitResult {
  createdCount: number
  updatedCount: number
  skippedCount: number
  rowResults: ImportCommitRowResult[]
}

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

function splitOrganizerText(value?: string): string[] {
  if (!value)
    return []
  return value
    .split(/[\n,，、;；/|]+/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function extractOrganizerTags(contest: Contest): string[] {
  const merged = [...splitOrganizerText(contest.organizer), ...splitOrganizerText(contest.coOrganizer)]
  return Array.from(new Set(merged))
}

function statusColor(status?: ContestStatus): 'gray' | 'blue' | 'green' {
  if (status === 'published')
    return 'green'
  if (status === 'archived')
    return 'gray'
  return 'blue'
}

const loading = ref(false)
const permissionLoaded = ref(false)
const permissionErrorText = ref('')
const actionLoadingId = ref('')
const errorText = ref('')
const successText = ref('')

const isPlatformAdmin = ref(false)
const permissions = ref<PlatformPermission[]>([])
const contests = ref<Contest[]>([])

const statusFilter = ref<ContestStatus | ''>('')
const search = ref('')
const organizerFilter = ref<string[]>([])

const page = ref(1)
const pageSize = ref(10)

const importCsvText = ref('')
const importPreview = ref<ImportPreviewResult | null>(null)
const importCommitRows = ref<ImportCommitRowResult[]>([])
const importLoading = ref(false)
const importDefaultExecute = ref(true)
const importDefaultOverwriteMode = ref<ImportOverwriteMode>('preserve_existing')
const importRowDecisions = ref<Record<number, { execute: boolean, overwriteMode: ImportOverwriteMode }>>({})
const importFileInputRef = ref<HTMLInputElement | null>(null)
const syncSourceName = ref('')
const syncSourceUrl = ref('')
const syncSources = ref<ContestSyncSource[]>([])
const syncRuns = ref<ContestSyncRun[]>([])
const syncLoading = ref(false)

const isListRoute = computed(() => {
  const normalized = route.path.replace(/\/+$/, '') || '/'
  return normalized === '/admin/contests'
})

const canRead = computed(() => isPlatformAdmin.value || permissions.value.includes('contest.read_internal'))
const canWrite = computed(() => isPlatformAdmin.value || permissions.value.includes('contest.write'))
const canPublish = computed(() => isPlatformAdmin.value || permissions.value.includes('contest.publish'))
const canArchive = computed(() => isPlatformAdmin.value || permissions.value.includes('contest.archive'))

const organizerOptions = computed(() => {
  const set = new Set<string>()
  for (const item of contests.value) {
    for (const organizer of extractOrganizerTags(item))
      set.add(organizer)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const filteredContests = computed(() => {
  if (organizerFilter.value.length === 0)
    return contests.value
  return contests.value.filter((item) => {
    const tags = extractOrganizerTags(item)
    return organizerFilter.value.every(filterTag => tags.includes(filterTag))
  })
})

const pagedContests = computed(() => {
  const start = (page.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredContests.value.slice(start, end)
})

const contestColumns = [
  { title: '赛事', dataIndex: 'name', slotName: 'name', ellipsis: true, tooltip: true },
  { title: '主办单位', dataIndex: 'organizers', slotName: 'organizers', width: 280 },
  { title: '级别', dataIndex: 'level', width: 110 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 120 },
  { title: '可见性', dataIndex: 'visibility', width: 120 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 320, fixed: 'right' as const },
]

watch([filteredContests, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(filteredContests.value.length / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

watch(importCsvText, () => {
  importPreview.value = null
  importCommitRows.value = []
  importRowDecisions.value = {}
})

async function loadPermissions() {
  permissionErrorText.value = ''
  const response = await $fetch<ApiResponse<AuthMeResult>>(endpoint('/auth/me'))
  permissions.value = response.data.user.platformPermissions || []
  isPlatformAdmin.value = Boolean(response.data.user.isPlatformAdmin)
}

async function loadContests() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Contest[]>>(endpoint('/admin/contests'), {
      query: {
        status: statusFilter.value,
        q: search.value.trim(),
      },
    })
    contests.value = response.data
    page.value = 1
  }
  catch (error: any) {
    contests.value = []
    errorText.value = String(error?.data?.message || '赛事列表加载失败。')
  }
  finally {
    loading.value = false
  }
}

function resetFilters() {
  statusFilter.value = ''
  search.value = ''
  organizerFilter.value = []
  void loadContests()
}

async function publishContest(contestId: string) {
  if (!canPublish.value)
    return
  actionLoadingId.value = contestId
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId}/publish`), {
      method: 'POST',
    })
    successText.value = '赛事发布成功。'
    await loadContests()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '发布失败。')
  }
  finally {
    actionLoadingId.value = ''
  }
}

async function archiveContest(contestId: string) {
  if (!canArchive.value)
    return
  actionLoadingId.value = contestId
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId}/archive`), {
      method: 'POST',
    })
    successText.value = '赛事已下架。'
    await loadContests()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '下架失败。')
  }
  finally {
    actionLoadingId.value = ''
  }
}

async function goToContestWorkspace(contestId?: string) {
  if (!contestId) {
    errorText.value = '赛事 ID 缺失，无法进入工作区。'
    return
  }
  await navigateTo(`/admin/contests/${contestId}`)
}

async function goToContestOverviewEditor(contestId?: string) {
  if (!contestId) {
    errorText.value = '赛事 ID 缺失，无法进入编辑。'
    return
  }
  await navigateTo(`/admin/contests/${contestId}/overview/edit`)
}

async function goToContestAiPrompts(contestId?: string) {
  if (!contestId) {
    errorText.value = '赛事 ID 缺失，无法进入 AI 提示词。'
    return
  }
  await navigateTo(`/admin/contests/${contestId}/ai-prompts`)
}

function normalizeImportOverwriteMode(value: unknown): ImportOverwriteMode {
  return value === 'force_replace' ? 'force_replace' : 'preserve_existing'
}

function setImportRowDecision(
  rowNumber: number,
  patch: Partial<{ execute: boolean, overwriteMode: ImportOverwriteMode }>,
) {
  const current = importRowDecisions.value[rowNumber] || {
    execute: importDefaultExecute.value,
    overwriteMode: importDefaultOverwriteMode.value,
  }
  importRowDecisions.value = {
    ...importRowDecisions.value,
    [rowNumber]: {
      execute: patch.execute === undefined ? current.execute : patch.execute,
      overwriteMode: patch.overwriteMode || current.overwriteMode,
    },
  }
}

function getImportRowDecision(row: ImportPreviewRow): { execute: boolean, overwriteMode: ImportOverwriteMode } {
  const existing = importRowDecisions.value[row.rowNumber]
  if (existing)
    return existing
  return {
    execute: row.suggestedExecute,
    overwriteMode: normalizeImportOverwriteMode(row.suggestedOverwriteMode),
  }
}

function restoreImportExecutionPlan(preview: ImportPreviewResult) {
  importDefaultExecute.value = preview.defaultExecutionPlan?.defaultExecute !== false
  importDefaultOverwriteMode.value = normalizeImportOverwriteMode(preview.defaultExecutionPlan?.defaultOverwriteMode)

  const initial: Record<number, { execute: boolean, overwriteMode: ImportOverwriteMode }> = {}
  for (const row of preview.rows) {
    initial[row.rowNumber] = {
      execute: row.suggestedExecute,
      overwriteMode: normalizeImportOverwriteMode(row.suggestedOverwriteMode),
    }
  }

  for (const decision of preview.defaultExecutionPlan?.rowDecisions || []) {
    const rowNumber = Number(decision.rowNumber || 0)
    if (!Number.isFinite(rowNumber) || rowNumber <= 0 || !initial[rowNumber])
      continue
    initial[rowNumber] = {
      execute: decision.execute === undefined ? initial[rowNumber]!.execute : decision.execute !== false,
      overwriteMode: decision.overwriteMode === undefined
        ? initial[rowNumber]!.overwriteMode
        : normalizeImportOverwriteMode(decision.overwriteMode),
    }
  }

  importRowDecisions.value = initial
}

function resetImportExecutionPlan() {
  if (!importPreview.value)
    return
  restoreImportExecutionPlan(importPreview.value)
}

function applyImportBatchOnlyCreate() {
  if (!importPreview.value)
    return
  for (const row of importPreview.value.rows) {
    setImportRowDecision(row.rowNumber, {
      execute: row.action === 'create' && row.errors.length === 0,
    })
  }
}

function applyImportBatchOnlyUpdate() {
  if (!importPreview.value)
    return
  for (const row of importPreview.value.rows) {
    setImportRowDecision(row.rowNumber, {
      execute: row.action === 'update' && row.errors.length === 0,
    })
  }
}

function applyImportBatchSkipInvalid() {
  if (!importPreview.value)
    return
  for (const row of importPreview.value.rows) {
    if (row.errors.length > 0) {
      setImportRowDecision(row.rowNumber, {
        execute: false,
      })
    }
  }
}

function applyImportBatchForceUpdateOverwrite() {
  if (!importPreview.value)
    return
  for (const row of importPreview.value.rows) {
    if (row.action === 'update') {
      setImportRowDecision(row.rowNumber, {
        overwriteMode: 'force_replace',
      })
    }
  }
}

function buildImportExecutionPlan(): ImportExecutionPlan {
  const rowDecisions = Object.entries(importRowDecisions.value)
    .map(([rowNumber, decision]) => ({
      rowNumber: Number(rowNumber),
      execute: decision.execute,
      overwriteMode: decision.overwriteMode,
    }))
    .filter(item => Number.isFinite(item.rowNumber) && item.rowNumber > 0)

  return {
    defaultExecute: importDefaultExecute.value,
    defaultOverwriteMode: importDefaultOverwriteMode.value,
    rowDecisions,
  }
}

function openImportFilePicker() {
  importFileInputRef.value?.click()
}

async function onImportFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file)
    return

  try {
    importCsvText.value = await file.text()
    importPreview.value = null
    importCommitRows.value = []
    successText.value = `已加载文件：${file.name}`
    errorText.value = ''
  }
  catch {
    errorText.value = 'CSV 文件读取失败。'
  }
  finally {
    if (target)
      target.value = ''
  }
}

async function previewImport() {
  if (!canWrite.value)
    return
  importLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const response = await $fetch<ApiResponse<ImportPreviewResult>>(endpoint('/admin/contests/import/preview'), {
      method: 'POST',
      body: {
        csvText: importCsvText.value,
      },
    })
    importPreview.value = response.data
    importCommitRows.value = []
    restoreImportExecutionPlan(response.data)
    successText.value = `预检完成：共 ${response.data.total} 行，可导入 ${response.data.validCount} 行。`
  }
  catch (error: any) {
    importPreview.value = null
    importCommitRows.value = []
    errorText.value = String(error?.data?.message || '导入预检失败。')
  }
  finally {
    importLoading.value = false
  }
}

async function commitImport() {
  if (!canWrite.value)
    return
  importLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const response = await $fetch<ApiResponse<{ commit: ImportCommitResult }>>(endpoint('/admin/contests/import/commit'), {
      method: 'POST',
      body: {
        csvText: importCsvText.value,
        executionPlan: buildImportExecutionPlan(),
      },
    })
    importCommitRows.value = response.data.commit.rowResults || []
    successText.value = `导入完成：新增 ${response.data.commit.createdCount} 条，更新 ${response.data.commit.updatedCount} 条，跳过 ${response.data.commit.skippedCount} 条。`
    await loadContests()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '导入提交失败。')
  }
  finally {
    importLoading.value = false
  }
}

async function loadSyncData() {
  if (!canWrite.value) {
    syncSources.value = []
    syncRuns.value = []
    return
  }

  syncLoading.value = true
  try {
    const [sourcesResponse, runsResponse] = await Promise.all([
      $fetch<ApiResponse<ContestSyncSource[]>>(endpoint('/admin/contests/sync/sources')),
      $fetch<ApiResponse<ContestSyncRun[]>>(endpoint('/admin/contests/sync/runs'), {
        query: {
          limit: 30,
        },
      }),
    ])
    syncSources.value = sourcesResponse.data
    syncRuns.value = runsResponse.data
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '同步配置加载失败。')
    syncSources.value = []
    syncRuns.value = []
  }
  finally {
    syncLoading.value = false
  }
}

async function createSyncSource() {
  if (!canWrite.value)
    return

  syncLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint('/admin/contests/sync/sources'), {
      method: 'POST',
      body: {
        name: syncSourceName.value,
        sourceUrl: syncSourceUrl.value,
      },
    })
    successText.value = '同步源创建成功。'
    syncSourceName.value = ''
    syncSourceUrl.value = ''
    await loadSyncData()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '同步源创建失败。')
  }
  finally {
    syncLoading.value = false
  }
}

async function runSyncSource(sourceId: string) {
  if (!canWrite.value)
    return

  syncLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const response = await $fetch<ApiResponse<ContestSyncRun>>(endpoint(`/admin/contests/sync/sources/${sourceId}/run`), {
      method: 'POST',
    })
    successText.value = `同步完成：状态 ${response.data.status}，新增 ${response.data.createdCount} 条，更新 ${response.data.updatedCount} 条，跳过 ${response.data.skippedCount} 条。`
    await Promise.all([loadContests(), loadSyncData()])
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '同步任务执行失败。')
    await loadSyncData()
  }
  finally {
    syncLoading.value = false
  }
}

async function bootstrapListPage() {
  try {
    await loadPermissions()
  }
  catch (error: any) {
    permissionErrorText.value = String(error?.data?.message || '权限加载失败。')
    permissions.value = []
    isPlatformAdmin.value = false
    permissionLoaded.value = true
    return
  }

  permissionLoaded.value = true
  if (canRead.value) {
    await Promise.all([loadContests(), loadSyncData()])
  }
}

watch(isListRoute, async (value) => {
  if (!value)
    return
  await bootstrapListPage()
}, { immediate: true })
</script>

<template>
  <NuxtPage v-if="!isListRoute" />
  <div v-else class="text-[11px] space-y-3">
    <section
      v-if="!permissionLoaded"
      class="p-3 border border-slate-200 bg-white"
    >
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <section
      v-else-if="permissionErrorText"
      class="text-amber-700 p-3 border border-amber-200 bg-amber-50"
    >
      {{ permissionErrorText }}
    </section>
    <section
      v-else-if="!canRead"
      class="text-rose-600 p-3 border border-rose-200 bg-rose-50"
    >
      403：当前账号没有赛事管理权限。
    </section>

    <template v-else>
      <section class="p-3 border border-slate-200 bg-white">
        <div class="gap-2 grid lg:grid-cols-[2fr_1fr_2fr_auto]">
          <a-input
            v-model="search"
            allow-clear
            size="small"
            placeholder="搜索：名称/主办方/官网/关键词"
            @press-enter="loadContests"
          />
          <a-select
            v-model="statusFilter"
            allow-clear
            size="small"
            placeholder="状态"
          >
            <a-option value="draft">
              draft
            </a-option>
            <a-option value="published">
              published
            </a-option>
            <a-option value="archived">
              archived
            </a-option>
          </a-select>
          <a-select
            v-model="organizerFilter"
            :max-tag-count="2"
            allow-clear
            allow-search
            multiple
            size="small"
            placeholder="按主办单位筛选（支持多选）"
          >
            <a-option v-for="item in organizerOptions" :key="item" :value="item">
              {{ item }}
            </a-option>
          </a-select>
          <div class="flex gap-2 items-center">
            <a-button size="small" type="primary" @click="loadContests">
              查询
            </a-button>
            <a-button size="small" @click="resetFilters">
              重置
            </a-button>
          </div>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <div class="mb-3 flex gap-2 items-center justify-between">
          <p class="text-[11px] text-slate-900 font-semibold m-0">
            赛事列表（{{ filteredContests.length }}）
          </p>
          <NuxtLink v-if="canWrite" to="/admin/contests/new">
            <a-button size="small" type="primary">
              新建赛事
            </a-button>
          </NuxtLink>
        </div>

        <a-skeleton v-if="loading" :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>

        <template v-else>
          <a-table
            :bordered="{ cell: true }"
            :columns="contestColumns"
            :data="pagedContests"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #name="{ record }">
              <div class="min-w-0">
                <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                  {{ record.name }}
                </p>
                <p class="text-[10px] text-slate-500 m-0 mt-1 truncate">
                  {{ record.officialUrl || '暂无官网链接' }}
                </p>
              </div>
            </template>

            <template #organizers="{ record }">
              <div class="flex flex-wrap gap-1">
                <a-tag
                  v-for="item in extractOrganizerTags(record)"
                  :key="`${record.id}-${item}`"
                  bordered
                  size="small"
                >
                  {{ item }}
                </a-tag>
                <span v-if="extractOrganizerTags(record).length === 0" class="text-[10px] text-slate-400">
                  待补充
                </span>
              </div>
            </template>

            <template #status="{ record }">
              <a-tag :color="statusColor(record.status)" size="small">
                {{ record.status || 'draft' }}
              </a-tag>
            </template>

            <template #actions="{ record }">
              <div class="flex flex-wrap gap-1 justify-end">
                <a-button size="mini" @click="goToContestOverviewEditor(record.id)">
                  编辑
                </a-button>
                <a-button size="mini" @click="goToContestWorkspace(record.id)">
                  工作区
                </a-button>
                <a-button v-if="canWrite" size="mini" @click="goToContestAiPrompts(record.id)">
                  AI提示词
                </a-button>
                <a-button
                  v-if="canPublish"
                  size="mini"
                  :loading="actionLoadingId === record.id"
                  @click="publishContest(record.id)"
                >
                  发布
                </a-button>
                <a-button
                  v-if="canArchive"
                  size="mini"
                  status="danger"
                  :loading="actionLoadingId === record.id"
                  @click="archiveContest(record.id)"
                >
                  下架
                </a-button>
              </div>
            </template>
          </a-table>

          <div class="mt-3 flex justify-end">
            <a-pagination
              :current="page"
              :page-size="pageSize"
              :page-size-options="[10, 20, 50]"
              :show-total="true"
              :total="filteredContests.length"
              size="small"
              @change="(value: number) => page = value"
              @page-size-change="(value: number) => { pageSize = value; page = 1 }"
            />
          </div>
        </template>
      </section>

      <section v-if="canWrite" class="p-3 border border-slate-200 bg-white">
        <a-collapse :default-active-key="[]" :bordered="false" expand-icon-position="right">
          <a-collapse-item key="import" header="批量导入（CSV）">
            <div class="space-y-2">
              <div class="flex flex-wrap gap-2 items-center">
                <a
                  class="text-[11px] text-[#1152d4] inline-flex hover:underline"
                  :href="endpoint('/admin/contests/import/template')"
                  target="_blank"
                >
                  下载模板
                </a>
                <input
                  ref="importFileInputRef"
                  accept=".csv,text/csv"
                  class="hidden"
                  type="file"
                  @change="onImportFileChange"
                >
                <a-button size="mini" @click="openImportFilePicker">
                  上传 CSV 文件
                </a-button>
              </div>

              <a-textarea
                v-model="importCsvText"
                :auto-size="{ minRows: 6, maxRows: 14 }"
                placeholder="支持：飞书多维表格导出 CSV 文件上传，或直接粘贴 CSV 内容。"
              />

              <div class="flex flex-wrap gap-2 items-center">
                <a-button size="small" :loading="importLoading" @click="previewImport">
                  预检
                </a-button>
                <a-button size="small" :disabled="!importPreview" :loading="importLoading" type="primary" @click="commitImport">
                  提交导入（按执行计划）
                </a-button>
              </div>

              <div v-if="importPreview" class="text-[11px] text-slate-700 p-2 border border-slate-200 rounded space-y-2">
                <p class="m-0">
                  总行数：{{ importPreview.total }}；可导入：{{ importPreview.validCount }}；无效：{{ importPreview.invalidCount }}
                </p>
                <p class="text-[10px] text-slate-500 m-0">
                  创建：{{ importPreview.rows.filter(item => item.action === 'create').length }}；
                  更新：{{ importPreview.rows.filter(item => item.action === 'update').length }}
                </p>

                <div class="flex flex-wrap gap-2 items-center">
                  <a-button size="mini" @click="applyImportBatchOnlyCreate">
                    仅执行新增
                  </a-button>
                  <a-button size="mini" @click="applyImportBatchOnlyUpdate">
                    仅执行更新
                  </a-button>
                  <a-button size="mini" @click="applyImportBatchSkipInvalid">
                    跳过有错误行
                  </a-button>
                  <a-button size="mini" @click="applyImportBatchForceUpdateOverwrite">
                    更新行批量强制覆盖
                  </a-button>
                  <a-button size="mini" @click="resetImportExecutionPlan">
                    恢复默认策略
                  </a-button>
                </div>

                <div class="max-h-[280px] overflow-auto space-y-1">
                  <div
                    v-for="row in importPreview.rows"
                    :key="`decision-${row.rowNumber}`"
                    class="p-2 border border-slate-200 rounded bg-slate-50"
                  >
                    <div class="gap-2 grid items-center md:grid-cols-[90px_90px_120px_180px_1fr]">
                      <p class="text-slate-900 m-0">
                        第 {{ row.rowNumber }} 行
                      </p>
                      <a-tag :color="row.action === 'create' ? 'green' : (row.action === 'update' ? 'blue' : 'red')" size="small">
                        {{ row.action }}
                      </a-tag>
                      <a-checkbox
                        :model-value="getImportRowDecision(row).execute"
                        @change="(value: any) => setImportRowDecision(row.rowNumber, { execute: Boolean(value) })"
                      >
                        执行
                      </a-checkbox>
                      <a-select
                        v-if="row.action === 'update'"
                        :model-value="getImportRowDecision(row).overwriteMode"
                        size="mini"
                        @change="(value: any) => setImportRowDecision(row.rowNumber, { overwriteMode: normalizeImportOverwriteMode(value) })"
                      >
                        <a-option value="preserve_existing">
                          保守合并
                        </a-option>
                        <a-option value="force_replace">
                          强制覆盖
                        </a-option>
                      </a-select>
                      <span v-else class="text-[10px] text-slate-500">-</span>
                      <p class="text-[10px] m-0" :class="row.errors.length ? 'text-rose-600' : 'text-slate-600'">
                        {{ row.errors.length ? row.errors.join('；') : [...row.warnings, ...row.structuredWarnings].join('；') || '无' }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="importCommitRows.length > 0" class="text-[11px] text-slate-700 p-2 border border-slate-200 rounded">
                <p class="text-slate-900 font-semibold m-0">
                  最近一次提交结果（最多展示 20 条）
                </p>
                <p
                  v-for="row in importCommitRows.slice(0, 20)"
                  :key="`commit-${row.rowNumber}`"
                  class="m-0 mt-1"
                  :class="row.result === 'error' || row.result === 'invalid' ? 'text-rose-600' : 'text-slate-700'"
                >
                  第 {{ row.rowNumber }} 行：{{ row.result }}（{{ row.overwriteMode }}）{{ row.message ? ` - ${row.message}` : '' }}
                </p>
              </div>
            </div>
          </a-collapse-item>
        </a-collapse>
      </section>

      <section v-if="canWrite" class="p-3 border border-slate-200 bg-white">
        <a-collapse :default-active-key="[]" :bordered="false" expand-icon-position="right">
          <a-collapse-item key="sync" header="自动拉取（CSV URL 手动触发）">
            <div class="space-y-3">
              <div class="gap-2 grid lg:grid-cols-[200px_1fr_auto]">
                <a-input v-model="syncSourceName" allow-clear size="small" placeholder="数据源名称" />
                <a-input v-model="syncSourceUrl" allow-clear size="small" placeholder="CSV URL（http/https）" />
                <a-button size="small" type="primary" :loading="syncLoading" @click="createSyncSource">
                  新增同步源
                </a-button>
              </div>

              <div class="flex items-center justify-between">
                <p class="text-[11px] text-slate-900 font-semibold m-0">
                  同步源（{{ syncSources.length }}）
                </p>
                <a-button size="small" :loading="syncLoading" @click="loadSyncData">
                  刷新
                </a-button>
              </div>

              <div v-if="syncSources.length === 0" class="text-[11px] text-slate-500">
                暂无同步源，请先新增。
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="item in syncSources"
                  :key="item.id"
                  class="p-2 border border-slate-200 rounded"
                >
                  <div class="flex flex-wrap gap-2 items-center justify-between">
                    <div class="min-w-0">
                      <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                        {{ item.name }}
                      </p>
                      <p class="text-[10px] text-slate-500 m-0 mt-1 truncate">
                        {{ item.sourceUrl }}
                      </p>
                      <p class="text-[10px] text-slate-500 m-0 mt-1">
                        上次运行：{{ item.lastRunAt || '尚未运行' }}
                      </p>
                    </div>
                    <a-button size="small" :disabled="!item.isActive" :loading="syncLoading" @click="runSyncSource(item.id)">
                      手动触发
                    </a-button>
                  </div>
                </div>
              </div>

              <div class="pt-1">
                <p class="text-[11px] text-slate-900 font-semibold m-0">
                  最近运行记录（{{ syncRuns.length }}）
                </p>
              </div>
              <div v-if="syncRuns.length === 0" class="text-[11px] text-slate-500">
                暂无运行记录。
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="item in syncRuns"
                  :key="item.id"
                  class="p-2 border border-slate-200 rounded"
                >
                  <div class="flex flex-wrap gap-2 items-center justify-between">
                    <p class="text-[11px] text-slate-900 font-semibold m-0">
                      {{ item.sourceName }}
                    </p>
                    <a-tag :color="item.status === 'success' ? 'green' : (item.status === 'partial_success' ? 'orange' : (item.status === 'failed' ? 'red' : 'blue'))" size="small">
                      {{ item.status }}
                    </a-tag>
                  </div>
                  <p class="text-[10px] text-slate-600 m-0 mt-1">
                    总数 {{ item.previewTotal }} / 有效 {{ item.previewValid }} / 无效 {{ item.previewInvalid }} /
                    新增 {{ item.createdCount }} / 更新 {{ item.updatedCount }} / 跳过 {{ item.skippedCount }}
                  </p>
                  <p v-if="item.errorMessage" class="text-[10px] text-rose-600 m-0 mt-1">
                    {{ item.errorMessage }}
                  </p>
                </div>
              </div>
            </div>
          </a-collapse-item>
        </a-collapse>
      </section>
    </template>

    <section v-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
      {{ successText }}
    </section>
  </div>
</template>
