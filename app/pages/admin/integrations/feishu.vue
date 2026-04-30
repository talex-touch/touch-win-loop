<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  FeishuAdminManualAddResult,
  FeishuAdminOverview,
  FeishuBitableSourceConfig,
  FeishuBitableSync,
  FeishuBitableSyncConfigImportPreview,
  FeishuBitableSyncConfigImportResult,
  FeishuBitableSyncConfigPackage,
  FeishuBitableSyncConfigPackageSummary,
  FeishuBitableSyncConfigShare,
  FeishuBitableSyncDetail,
  FeishuBitableSyncEnvironment,
  FeishuBitableSyncItem,
  FeishuBitableSyncItemDetail,
  FeishuBitableSyncItemEntityType,
  FeishuBitableTableMeta,
  FeishuBitableViewMeta,
  FeishuChatCandidate,
  FeishuIntegrationConfig,
  FeishuSyncIssue,
  PlatformPermission,
} from '~~/shared/types/domain'
import { resolveAuthDisplayMessage, resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

definePageMeta({
  layout: 'admin',
})

type SecretMode = 'keep' | 'replace' | 'clear'
type BuildValueSource = 'env' | 'runtime' | 'missing'
type CreateSyncSourceMode = 'url' | 'manual'

interface FeishuIntegrationConfigView extends FeishuIntegrationConfig {
  startupEffectiveVersion?: string
  startupEffectiveCommitSha?: string
  startupVersionSource?: BuildValueSource
  startupCommitShaSource?: BuildValueSource
}

interface SourceViewsPayload {
  tables: FeishuBitableTableMeta[]
  views: FeishuBitableViewMeta[]
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()
const router = useRouter()

type ApiRequestError = Error & {
  statusCode?: number
  data?: {
    message?: string
    meta?: ApiResponse<null>['meta']
  }
}

function createApiRequestError(message: string, statusCode = 0, payload: ApiResponse<unknown> | null = null): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.statusCode = statusCode
  error.data = {
    message,
    ...(payload?.meta ? { meta: payload.meta } : {}),
  }
  return error
}

async function requestApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const headers = new Headers()
  let body: BodyInit | undefined

  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body,
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage), response.status, payload)
  return payload.data
}

const loadingPermissions = ref(true)
const loadingConfig = ref(false)
const loadingSyncs = ref(false)
const savingConfig = ref(false)
const adminOverviewLoading = ref(false)
const creatingSync = ref(false)
const startupNotifyChatOptionsLoading = ref(false)
const testingStartupNotify = ref(false)
const startupNotifyChatPickerVisible = ref(false)
const manualAddingKey = ref('')
const syncToggleMutating = reactive<Record<string, boolean>>({})
const archivingSyncMutating = reactive<Record<string, boolean>>({})
const restoringSyncMutating = reactive<Record<string, boolean>>({})
const syncConfigShareMutating = reactive<Record<string, boolean>>({})
const syncItemToggleMutating = reactive<Record<string, boolean>>({})
const issueActionMutating = reactive<Record<string, boolean>>({})

const createSyncDrawerVisible = ref(false)
const editSyncDrawerVisible = ref(false)
const syncConfigImportDrawerVisible = ref(false)
const createSourceMode = ref<CreateSyncSourceMode>('url')
const configDialogVisible = ref(false)
const editingSyncId = ref('')
const editingSelectedItemId = ref('')
const editingDraftTableId = ref('')
const editingDraftViewId = ref('')
const editingSyncIncludeArchived = ref(false)
const showArchivedSyncs = ref(false)
const expandedSyncKeys = ref<string[]>([])

const errorText = ref('')
const successText = ref('')
const startupNotifyTestErrorText = ref('')
const startupNotifyTestSuccessText = ref('')
const permissions = ref<PlatformPermission[]>([])
const config = ref<FeishuIntegrationConfigView | null>(null)
const adminOverview = ref<FeishuAdminOverview | null>(null)
const syncs = ref<FeishuBitableSync[]>([])
const startupNotifyChatOptions = ref<FeishuChatCandidate[]>([])
const startupNotifyChatSearchKeyword = ref('')
const syncConfigShares = reactive<Record<string, FeishuBitableSyncConfigShare | null>>({})
const syncConfigImportUrl = ref('')
const syncConfigImportPreview = ref<FeishuBitableSyncConfigImportPreview | null>(null)
const syncConfigImportLoading = ref(false)
const syncConfigImporting = ref(false)
const syncConfigImportErrorText = ref('')
const expandedSyncDetails = reactive<Record<string, FeishuBitableSyncDetail | null>>({})
const expandedSyncLoading = reactive<Record<string, boolean>>({})
const expandedSyncErrors = reactive<Record<string, string>>({})
const syncItemLogVisible = ref(false)
const syncItemLogLoading = ref(false)
const syncItemLogErrorText = ref('')
const syncItemLogSyncId = ref('')
const syncItemLogSyncName = ref('')
const syncItemLogIncludeArchived = ref(false)
const syncItemLogItemDetail = ref<FeishuBitableSyncItemDetail | null>(null)
let startupNotifyChatSearchSequence = 0

const syncColumns = [
  { title: '同步信息', dataIndex: 'name', slotName: 'name', width: 220 },
  { title: '主库来源', dataIndex: 'source', slotName: 'source', width: 340 },
  { title: '子表同步项', dataIndex: 'itemCount', slotName: 'itemCount', width: 240 },
  { title: '最近执行', dataIndex: 'latestRun', slotName: 'latestRun', width: 220 },
  { title: '主调度', dataIndex: 'schedule', slotName: 'schedule', width: 220 },
  { title: '问题', dataIndex: 'issueStats', slotName: 'issueStats', width: 120 },
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', width: 170 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 560 },
]

const syncItemPreviewColumns = [
  { title: '子表同步项', dataIndex: 'name', slotName: 'itemName', width: 260 },
  { title: '飞书来源', dataIndex: 'source', slotName: 'itemSource', width: 260 },
  { title: '状态', dataIndex: 'status', slotName: 'itemStatus', width: 170 },
  { title: '最近执行', dataIndex: 'latestRun', slotName: 'itemLatestRun', width: 240 },
  { title: '调度状态', dataIndex: 'schedule', slotName: 'itemSchedule', width: 220 },
  { title: '操作', dataIndex: 'actions', slotName: 'itemActions', width: 220 },
]

const canManageConfig = computed(() => permissions.value.includes('role.assign'))
const canManageBitable = computed(() => permissions.value.includes('contest.write'))
const canReadSyncedData = computed(() => permissions.value.includes('contest.read_internal'))
const canAccessPage = computed(() => canManageConfig.value || canManageBitable.value)
const loadingAny = computed(() => loadingPermissions.value || loadingConfig.value || loadingSyncs.value)
const normalizedPath = computed(() => route.path.replace(/\/+$/, '') || '/')
const isOverviewRoute = computed(() => normalizedPath.value === '/admin/integrations/feishu')

const {
  loading: feishuDirectoryLoading,
  members: feishuDirectoryMembers,
  departments: feishuDirectoryDepartments,
  rootDepartmentId: feishuDirectoryRootDepartmentId,
  notice: feishuDirectoryNotice,
  source: feishuDirectorySource,
  fromCache: feishuDirectoryFromCache,
  fetchedAt: feishuDirectoryFetchedAt,
  cacheExpiresAt: feishuDirectoryCacheExpiresAt,
  totalMembers: feishuDirectoryTotalMembers,
  permissionHint: feishuDirectoryPermissionHint,
  directoryStatus: feishuDirectoryStatus,
  memberListStatus: feishuDirectoryMemberListStatus,
  departmentTreeStatus: feishuDirectoryDepartmentTreeStatus,
  contactScopeStatus: feishuDirectoryContactScopeStatus,
  contactScopeSummary: feishuDirectoryContactScopeSummary,
  contactScopeErrorMessage: feishuDirectoryContactScopeErrorMessage,
  diagnosticCode: feishuDirectoryDiagnosticCode,
  diagnosticMessage: feishuDirectoryDiagnosticMessage,
  load: loadFeishuDirectoryBrowser,
} = useFeishuDirectoryBrowser({
  endpoint,
  canSearch: () => canManageConfig.value,
  onError: setError,
})

const configForm = reactive({
  enabled: false,
  appId: '',
  marketplaceAppUrl: '',
  oauthRedirectUri: '',
  adminGroupIdsText: '',
  webSdkScriptUrl: '',
  startupNotifyEnabled: false,
  startupNotifyChatId: '',
  startupNotifyRemark: '',
  appSecretMode: 'keep' as SecretMode,
  appSecret: '',
  eventTokenMode: 'keep' as SecretMode,
  eventToken: '',
  eventEncryptKeyMode: 'keep' as SecretMode,
  eventEncryptKey: '',
})

const createSyncForm = reactive({
  name: '',
  environment: 'test' as FeishuBitableSyncEnvironment,
  sourceInput: '',
  appName: '',
  appToken: '',
  tableName: '',
  tableId: '',
  viewName: '',
  viewId: '',
  sourceUrl: '',
})

const SYNC_ENVIRONMENT_OPTIONS: Array<{ value: FeishuBitableSyncEnvironment, label: string, tagColor: string, namePrefix: string }> = [
  { value: 'test', label: '测试环境', tagColor: 'gold', namePrefix: '[测试]' },
  { value: 'production', label: '正式环境', tagColor: 'green', namePrefix: '[正式]' },
]

const CREATE_SYNC_MILESTONES = [
  {
    step: '01',
    title: '先建主库',
    description: '先保存 appToken、环境标签和可选的 table/view 草稿，不在这一步处理字段映射。',
  },
  {
    step: '02',
    title: '再配子表',
    description: '进入编辑抽屉，为每个子表创建同步项，并确认同步到哪类平台实体。',
  },
  {
    step: '03',
    title: '先预检再执行',
    description: '先补映射、回填和自动同步规则，再用预检和单行模拟确认结果。',
  },
  {
    step: '04',
    title: '最后启用调度',
    description: '首轮手动执行通过后，再决定是否开启主同步和定时调度。',
  },
]

const SYNC_ITEM_ENTITY_TYPE_LABELS: Record<FeishuBitableSyncItemEntityType, string> = {
  contest: '竞赛',
  track: '赛道',
  resource: '资料',
  persona: '人设',
  policy: '政策',
  track_timeline: '赛道时间线',
}

const sourceResolveLoading = ref(false)
const sourceViewsLoading = ref(false)
const sourceTables = ref<FeishuBitableTableMeta[]>([])
const sourceViews = ref<FeishuBitableViewMeta[]>([])

function setError(message: string) {
  errorText.value = message
}

function setSuccess(message: string) {
  successText.value = message
}

function clearFeedback() {
  errorText.value = ''
  successText.value = ''
}

function clearStartupNotifyTestFeedback() {
  startupNotifyTestErrorText.value = ''
  startupNotifyTestSuccessText.value = ''
}

function formatDateTime(value?: string | null): string {
  const text = String(value || '').trim()
  return text || '-'
}

function runStatusLabel(status?: string | null): string {
  if (status === 'success')
    return '成功'
  if (status === 'partial_success')
    return '部分成功'
  if (status === 'failed')
    return '失败'
  return status || '未知'
}

function runStatusColor(status?: string | null): string {
  if (status === 'success')
    return 'green'
  if (status === 'partial_success')
    return 'gold'
  if (status === 'failed')
    return 'red'
  return 'gray'
}

interface RunHealthSummaryLike {
  status?: string | null
  errorCount?: number | null
}

function runHealthFailed(summary?: RunHealthSummaryLike | null): boolean {
  return summary?.status === 'failed'
}

function runHealthWarned(summary?: RunHealthSummaryLike | null): boolean {
  return summary?.status === 'partial_success' || Boolean(summary?.errorCount)
}

function runHealthLabel(summary?: RunHealthSummaryLike | null): string {
  if (!summary)
    return '未执行'
  if (summary.status === 'success' && Number(summary.errorCount || 0) > 0)
    return '成功但有告警'
  return runStatusLabel(summary.status)
}

function runHealthColor(summary?: RunHealthSummaryLike | null): string {
  if (!summary)
    return 'gray'
  if (runHealthFailed(summary))
    return 'red'
  if (runHealthWarned(summary))
    return 'gold'
  return runStatusColor(summary.status)
}

function triggerSourceLabel(source?: string | null): string {
  if (source === 'manual')
    return '手动'
  if (source === 'event')
    return '事件'
  if (source === 'scheduled')
    return '定时'
  return source || '未知'
}

function buildValueSourceLabel(source: BuildValueSource | undefined): string {
  if (source === 'env')
    return '环境变量'
  if (source === 'runtime')
    return '构建推导'
  return '未命中'
}

function syncLatestRunSummary(sync: FeishuBitableSync): string {
  if (!sync.latestRunSummary)
    return '暂无执行记录'
  return `${formatDateTime(sync.latestRunSummary.startedAt)} / ${runHealthLabel(sync.latestRunSummary)} / ${triggerSourceLabel(sync.latestRunSummary.triggerSource)}`
}

function syncItemEntityTypeLabel(entityType?: FeishuBitableSyncItemEntityType | null): string {
  if (!entityType)
    return '未知类型'
  return SYNC_ITEM_ENTITY_TYPE_LABELS[entityType] || entityType
}

function syncItemLatestRunSummary(item: FeishuBitableSyncItem): string {
  if (!item.latestRunSummary)
    return '暂无执行记录'
  return `${formatDateTime(item.latestRunSummary.startedAt)} / ${runHealthLabel(item.latestRunSummary)} / ${triggerSourceLabel(item.latestRunSummary.triggerSource)}`
}

function syncItemScheduleStatusLabel(sync: FeishuBitableSync, item: FeishuBitableSyncItem): string {
  if (!sync.enabled)
    return '受主同步影响'
  if (!item.isEnabled)
    return '子项已禁用'
  if (!item.schedule?.enabled)
    return '未启用调度'
  return '已启用调度'
}

function syncItemScheduleStatusColor(sync: FeishuBitableSync, item: FeishuBitableSyncItem): string {
  if (!sync.enabled)
    return 'gold'
  if (!item.isEnabled)
    return 'gray'
  if (!item.schedule?.enabled)
    return 'gray'
  return 'green'
}

function syncIssueStatusLabel(status?: string | null): string {
  if (status === 'open')
    return '待处理'
  if (status === 'resolved')
    return '已解决'
  if (status === 'ignored')
    return '已忽略'
  return status || '未知'
}

function syncIssueStatusColor(status?: string | null): string {
  if (status === 'open')
    return 'red'
  if (status === 'resolved')
    return 'green'
  if (status === 'ignored')
    return 'gray'
  return 'gray'
}

function sortedSyncIssues(issues: FeishuSyncIssue[] = []): FeishuSyncIssue[] {
  const statusOrder: Record<string, number> = {
    open: 0,
    resolved: 1,
    ignored: 2,
  }
  return [...issues].sort((left, right) => {
    const statusDiff = (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9)
    if (statusDiff !== 0)
      return statusDiff
    return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
  })
}

function syncRunModeLabel(mode?: string | null): string {
  if (mode === 'full')
    return '全量'
  if (mode === 'delta')
    return '增量'
  return mode || '未标记'
}

function syncScheduleStatusLabel(sync: FeishuBitableSync): string {
  if (!sync.schedule.enabled)
    return '已配置未启用'
  return sync.enabled ? '已启用调度' : '主同步已禁用'
}

function syncScheduleStatusColor(sync: FeishuBitableSync): string {
  if (!sync.schedule.enabled)
    return 'gray'
  return sync.enabled ? 'green' : 'gold'
}

function syncEnabledItemSummary(record: FeishuBitableSync): string {
  return record.enabled ? `已启用 ${record.enabledItemCount}` : '主同步已禁用'
}

function syncLatestRunFailed(sync: FeishuBitableSync): boolean {
  return runHealthFailed(sync.latestRunSummary)
}

function syncLatestRunWarned(sync: FeishuBitableSync): boolean {
  return runHealthWarned(sync.latestRunSummary)
}

function syncProgressStageLabel(sync: FeishuBitableSync): string {
  if (sync.archivedAt)
    return '只读归档'
  if (!sync.itemCount)
    return '待配子表'
  if (!sync.enabled)
    return '主同步停用'
  if (!sync.enabledItemCount)
    return '待启用子项'
  if (syncLatestRunFailed(sync))
    return '最近运行失败'
  if (syncLatestRunWarned(sync))
    return '最近运行告警'
  if (sync.issueStats.open)
    return '待处理问题'
  if (!sync.latestRunSummary)
    return '待首轮验证'
  if (!sync.schedule.enabled)
    return '手动运行稳定'
  return '稳定运行中'
}

function syncProgressStageColor(sync: FeishuBitableSync): string {
  if (sync.archivedAt)
    return 'gray'
  if (!sync.itemCount)
    return 'gold'
  if (!sync.enabled)
    return 'gray'
  if (!sync.enabledItemCount)
    return 'gold'
  if (syncLatestRunFailed(sync))
    return 'red'
  if (syncLatestRunWarned(sync))
    return 'gold'
  if (sync.issueStats.open)
    return 'red'
  if (!sync.latestRunSummary)
    return 'arcoblue'
  if (!sync.schedule.enabled)
    return 'green'
  return 'green'
}

function syncProgressSummary(sync: FeishuBitableSync): string {
  if (sync.archivedAt)
    return '当前只保留历史配置，不再参与导入链路。'
  if (!sync.itemCount)
    return '主库已接入，当前还没有子表同步项。'
  if (!sync.enabled)
    return '子表与配置保留，但主同步停用后不会响应事件或调度。'
  if (!sync.enabledItemCount)
    return '已有子表同步项，但还没有任何启用中的导入入口。'
  if (syncLatestRunFailed(sync))
    return `最近一次执行失败${sync.latestRunSummary?.errorCount ? `，错误 ${sync.latestRunSummary.errorCount} 条。` : '。'}先回到子表同步项处理异常，再继续导入。`
  if (syncLatestRunWarned(sync))
    return `最近一次执行仍有错误或部分成功${sync.latestRunSummary?.errorCount ? `，当前错误 ${sync.latestRunSummary.errorCount} 条。` : '。'}这条链路暂时不应视为稳定运行。`
  if (sync.issueStats.open)
    return `当前有 ${sync.issueStats.open} 个待处理问题，建议先清理映射或回填问题。`
  if (!sync.latestRunSummary)
    return '已有启用中的子表同步项，但还没完成首轮手动验证。'
  if (!sync.schedule.enabled)
    return '首轮验证已完成，当前更适合手动控制执行节奏。'
  return '主同步与调度均已进入可持续运行状态。'
}

function syncNextActionText(sync: FeishuBitableSync): string {
  if (sync.archivedAt)
    return '如需继续使用，先恢复归档。'
  if (!sync.itemCount)
    return '打开编辑抽屉，至少创建一个子表同步项。'
  if (!sync.enabled)
    return '确认配置后再重新启用主同步。'
  if (!sync.enabledItemCount)
    return '进入子表同步项，先启用至少一个可运行入口。'
  if (syncLatestRunFailed(sync))
    return '先打开子表同步项查看错误日志，修复后再手动重跑。'
  if (syncLatestRunWarned(sync))
    return '先核对错误记录和跳过原因，确认干净后再考虑启用调度。'
  if (sync.issueStats.open)
    return '先处理问题单，再继续预检或启用调度。'
  if (!sync.latestRunSummary)
    return '先做一次手动执行，确认落库和回填。'
  if (!sync.schedule.enabled)
    return '验证稳定后，再按需开启主调度。'
  return '持续关注最近运行结果和问题单。'
}

function scheduleModeLabel(mode?: string | null): string {
  if (mode === 'cron')
    return 'Cron'
  if (mode === 'interval')
    return '固定间隔'
  return '未知'
}

function resetSecretInputs() {
  configForm.appSecretMode = 'keep'
  configForm.appSecret = ''
  configForm.eventTokenMode = 'keep'
  configForm.eventToken = ''
  configForm.eventEncryptKeyMode = 'keep'
  configForm.eventEncryptKey = ''
}

function parseMultilineList(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of String(text || '').split(/[\n,]/g)) {
    const normalized = item.trim()
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function normalizeStartupNotifyChatOptions(items: FeishuChatCandidate[], selectedChatId = ''): FeishuChatCandidate[] {
  const seen = new Set<string>()
  const result: FeishuChatCandidate[] = []

  const append = (item: FeishuChatCandidate | null | undefined) => {
    const chatId = String(item?.chatId || '').trim()
    if (!chatId || seen.has(chatId))
      return
    seen.add(chatId)
    result.push({
      chatId,
      name: String(item?.name || '').trim() || chatId,
      description: String(item?.description || '').trim(),
      avatarUrl: String(item?.avatarUrl || '').trim(),
    })
  }

  const normalizedSelectedChatId = String(selectedChatId || '').trim()
  if (normalizedSelectedChatId) {
    append({
      chatId: normalizedSelectedChatId,
      name: normalizedSelectedChatId,
      description: '',
      avatarUrl: '',
    })
  }

  for (const item of items)
    append(item)

  return result
}

function formatStartupNotifyChatLabel(item?: FeishuChatCandidate | null): string {
  const chatId = String(item?.chatId || '').trim()
  const name = String(item?.name || '').trim()
  return name || chatId
}

const startupNotifyChatSelectOptions = computed(() => {
  return normalizeStartupNotifyChatOptions(startupNotifyChatOptions.value, configForm.startupNotifyChatId)
})

const selectedStartupNotifyChat = computed(() => {
  const selectedChatId = String(configForm.startupNotifyChatId || '').trim()
  if (!selectedChatId)
    return null
  return startupNotifyChatSelectOptions.value.find(item => item.chatId === selectedChatId) || null
})

function fillConfigForm(payload: FeishuIntegrationConfig) {
  configForm.enabled = Boolean(payload.enabled)
  configForm.appId = payload.appId || ''
  configForm.marketplaceAppUrl = payload.marketplaceAppUrl || ''
  configForm.oauthRedirectUri = payload.oauthRedirectUri || ''
  configForm.adminGroupIdsText = Array.isArray(payload.adminGroupIds) ? payload.adminGroupIds.join('\n') : ''
  configForm.webSdkScriptUrl = payload.webSdkScriptUrl || ''
  configForm.startupNotifyEnabled = Boolean(payload.startupNotifyEnabled)
  configForm.startupNotifyChatId = payload.startupNotifyChatId || ''
  configForm.startupNotifyRemark = payload.startupNotifyRemark || ''
  startupNotifyChatOptions.value = normalizeStartupNotifyChatOptions(startupNotifyChatOptions.value, payload.startupNotifyChatId || '')
  resetSecretInputs()
}

function buildDefaultSyncName(): string {
  let maxIndex = 0
  for (const sync of syncs.value) {
    const match = String(sync.name || '').trim().match(/^(?:\[(?:测试|正式)\]\s*)?多维同步\s+(\d+)$/)
    if (!match)
      continue
    const index = Number(match[1] || 0)
    if (Number.isInteger(index) && index > maxIndex)
      maxIndex = index
  }
  return `多维同步 ${maxIndex + 1}`
}

function syncEnvironmentLabel(environment?: FeishuBitableSyncEnvironment | null): string {
  return SYNC_ENVIRONMENT_OPTIONS.find(item => item.value === environment)?.label || '未标记'
}

function syncEnvironmentTagColor(environment?: FeishuBitableSyncEnvironment | null): string {
  return SYNC_ENVIRONMENT_OPTIONS.find(item => item.value === environment)?.tagColor || 'gray'
}

function buildSuggestedCreateSyncName(): string {
  const environment = createSyncForm.environment
  const prefix = SYNC_ENVIRONMENT_OPTIONS.find(item => item.value === environment)?.namePrefix || ''
  const baseName = createSyncForm.appName.trim() || buildDefaultSyncName()
  return prefix ? `${prefix} ${baseName}` : baseName
}

function buildSyncedDataLink(options?: { syncId?: string }) {
  const query: Record<string, string> = {}
  const syncId = String(options?.syncId || '').trim()
  if (syncId)
    query.syncId = syncId
  if ((Array.isArray(route.query.embed) ? route.query.embed[0] : route.query.embed) === '1')
    query.embed = '1'
  return Object.keys(query).length
    ? { path: '/admin/integrations/feishu/data', query }
    : '/admin/integrations/feishu/data'
}

async function openSyncedData(options?: { syncId?: string }) {
  const target = buildSyncedDataLink(options)
  try {
    await navigateTo(target)
  }
  catch {
    if (import.meta.client)
      window.location.assign(router.resolve(target).href)
  }
}

function buildCreateSourceConfig(): FeishuBitableSourceConfig {
  return {
    appToken: String(createSyncForm.appToken || '').trim(),
    tableId: String(createSyncForm.tableId || '').trim(),
    viewId: String(createSyncForm.viewId || '').trim(),
    appName: String(createSyncForm.appName || '').trim(),
    tableName: String(createSyncForm.tableName || '').trim(),
    viewName: String(createSyncForm.viewName || '').trim(),
    sourceUrl: String(createSyncForm.sourceUrl || '').trim(),
    environment: createSyncForm.environment,
  }
}

function resetCreateSyncForm() {
  createSyncForm.name = ''
  createSyncForm.environment = 'test'
  createSyncForm.sourceInput = ''
  createSyncForm.appName = ''
  createSyncForm.appToken = ''
  createSyncForm.tableName = ''
  createSyncForm.tableId = ''
  createSyncForm.viewName = ''
  createSyncForm.viewId = ''
  createSyncForm.sourceUrl = ''
  sourceTables.value = []
  sourceViews.value = []
}

function onAppTokenChanged() {
  createSyncForm.appName = ''
  createSyncForm.tableId = ''
  createSyncForm.tableName = ''
  createSyncForm.viewId = ''
  createSyncForm.viewName = ''
  sourceTables.value = []
  sourceViews.value = []
}

function onTableIdChanged(preserveView = false) {
  const selected = sourceTables.value.find(item => item.tableId === createSyncForm.tableId)
  createSyncForm.tableName = selected?.name || ''
  if (!preserveView) {
    createSyncForm.viewId = ''
    createSyncForm.viewName = ''
  }
}

function onViewIdChanged() {
  const selected = sourceViews.value.find(item => item.viewId === createSyncForm.viewId)
  createSyncForm.viewName = selected?.name || ''
}

function pruneExpandedSyncPreviewState(availableSyncIds: string[]) {
  const availableKeys = new Set(availableSyncIds)
  expandedSyncKeys.value = expandedSyncKeys.value.filter(key => availableKeys.has(key))

  for (const key of Object.keys(expandedSyncDetails)) {
    if (!availableKeys.has(key))
      delete expandedSyncDetails[key]
  }

  for (const key of Object.keys(expandedSyncLoading)) {
    if (!availableKeys.has(key))
      delete expandedSyncLoading[key]
  }

  for (const key of Object.keys(expandedSyncErrors)) {
    if (!availableKeys.has(key))
      delete expandedSyncErrors[key]
  }
}

async function loadExpandedSyncDetail(sync: FeishuBitableSync, force = false) {
  const syncId = String(sync.id || '').trim()
  if (!syncId)
    return

  if (expandedSyncLoading[syncId])
    return
  if (!force && expandedSyncDetails[syncId])
    return

  expandedSyncLoading[syncId] = true
  expandedSyncErrors[syncId] = ''

  try {
    const query = new URLSearchParams({
      includeInactive: 'true',
    })
    if (sync.archivedAt)
      query.set('includeArchived', 'true')

    expandedSyncDetails[syncId] = await requestApi<FeishuBitableSyncDetail>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}?${query.toString()}`),
      {},
      '子表同步项预览加载失败。',
    )
  }
  catch (error: any) {
    expandedSyncDetails[syncId] = null
    expandedSyncErrors[syncId] = String(error?.data?.message || '子表同步项预览加载失败。')
  }
  finally {
    expandedSyncLoading[syncId] = false
  }
}

function toggleSyncExpanded(sync: FeishuBitableSync) {
  const syncId = String(sync.id || '').trim()
  if (!syncId)
    return

  if (expandedSyncKeys.value.includes(syncId)) {
    expandedSyncKeys.value = expandedSyncKeys.value.filter(key => key !== syncId)
    return
  }

  expandedSyncKeys.value = [...expandedSyncKeys.value, syncId]
  void loadExpandedSyncDetail(sync)
}

function handleSyncRowExpand(_: string | number, record: FeishuBitableSync) {
  void loadExpandedSyncDetail(record)
}

async function toggleExpandedSyncItemEnabled(sync: FeishuBitableSync, item: FeishuBitableSyncItem, enabled: boolean) {
  const syncId = String(sync.id || '').trim()
  const itemId = String(item.id || '').trim()
  if (!syncId || !itemId)
    return

  syncItemToggleMutating[itemId] = true
  clearFeedback()
  try {
    await requestApi<FeishuBitableSyncItem>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}/items/${encodeURIComponent(itemId)}`),
      {
        method: 'PATCH',
        body: {
          isEnabled: enabled,
        },
      },
      `子表同步项${enabled ? '启用' : '禁用'}失败。`,
    )
    await loadSyncs()
    setSuccess(`子表同步项“${item.name || itemId}”已${enabled ? '启用' : '禁用'}。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || `子表同步项${enabled ? '启用' : '禁用'}失败。`))
  }
  finally {
    syncItemToggleMutating[itemId] = false
  }
}

async function openSyncItemLogDrawer(sync: FeishuBitableSync, item: FeishuBitableSyncItem) {
  const syncId = String(sync.id || '').trim()
  const itemId = String(item.id || '').trim()
  if (!syncId || !itemId)
    return

  syncItemLogVisible.value = true
  syncItemLogSyncId.value = syncId
  syncItemLogSyncName.value = String(sync.name || '').trim()
  syncItemLogIncludeArchived.value = Boolean(sync.archivedAt)
  syncItemLogItemDetail.value = {
    ...(item as FeishuBitableSyncItemDetail),
    issues: [],
    recentRuns: [],
  }
  await refreshSyncItemLogDrawer()
}

function openSyncItemEditor(sync: FeishuBitableSync, item: FeishuBitableSyncItem) {
  const syncId = String(sync.id || '').trim()
  const itemId = String(item.id || '').trim()
  if (!syncId || !itemId)
    return

  openEditSyncDrawer(syncId, {
    selectedItemId: itemId,
    includeArchived: Boolean(sync.archivedAt),
  })
}

async function refreshSyncItemLogDrawer() {
  const syncId = String(syncItemLogSyncId.value || '').trim()
  const itemId = String(syncItemLogItemDetail.value?.id || '').trim()
  if (!syncId || !itemId)
    return

  syncItemLogLoading.value = true
  syncItemLogErrorText.value = ''
  try {
    const query = new URLSearchParams({
      runLimit: '20',
      issueLimit: '50',
    })
    if (syncItemLogIncludeArchived.value)
      query.set('includeArchived', 'true')
    syncItemLogItemDetail.value = await requestApi<FeishuBitableSyncItemDetail>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}/items/${encodeURIComponent(itemId)}?${query.toString()}`),
      {},
      '子表同步项日志加载失败。',
    )
  }
  catch (error: any) {
    syncItemLogErrorText.value = String(error?.data?.message || '子表同步项日志加载失败。')
  }
  finally {
    syncItemLogLoading.value = false
  }
}

async function handleSyncIssueAction(issue: FeishuSyncIssue, action: 'resolve' | 'ignore') {
  const issueId = String(issue.id || '').trim()
  if (!issueId || issue.status !== 'open')
    return

  issueActionMutating[issueId] = true
  setError('')
  setSuccess('')
  try {
    const path = action === 'resolve'
      ? `/admin/integrations/feishu/link-issues/${encodeURIComponent(issueId)}/resolve`
      : `/admin/integrations/feishu/link-issues/${encodeURIComponent(issueId)}/ignore`
    await requestApi<FeishuSyncIssue>(
      endpoint(path),
      {
        method: 'POST',
        body: action === 'resolve'
          ? { resolutionPayload: { source: 'feishu_integration_page' } }
          : { reason: '管理员手动忽略' },
      },
      action === 'resolve' ? '关联问题标记失败。' : '关联问题忽略失败。',
    )

    await refreshSyncItemLogDrawer()
    await loadSyncs()
    setSuccess(action === 'resolve' ? '关联问题已标记为已解决。' : '关联问题已忽略。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || (action === 'resolve' ? '关联问题标记失败。' : '关联问题忽略失败。')))
  }
  finally {
    issueActionMutating[issueId] = false
  }
}

function openSyncItemLogEditor() {
  const itemId = String(syncItemLogItemDetail.value?.id || '').trim()
  if (!syncItemLogSyncId.value || !itemId)
    return

  syncItemLogVisible.value = false
  openEditSyncDrawer(syncItemLogSyncId.value, {
    selectedItemId: itemId,
    includeArchived: syncItemLogIncludeArchived.value,
  })
}

async function loadPermissions() {
  loadingPermissions.value = true
  try {
    const data = await requestApi<AuthMeResult>(endpoint('/auth/me'), {}, '权限加载失败，请先登录。')
    permissions.value = data.user.platformPermissions || []
  }
  catch (error: any) {
    const info = resolveAuthRequestErrorInfo(error)
    permissions.value = []
    if (info.isUnauthorized) {
      await navigateTo({
        path: '/login',
        query: { redirect: resolveLoginRedirectTarget(route, '/admin/integrations/feishu') },
      }, { replace: true })
      return
    }
    setError(resolveAuthDisplayMessage(error, '权限加载失败，请稍后重试。'))
  }
  finally {
    loadingPermissions.value = false
  }
}

async function loadConfig() {
  if (!canManageConfig.value) {
    config.value = null
    return
  }

  loadingConfig.value = true
  try {
    const data = await requestApi<FeishuIntegrationConfigView>(endpoint('/admin/integrations/feishu/config'), {}, '飞书配置加载失败。')
    config.value = data
    fillConfigForm(data)
  }
  catch (error: any) {
    config.value = null
    setError(String(error?.data?.message || '飞书配置加载失败。'))
  }
  finally {
    loadingConfig.value = false
  }
}

async function loadAdminOverview() {
  if (!canManageConfig.value) {
    adminOverview.value = null
    return
  }

  adminOverviewLoading.value = true
  try {
    adminOverview.value = await requestApi<FeishuAdminOverview>(endpoint('/admin/integrations/feishu/admin-overview'), {}, '管理员概览加载失败。')
  }
  catch (error: any) {
    adminOverview.value = null
    setError(String(error?.data?.message || '管理员概览加载失败。'))
  }
  finally {
    adminOverviewLoading.value = false
  }
}

async function loadSyncs() {
  if (!canManageBitable.value) {
    syncs.value = []
    return
  }

  loadingSyncs.value = true
  try {
    const query = showArchivedSyncs.value ? '?includeArchived=true' : ''
    syncs.value = await requestApi<FeishuBitableSync[]>(
      endpoint(`/admin/integrations/feishu/bitable-syncs${query}`),
      {},
      '多维同步信息加载失败。',
    ) || []

    pruneExpandedSyncPreviewState(syncs.value.map(sync => String(sync.id || '').trim()))
    for (const syncId of expandedSyncKeys.value) {
      const target = syncs.value.find(sync => sync.id === syncId)
      if (target)
        void loadExpandedSyncDetail(target, true)
    }
  }
  catch (error: any) {
    syncs.value = []
    pruneExpandedSyncPreviewState([])
    setError(String(error?.data?.message || '多维同步信息加载失败。'))
  }
  finally {
    loadingSyncs.value = false
  }
}

async function loadBitableTablesAndViews() {
  if (!canManageBitable.value)
    return

  const appToken = String(createSyncForm.appToken || '').trim()
  const tableId = String(createSyncForm.tableId || '').trim()
  if (!appToken) {
    setError('请先填写 appToken，再加载表和视图列表。')
    return
  }

  sourceViewsLoading.value = true
  try {
    sourceTables.value = await requestApi<FeishuBitableTableMeta[]>(
      endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables`),
      {},
      '加载表/视图失败。',
    ) || []

    if (!tableId) {
      sourceViews.value = []
      onTableIdChanged()
      setSuccess(`已加载 ${sourceTables.value.length} 个子表，请先选择子表后再加载视图。`)
      return
    }

    const viewsPayload = await requestApi<SourceViewsPayload>(
      endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`),
      {},
      '加载表/视图失败。',
    )
    sourceViews.value = viewsPayload.views || []
    onTableIdChanged(true)
    onViewIdChanged()
    setSuccess(`已加载 ${sourceTables.value.length} 个子表、${sourceViews.value.length} 个视图。`)
  }
  catch (error: any) {
    sourceTables.value = []
    sourceViews.value = []
    setError(String(error?.data?.message || '加载表/视图失败。'))
  }
  finally {
    sourceViewsLoading.value = false
  }
}

async function resolveBitableSourceInput() {
  if (!canManageBitable.value)
    return

  const sourceInput = String(createSyncForm.sourceInput || '').trim()
  if (!sourceInput) {
    setError('请先粘贴飞书多维链接或 appToken/tableId 信息。')
    return
  }

  sourceResolveLoading.value = true
  try {
    const source = await requestApi<FeishuBitableSourceConfig>(
      endpoint('/admin/integrations/feishu/bitable/sources/resolve'),
      {
        method: 'POST',
        body: {
          input: sourceInput,
        },
      },
      '来源解析失败。',
    )
    createSyncForm.appToken = source.appToken || ''
    createSyncForm.tableId = source.tableId || ''
    createSyncForm.viewId = source.viewId || ''
    createSyncForm.appName = source.appName || ''
    createSyncForm.tableName = source.tableName || ''
    createSyncForm.viewName = source.viewName || ''
    createSyncForm.sourceUrl = source.sourceUrl || createSyncForm.sourceUrl
    setSuccess('已解析飞书来源信息。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '来源解析失败。'))
  }
  finally {
    sourceResolveLoading.value = false
  }
}

async function saveConfig() {
  if (!canManageConfig.value)
    return

  clearFeedback()
  if (configForm.appSecretMode === 'replace' && !String(configForm.appSecret || '').trim()) {
    setError('已选择替换 App Secret，请输入新值。')
    return
  }
  if (configForm.eventTokenMode === 'replace' && !String(configForm.eventToken || '').trim()) {
    setError('已选择替换 Event Token，请输入新值。')
    return
  }
  if (configForm.eventEncryptKeyMode === 'replace' && !String(configForm.eventEncryptKey || '').trim()) {
    setError('已选择替换 Event Encrypt Key，请输入新值。')
    return
  }
  if (configForm.startupNotifyEnabled && !String(configForm.startupNotifyChatId || '').trim()) {
    setError('已启用启动通知，请填写群 chat_id。')
    return
  }

  savingConfig.value = true
  try {
    const data = await requestApi<FeishuIntegrationConfig>(
      endpoint('/admin/integrations/feishu/config'),
      {
        method: 'PATCH',
        body: {
          enabled: configForm.enabled,
          appId: configForm.appId.trim(),
          marketplaceAppUrl: configForm.marketplaceAppUrl.trim(),
          oauthRedirectUri: configForm.oauthRedirectUri.trim(),
          adminGroupIds: parseMultilineList(configForm.adminGroupIdsText),
          webSdkScriptUrl: configForm.webSdkScriptUrl.trim(),
          startupNotifyEnabled: configForm.startupNotifyEnabled,
          startupNotifyChatId: configForm.startupNotifyChatId.trim(),
          startupNotifyRemark: configForm.startupNotifyRemark.trim(),
          appSecretMode: configForm.appSecretMode,
          appSecret: configForm.appSecret,
          eventTokenMode: configForm.eventTokenMode,
          eventToken: configForm.eventToken,
          eventEncryptKeyMode: configForm.eventEncryptKeyMode,
          eventEncryptKey: configForm.eventEncryptKey,
        },
      },
      '飞书配置保存失败。',
    )

    config.value = data
    fillConfigForm(data)
    configDialogVisible.value = false
    setSuccess('飞书集成配置已保存。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '飞书配置保存失败。'))
  }
  finally {
    savingConfig.value = false
  }
}

async function testStartupNotify() {
  if (!canManageConfig.value)
    return

  clearStartupNotifyTestFeedback()
  const chatId = String(configForm.startupNotifyChatId || '').trim()
  if (!chatId) {
    startupNotifyTestErrorText.value = '请先填写群 chat_id，再执行测试。'
    return
  }

  testingStartupNotify.value = true
  try {
    const data = await requestApi<{
      chatId: string
      version: string
      commitSha: string
      testedAt: string
    }>(
      endpoint('/admin/integrations/feishu/startup-notify/test'),
      {
        method: 'POST',
        body: {
          chatId,
          remark: configForm.startupNotifyRemark.trim(),
        },
      },
      '启动通知测试失败。',
    )

    startupNotifyTestSuccessText.value = `测试消息已发送到 ${data.chatId}（版本 ${data.version} / Commit ${data.commitSha}）。`
  }
  catch (error: any) {
    startupNotifyTestErrorText.value = String(error?.data?.message || '启动通知测试失败。')
  }
  finally {
    testingStartupNotify.value = false
  }
}

async function loadStartupNotifyChatOptions(keyword = '') {
  if (!canManageConfig.value) {
    startupNotifyChatOptions.value = []
    return
  }

  const normalizedKeyword = String(keyword || '').trim()
  const selectedChatId = String(configForm.startupNotifyChatId || '').trim()
  const query = new URLSearchParams()
  if (normalizedKeyword)
    query.set('keyword', normalizedKeyword)
  if (selectedChatId)
    query.set('chatId', selectedChatId)
  query.set('limit', normalizedKeyword ? '20' : '10')

  const currentSequence = ++startupNotifyChatSearchSequence
  startupNotifyChatOptionsLoading.value = true
  try {
    const data = await requestApi<FeishuChatCandidate[]>(
      endpoint(`/admin/integrations/feishu/startup-groups/search?${query.toString()}`),
      {},
      '飞书群列表加载失败。',
    )
    if (currentSequence !== startupNotifyChatSearchSequence)
      return
    startupNotifyChatOptions.value = normalizeStartupNotifyChatOptions(data || [], selectedChatId)
  }
  catch (error: any) {
    if (currentSequence !== startupNotifyChatSearchSequence)
      return
    startupNotifyChatOptions.value = normalizeStartupNotifyChatOptions([], selectedChatId)
    setError(String(error?.data?.message || '飞书群列表加载失败。'))
  }
  finally {
    if (currentSequence === startupNotifyChatSearchSequence)
      startupNotifyChatOptionsLoading.value = false
  }
}

function openStartupNotifyChatPicker() {
  startupNotifyChatPickerVisible.value = true
  if (startupNotifyChatOptions.value.length > 0)
    return
  void loadStartupNotifyChatOptions(startupNotifyChatSearchKeyword.value)
}

function searchStartupNotifyChats() {
  void loadStartupNotifyChatOptions(startupNotifyChatSearchKeyword.value)
}

function resetStartupNotifyChatSearch() {
  startupNotifyChatSearchKeyword.value = ''
  void loadStartupNotifyChatOptions()
}

function selectStartupNotifyChat(item: FeishuChatCandidate) {
  const chatId = String(item.chatId || '').trim()
  if (!chatId)
    return
  configForm.startupNotifyChatId = chatId
  startupNotifyChatOptions.value = normalizeStartupNotifyChatOptions([item, ...startupNotifyChatOptions.value], chatId)
  startupNotifyChatPickerVisible.value = false
}

function openCreateSyncDrawer() {
  resetCreateSyncForm()
  createSourceMode.value = 'url'
  createSyncDrawerVisible.value = true
}

function resetSyncConfigImportState() {
  syncConfigImportUrl.value = ''
  syncConfigImportPreview.value = null
  syncConfigImportErrorText.value = ''
}

function openSyncConfigImportDrawer() {
  clearFeedback()
  resetSyncConfigImportState()
  syncConfigImportDrawerVisible.value = true
}

function syncConfigShareFor(sync: FeishuBitableSync): FeishuBitableSyncConfigShare | null {
  const syncId = String(sync.id || '').trim()
  return syncId ? syncConfigShares[syncId] || null : null
}

function syncConfigEntityTypeText(summary?: FeishuBitableSyncConfigPackageSummary | null): string {
  const entityTypes = summary?.entityTypes || []
  if (!entityTypes.length)
    return '无子表实体'
  return entityTypes.map(item => syncItemEntityTypeLabel(item)).join('、')
}

function extractShareKeyFromConfigUrl(rawUrl: string): string {
  const url = String(rawUrl || '').trim()
  if (!url)
    return ''
  const match = url.match(/\/bitable-sync-config\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1] || '') : ''
}

async function copyTextToClipboard(text: string): Promise<void> {
  const value = String(text || '').trim()
  if (!value || !import.meta.client)
    return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function downloadJsonFile(filename: string, payload: unknown) {
  if (!import.meta.client)
    return
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function resetEditSyncDrawerState() {
  editingSyncId.value = ''
  editingSelectedItemId.value = ''
  editingDraftTableId.value = ''
  editingDraftViewId.value = ''
  editingSyncIncludeArchived.value = false
}

function openEditSyncDrawer(syncId: string, options?: { selectedItemId?: string, draftTableId?: string, draftViewId?: string, includeArchived?: boolean }) {
  editingSyncId.value = String(syncId || '').trim()
  editingSelectedItemId.value = String(options?.selectedItemId || '').trim()
  editingDraftTableId.value = String(options?.draftTableId || '').trim()
  editingDraftViewId.value = String(options?.draftViewId || '').trim()
  editingSyncIncludeArchived.value = options?.includeArchived === true
  editSyncDrawerVisible.value = Boolean(editingSyncId.value)
}

function openConfigDialog() {
  clearFeedback()
  clearStartupNotifyTestFeedback()
  configDialogVisible.value = true
  void Promise.allSettled([
    loadAdminOverview(),
    loadFeishuDirectoryBrowser(),
    loadStartupNotifyChatOptions(),
  ])
}

async function createSync() {
  if (!canManageBitable.value)
    return

  clearFeedback()
  const resolvedSource = buildCreateSourceConfig()
  const appToken = resolvedSource.appToken.trim()
  const name = createSyncForm.name.trim() || buildSuggestedCreateSyncName()
  if (!appToken) {
    setError('新增同步信息时，主库 appToken 为必填。')
    return
  }

  creatingSync.value = true
  try {
    const createdSync = await requestApi<FeishuBitableSync>(
      endpoint('/admin/integrations/feishu/bitable-syncs'),
      {
        method: 'POST',
        body: {
          name,
          source: {
            ...resolvedSource,
            appToken,
          },
        },
      },
      '多维同步信息创建失败。',
    )
    const draftTableId = createSyncForm.tableId.trim()
    const draftViewId = createSyncForm.viewId.trim()
    createSyncDrawerVisible.value = false
    await loadSyncs()
    await nextTick()
    openEditSyncDrawer(createdSync.id, {
      draftTableId,
      draftViewId,
    })
    setSuccess('多维同步信息已创建，请继续在编辑抽屉里配置子表同步项。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '多维同步信息创建失败。'))
  }
  finally {
    creatingSync.value = false
  }
}

async function refreshSyncList() {
  await loadSyncs()
}

async function downloadSyncConfigPackage(sync: FeishuBitableSync) {
  if (!canManageBitable.value)
    return

  const syncId = String(sync.id || '').trim()
  if (!syncId)
    return

  clearFeedback()
  try {
    const pkg = await requestApi<FeishuBitableSyncConfigPackage>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}/config-package`),
      {},
      '同步配置包导出失败。',
    )
    const safeName = String(sync.name || syncId).replace(/[^\w\u4E00-\u9FA5.-]+/g, '-')
    downloadJsonFile(`feishu-bitable-sync-config-${safeName}.json`, pkg)
    setSuccess(`同步信息“${sync.name || syncId}”配置包已导出。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '同步配置包导出失败。'))
  }
}

async function createSyncConfigShare(sync: FeishuBitableSync) {
  if (!canManageBitable.value)
    return

  const syncId = String(sync.id || '').trim()
  if (!syncId)
    return

  syncConfigShareMutating[syncId] = true
  clearFeedback()
  try {
    const share = await requestApi<FeishuBitableSyncConfigShare>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}/config-share`),
      {
        method: 'POST',
      },
      '公网配置创建失败。',
    )
    syncConfigShares[syncId] = share
    setSuccess(`公网配置已创建，默认有效至 ${formatDateTime(share.expiresAt)}。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '公网配置创建失败。'))
  }
  finally {
    syncConfigShareMutating[syncId] = false
  }
}

async function copySyncConfigShareUrl(sync: FeishuBitableSync) {
  const share = syncConfigShareFor(sync)
  if (!share?.shareUrl) {
    setError('请先创建公网配置，再复制链接。')
    return
  }
  try {
    await copyTextToClipboard(share.shareUrl)
    setSuccess('公网配置链接已复制。')
  }
  catch {
    setError('公网配置链接复制失败，请手动复制。')
  }
}

async function revokeSyncConfigShare(sync: FeishuBitableSync) {
  if (!canManageBitable.value)
    return

  const syncId = String(sync.id || '').trim()
  if (!syncId)
    return

  syncConfigShareMutating[syncId] = true
  clearFeedback()
  try {
    await requestApi<{ revokedCount: number }>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}/config-share`),
      {
        method: 'DELETE',
        body: {
          shareKey: syncConfigShareFor(sync)?.shareKey || '',
        },
      },
      '公网配置撤销失败。',
    )
    syncConfigShares[syncId] = null
    setSuccess(`同步信息“${sync.name || syncId}”的公网配置已撤销。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '公网配置撤销失败。'))
  }
  finally {
    syncConfigShareMutating[syncId] = false
  }
}

async function previewSyncConfigImport() {
  if (!canManageBitable.value)
    return

  const url = syncConfigImportUrl.value.trim()
  if (!url) {
    syncConfigImportErrorText.value = '请先填写公网配置 URL。'
    return
  }

  syncConfigImportLoading.value = true
  syncConfigImportErrorText.value = ''
  syncConfigImportPreview.value = null
  try {
    syncConfigImportPreview.value = await requestApi<FeishuBitableSyncConfigImportPreview>(
      endpoint('/admin/integrations/feishu/bitable-syncs/config-import/preview'),
      {
        method: 'POST',
        body: { url },
      },
      '配置包预览失败。',
    )
  }
  catch (error: any) {
    syncConfigImportErrorText.value = String(error?.data?.message || '配置包预览失败。')
  }
  finally {
    syncConfigImportLoading.value = false
  }
}

async function confirmSyncConfigImport() {
  if (!canManageBitable.value)
    return

  if (!syncConfigImportPreview.value)
    await previewSyncConfigImport()
  if (!syncConfigImportPreview.value)
    return

  syncConfigImporting.value = true
  syncConfigImportErrorText.value = ''
  try {
    const result = await requestApi<FeishuBitableSyncConfigImportResult>(
      endpoint('/admin/integrations/feishu/bitable-syncs/config-import/import'),
      {
        method: 'POST',
        body: {
          url: syncConfigImportUrl.value.trim(),
          shareKey: extractShareKeyFromConfigUrl(syncConfigImportUrl.value),
          package: syncConfigImportPreview.value.package,
        },
      },
      '配置包导入失败。',
    )
    syncConfigImportDrawerVisible.value = false
    await loadSyncs()
    await nextTick()
    openEditSyncDrawer(result.sync.id, {
      includeArchived: false,
    })
    setSuccess(`配置包已导入为“${result.sync.name}”，主同步、子表和调度均保持禁用，请先预检并手动执行。`)
  }
  catch (error: any) {
    syncConfigImportErrorText.value = String(error?.data?.message || '配置包导入失败。')
  }
  finally {
    syncConfigImporting.value = false
  }
}

async function toggleSyncEnabled(sync: FeishuBitableSync, enabled: boolean) {
  if (!canManageBitable.value || sync.archivedAt)
    return

  const syncId = String(sync.id || '').trim()
  if (!syncId)
    return

  syncToggleMutating[syncId] = true
  clearFeedback()
  try {
    await requestApi<unknown>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}`),
      {
        method: 'PATCH',
        body: {
          enabled,
        },
      },
      `同步信息${enabled ? '启用' : '禁用'}失败。`,
    )
    await loadSyncs()
    setSuccess(`同步信息“${sync.name || syncId}”已${enabled ? '启用' : '禁用'}。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || `同步信息${enabled ? '启用' : '禁用'}失败。`))
  }
  finally {
    syncToggleMutating[syncId] = false
  }
}

async function archiveSync(sync: FeishuBitableSync) {
  if (!canManageBitable.value)
    return

  const syncId = String(sync.id || '').trim()
  if (!syncId)
    return

  archivingSyncMutating[syncId] = true
  clearFeedback()
  try {
    await requestApi<unknown>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}/archive`),
      {
        method: 'POST',
      },
      '同步信息归档失败。',
    )

    if (editingSyncId.value === syncId)
      editSyncDrawerVisible.value = false

    await loadSyncs()
    setSuccess(`同步信息“${sync.name || syncId}”已归档，已自动停用全部子表同步项与定时调度。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '同步信息归档失败。'))
  }
  finally {
    archivingSyncMutating[syncId] = false
  }
}

async function restoreSync(sync: FeishuBitableSync) {
  if (!canManageBitable.value)
    return

  const syncId = String(sync.id || '').trim()
  if (!syncId)
    return

  restoringSyncMutating[syncId] = true
  clearFeedback()
  try {
    await requestApi<unknown>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(syncId)}/restore`),
      {
        method: 'POST',
      },
      '同步信息恢复失败。',
    )

    await loadSyncs()
    setSuccess(`同步信息“${sync.name || syncId}”已恢复。为避免误触发，子表同步项与定时调度仍保持停用，请按需手动重新启用。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '同步信息恢复失败。'))
  }
  finally {
    restoringSyncMutating[syncId] = false
  }
}

watch(editSyncDrawerVisible, (visible, oldVisible) => {
  if (visible || !oldVisible)
    return
  resetEditSyncDrawerState()
  void refreshSyncList()
})

watch(expandedSyncKeys, (currentKeys, previousKeys) => {
  const previousKeySet = new Set(previousKeys)
  for (const syncId of currentKeys) {
    if (previousKeySet.has(syncId))
      continue
    const target = syncs.value.find(sync => sync.id === syncId)
    if (target)
      void loadExpandedSyncDetail(target)
  }
})

async function manualAddContestAdmin(targetUserId: string) {
  if (!canManageConfig.value || !targetUserId)
    return

  manualAddingKey.value = `user:${targetUserId}`
  clearFeedback()
  try {
    const data = await requestApi<FeishuAdminManualAddResult>(
      endpoint('/admin/integrations/feishu/admin-members/manual-add'),
      {
        method: 'POST',
        body: {
          targetUserId,
        },
      },
      '手动添加管理员失败。',
    )

    setSuccess(data.granted
      ? `已添加 ${data.username} 为 contest_admin。`
      : `${data.username} 已经是 contest_admin。`)
    await Promise.all([
      loadAdminOverview(),
      loadFeishuDirectoryBrowser(true),
    ])
  }
  catch (error: any) {
    setError(String(error?.data?.message || '手动添加管理员失败。'))
  }
  finally {
    manualAddingKey.value = ''
  }
}

async function manualAddContestAdminByUnionId(unionId: string) {
  if (!canManageConfig.value || !unionId)
    return

  manualAddingKey.value = `union:${unionId}`
  clearFeedback()
  try {
    const data = await requestApi<FeishuAdminManualAddResult>(
      endpoint('/admin/integrations/feishu/admin-members/manual-add'),
      {
        method: 'POST',
        body: {
          targetUnionId: unionId,
        },
      },
      '按飞书成员添加管理员失败。',
    )

    setSuccess(data.granted
      ? `已添加 ${data.username} 为 contest_admin。`
      : `${data.username} 已经是 contest_admin。`)
    await Promise.all([
      loadAdminOverview(),
      loadFeishuDirectoryBrowser(true),
    ])
  }
  catch (error: any) {
    setError(String(error?.data?.message || '按飞书成员添加管理员失败。'))
  }
  finally {
    manualAddingKey.value = ''
  }
}

async function initializePage() {
  clearFeedback()
  if (!isOverviewRoute.value)
    return
  await loadPermissions()
  if (!canAccessPage.value)
    return

  await Promise.all([
    loadConfig(),
    loadSyncs(),
  ])
}

watch(
  () => isOverviewRoute.value,
  (value, previousValue) => {
    if (value && !previousValue)
      void initializePage()
  },
)

onMounted(initializePage)
</script>

<template>
  <div class="text-[11px] space-y-3">
    <template v-if="isOverviewRoute">
      <section v-if="loadingAny" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>

      <template v-else>
        <section
          v-if="errorText"
          class="text-rose-600 p-3 border border-rose-200 bg-rose-50"
        >
          {{ errorText }}
        </section>
        <section
          v-if="successText"
          class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50"
        >
          {{ successText }}
        </section>

        <section
          v-if="!canAccessPage"
          class="text-rose-600 p-3 border border-rose-200 bg-rose-50"
        >
          403：当前账号无飞书集成权限。需要 `role.assign` 或 `contest.write`。
        </section>

        <template v-else>
          <section v-if="canReadSyncedData" class="p-3 border border-slate-200 bg-white flex flex-wrap gap-2 items-center justify-between">
            <div>
              <h2 class="text-[12px] text-slate-900 font-semibold m-0">
                飞书同步数据
              </h2>
              <p class="text-[10px] text-slate-500 m-0 mt-1">
                浏览飞书导入后的索引、映射和待审草稿。
              </p>
            </div>
            <a-button size="small" type="primary" @click="openSyncedData()">
              查看所有已同步的数据
            </a-button>
          </section>

          <section v-if="canManageConfig" class="p-3 border border-slate-200 bg-white space-y-3">
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <div>
                <h2 class="text-[12px] text-slate-900 font-semibold m-0">
                  飞书集成配置
                </h2>
                <p class="text-[10px] text-slate-500 m-0 mt-1">
                  `role.assign` 权限可维护 OAuth、事件回调与管理员手动授权配置。
                </p>
              </div>
              <div class="flex flex-wrap gap-2 items-center">
                <a-button size="small" type="primary" @click="openConfigDialog">
                  打开配置
                </a-button>
              </div>
            </div>

            <div class="text-[10px] text-slate-600 p-3 border border-slate-200 bg-slate-50 space-y-1">
              <p class="m-0">
                当前状态：{{ config?.enabled ? '已启用' : '未启用' }}，App ID：{{ config?.appId || '-' }}
              </p>
              <p class="m-0">
                当前生效版本：{{ config?.startupEffectiveVersion || '-' }}；
                Commit：{{ config?.startupEffectiveCommitSha || '-' }}
              </p>
              <p class="text-slate-500 m-0">
                版本来源：{{ buildValueSourceLabel(config?.startupVersionSource) }}；
                Commit 来源：{{ buildValueSourceLabel(config?.startupCommitShaSource) }}
              </p>
              <p class="m-0">
                App Secret：{{ config?.appSecretConfigured ? '已配置' : '未配置' }}；
                Event Token：{{ config?.eventTokenConfigured ? '已配置' : '未配置' }}；
                Event Encrypt Key：{{ config?.eventEncryptKeyConfigured ? '已配置' : '未配置' }}
              </p>
              <p v-if="config?.updatedAt" class="m-0">
                最近更新：{{ config.updatedAt }}（{{ config.updatedByUserId || 'unknown' }}）
              </p>
            </div>
          </section>

          <section v-if="canManageBitable" class="p-3 border border-slate-200 bg-white space-y-3">
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <div>
                <h2 class="text-[12px] text-slate-900 font-semibold m-0">
                  多维表格同步信息
                </h2>
                <p class="text-[10px] text-slate-500 m-0 mt-1">
                  一条记录代表一个飞书多维主库。创建后直接在编辑抽屉里继续配置多个子表同步项与字段映射。
                </p>
              </div>
              <div class="flex gap-3 items-center">
                <label class="text-[10px] text-slate-500 flex gap-2 items-center">
                  <a-switch v-model="showArchivedSyncs" size="small" @change="refreshSyncList" />
                  <span>显示已归档</span>
                </label>
                <a-button size="small" @click="openSyncConfigImportDrawer">
                  从配置 URL 导入
                </a-button>
                <a-button size="small" type="primary" @click="openCreateSyncDrawer">
                  新建同步信息
                </a-button>
                <a-button size="small" :loading="loadingSyncs" @click="refreshSyncList">
                  刷新
                </a-button>
              </div>
            </div>

            <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-4">
              <div
                v-for="step in CREATE_SYNC_MILESTONES"
                :key="step.step"
                class="p-3 border border-slate-200 bg-slate-50"
              >
                <p class="text-[10px] text-slate-400 tracking-[0.18em] font-medium m-0 uppercase">
                  {{ step.step }}
                </p>
                <p class="text-[11px] text-slate-900 font-semibold m-0 mt-2">
                  {{ step.title }}
                </p>
                <p class="text-[10px] text-slate-500 leading-5 m-0 mt-1">
                  {{ step.description }}
                </p>
              </div>
            </div>

            <a-table
              v-model:expanded-keys="expandedSyncKeys"
              :columns="syncColumns"
              :data="syncs"
              :pagination="false"
              row-key="id"
              size="small"
              :bordered="{ cell: true }"
              :expandable="{ width: 48 }"
              @expand="handleSyncRowExpand"
            >
              <template #name="{ record }">
                <div class="min-w-0">
                  <div class="flex gap-2 min-w-0 items-center">
                    <p class="text-[11px] text-slate-900 font-semibold m-0 truncate">
                      {{ record.name }}
                    </p>
                    <a-tag v-if="record.source?.environment" :color="syncEnvironmentTagColor(record.source.environment)" size="small">
                      {{ syncEnvironmentLabel(record.source.environment) }}
                    </a-tag>
                    <a-tag v-if="!record.enabled && !record.archivedAt" color="gold" size="small">
                      已禁用
                    </a-tag>
                    <a-tag v-if="record.archivedAt" color="gray" size="small">
                      已归档
                    </a-tag>
                  </div>
                  <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                    {{ record.id }}
                  </p>
                  <p v-if="record.archivedAt" class="text-[10px] text-slate-400 m-0 mt-1">
                    归档时间：{{ formatDateTime(record.archivedAt) }}
                  </p>
                </div>
              </template>

              <template #source="{ record }">
                <p class="text-[10px] text-slate-600 font-mono m-0">
                  {{ record.source?.appName || record.source?.appToken }}
                </p>
                <p class="text-[10px] text-slate-500 m-0 mt-1">
                  环境：{{ syncEnvironmentLabel(record.source?.environment) }}
                </p>
                <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 break-all">
                  {{ record.source?.appToken || '-' }}
                </p>
              </template>

              <template #itemCount="{ record }">
                <div class="space-y-1">
                  <div class="flex flex-wrap gap-1">
                    <a-tag color="arcoblue" size="small">
                      {{ record.itemCount }} 个子表项
                    </a-tag>
                    <a-tag :color="record.enabled ? 'green' : 'gold'" size="small">
                      {{ syncEnabledItemSummary(record) }}
                    </a-tag>
                    <a-tag :color="syncProgressStageColor(record)" size="small">
                      {{ syncProgressStageLabel(record) }}
                    </a-tag>
                  </div>
                  <p class="text-[10px] text-slate-500 m-0">
                    {{ syncProgressSummary(record) }}
                  </p>
                  <p class="text-[10px] text-slate-400 m-0">
                    下一步：{{ syncNextActionText(record) }}
                  </p>
                  <a-button size="mini" type="text" class="!px-0" @click.stop="toggleSyncExpanded(record)">
                    {{ expandedSyncKeys.includes(record.id) ? '收起子项' : '展开查看' }}
                  </a-button>
                </div>
              </template>

              <template #latestRun="{ record }">
                <div>
                  <p class="text-[10px] text-slate-700 m-0">
                    {{ syncLatestRunSummary(record) }}
                  </p>
                  <p class="text-[10px] text-slate-400 m-0 mt-1">
                    更新时间：{{ formatDateTime(record.updatedAt) }}
                  </p>
                </div>
              </template>

              <template #schedule="{ record }">
                <div class="space-y-1">
                  <a-tag :color="syncScheduleStatusColor(record)" size="small">
                    {{ syncScheduleStatusLabel(record) }}
                  </a-tag>
                  <p class="text-[10px] text-slate-500 m-0">
                    模式：{{ scheduleModeLabel(record.schedule?.mode) }}
                  </p>
                  <p class="text-[10px] text-slate-500 m-0">
                    下次：{{ formatDateTime(record.scheduleRuntime?.nextRunAt) }}
                  </p>
                  <p v-if="record.scheduleRuntime?.lastError" class="text-[10px] text-rose-500 m-0 break-all">
                    错误：{{ record.scheduleRuntime.lastError }}
                  </p>
                </div>
              </template>

              <template #issueStats="{ record }">
                <a-tag :color="record.issueStats.open ? 'red' : 'gray'" size="small">
                  待处理 {{ record.issueStats.open }}
                </a-tag>
              </template>

              <template #updatedAt="{ record }">
                <div>
                  <p class="text-[10px] text-slate-700 m-0">
                    {{ formatDateTime(record.updatedAt) }}
                  </p>
                  <p v-if="record.archivedAt" class="text-[10px] text-slate-400 m-0 mt-1">
                    已归档
                  </p>
                </div>
              </template>

              <template #actions="{ record }">
                <div class="flex flex-wrap gap-1">
                  <a-button
                    v-if="canReadSyncedData"
                    size="mini"
                    :data-sync-data-link="buildSyncedDataLink({ syncId: record.id })"
                    @click="openSyncedData({ syncId: record.id })"
                  >
                    查看同步数据
                  </a-button>
                  <a-button
                    size="mini"
                    type="primary"
                    :disabled="archivingSyncMutating[record.id] || restoringSyncMutating[record.id] || syncToggleMutating[record.id]"
                    @click="openEditSyncDrawer(record.id, { includeArchived: Boolean(record.archivedAt) })"
                  >
                    {{ record.archivedAt ? '查看同步信息' : '编辑同步信息' }}
                  </a-button>
                  <a-button size="mini" @click="downloadSyncConfigPackage(record)">
                    导出配置
                  </a-button>
                  <a-button
                    size="mini"
                    :loading="syncConfigShareMutating[record.id]"
                    @click="createSyncConfigShare(record)"
                  >
                    创建公网配置
                  </a-button>
                  <a-button
                    size="mini"
                    :disabled="!syncConfigShareFor(record)"
                    @click="copySyncConfigShareUrl(record)"
                  >
                    复制公网配置
                  </a-button>
                  <a-popconfirm
                    content="确认撤销该同步信息的公网配置链接吗？撤销后已有链接将无法继续导入。"
                    type="warning"
                    @ok="revokeSyncConfigShare(record)"
                  >
                    <a-button
                      size="mini"
                      :disabled="syncConfigShareMutating[record.id]"
                    >
                      撤销公网配置
                    </a-button>
                  </a-popconfirm>
                  <a-button
                    v-if="!record.archivedAt"
                    size="mini"
                    :type="record.enabled ? 'outline' : 'primary'"
                    :status="record.enabled ? 'warning' : 'success'"
                    :loading="syncToggleMutating[record.id]"
                    :disabled="archivingSyncMutating[record.id] || restoringSyncMutating[record.id]"
                    @click="toggleSyncEnabled(record, !record.enabled)"
                  >
                    {{ record.enabled ? '禁用' : '启用' }}
                  </a-button>
                  <a-popconfirm
                    v-if="!record.archivedAt"
                    content="确认归档该同步信息吗？归档后会自动停用全部子表同步项与定时调度，列表默认不再展示。"
                    type="warning"
                    @ok="archiveSync(record)"
                  >
                    <a-button
                      size="mini"
                      status="danger"
                      :loading="archivingSyncMutating[record.id]"
                      :disabled="restoringSyncMutating[record.id] || syncToggleMutating[record.id]"
                    >
                      归档
                    </a-button>
                  </a-popconfirm>
                  <a-popconfirm
                    v-else
                    content="确认恢复该同步信息吗？恢复后只会恢复主记录本身，子表同步项与定时调度仍保持停用，需要手动重新启用。"
                    type="warning"
                    @ok="restoreSync(record)"
                  >
                    <a-button
                      size="mini"
                      :loading="restoringSyncMutating[record.id]"
                      :disabled="archivingSyncMutating[record.id] || syncToggleMutating[record.id]"
                    >
                      恢复归档
                    </a-button>
                  </a-popconfirm>
                </div>
              </template>

              <template #expand-row="{ record: syncRecord }">
                <div class="p-3 bg-slate-50 space-y-3">
                  <div class="flex flex-wrap gap-2 items-center justify-between">
                    <div>
                      <p class="text-[11px] text-slate-900 font-semibold m-0">
                        子表同步项快速预览
                      </p>
                      <p class="text-[10px] text-slate-500 m-0 mt-1">
                        这里展示当前主同步下的子表同步项、运行状态和调度概况。
                      </p>
                    </div>
                    <a-button
                      size="mini"
                      type="outline"
                      @click="openEditSyncDrawer(syncRecord.id, { includeArchived: Boolean(syncRecord.archivedAt) })"
                    >
                      进入完整编辑
                    </a-button>
                  </div>

                  <section v-if="expandedSyncLoading[syncRecord.id]" class="p-3 border border-slate-200 bg-white">
                    <a-skeleton :animation="true">
                      <a-skeleton-line :rows="4" />
                    </a-skeleton>
                  </section>

                  <section
                    v-else-if="expandedSyncErrors[syncRecord.id]"
                    class="p-3 border border-rose-200 bg-rose-50 flex flex-wrap gap-2 items-center justify-between"
                  >
                    <p class="text-[10px] text-rose-600 m-0">
                      {{ expandedSyncErrors[syncRecord.id] }}
                    </p>
                    <a-button size="mini" status="danger" @click="loadExpandedSyncDetail(syncRecord, true)">
                      重试
                    </a-button>
                  </section>

                  <template v-else-if="expandedSyncDetails[syncRecord.id]?.items?.length">
                    <div class="text-[10px] text-slate-500 flex flex-wrap gap-2 items-center">
                      <span>共 {{ expandedSyncDetails[syncRecord.id]?.items?.length || 0 }} 个子表同步项</span>
                      <span>已启用 {{ expandedSyncDetails[syncRecord.id]?.items?.filter(item => item.isEnabled).length || 0 }} 个</span>
                    </div>

                    <a-table
                      :columns="syncItemPreviewColumns"
                      :data="expandedSyncDetails[syncRecord.id]?.items || []"
                      :pagination="false"
                      row-key="id"
                      size="small"
                      :bordered="{ cell: true }"
                    >
                      <template #itemName="{ record: item }">
                        <div class="min-w-0">
                          <div class="flex flex-wrap gap-2 items-center">
                            <p class="text-[10px] text-slate-900 font-semibold m-0">
                              {{ item.name }}
                            </p>
                            <a-tag size="small" color="arcoblue">
                              {{ syncItemEntityTypeLabel(item.entityType) }}
                            </a-tag>
                            <a-tag v-if="!item.isEnabled" size="small" color="gray">
                              已禁用
                            </a-tag>
                            <a-tag v-else-if="!syncRecord.enabled" size="small" color="gold">
                              受主同步影响
                            </a-tag>
                          </div>
                          <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 break-all">
                            {{ item.id }}
                          </p>
                        </div>
                      </template>

                      <template #itemSource="{ record: item }">
                        <div>
                          <p class="text-[10px] text-slate-700 m-0">
                            {{ item.source?.tableName || item.tableId || '-' }}
                            <span class="text-slate-400"> / </span>
                            {{ item.source?.viewName || item.viewId || '-' }}
                          </p>
                          <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 break-all">
                            {{ item.tableId || '-' }}
                          </p>
                        </div>
                      </template>

                      <template #itemStatus="{ record: item }">
                        <div class="space-y-1">
                          <label class="text-[10px] text-slate-500 flex gap-2 items-center">
                            <span>启用</span>
                            <a-switch
                              :model-value="item.isEnabled"
                              size="small"
                              :loading="syncItemToggleMutating[item.id]"
                              :disabled="Boolean(syncRecord.archivedAt)"
                              @change="(value) => toggleExpandedSyncItemEnabled(syncRecord, item, Boolean(value))"
                            />
                          </label>
                          <a-tag v-if="!syncRecord.enabled" size="small" color="gold">
                            主同步已禁用
                          </a-tag>
                        </div>
                      </template>

                      <template #itemLatestRun="{ record: item }">
                        <div class="space-y-1">
                          <a-tag :color="runHealthColor(item.latestRunSummary)" size="small">
                            {{ runHealthLabel(item.latestRunSummary) }}
                          </a-tag>
                          <p class="text-[10px] text-slate-500 m-0">
                            {{ syncItemLatestRunSummary(item) }}
                          </p>
                          <p v-if="item.latestRunSummary?.errorCount" class="text-[10px] text-rose-500 m-0">
                            最近错误数：{{ item.latestRunSummary.errorCount }}
                          </p>
                        </div>
                      </template>

                      <template #itemSchedule="{ record: item }">
                        <div class="space-y-1">
                          <a-tag :color="syncItemScheduleStatusColor(syncRecord, item)" size="small">
                            {{ syncItemScheduleStatusLabel(syncRecord, item) }}
                          </a-tag>
                          <p class="text-[10px] text-slate-500 m-0">
                            模式：{{ scheduleModeLabel(item.schedule?.mode) }}
                          </p>
                          <p class="text-[10px] text-slate-500 m-0">
                            下次：{{ formatDateTime(item.scheduleRuntime?.nextRunAt) }}
                          </p>
                        </div>
                      </template>

                      <template #itemActions="{ record: item }">
                        <div class="flex flex-wrap gap-2 items-center">
                          <a-button size="mini" type="text" class="!px-0" @click="openSyncItemLogDrawer(syncRecord, item)">
                            执行日志
                          </a-button>
                          <a-button size="mini" type="text" class="!px-0" @click="openSyncItemEditor(syncRecord, item)">
                            进入子项配置
                          </a-button>
                        </div>
                      </template>
                    </a-table>
                  </template>
                </div>
              </template>
            </a-table>
          </section>
        </template>
      </template>
    </template>

    <NuxtPage v-else />

    <a-drawer
      v-model:visible="configDialogVisible"
      title="飞书集成配置"
      :mask-closable="!savingConfig"
      :closable="!savingConfig"
      :esc-to-close="!savingConfig"
      :footer="false"
      width="980px"
    >
      <div class="space-y-3">
        <section class="p-3 border border-slate-200 bg-white space-y-3">
          <div class="space-y-1">
            <h3 class="text-[12px] text-slate-900 font-semibold m-0">
              1. 基础信息配置
            </h3>
            <p class="text-[10px] text-slate-500 m-0">
              维护飞书集成的启用状态、OAuth 回调地址和管理页前端依赖地址。
            </p>
          </div>

          <div class="gap-3 grid md:grid-cols-2">
            <label class="text-[10px] text-slate-600 font-medium block">
              启用状态
              <div class="mt-1 px-3 border border-slate-200 rounded bg-slate-50 flex h-[32px] items-center">
                <a-switch v-model="configForm.enabled" />
              </div>
            </label>

            <label class="text-[10px] text-slate-600 font-medium block">
              App ID
              <a-input v-model="configForm.appId" class="mt-1" allow-clear size="small" placeholder="cli_xxx" />
            </label>

            <label class="text-[10px] text-slate-600 font-medium block">
              商店应用安装地址
              <a-input v-model="configForm.marketplaceAppUrl" class="mt-1" allow-clear size="small" placeholder="https://open.feishu.cn/app/..." />
            </label>

            <label class="text-[10px] text-slate-600 font-medium block md:col-span-2">
              OAuth Redirect URI
              <a-input v-model="configForm.oauthRedirectUri" class="mt-1" allow-clear size="small" placeholder="https://domain/api/auth/feishu/callback" />
            </label>

            <label class="text-[10px] text-slate-600 font-medium block md:col-span-2">
              Web SDK Script URL
              <a-input v-model="configForm.webSdkScriptUrl" class="mt-1" allow-clear size="small" placeholder="https://.../h5-js-sdk.js" />
            </label>
          </div>
        </section>

        <section class="p-3 border border-slate-200 bg-white space-y-3">
          <div class="space-y-1">
            <h3 class="text-[12px] text-slate-900 font-semibold m-0">
              2. 密钥信息配置
            </h3>
            <p class="text-[10px] text-slate-500 m-0">
              统一维护开放平台密钥与事件回调凭证，支持保持、替换和清空三种模式。
            </p>
          </div>

          <div class="gap-3 grid">
            <div class="p-3 border border-slate-200 bg-slate-50 space-y-2">
              <p class="text-[10px] text-slate-700 font-semibold m-0">
                App Secret
              </p>
              <a-radio-group v-model="configForm.appSecretMode" size="small" type="button">
                <a-radio value="keep">
                  保持
                </a-radio>
                <a-radio value="replace">
                  替换
                </a-radio>
                <a-radio value="clear">
                  清空
                </a-radio>
              </a-radio-group>
              <a-input-password
                v-if="configForm.appSecretMode === 'replace'"
                v-model="configForm.appSecret"
                allow-clear
                size="small"
                placeholder="输入新的 App Secret"
              />
            </div>

            <div class="p-3 border border-slate-200 bg-slate-50 space-y-2">
              <p class="text-[10px] text-slate-700 font-semibold m-0">
                Event Token
              </p>
              <a-radio-group v-model="configForm.eventTokenMode" size="small" type="button">
                <a-radio value="keep">
                  保持
                </a-radio>
                <a-radio value="replace">
                  替换
                </a-radio>
                <a-radio value="clear">
                  清空
                </a-radio>
              </a-radio-group>
              <a-input-password
                v-if="configForm.eventTokenMode === 'replace'"
                v-model="configForm.eventToken"
                allow-clear
                size="small"
                placeholder="输入新的 Event Token"
              />
            </div>

            <div class="p-3 border border-slate-200 bg-slate-50 space-y-2">
              <p class="text-[10px] text-slate-700 font-semibold m-0">
                Event Encrypt Key
              </p>
              <a-radio-group v-model="configForm.eventEncryptKeyMode" size="small" type="button">
                <a-radio value="keep">
                  保持
                </a-radio>
                <a-radio value="replace">
                  替换
                </a-radio>
                <a-radio value="clear">
                  清空
                </a-radio>
              </a-radio-group>
              <a-input-password
                v-if="configForm.eventEncryptKeyMode === 'replace'"
                v-model="configForm.eventEncryptKey"
                allow-clear
                size="small"
                placeholder="输入新的 Event Encrypt Key"
              />
            </div>
          </div>

          <div class="text-[10px] text-slate-500 p-3 border border-slate-200 bg-slate-50 space-y-1">
            <p class="m-0">
              App Secret：{{ config?.appSecretConfigured ? '已配置' : '未配置' }}；
              Event Token：{{ config?.eventTokenConfigured ? '已配置' : '未配置' }}；
              Event Encrypt Key：{{ config?.eventEncryptKeyConfigured ? '已配置' : '未配置' }}；
              App Ticket：{{ config?.appTicketConfigured ? '已接收' : '未接收' }}
            </p>
            <p v-if="config?.appTicketUpdatedAt" class="m-0">
              App Ticket 最近更新：{{ config.appTicketUpdatedAt }}
            </p>
            <p v-if="config?.updatedAt" class="m-0">
              最近更新：{{ config.updatedAt }}（{{ config.updatedByUserId || 'unknown' }}）
            </p>
          </div>
        </section>

        <section class="p-3 border border-slate-200 bg-white space-y-3">
          <div class="space-y-1">
            <h3 class="text-[12px] text-slate-900 font-semibold m-0">
              3. 通知配置
            </h3>
            <p class="text-[10px] text-slate-500 m-0">
              配置进程首次启动时的飞书通知渠道，以及版本信息的兜底来源。
            </p>
          </div>

          <div class="p-3 border border-slate-200 bg-slate-50 space-y-3">
            <div class="flex gap-2 items-center justify-between">
              <div>
                <p class="text-[10px] text-slate-700 font-semibold m-0">
                  启动通知渠道
                </p>
                <p class="text-[10px] text-slate-500 m-0 mt-1">
                  仅在进程首次启动时发送，关闭后不会校验 chat_id。
                </p>
              </div>
              <a-switch v-model="configForm.startupNotifyEnabled" />
            </div>

            <div class="gap-3 grid md:grid-cols-2">
              <label class="text-[10px] text-slate-600 font-medium block">
                飞书群 chat_id
                <a-input-group class="mt-1">
                  <a-input
                    v-model="configForm.startupNotifyChatId"
                    allow-clear
                    size="small"
                    placeholder="oc_xxx"
                  />
                  <a-button
                    size="small"
                    :loading="startupNotifyChatOptionsLoading && startupNotifyChatPickerVisible"
                    @click="openStartupNotifyChatPicker"
                  >
                    选择群
                  </a-button>
                  <a-button
                    size="small"
                    type="primary"
                    :loading="testingStartupNotify"
                    @click="testStartupNotify"
                  >
                    测试
                  </a-button>
                </a-input-group>
                <p class="text-[10px] text-slate-400 m-0 mt-1">
                  支持手动输入 chat_id，也可以点击“选择群”从列表回填。
                </p>
                <p v-if="configForm.startupNotifyChatId" class="text-[10px] text-slate-400 font-mono m-0 mt-1">
                  当前 chat_id：{{ configForm.startupNotifyChatId }}
                </p>
                <p
                  v-if="selectedStartupNotifyChat && formatStartupNotifyChatLabel(selectedStartupNotifyChat) !== selectedStartupNotifyChat.chatId"
                  class="text-[10px] text-slate-500 m-0 mt-1 truncate"
                >
                  当前群名：{{ formatStartupNotifyChatLabel(selectedStartupNotifyChat) }}
                </p>
                <p v-if="startupNotifyTestSuccessText" class="text-[10px] text-emerald-700 m-0 mt-2 break-all">
                  {{ startupNotifyTestSuccessText }}
                </p>
                <p v-if="startupNotifyTestErrorText" class="text-[10px] text-rose-600 m-0 mt-2 break-all">
                  {{ startupNotifyTestErrorText }}
                </p>
              </label>

              <label class="text-[10px] text-slate-600 font-medium block">
                通知备注（可选）
                <a-textarea
                  v-model="configForm.startupNotifyRemark"
                  class="mt-1"
                  :auto-size="{ minRows: 2, maxRows: 4 }"
                  allow-clear
                  placeholder="例如：已优化启动流程，准备回归验证。"
                />
              </label>
            </div>

            <p class="text-[10px] text-slate-500 m-0">
              版本来源：CI/CD 环境变量（WINLOOP_BUILD_VERSION / WINLOOP_BUILD_COMMIT_SHA）或构建推导（git）；缺失时启动通知会阻断发送。
            </p>
          </div>
        </section>

        <section class="p-3 border border-slate-200 bg-white space-y-3">
          <div class="space-y-1">
            <h3 class="text-[12px] text-slate-900 font-semibold m-0">
              4. 管理页配置
            </h3>
            <p class="text-[10px] text-slate-500 m-0">
              维护管理员组降级目录、平台管理员概览，以及飞书成员浏览与手动授权入口。
            </p>
          </div>

          <label class="text-[10px] text-slate-600 font-medium block">
            管理员组 ID（可选）
            <a-textarea
              v-model="configForm.adminGroupIdsText"
              class="mt-1"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              allow-clear
              placeholder="每行一个 group_id，飞书全员目录不可用时会降级到管理员组目录。"
            />
          </label>

          <div class="p-3 border border-slate-200 bg-slate-50 space-y-2">
            <div class="flex gap-2 items-center justify-between">
              <p class="text-[10px] text-slate-700 font-semibold m-0">
                平台管理员概览
              </p>
              <a-button size="mini" :loading="adminOverviewLoading" @click="loadAdminOverview">
                刷新概览
              </a-button>
            </div>
            <p v-if="adminOverview?.notice" class="text-[10px] text-slate-600 m-0 p-2 border border-slate-200 bg-white">
              {{ adminOverview.notice }}
            </p>
            <section class="p-2 border border-slate-200 bg-white space-y-1">
              <p class="text-[10px] text-slate-700 font-medium m-0">
                当前 contest_admin（{{ adminOverview?.contestAdmins?.length || 0 }}）
              </p>
              <p v-if="adminOverviewLoading" class="text-[10px] text-slate-500 m-0">
                加载中...
              </p>
              <p v-else-if="!adminOverview?.contestAdmins?.length" class="text-[10px] text-slate-500 m-0">
                暂无 contest_admin
              </p>
              <div v-else class="max-h-[160px] overflow-auto space-y-1">
                <div
                  v-for="item in adminOverview.contestAdmins"
                  :key="item.userId"
                  class="p-1 border border-slate-200 bg-slate-50"
                >
                  <p class="text-[10px] text-slate-800 m-0">
                    {{ item.username }}
                  </p>
                  <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
                    user: {{ item.userId }}{{ item.unionId ? ` / union: ${item.unionId}` : '' }}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <AdminFeishuDirectoryBrowser
            :loading="feishuDirectoryLoading"
            :members="feishuDirectoryMembers"
            :departments="feishuDirectoryDepartments"
            :root-department-id="feishuDirectoryRootDepartmentId"
            :notice="feishuDirectoryNotice"
            :source="feishuDirectorySource"
            :from-cache="feishuDirectoryFromCache"
            :fetched-at="feishuDirectoryFetchedAt"
            :cache-expires-at="feishuDirectoryCacheExpiresAt"
            :total-members="feishuDirectoryTotalMembers"
            :permission-hint="feishuDirectoryPermissionHint"
            :directory-status="feishuDirectoryStatus"
            :member-list-status="feishuDirectoryMemberListStatus"
            :department-tree-status="feishuDirectoryDepartmentTreeStatus"
            :contact-scope-status="feishuDirectoryContactScopeStatus"
            :contact-scope-summary="feishuDirectoryContactScopeSummary"
            :contact-scope-error-message="feishuDirectoryContactScopeErrorMessage"
            :diagnostic-code="feishuDirectoryDiagnosticCode"
            :diagnostic-message="feishuDirectoryDiagnosticMessage"
            :manual-adding-key="manualAddingKey"
            @refresh="forceRefresh => loadFeishuDirectoryBrowser(forceRefresh)"
            @add-user="manualAddContestAdmin"
            @add-union="manualAddContestAdminByUnionId"
          />
        </section>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="savingConfig" @click="configDialogVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="savingConfig" @click="saveConfig">
            保存飞书配置
          </a-button>
        </div>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="createSyncDrawerVisible"
      title="新建多维同步信息"
      :mask-closable="!creatingSync"
      :closable="!creatingSync"
      :esc-to-close="!creatingSync"
      :footer="false"
      width="720px"
    >
      <div class="space-y-3">
        <div class="p-3 border border-slate-200 bg-slate-50 space-y-3">
          <p class="text-[11px] text-slate-700 m-0">
            创建阶段只识别并保存主库来源。字段映射、回填、预检与启用都在创建成功后的编辑抽屉里继续配置。
          </p>
          <div class="gap-3 grid md:grid-cols-2">
            <div
              v-for="step in CREATE_SYNC_MILESTONES"
              :key="`create-${step.step}`"
              class="p-3 border border-slate-200 bg-white"
            >
              <p class="text-[10px] text-slate-400 tracking-[0.18em] font-medium m-0 uppercase">
                {{ step.step }}
              </p>
              <p class="text-[11px] text-slate-900 font-semibold m-0 mt-2">
                {{ step.title }}
              </p>
              <p class="text-[10px] text-slate-500 leading-5 m-0 mt-1">
                {{ step.description }}
              </p>
            </div>
          </div>
        </div>

        <div class="gap-3 grid md:grid-cols-2">
          <label class="text-[10px] text-slate-600 font-medium block">
            同步信息名称
            <a-input v-model="createSyncForm.name" class="mt-1" allow-clear size="small" placeholder="留空时优先使用主库名称，否则自动生成多维同步 N" />
            <p class="text-[10px] text-slate-500 m-0 mt-1">
              推荐命名：{{ buildSuggestedCreateSyncName() }}
            </p>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            运行环境标签
            <a-select v-model="createSyncForm.environment" class="mt-1" size="small">
              <a-option v-for="item in SYNC_ENVIRONMENT_OPTIONS" :key="item.value" :value="item.value">
                {{ item.label }}
              </a-option>
            </a-select>
            <p class="text-[10px] text-slate-500 m-0 mt-1">
              会用于列表标签、高亮提示，以及默认命名建议，避免测试库和正式库混淆。
            </p>
          </label>
        </div>

        <section class="border border-slate-200 bg-white">
          <a-tabs v-model:active-key="createSourceMode" type="rounded" size="small" class="px-3 pt-3">
            <a-tab-pane key="url" title="URL 识别">
              <div class="pb-3 space-y-3">
                <div class="text-[10px] text-slate-600 font-medium block">
                  <div>粘贴飞书链接 / 标识</div>
                  <div class="mt-1 flex gap-2">
                    <a-input v-model="createSyncForm.sourceInput" allow-clear size="small" placeholder="支持 URL 或 appToken/tableId/viewId 文本" />
                    <a-button size="small" :loading="sourceResolveLoading" @click="resolveBitableSourceInput">
                      解析
                    </a-button>
                  </div>
                </div>

                <div class="gap-2 grid md:grid-cols-3">
                  <label class="text-[10px] text-slate-600 font-medium block">
                    主库 ID / appToken
                    <a-input v-model="createSyncForm.appToken" class="mt-1" allow-clear size="small" @blur="onAppTokenChanged" />
                  </label>
                  <label class="text-[10px] text-slate-600 font-medium block">
                    子表 tableId（可选）
                    <a-input v-model="createSyncForm.tableId" class="mt-1" allow-clear size="small" @blur="onTableIdChanged" />
                  </label>
                  <label class="text-[10px] text-slate-600 font-medium block">
                    视图 viewId（可选）
                    <a-input v-model="createSyncForm.viewId" class="mt-1" allow-clear size="small" @blur="onViewIdChanged" />
                  </label>
                </div>

                <div class="text-[10px] text-slate-600 font-medium block">
                  <div>主库子表 / 视图候选（可选）</div>
                  <div class="mt-1 flex gap-2">
                    <a-button size="small" :loading="sourceViewsLoading" @click="loadBitableTablesAndViews">
                      加载表和视图
                    </a-button>
                    <a-select
                      v-model="createSyncForm.tableId"
                      class="flex-1"
                      allow-search
                      allow-clear
                      size="small"
                      placeholder="可选：预带一个子表草稿"
                      @change="onTableIdChanged"
                    >
                      <a-option v-for="item in sourceTables" :key="item.tableId" :value="item.tableId">
                        {{ item.name }} ({{ item.tableId }})
                      </a-option>
                    </a-select>
                    <a-select
                      v-model="createSyncForm.viewId"
                      class="flex-1"
                      allow-search
                      allow-clear
                      size="small"
                      placeholder="可选：预带一个视图草稿"
                      @change="onViewIdChanged"
                    >
                      <a-option v-for="item in sourceViews" :key="item.viewId" :value="item.viewId">
                        {{ item.name }} ({{ item.viewId }})
                      </a-option>
                    </a-select>
                  </div>
                </div>
              </div>
            </a-tab-pane>

            <a-tab-pane key="manual" title="手动填写">
              <div class="pb-3 space-y-3">
                <div class="gap-2 grid md:grid-cols-3">
                  <label class="text-[10px] text-slate-600 font-medium block">
                    主库 ID / appToken
                    <a-input v-model="createSyncForm.appToken" class="mt-1" allow-clear size="small" @blur="onAppTokenChanged" />
                  </label>
                  <label class="text-[10px] text-slate-600 font-medium block">
                    子表 tableId（可选）
                    <a-input v-model="createSyncForm.tableId" class="mt-1" allow-clear size="small" @blur="onTableIdChanged" />
                  </label>
                  <label class="text-[10px] text-slate-600 font-medium block">
                    视图 viewId（可选）
                    <a-input v-model="createSyncForm.viewId" class="mt-1" allow-clear size="small" @blur="onViewIdChanged" />
                  </label>
                </div>

                <div class="text-[10px] text-slate-600 font-medium block">
                  <div>主库子表 / 视图候选（可选）</div>
                  <div class="mt-1 flex gap-2">
                    <a-button size="small" :loading="sourceViewsLoading" @click="loadBitableTablesAndViews">
                      加载表和视图
                    </a-button>
                    <a-select
                      v-model="createSyncForm.tableId"
                      class="flex-1"
                      allow-search
                      allow-clear
                      size="small"
                      placeholder="可选：预带一个子表草稿"
                      @change="onTableIdChanged"
                    >
                      <a-option v-for="item in sourceTables" :key="item.tableId" :value="item.tableId">
                        {{ item.name }} ({{ item.tableId }})
                      </a-option>
                    </a-select>
                    <a-select
                      v-model="createSyncForm.viewId"
                      class="flex-1"
                      allow-search
                      allow-clear
                      size="small"
                      placeholder="可选：预带一个视图草稿"
                      @change="onViewIdChanged"
                    >
                      <a-option v-for="item in sourceViews" :key="item.viewId" :value="item.viewId">
                        {{ item.name }} ({{ item.viewId }})
                      </a-option>
                    </a-select>
                  </div>
                </div>

                <label class="text-[10px] text-slate-600 font-medium block">
                  来源 URL（可选）
                  <a-input v-model="createSyncForm.sourceUrl" class="mt-1" allow-clear size="small" />
                </label>
              </div>
            </a-tab-pane>
          </a-tabs>
        </section>

        <section class="p-3 border border-slate-200 bg-slate-50 space-y-1">
          <p class="text-[11px] text-slate-700 font-medium m-0">
            当前识别结果
          </p>
          <p class="text-[10px] text-slate-500 m-0 break-all">
            appToken={{ createSyncForm.appToken || '-' }}
          </p>
          <p class="text-[10px] text-slate-500 m-0">
            environment={{ syncEnvironmentLabel(createSyncForm.environment) }}
          </p>
          <p class="text-[10px] text-slate-500 m-0 break-all">
            draftTableId={{ createSyncForm.tableId || '-' }} / draftViewId={{ createSyncForm.viewId || '-' }}
          </p>
          <p v-if="createSyncForm.sourceUrl" class="text-[10px] text-slate-500 m-0 break-all">
            sourceUrl={{ createSyncForm.sourceUrl }}
          </p>
          <p class="text-[10px] text-slate-500 m-0">
            说明：这里的 `appToken` 是“飞书多维主库”的标识，不是开放平台里的 `appId/appSecret`。
          </p>
        </section>

        <div class="flex items-center justify-between">
          <p class="text-[10px] text-slate-500 m-0">
            创建成功后会自动打开编辑抽屉；如果这里已经带了 table/view，会作为待创建子表同步项草稿带过去。
          </p>
        </div>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="creatingSync" @click="createSyncDrawerVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="creatingSync" @click="createSync">
            创建并继续配置
          </a-button>
        </div>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="syncConfigImportDrawerVisible"
      title="从配置 URL 导入"
      :mask-closable="!syncConfigImporting"
      :closable="!syncConfigImporting"
      :esc-to-close="!syncConfigImporting"
      :footer="false"
      width="680px"
    >
      <div class="space-y-3">
        <section class="p-3 border border-slate-200 bg-slate-50 space-y-2">
          <p class="text-[11px] text-slate-700 font-medium m-0">
            导入策略
          </p>
          <p class="text-[10px] text-slate-500 leading-5 m-0">
            配置包只迁移主库、子表、字段映射、回填、自动同步和调度草案；不会迁移运行记录、问题记录或已同步业务数据。导入后不会自动启用主同步、子表或调度。
          </p>
        </section>

        <label class="text-[10px] text-slate-600 font-medium block">
          公网配置 URL
          <a-textarea
            v-model="syncConfigImportUrl"
            class="mt-1"
            allow-clear
            :auto-size="{ minRows: 2, maxRows: 4 }"
            placeholder="https://your-domain/api/feishu/bitable-sync-config/..."
          />
        </label>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :loading="syncConfigImportLoading" @click="previewSyncConfigImport">
            预览配置
          </a-button>
        </div>

        <section v-if="syncConfigImportErrorText" class="p-3 border border-rose-200 bg-rose-50">
          <p class="text-[10px] text-rose-600 m-0 break-all">
            {{ syncConfigImportErrorText }}
          </p>
        </section>

        <section v-if="syncConfigImportPreview" class="p-3 border border-slate-200 bg-white space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-[12px] text-slate-900 font-semibold m-0">
              配置摘要
            </h3>
            <a-tag size="small" color="arcoblue">
              {{ syncConfigImportPreview.summary.itemCount }} 个子表项
            </a-tag>
          </div>
          <div class="gap-2 grid md:grid-cols-2">
            <p class="text-[10px] text-slate-500 m-0">
              名称：{{ syncConfigImportPreview.summary.name || '-' }}
            </p>
            <p class="text-[10px] text-slate-500 m-0">
              主库：{{ syncConfigImportPreview.summary.appName || syncConfigImportPreview.summary.appToken || '-' }}
            </p>
            <p class="text-[10px] text-slate-500 m-0">
              环境：{{ syncEnvironmentLabel(syncConfigImportPreview.summary.environment || undefined) }}
            </p>
            <p class="text-[10px] text-slate-500 m-0">
              实体：{{ syncConfigEntityTypeText(syncConfigImportPreview.summary) }}
            </p>
            <p class="text-[10px] text-slate-500 m-0">
              映射字段：{{ syncConfigImportPreview.summary.mappingFieldCount }}
            </p>
          </div>
          <p class="text-[10px] text-amber-600 m-0">
            导入后会创建一条新的同步信息，且默认保持禁用。请先完成预检和手动执行，再决定是否启用调度。
          </p>
        </section>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="syncConfigImporting" @click="syncConfigImportDrawerVisible = false">
            取消
          </a-button>
          <a-button
            size="small"
            type="primary"
            :loading="syncConfigImporting"
            :disabled="!syncConfigImportPreview"
            @click="confirmSyncConfigImport"
          >
            确认导入
          </a-button>
        </div>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="editSyncDrawerVisible"
      title="编辑多维同步信息"
      width="96vw"
      :footer="false"
      unmount-on-close
    >
      <AdminFeishuBitableSyncEditor
        v-if="editingSyncId"
        :sync-id="editingSyncId"
        :selected-item-id="editingSelectedItemId"
        :draft-table-id="editingDraftTableId"
        :draft-view-id="editingDraftViewId"
        :include-archived="editingSyncIncludeArchived"
        :embedded="true"
        :show-back-button="false"
        @item-change="(itemId) => editingSelectedItemId = itemId"
        @updated="refreshSyncList"
      />
    </a-drawer>

    <a-drawer
      v-model:visible="syncItemLogVisible"
      title="子表同步项执行日志"
      width="960px"
      :footer="false"
    >
      <div class="space-y-4">
        <section class="p-3 border border-slate-200 bg-slate-50 space-y-2">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <div class="space-y-1">
              <p class="text-[12px] text-slate-900 font-semibold m-0">
                {{ syncItemLogItemDetail?.name || '正在加载子表同步项' }}
              </p>
              <p class="text-[10px] text-slate-500 m-0">
                主同步：{{ syncItemLogSyncName || syncItemLogSyncId || '-' }}
              </p>
              <p v-if="syncItemLogItemDetail" class="text-[10px] text-slate-500 m-0 break-all">
                子表：{{ syncItemLogItemDetail.source?.tableName || syncItemLogItemDetail.tableId || '-' }}
                /
                视图：{{ syncItemLogItemDetail.source?.viewName || syncItemLogItemDetail.viewId || '全部视图' }}
              </p>
            </div>
            <div class="flex gap-2">
              <a-button size="small" :loading="syncItemLogLoading" :disabled="!syncItemLogItemDetail" @click="refreshSyncItemLogDrawer">
                刷新
              </a-button>
              <a-button
                size="small"
                type="primary"
                :disabled="!syncItemLogItemDetail"
                @click="openSyncItemLogEditor"
              >
                进入子项配置
              </a-button>
            </div>
          </div>
        </section>

        <section v-if="syncItemLogLoading" class="p-3 border border-slate-200 bg-white">
          <a-skeleton :animation="true">
            <a-skeleton-line :rows="8" />
          </a-skeleton>
        </section>

        <section v-else-if="syncItemLogErrorText" class="p-3 border border-rose-200 bg-rose-50 space-y-2">
          <p class="text-[10px] text-rose-600 m-0">
            {{ syncItemLogErrorText }}
          </p>
          <a-button size="small" status="danger" @click="refreshSyncItemLogDrawer">
            重新加载
          </a-button>
        </section>

        <template v-else-if="syncItemLogItemDetail">
          <section class="gap-4 grid xl:grid-cols-2">
            <div class="p-4 border border-slate-200 bg-white space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  最近执行
                </h3>
                <a-tag size="small" :color="runHealthColor(syncItemLogItemDetail.latestRunSummary)">
                  {{ runHealthLabel(syncItemLogItemDetail.latestRunSummary) }}
                </a-tag>
              </div>
              <div v-if="syncItemLogItemDetail.recentRuns.length" class="space-y-2">
                <div v-for="run in syncItemLogItemDetail.recentRuns" :key="run.id" class="p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
                  <div class="flex flex-wrap gap-2 items-center">
                    <a-tag :color="runHealthColor(run)" size="small">
                      {{ runHealthLabel(run) }}
                    </a-tag>
                    <a-tag size="small">
                      {{ triggerSourceLabel(run.triggerSource) }}
                    </a-tag>
                    <a-tag size="small" color="arcoblue">
                      {{ syncRunModeLabel(run.mode) }}
                    </a-tag>
                    <span class="text-[10px] text-slate-500 font-mono">{{ run.id }}</span>
                  </div>
                  <p class="text-[10px] text-slate-700 m-0">
                    开始：{{ formatDateTime(run.startedAt) }} / 结束：{{ formatDateTime(run.finishedAt) }}
                  </p>
                  <p class="text-[10px] text-slate-500 m-0">
                    抓取 {{ run.fetchedCount }} / 新增 {{ run.createdCount }} / 更新 {{ run.updatedCount }} / 跳过 {{ run.skippedCount }} / 错误 {{ run.errorCount }}
                  </p>
                  <p v-if="run.deltaRecordCount !== undefined" class="text-[10px] text-slate-500 m-0">
                    Delta 记录数：{{ run.deltaRecordCount }}
                  </p>
                  <p v-if="run.errorMessage" class="text-[10px] text-rose-500 m-0 break-all">
                    错误摘要：{{ run.errorMessage }}
                  </p>
                </div>
              </div>
              <a-empty v-else description="暂无执行记录" />
            </div>

            <div class="p-4 border border-slate-200 bg-white space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  关联问题
                </h3>
                <div class="flex gap-2">
                  <a-tag size="small" color="gold">
                    待处理 {{ syncItemLogItemDetail.issueStats.open }}
                  </a-tag>
                  <a-tag size="small">
                    总计 {{ syncItemLogItemDetail.issueStats.total }}
                  </a-tag>
                </div>
              </div>
              <div v-if="syncItemLogItemDetail.issues.length" class="space-y-2">
                <div v-for="issue in sortedSyncIssues(syncItemLogItemDetail.issues)" :key="issue.id" class="p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
                  <div class="flex flex-wrap gap-2 items-center">
                    <a-tag :color="syncIssueStatusColor(issue.status)" size="small">
                      {{ syncIssueStatusLabel(issue.status) }}
                    </a-tag>
                    <a-tag size="small">
                      {{ issue.reasonCode || '未标记原因' }}
                    </a-tag>
                    <span class="text-[10px] text-slate-500 font-mono">{{ issue.id }}</span>
                    <div v-if="issue.status === 'open'" class="ml-auto flex gap-1">
                      <a-button size="mini" :loading="issueActionMutating[issue.id]" @click="handleSyncIssueAction(issue, 'resolve')">
                        标记已解决
                      </a-button>
                      <a-button size="mini" status="warning" :loading="issueActionMutating[issue.id]" @click="handleSyncIssueAction(issue, 'ignore')">
                        忽略
                      </a-button>
                    </div>
                  </div>
                  <p class="text-[10px] text-slate-700 m-0 break-all">
                    {{ issue.message }}
                  </p>
                  <p class="text-[10px] text-slate-500 m-0 break-all">
                    externalId={{ issue.externalId || '-' }} / recordId={{ issue.recordId || '-' }}
                  </p>
                  <p class="text-[10px] text-slate-500 m-0">
                    更新时间：{{ formatDateTime(issue.updatedAt) }}
                  </p>
                </div>
              </div>
              <a-empty v-else description="暂无问题单" />
            </div>
          </section>
        </template>
      </div>
    </a-drawer>

    <a-modal
      v-model:visible="startupNotifyChatPickerVisible"
      title="选择飞书群"
      :footer="false"
      width="720px"
    >
      <div class="space-y-3">
        <div class="flex gap-2 items-center">
          <a-input
            v-model="startupNotifyChatSearchKeyword"
            class="flex-1"
            allow-clear
            size="small"
            placeholder="输入群名关键词搜索"
            @press-enter="searchStartupNotifyChats"
          />
          <a-button size="small" type="primary" :loading="startupNotifyChatOptionsLoading" @click="searchStartupNotifyChats">
            搜索
          </a-button>
          <a-button size="small" @click="resetStartupNotifyChatSearch">
            重置
          </a-button>
        </div>

        <div class="text-[10px] text-slate-500 p-3 border border-slate-200 bg-slate-50 space-y-1">
          <p class="m-0">
            搜索不到时，可以直接在外层输入框手动填写 chat_id。
          </p>
          <p v-if="configForm.startupNotifyChatId" class="font-mono m-0">
            当前填写：{{ configForm.startupNotifyChatId }}
          </p>
        </div>

        <div v-if="startupNotifyChatOptionsLoading" class="p-3 border border-slate-200 bg-white">
          <a-skeleton :animation="true">
            <a-skeleton-line :rows="4" />
          </a-skeleton>
        </div>

        <div v-else-if="startupNotifyChatSelectOptions.length === 0" class="text-[10px] text-slate-500 p-4 text-center border border-slate-300 border-dashed bg-slate-50">
          暂未检索到群。你可以换个关键词重试，或直接手动填写 chat_id。
        </div>

        <div v-else class="pr-1 max-h-[420px] overflow-y-auto space-y-2">
          <div
            v-for="item in startupNotifyChatSelectOptions"
            :key="item.chatId"
            class="p-3 border border-slate-200 rounded bg-white flex gap-3 items-start justify-between"
          >
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap gap-2 items-center">
                <p class="text-[11px] text-slate-900 font-semibold m-0 truncate">
                  {{ formatStartupNotifyChatLabel(item) }}
                </p>
                <a-tag v-if="item.chatId === configForm.startupNotifyChatId" size="small" color="arcoblue">
                  当前已选
                </a-tag>
              </div>
              <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 break-all">
                {{ item.chatId }}
              </p>
              <p v-if="item.description" class="text-[10px] text-slate-500 m-0 mt-1 break-all">
                {{ item.description }}
              </p>
            </div>
            <a-button
              size="mini"
              type="primary"
              :disabled="item.chatId === configForm.startupNotifyChatId"
              @click="selectStartupNotifyChat(item)"
            >
              选择
            </a-button>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>
