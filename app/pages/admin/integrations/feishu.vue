<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  FeishuAdminManualAddResult,
  FeishuAdminOverview,
  FeishuBitableAppMeta,
  FeishuBitableSourceConfig,
  FeishuBitableSyncRun,
  FeishuBitableTableMeta,
  FeishuBitableTask,
  FeishuBitableTaskDetail,
  FeishuBitableTaskTargetType,
  FeishuBitableViewMeta,
  FeishuBitableWritebackConfig,
  FeishuFieldInspectionItem,
  FeishuIntegrationConfig,
  FeishuSyncIssue,
  FeishuTaskScheduleConfig,
  FeishuTaskScheduleMode,
  PlatformPermission,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type SecretMode = 'keep' | 'replace' | 'clear'
type BuildValueSource = 'env' | 'runtime' | 'fallback' | 'missing'

interface FeishuIntegrationConfigView extends FeishuIntegrationConfig {
  startupEffectiveVersion?: string
  startupEffectiveCommitSha?: string
  startupVersionSource?: BuildValueSource
  startupCommitShaSource?: BuildValueSource
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const DEFAULT_MAPPING_TEXT = `{
  "externalIdField": "",
  "contestExternalIdField": "",
  "trackExternalIdField": "",
  "fieldMap": {
    "name": "",
    "officialUrl": "",
    "summary": "",
    "title": "",
    "content": "",
    "category": "",
    "url": "",
    "sourceType": "",
    "year": ""
  }
}`

const DEFAULT_OPTIONS_TEXT = `{
  "contestId": "",
  "defaultVisibility": "internal",
  "defaultStatus": "active",
  "defaultResourceCategory": "basic_info",
  "defaultResourceAccessLevel": "public"
}`

const DEFAULT_WRITEBACK_TEXT = `{
  "enabled": true,
  "fields": {
    "status": "",
    "syncedAt": "",
    "errorMessage": "",
    "reasonCode": "",
    "entityId": "",
    "runId": "",
    "triggerSource": ""
  },
  "values": {
    "success": "已同步",
    "failed": "失败",
    "skipped": "跳过"
  }
}`

type TaskFormMode = 'create' | 'edit'

interface SourceViewsPayload {
  tables: FeishuBitableTableMeta[]
  views: FeishuBitableViewMeta[]
}

interface MappingWizardBinding {
  targetKey: string
  sourceField: string
  transform: string
}

interface MappingOption {
  key: string
  label: string
}

const MAPPING_OPTIONS: Record<FeishuBitableTaskTargetType, MappingOption[]> = {
  contest: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'name', label: 'name（名称）' },
    { key: 'officialUrl', label: 'officialUrl（官网）' },
    { key: 'summary', label: 'summary（简介）' },
    { key: 'level', label: 'level（级别）' },
    { key: 'organizer', label: 'organizer（主办方）' },
    { key: 'coOrganizer', label: 'coOrganizer（协办方）' },
    { key: 'participantRequirements', label: 'participantRequirements（参赛对象）' },
    { key: 'teamRule', label: 'teamRule（组队规则）' },
    { key: 'currentSeason', label: 'currentSeason（届次）' },
    { key: 'disciplines', label: 'disciplines（学科）' },
    { key: 'aliases', label: 'aliases（别名）' },
    { key: 'keywords', label: 'keywords（关键词）' },
    { key: 'recommendedFor', label: 'recommendedFor（推荐人群）' },
  ],
  track: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'contestExternalId', label: 'contestExternalId（赛事外部ID）' },
    { key: 'name', label: 'name（赛道名）' },
    { key: 'summary', label: 'summary（简介）' },
    { key: 'suitableMajors', label: 'suitableMajors（适用专业）' },
    { key: 'deliverableTypes', label: 'deliverableTypes（交付物类型）' },
    { key: 'sortOrder', label: 'sortOrder（排序）' },
  ],
  resource: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'contestExternalId', label: 'contestExternalId（赛事外部ID）' },
    { key: 'trackExternalId', label: 'trackExternalId（赛道外部ID）' },
    { key: 'title', label: 'title（标题）' },
    { key: 'name', label: 'name（别名标题）' },
    { key: 'summary', label: 'summary（摘要）' },
    { key: 'content', label: 'content（正文）' },
    { key: 'category', label: 'category（分类）' },
    { key: 'url', label: 'url（链接）' },
    { key: 'sourceType', label: 'sourceType（来源类型）' },
    { key: 'year', label: 'year（年份）' },
  ],
}

const MAPPING_GUESS_ALIASES: Record<string, string[]> = {
  externalId: ['external_id', 'externalid', 'id', 'record_id', '业务id'],
  contestExternalId: ['contest_external_id', 'contestid', '赛事外部id', '赛事id'],
  trackExternalId: ['track_external_id', 'trackid', '赛道外部id', '赛道id'],
  name: ['name', '名称', '名字'],
  title: ['title', '标题'],
  summary: ['summary', '简介', '描述'],
  content: ['content', '正文', '内容', '详情'],
  officialUrl: ['officialurl', 'official_url', '官网', '官网链接', 'url'],
  organizer: ['organizer', '主办方', '主办单位'],
  coOrganizer: ['coorganizer', 'co_organizer', '协办方', '承办方'],
  participantRequirements: ['participantrequirements', '参赛对象', '参赛要求'],
  teamRule: ['teamrule', '组队规则'],
  currentSeason: ['currentseason', '届次', '赛季'],
  disciplines: ['disciplines', '学科', '专业'],
  aliases: ['aliases', '别名'],
  keywords: ['keywords', '关键字', '关键词', '标签'],
  recommendedFor: ['recommendedfor', '推荐人群'],
  suitableMajors: ['suitablemajors', '适合专业', '适用专业'],
  deliverableTypes: ['deliverabletypes', '交付物', '成果类型'],
  sortOrder: ['sortorder', '排序', '序号'],
  category: ['category', '分类'],
  url: ['url', '链接'],
  sourceType: ['sourcetype', '来源类型'],
  year: ['year', '年份'],
}

const loadingPermissions = ref(true)
const loadingConfig = ref(false)
const loadingTasks = ref(false)
const loadingRuns = ref(false)
const loadingTaskDetail = ref(false)
const savingConfig = ref(false)
const adminOverviewLoading = ref(false)
const creatingTask = ref(false)
const editingTask = ref(false)
const savingSchedule = ref(false)
const manualAddingKey = ref('')
const patchingTaskId = ref('')
const previewTaskId = ref('')
const runningTaskId = ref('')
const inspectingTaskId = ref('')

const createDialogVisible = ref(false)
const configDialogVisible = ref(false)
const editDialogVisible = ref(false)
const scheduleDialogVisible = ref(false)
const detailDrawerVisible = ref(false)

const errorText = ref('')
const successText = ref('')
const permissions = ref<PlatformPermission[]>([])
const config = ref<FeishuIntegrationConfigView | null>(null)
const adminOverview = ref<FeishuAdminOverview | null>(null)
const tasks = ref<FeishuBitableTask[]>([])
const runs = ref<FeishuBitableSyncRun[]>([])
const taskDetail = ref<FeishuBitableTaskDetail | null>(null)
const inspectedFields = ref<FeishuFieldInspectionItem[]>([])
const taskActionMessages = reactive<Record<string, string>>({})

const taskColumns = [
  { title: '任务名称', dataIndex: 'name', slotName: 'name', width: 200 },
  { title: '目标类型', dataIndex: 'targetType', slotName: 'targetType', width: 110 },
  { title: '数据源', dataIndex: 'source', slotName: 'source', width: 220 },
  { title: '调度', dataIndex: 'schedule', slotName: 'schedule', width: 220 },
  { title: '状态', dataIndex: 'isActive', slotName: 'isActive', width: 90 },
  { title: '最近执行', dataIndex: 'latestRun', slotName: 'latestRun', width: 230 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 430 },
]

const runColumns = [
  { title: '开始时间', dataIndex: 'startedAt', slotName: 'startedAt', width: 170 },
  { title: '任务', dataIndex: 'taskName', width: 180 },
  { title: '触发来源', dataIndex: 'triggerSource', slotName: 'triggerSource', width: 110 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 110 },
  { title: '结果统计', dataIndex: 'stats', slotName: 'stats', width: 260 },
  { title: '错误', dataIndex: 'errorMessage', slotName: 'errorMessage' },
]

const detailRunColumns = [
  { title: '开始时间', dataIndex: 'startedAt', slotName: 'startedAt', width: 170 },
  { title: '来源', dataIndex: 'triggerSource', slotName: 'triggerSource', width: 90 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 90 },
  { title: '统计', dataIndex: 'stats', slotName: 'stats', width: 210 },
  { title: '错误', dataIndex: 'errorMessage', slotName: 'errorMessage' },
]

const detailIssueColumns = [
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', width: 170 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 90 },
  { title: '原因', dataIndex: 'reasonCode', width: 130 },
  { title: '记录ID', dataIndex: 'recordId', slotName: 'recordId', width: 170 },
  { title: '说明', dataIndex: 'message', slotName: 'message' },
]

const canManageConfig = computed(() => permissions.value.includes('role.assign'))
const canManageBitable = computed(() => permissions.value.includes('contest.write'))
const canAccessPage = computed(() => canManageConfig.value || canManageBitable.value)
const loadingAny = computed(() => loadingPermissions.value || loadingConfig.value || loadingTasks.value || loadingRuns.value)
const {
  keyword: feishuDirectoryKeyword,
  loading: feishuDirectoryLoading,
  candidates: feishuDirectoryCandidates,
  notice: feishuDirectoryNotice,
  source: feishuDirectorySource,
  fromCache: feishuDirectoryFromCache,
  fetchedAt: feishuDirectoryFetchedAt,
  cacheExpiresAt: feishuDirectoryCacheExpiresAt,
  totalMembers: feishuDirectoryTotalMembers,
  permissionHint: feishuDirectoryPermissionHint,
  search: searchFeishuDirectoryCandidates,
} = useFeishuDirectoryCandidates({
  endpoint,
  canSearch: () => canManageConfig.value,
  onError: setError,
})

const configForm = reactive({
  enabled: false,
  appId: '',
  oauthRedirectUri: '',
  webSdkScriptUrl: '',
  startupNotifyEnabled: false,
  startupNotifyChatId: '',
  startupNotifyRemark: '',
  startupFallbackVersion: '',
  startupFallbackCommitSha: '',
  appSecretMode: 'keep' as SecretMode,
  appSecret: '',
  eventTokenMode: 'keep' as SecretMode,
  eventToken: '',
  eventEncryptKeyMode: 'keep' as SecretMode,
  eventEncryptKey: '',
})

const createTaskForm = reactive({
  name: '',
  targetType: 'contest' as FeishuBitableTaskTargetType,
  sourceInput: '',
  sourceKeyword: '',
  appName: '',
  appToken: '',
  tableName: '',
  tableId: '',
  viewName: '',
  viewId: '',
  sourceUrl: '',
  isActive: true,
  mappingText: DEFAULT_MAPPING_TEXT,
  optionsText: DEFAULT_OPTIONS_TEXT,
  writebackText: DEFAULT_WRITEBACK_TEXT,
})

const editTaskForm = reactive({
  id: '',
  name: '',
  targetType: 'contest' as FeishuBitableTaskTargetType,
  sourceInput: '',
  sourceKeyword: '',
  appName: '',
  appToken: '',
  tableName: '',
  tableId: '',
  viewName: '',
  viewId: '',
  sourceUrl: '',
  isActive: true,
  mappingText: '{}',
  optionsText: '{}',
  writebackText: '{}',
})

const sourceSearchLoading = reactive<Record<TaskFormMode, boolean>>({
  create: false,
  edit: false,
})

const sourceResolveLoading = reactive<Record<TaskFormMode, boolean>>({
  create: false,
  edit: false,
})

const sourceViewsLoading = reactive<Record<TaskFormMode, boolean>>({
  create: false,
  edit: false,
})

const sourceApps = reactive<Record<TaskFormMode, FeishuBitableAppMeta[]>>({
  create: [],
  edit: [],
})

const sourceTables = reactive<Record<TaskFormMode, FeishuBitableTableMeta[]>>({
  create: [],
  edit: [],
})

const sourceViews = reactive<Record<TaskFormMode, FeishuBitableViewMeta[]>>({
  create: [],
  edit: [],
})

const sourceFieldInspectLoading = reactive<Record<TaskFormMode, boolean>>({
  create: false,
  edit: false,
})

const sourceFieldInspectInlineError = reactive<Record<TaskFormMode, string>>({
  create: '',
  edit: '',
})

const mappingWizardFields = reactive<Record<TaskFormMode, FeishuFieldInspectionItem[]>>({
  create: [],
  edit: [],
})

const mappingWizardBindings = reactive<Record<TaskFormMode, MappingWizardBinding[]>>({
  create: [],
  edit: [],
})

const scheduleForm = reactive({
  taskId: '',
  taskName: '',
  enabled: false,
  mode: 'interval' as FeishuTaskScheduleMode,
  intervalMinutes: 60,
  cronExpr: '0 * * * *',
  timezone: 'Asia/Shanghai',
})

const scheduleValidationError = computed(() => {
  if (!scheduleForm.enabled)
    return ''

  const timezone = String(scheduleForm.timezone || '').trim()
  if (!timezone)
    return '时区不能为空。'

  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
  }
  catch {
    return '时区格式不正确。'
  }

  if (scheduleForm.mode === 'interval') {
    const interval = Number(scheduleForm.intervalMinutes || 0)
    if (!Number.isInteger(interval) || interval < 5)
      return 'interval 模式下，执行间隔必须是 >= 5 的整数（分钟）。'
    return ''
  }

  const cronExpr = String(scheduleForm.cronExpr || '').trim()
  if (!cronExpr)
    return 'cron 模式下表达式不能为空。'

  const fields = cronExpr.split(/\s+/).filter(Boolean)
  if (fields.length !== 5)
    return 'cron 必须是 5 段（分钟 小时 日 月 周）。'

  const fieldPattern = /^(?:\*|\d+|\d+-\d+)(?:\/\d+)?(?:,(?:\*|\d+|\d+-\d+)(?:\/\d+)?)*$/
  if (!fields.every(field => fieldPattern.test(field)))
    return 'cron 表达式格式非法，仅支持 *, 数字, 范围, 步长, 列表组合。'

  return ''
})

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

function formatDateTime(value?: string | null): string {
  const text = String(value || '').trim()
  if (!text)
    return '-'
  return text
}

function resetSecretInputs() {
  configForm.appSecretMode = 'keep'
  configForm.appSecret = ''
  configForm.eventTokenMode = 'keep'
  configForm.eventToken = ''
  configForm.eventEncryptKeyMode = 'keep'
  configForm.eventEncryptKey = ''
}

function fillConfigForm(payload: FeishuIntegrationConfig) {
  configForm.enabled = Boolean(payload.enabled)
  configForm.appId = payload.appId || ''
  configForm.oauthRedirectUri = payload.oauthRedirectUri || ''
  configForm.webSdkScriptUrl = payload.webSdkScriptUrl || ''
  configForm.startupNotifyEnabled = Boolean(payload.startupNotifyEnabled)
  configForm.startupNotifyChatId = payload.startupNotifyChatId || ''
  configForm.startupNotifyRemark = payload.startupNotifyRemark || ''
  configForm.startupFallbackVersion = payload.startupFallbackVersion || ''
  configForm.startupFallbackCommitSha = payload.startupFallbackCommitSha || ''
  resetSecretInputs()
}

function parseJsonText(text: string, label: string): Record<string, unknown> {
  const source = String(text || '').trim()
  if (!source)
    return {}
  try {
    const parsed = JSON.parse(source)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error(`${label} 必须为 JSON 对象。`)
    return parsed as Record<string, unknown>
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('必须为 JSON 对象'))
      throw error
    throw new Error(`${label} JSON 格式错误。`)
  }
}

function getTaskForm(mode: TaskFormMode) {
  return mode === 'create' ? createTaskForm : editTaskForm
}

function fieldSamplePreview(sampleValues: string[]): string {
  const values = Array.isArray(sampleValues)
    ? sampleValues.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : []
  return values.join(' | ') || '-'
}

function fieldOverviewEmptyText(mode: TaskFormMode): string {
  const form = getTaskForm(mode)
  const tableId = String(form.tableId || '').trim()
  if (!tableId)
    return '请先选择表（tableId）后查看字段概览。'
  return '该视图暂无可巡检字段/无权限字段。'
}

function isMappingSourceFieldInvalid(mode: TaskFormMode, sourceField: string): boolean {
  const form = getTaskForm(mode)
  const tableId = String(form.tableId || '').trim()
  if (!tableId)
    return false
  const value = String(sourceField || '').trim()
  if (!value)
    return false
  return !mappingWizardFields[mode].some(item => item.fieldName === value)
}

function resetSourceLookupState(mode: TaskFormMode) {
  sourceApps[mode] = []
  sourceTables[mode] = []
  sourceViews[mode] = []
}

function syncSourceNamesFromLookup(mode: TaskFormMode) {
  const form = getTaskForm(mode)
  const app = sourceApps[mode].find(item => item.appToken === form.appToken)
  const table = sourceTables[mode].find(item => item.tableId === form.tableId)
  const view = sourceViews[mode].find(item => item.viewId === form.viewId)
  if (app)
    form.appName = app.name
  if (table)
    form.tableName = table.name
  if (view)
    form.viewName = view.name
}

function buildTaskSourceConfig(form: typeof createTaskForm | typeof editTaskForm): FeishuBitableSourceConfig {
  return {
    appToken: String(form.appToken || '').trim(),
    tableId: String(form.tableId || '').trim(),
    viewId: String(form.viewId || '').trim(),
    appName: String(form.appName || '').trim(),
    tableName: String(form.tableName || '').trim(),
    viewName: String(form.viewName || '').trim(),
    sourceUrl: String(form.sourceUrl || '').trim(),
  }
}

async function searchBitableSources(mode: TaskFormMode) {
  if (!canManageBitable.value)
    return

  const form = getTaskForm(mode)
  const keyword = String(form.sourceKeyword || '').trim()
  sourceSearchLoading[mode] = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableAppMeta[]>>(endpoint('/admin/integrations/feishu/bitable/sources/search'), {
      query: {
        keyword,
        limit: 30,
      },
    })
    sourceApps[mode] = response.data || []
    syncSourceNamesFromLookup(mode)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '检索飞书多维应用失败。'))
  }
  finally {
    sourceSearchLoading[mode] = false
  }
}

async function resolveBitableSourceInput(mode: TaskFormMode) {
  if (!canManageBitable.value)
    return

  const form = getTaskForm(mode)
  const sourceInput = String(form.sourceInput || '').trim()
  if (!sourceInput) {
    setError('请先粘贴飞书多维链接或 appToken/tableId 信息。')
    return
  }

  sourceResolveLoading[mode] = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableSourceConfig>>(endpoint('/admin/integrations/feishu/bitable/sources/resolve'), {
      method: 'POST',
      body: {
        input: sourceInput,
      },
    })
    const source = response.data
    form.appToken = source.appToken || ''
    form.tableId = source.tableId || ''
    form.viewId = source.viewId || ''
    if (source.sourceUrl)
      form.sourceUrl = source.sourceUrl
    syncSourceNamesFromLookup(mode)
    await inspectSourceFieldsForWizard(mode, { fromAuto: true })
    setSuccess('已解析飞书来源信息。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '来源解析失败。'))
  }
  finally {
    sourceResolveLoading[mode] = false
  }
}

async function loadBitableTablesAndViews(mode: TaskFormMode) {
  if (!canManageBitable.value)
    return

  const form = getTaskForm(mode)
  const appToken = String(form.appToken || '').trim()
  const tableId = String(form.tableId || '').trim()
  if (!appToken || !tableId) {
    setError('请先填写 appToken 与 tableId，再加载表和视图列表。')
    return
  }

  sourceViewsLoading[mode] = true
  try {
    const response = await $fetch<ApiResponse<SourceViewsPayload>>(endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`))
    sourceTables[mode] = response.data.tables || []
    sourceViews[mode] = response.data.views || []
    syncSourceNamesFromLookup(mode)
    setSuccess(`已加载 ${sourceTables[mode].length} 个表、${sourceViews[mode].length} 个视图。`)
  }
  catch (error: any) {
    sourceTables[mode] = []
    sourceViews[mode] = []
    setError(String(error?.data?.message || '加载表/视图失败。'))
  }
  finally {
    sourceViewsLoading[mode] = false
  }
}

function onAppTokenChanged(mode: TaskFormMode) {
  const form = getTaskForm(mode)
  const selected = sourceApps[mode].find(item => item.appToken === form.appToken)
  form.appName = selected?.name || ''
  void inspectSourceFieldsForWizard(mode, { fromAuto: true })
}

function onTableIdChanged(mode: TaskFormMode) {
  const form = getTaskForm(mode)
  const selected = sourceTables[mode].find(item => item.tableId === form.tableId)
  form.tableName = selected?.name || ''
  void inspectSourceFieldsForWizard(mode, { fromAuto: true })
}

function onViewIdChanged(mode: TaskFormMode) {
  const form = getTaskForm(mode)
  const selected = sourceViews[mode].find(item => item.viewId === form.viewId)
  form.viewName = selected?.name || ''
  void inspectSourceFieldsForWizard(mode, { fromAuto: true })
}

function normalizeKey(text: string): string {
  return String(text || '').trim().toLowerCase().replace(/[\s_\-]/g, '')
}

function getMappingOptionsByMode(mode: TaskFormMode): MappingOption[] {
  const form = getTaskForm(mode)
  return MAPPING_OPTIONS[form.targetType] || []
}

function addMappingWizardBinding(mode: TaskFormMode, preset?: Partial<MappingWizardBinding>) {
  mappingWizardBindings[mode].push({
    targetKey: String(preset?.targetKey || '').trim(),
    sourceField: String(preset?.sourceField || '').trim(),
    transform: String(preset?.transform || '').trim(),
  })
}

function removeMappingWizardBinding(mode: TaskFormMode, index: number) {
  if (index < 0 || index >= mappingWizardBindings[mode].length)
    return
  mappingWizardBindings[mode].splice(index, 1)
}

function pickMappingFromRaw(raw: Record<string, unknown>): {
  schemaVersion: number
  fieldMap: Record<string, string>
  computedMap: Record<string, string>
  externalIdField: string
  contestExternalIdField: string
  trackExternalIdField: string
} {
  const schemaVersion = Number(raw.schemaVersion || 0)
  const fieldMap: Record<string, string> = {}
  const computedMap: Record<string, string> = {}
  let externalIdField = String(raw.externalIdField || '').trim()
  let contestExternalIdField = String(raw.contestExternalIdField || '').trim()
  let trackExternalIdField = String(raw.trackExternalIdField || '').trim()

  if (schemaVersion === 2 && Array.isArray(raw.layers)) {
    const match = (raw.match && typeof raw.match === 'object' && !Array.isArray(raw.match))
      ? raw.match as Record<string, unknown>
      : {}
    externalIdField = String(match.externalIdField || externalIdField || '').trim()
    contestExternalIdField = String(match.contestExternalIdField || contestExternalIdField || '').trim()
    trackExternalIdField = String(match.trackExternalIdField || trackExternalIdField || '').trim()

    for (const layerRaw of raw.layers) {
      if (!layerRaw || typeof layerRaw !== 'object' || Array.isArray(layerRaw))
        continue
      const layer = layerRaw as Record<string, unknown>
      if (layer.enabled === false)
        continue
      const scopeType = String(layer.scopeType || 'global').trim()
      if (scopeType !== 'global')
        continue
      const layerFieldMap = (layer.fieldMap && typeof layer.fieldMap === 'object' && !Array.isArray(layer.fieldMap))
        ? layer.fieldMap as Record<string, unknown>
        : {}
      for (const [key, value] of Object.entries(layerFieldMap)) {
        const fieldName = String(value || '').trim()
        if (!fieldName)
          continue
        fieldMap[key] = fieldName
      }
      const fieldBindings = Array.isArray(layer.fieldBindings) ? layer.fieldBindings : []
      for (const item of fieldBindings) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          continue
        const binding = item as Record<string, unknown>
        const key = String(binding.key || '').trim()
        const sourceField = String(binding.sourceField || '').trim()
        const transform = String(binding.transform || '').trim()
        if (key && sourceField)
          fieldMap[key] = sourceField
        if (key && transform)
          computedMap[key] = transform
      }
    }
  }
  else {
    const rawFieldMap = (raw.fieldMap && typeof raw.fieldMap === 'object' && !Array.isArray(raw.fieldMap))
      ? raw.fieldMap as Record<string, unknown>
      : {}
    const rawComputedMap = (raw.computedMap && typeof raw.computedMap === 'object' && !Array.isArray(raw.computedMap))
      ? raw.computedMap as Record<string, unknown>
      : {}
    for (const [key, value] of Object.entries(rawFieldMap)) {
      const fieldName = String(value || '').trim()
      if (!fieldName)
        continue
      fieldMap[key] = fieldName
    }
    for (const [key, value] of Object.entries(rawComputedMap)) {
      const transform = String(value || '').trim()
      if (!transform)
        continue
      computedMap[key] = transform
    }
  }

  return {
    schemaVersion,
    fieldMap,
    computedMap,
    externalIdField,
    contestExternalIdField,
    trackExternalIdField,
  }
}

function loadMappingWizardFromJson(mode: TaskFormMode) {
  const form = getTaskForm(mode)
  let mapping: Record<string, unknown>
  try {
    mapping = parseJsonText(form.mappingText, '字段映射')
  }
  catch (error) {
    setError(error instanceof Error ? error.message : '字段映射 JSON 解析失败。')
    return
  }

  const parsed = pickMappingFromRaw(mapping)
  const nextBindings: MappingWizardBinding[] = []
  for (const [key, fieldName] of Object.entries(parsed.fieldMap)) {
    nextBindings.push({
      targetKey: key,
      sourceField: fieldName,
      transform: parsed.computedMap[key] || '',
    })
  }
  if (parsed.externalIdField) {
    nextBindings.push({
      targetKey: 'externalId',
      sourceField: parsed.externalIdField,
      transform: parsed.computedMap.externalId || '',
    })
  }
  if (parsed.contestExternalIdField) {
    nextBindings.push({
      targetKey: 'contestExternalId',
      sourceField: parsed.contestExternalIdField,
      transform: parsed.computedMap.contestExternalId || '',
    })
  }
  if (parsed.trackExternalIdField) {
    nextBindings.push({
      targetKey: 'trackExternalId',
      sourceField: parsed.trackExternalIdField,
      transform: parsed.computedMap.trackExternalId || '',
    })
  }

  const dedup = new Map<string, MappingWizardBinding>()
  for (const item of nextBindings) {
    const key = String(item.targetKey || '').trim()
    if (!key)
      continue
    dedup.set(key, item)
  }
  mappingWizardBindings[mode] = [...dedup.values()]
  setSuccess('已根据 JSON 同步映射向导。')
}

function applyMappingWizardToJson(mode: TaskFormMode) {
  const form = getTaskForm(mode)
  let mapping: Record<string, unknown>
  try {
    mapping = parseJsonText(form.mappingText, '字段映射')
  }
  catch (error) {
    setError(error instanceof Error ? error.message : '字段映射 JSON 解析失败。')
    return
  }

  const fieldMap: Record<string, string> = {}
  const computedMap: Record<string, string> = {}
  let externalIdField = ''
  let contestExternalIdField = ''
  let trackExternalIdField = ''

  for (const item of mappingWizardBindings[mode]) {
    const key = String(item.targetKey || '').trim()
    const sourceField = String(item.sourceField || '').trim()
    const transform = String(item.transform || '').trim()
    if (!key || !sourceField)
      continue

    if (key === 'externalId')
      externalIdField = sourceField
    else if (key === 'contestExternalId')
      contestExternalIdField = sourceField
    else if (key === 'trackExternalId')
      trackExternalIdField = sourceField
    else
      fieldMap[key] = sourceField

    if (transform)
      computedMap[key] = transform
  }

  const schemaVersion = Number(mapping.schemaVersion || 0)
  if (schemaVersion === 2 && Array.isArray(mapping.layers)) {
    const source = {
      ...mapping,
    }
    const layers = Array.isArray(source.layers) ? [...source.layers] : []
    const restLayers = layers.filter((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return true
      return String((item as Record<string, unknown>).id || '') !== 'wizard_global'
    })
    const fieldBindings = Object.entries(computedMap).map(([key, transform]) => ({
      key,
      targetPath: key,
      sourceField: fieldMap[key] || (key === 'externalId'
        ? externalIdField
        : key === 'contestExternalId'
          ? contestExternalIdField
          : key === 'trackExternalId'
            ? trackExternalIdField
            : ''),
      transform,
    }))
    const hasWizardContent = Object.keys(fieldMap).length > 0
      || fieldBindings.length > 0
      || Boolean(externalIdField || contestExternalIdField || trackExternalIdField)
    if (hasWizardContent) {
      restLayers.push({
        id: 'wizard_global',
        scopeType: 'global',
        scopeValue: '*',
        priority: 0,
        enabled: true,
        fieldMap,
        fieldBindings,
        defaults: {},
      })
    }
    source.match = {
      ...(source.match && typeof source.match === 'object' && !Array.isArray(source.match) ? source.match : {}),
      externalIdField,
      contestExternalIdField,
      trackExternalIdField,
    }
    source.layers = restLayers
    form.mappingText = JSON.stringify(source, null, 2)
  }
  else {
    const source = {
      ...mapping,
      externalIdField,
      contestExternalIdField,
      trackExternalIdField,
      fieldMap,
      computedMap,
    }
    form.mappingText = JSON.stringify(source, null, 2)
  }

  setSuccess('已将映射向导内容写回 JSON。')
}

function guessFieldNameByTarget(targetKey: string, fields: FeishuFieldInspectionItem[]): string {
  const aliases = MAPPING_GUESS_ALIASES[targetKey] || [targetKey]
  const normalizedAliases = aliases.map(alias => normalizeKey(alias))
  for (const item of fields) {
    const fieldName = String(item.fieldName || '').trim()
    if (!fieldName)
      continue
    const normalizedField = normalizeKey(fieldName)
    if (normalizedAliases.includes(normalizedField))
      return fieldName
    if (normalizedAliases.some(alias => normalizedField.includes(alias) || alias.includes(normalizedField)))
      return fieldName
  }
  return ''
}

function autoFillMappingWizardBindings(mode: TaskFormMode) {
  const existing = new Map(mappingWizardBindings[mode].map(item => [item.targetKey, item]))
  const fields = mappingWizardFields[mode]
  for (const option of getMappingOptionsByMode(mode)) {
    if (existing.has(option.key))
      continue
    const guessedField = guessFieldNameByTarget(option.key, fields)
    if (!guessedField)
      continue
    existing.set(option.key, {
      targetKey: option.key,
      sourceField: guessedField,
      transform: '',
    })
  }
  mappingWizardBindings[mode] = [...existing.values()]
}

async function inspectSourceFieldsForWizard(mode: TaskFormMode, options: { fromAuto?: boolean } = {}) {
  const fromAuto = Boolean(options.fromAuto)
  const form = getTaskForm(mode)
  const appToken = String(form.appToken || '').trim()
  const tableId = String(form.tableId || '').trim()
  sourceFieldInspectInlineError[mode] = ''
  if (!appToken || !tableId) {
    mappingWizardFields[mode] = []
    if (!fromAuto)
      setError('请先填写 appToken 与 tableId，再执行字段巡检。')
    return
  }

  const previousFields = [...mappingWizardFields[mode]]
  sourceFieldInspectLoading[mode] = true
  try {
    const response = await $fetch<ApiResponse<FeishuFieldInspectionItem[]>>(endpoint('/admin/integrations/feishu/bitable/sources/inspect-fields'), {
      method: 'POST',
      body: {
        appToken,
        tableId,
        viewId: String(form.viewId || '').trim(),
        sampleRecords: 120,
      },
    })
    mappingWizardFields[mode] = response.data || []
    autoFillMappingWizardBindings(mode)
    if (!fromAuto)
      setSuccess(`已巡检 ${mappingWizardFields[mode].length} 个字段。`)
  }
  catch (error: any) {
    const message = String(error?.data?.message || '来源字段巡检失败。')
    sourceFieldInspectInlineError[mode] = message
    if (!previousFields.length)
      mappingWizardFields[mode] = []
    if (!fromAuto)
      setError(message)
  }
  finally {
    sourceFieldInspectLoading[mode] = false
  }
}

function targetTypeLabel(targetType: FeishuBitableTaskTargetType): string {
  if (targetType === 'contest')
    return '竞赛'
  if (targetType === 'track')
    return '赛道'
  return '资料'
}

function runStatusClass(status: FeishuBitableSyncRun['status']): string {
  if (status === 'success')
    return 'text-emerald-600'
  if (status === 'partial_success')
    return 'text-amber-600'
  if (status === 'failed')
    return 'text-rose-600'
  return 'text-slate-600'
}

function runStatusLabel(status: FeishuBitableSyncRun['status']): string {
  if (status === 'success')
    return '成功'
  if (status === 'partial_success')
    return '部分成功'
  if (status === 'failed')
    return '失败'
  return status
}

function triggerSourceLabel(source: FeishuBitableSyncRun['triggerSource']): string {
  if (source === 'manual')
    return '手动'
  if (source === 'event')
    return '事件'
  if (source === 'scheduled')
    return '定时'
  return source
}

function runModeLabel(run: FeishuBitableSyncRun): string {
  if (run.mode === 'delta')
    return `增量(${Number(run.deltaRecordCount || 0)})`
  return '全量'
}

function issueStatusLabel(status: FeishuSyncIssue['status']): string {
  if (status === 'open')
    return '待处理'
  if (status === 'resolved')
    return '已解决'
  if (status === 'ignored')
    return '已忽略'
  return status
}

function issueStatusColor(status: FeishuSyncIssue['status']): string {
  if (status === 'open')
    return 'red'
  if (status === 'resolved')
    return 'green'
  if (status === 'ignored')
    return 'gray'
  return 'arcoblue'
}

function scheduleModeLabel(mode: FeishuTaskScheduleMode): string {
  return mode === 'interval' ? '间隔' : 'Cron'
}

function scheduleSummary(task: FeishuBitableTask): string {
  if (!task.schedule.enabled)
    return '未启用'

  if (task.schedule.mode === 'interval')
    return `间隔 ${task.schedule.intervalMinutes || '-'} 分钟`

  return `Cron ${task.schedule.cronExpr || '-'}`
}

function buildValueSourceLabel(source: BuildValueSource | undefined): string {
  if (source === 'env')
    return '环境变量'
  if (source === 'runtime')
    return '构建推导'
  if (source === 'fallback')
    return '集成配置兜底'
  return '未命中'
}

function writebackSummary(task: FeishuBitableTask): string {
  const writeback = task.writeback
  if (!writeback || writeback.enabled === false)
    return '未启用'
  const fieldCount = Object.values(writeback.fields || {}).filter(value => String(value || '').trim().length > 0).length
  return `已启用（配置字段 ${fieldCount}）`
}

function latestRunSummary(task: FeishuBitableTask): string {
  if (task.latestRunSummary) {
    return `${runStatusLabel(task.latestRunSummary.status)} · ${formatDateTime(task.latestRunSummary.startedAt)}`
  }
  return task.lastRunAt ? `最近运行 ${formatDateTime(task.lastRunAt)}` : '尚未运行'
}

async function loadPermissions() {
  loadingPermissions.value = true
  try {
    const response = await $fetch<ApiResponse<AuthMeResult>>(endpoint('/auth/me'))
    permissions.value = response.data.user.platformPermissions || []
  }
  catch (error: any) {
    permissions.value = []
    setError(String(error?.data?.message || '权限加载失败，请先登录。'))
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
    const response = await $fetch<ApiResponse<FeishuIntegrationConfigView>>(endpoint('/admin/integrations/feishu/config'))
    config.value = response.data
    fillConfigForm(response.data)
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
    const response = await $fetch<ApiResponse<FeishuAdminOverview>>(endpoint('/admin/integrations/feishu/admin-overview'))
    adminOverview.value = response.data
  }
  catch (error: any) {
    adminOverview.value = null
    setError(String(error?.data?.message || '管理员概览加载失败。'))
  }
  finally {
    adminOverviewLoading.value = false
  }
}

async function manualAddContestAdmin(targetUserId: string) {
  if (!canManageConfig.value || !targetUserId)
    return

  manualAddingKey.value = `user:${targetUserId}`
  clearFeedback()
  try {
    const response = await $fetch<ApiResponse<FeishuAdminManualAddResult>>(endpoint('/admin/integrations/feishu/admin-members/manual-add'), {
      method: 'POST',
      body: {
        targetUserId,
      },
    })

    setSuccess(response.data.granted
      ? `已添加 ${response.data.username} 为 contest_admin。`
      : `${response.data.username} 已经是 contest_admin。`)
    await Promise.all([
      loadAdminOverview(),
      searchFeishuDirectoryCandidates(undefined, true),
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
    const response = await $fetch<ApiResponse<FeishuAdminManualAddResult>>(endpoint('/admin/integrations/feishu/admin-members/manual-add'), {
      method: 'POST',
      body: {
        targetUnionId: unionId,
      },
    })

    setSuccess(response.data.granted
      ? `已添加 ${response.data.username} 为 contest_admin。`
      : `${response.data.username} 已经是 contest_admin。`)
    await Promise.all([
      loadAdminOverview(),
      searchFeishuDirectoryCandidates(undefined, true),
    ])
  }
  catch (error: any) {
    setError(String(error?.data?.message || '按飞书成员添加管理员失败。'))
  }
  finally {
    manualAddingKey.value = ''
  }
}

async function loadTasks() {
  if (!canManageBitable.value) {
    tasks.value = []
    return
  }

  loadingTasks.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableTask[]>>(endpoint('/admin/integrations/feishu/bitable-tasks?includeInactive=true'))
    tasks.value = response.data || []
  }
  catch (error: any) {
    tasks.value = []
    setError(String(error?.data?.message || 'Bitable 任务加载失败。'))
  }
  finally {
    loadingTasks.value = false
  }
}

async function loadRuns() {
  if (!canManageBitable.value) {
    runs.value = []
    return
  }

  loadingRuns.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableSyncRun[]>>(endpoint('/admin/integrations/feishu/bitable-sync-runs?limit=50'))
    runs.value = response.data || []
  }
  catch (error: any) {
    runs.value = []
    setError(String(error?.data?.message || 'Bitable 运行日志加载失败。'))
  }
  finally {
    loadingRuns.value = false
  }
}

async function loadTaskDetail(taskId: string) {
  if (!taskId)
    return

  loadingTaskDetail.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableTaskDetail>>(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(taskId)}?runLimit=20&issueLimit=50`))
    taskDetail.value = response.data
  }
  catch (error: any) {
    taskDetail.value = null
    inspectedFields.value = []
    setError(String(error?.data?.message || '任务详情加载失败。'))
  }
  finally {
    loadingTaskDetail.value = false
  }
}

async function inspectTaskFields(taskId: string, sampleRecords = 120) {
  if (!taskId)
    return

  inspectingTaskId.value = taskId
  try {
    const response = await $fetch<ApiResponse<FeishuFieldInspectionItem[]>>(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(taskId)}/inspect-fields`), {
      method: 'POST',
      body: {
        sampleRecords,
      },
    })
    inspectedFields.value = response.data || []
  }
  catch (error: any) {
    inspectedFields.value = []
    setError(String(error?.data?.message || '字段巡检失败。'))
  }
  finally {
    inspectingTaskId.value = ''
  }
}

async function refreshTasksAndRuns() {
  await Promise.all([
    loadTasks(),
    loadRuns(),
  ])
}

async function maybeRefreshOpenedTaskDetail(taskId: string) {
  if (!detailDrawerVisible.value || !taskDetail.value || taskDetail.value.id !== taskId)
    return
  await loadTaskDetail(taskId)
  await inspectTaskFields(taskId)
}

async function initializePage() {
  clearFeedback()
  await loadPermissions()
  if (!canAccessPage.value)
    return

  await Promise.all([
    loadConfig(),
    loadTasks(),
    loadRuns(),
  ])
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
    const response = await $fetch<ApiResponse<FeishuIntegrationConfig>>(endpoint('/admin/integrations/feishu/config'), {
      method: 'PATCH',
      body: {
        enabled: configForm.enabled,
        appId: configForm.appId.trim(),
        oauthRedirectUri: configForm.oauthRedirectUri.trim(),
        webSdkScriptUrl: configForm.webSdkScriptUrl.trim(),
        startupNotifyEnabled: configForm.startupNotifyEnabled,
        startupNotifyChatId: configForm.startupNotifyChatId.trim(),
        startupNotifyRemark: configForm.startupNotifyRemark.trim(),
        startupFallbackVersion: configForm.startupFallbackVersion.trim(),
        startupFallbackCommitSha: configForm.startupFallbackCommitSha.trim(),
        appSecretMode: configForm.appSecretMode,
        appSecret: configForm.appSecret,
        eventTokenMode: configForm.eventTokenMode,
        eventToken: configForm.eventToken,
        eventEncryptKeyMode: configForm.eventEncryptKeyMode,
        eventEncryptKey: configForm.eventEncryptKey,
      },
    })

    config.value = response.data
    fillConfigForm(response.data)
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

function resetCreateTaskForm() {
  createTaskForm.name = ''
  createTaskForm.targetType = 'contest'
  createTaskForm.sourceInput = ''
  createTaskForm.sourceKeyword = ''
  createTaskForm.appName = ''
  createTaskForm.appToken = ''
  createTaskForm.tableName = ''
  createTaskForm.tableId = ''
  createTaskForm.viewName = ''
  createTaskForm.viewId = ''
  createTaskForm.sourceUrl = ''
  createTaskForm.isActive = true
  createTaskForm.mappingText = DEFAULT_MAPPING_TEXT
  createTaskForm.optionsText = DEFAULT_OPTIONS_TEXT
  createTaskForm.writebackText = DEFAULT_WRITEBACK_TEXT
  resetSourceLookupState('create')
  sourceFieldInspectInlineError.create = ''
  mappingWizardFields.create = []
  mappingWizardBindings.create = []
}

function openCreateTaskDialog() {
  resetCreateTaskForm()
  loadMappingWizardFromJson('create')
  createDialogVisible.value = true
}

function openConfigDialog() {
  clearFeedback()
  configDialogVisible.value = true
  void Promise.allSettled([
    loadAdminOverview(),
    searchFeishuDirectoryCandidates(''),
  ])
}

async function createTask() {
  if (!canManageBitable.value)
    return

  clearFeedback()
  const name = createTaskForm.name.trim()
  const appToken = createTaskForm.appToken.trim()
  const tableId = createTaskForm.tableId.trim()
  if (!name || !appToken || !tableId) {
    setError('新增任务时，名称、App Token、Table ID 为必填。')
    return
  }

  let mapping: Record<string, unknown>
  let options: Record<string, unknown>
  let writeback: FeishuBitableWritebackConfig
  try {
    mapping = parseJsonText(createTaskForm.mappingText, '字段映射')
    options = parseJsonText(createTaskForm.optionsText, '同步选项')
    writeback = parseJsonText(createTaskForm.writebackText, '状态回填配置') as FeishuBitableWritebackConfig
  }
  catch (error) {
    setError(error instanceof Error ? error.message : '任务参数解析失败。')
    return
  }

  creatingTask.value = true
  try {
    await $fetch(endpoint('/admin/integrations/feishu/bitable-tasks'), {
      method: 'POST',
      body: {
        name,
        targetType: createTaskForm.targetType,
        appToken,
        tableId,
        viewId: createTaskForm.viewId.trim(),
        source: buildTaskSourceConfig(createTaskForm),
        writeback,
        isActive: createTaskForm.isActive,
        mapping,
        options,
      },
    })
    createDialogVisible.value = false
    await loadTasks()
    setSuccess('Bitable 任务已创建。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || 'Bitable 任务创建失败。'))
  }
  finally {
    creatingTask.value = false
  }
}

function openEditTaskDialog(task: FeishuBitableTask) {
  editTaskForm.id = task.id
  editTaskForm.name = task.name
  editTaskForm.targetType = task.targetType
  editTaskForm.sourceInput = task.source?.sourceUrl || ''
  editTaskForm.sourceKeyword = ''
  editTaskForm.appName = task.source?.appName || ''
  editTaskForm.appToken = task.appToken
  editTaskForm.tableName = task.source?.tableName || ''
  editTaskForm.tableId = task.tableId
  editTaskForm.viewName = task.source?.viewName || ''
  editTaskForm.viewId = task.viewId
  editTaskForm.sourceUrl = task.source?.sourceUrl || ''
  editTaskForm.isActive = task.isActive
  editTaskForm.mappingText = JSON.stringify(task.mapping || {}, null, 2)
  editTaskForm.optionsText = JSON.stringify(task.options || {}, null, 2)
  editTaskForm.writebackText = JSON.stringify(task.writeback || {}, null, 2)
  resetSourceLookupState('edit')
  if (editTaskForm.appName && editTaskForm.appToken) {
    sourceApps.edit = [{
      appToken: editTaskForm.appToken,
      name: editTaskForm.appName,
    }]
  }
  if (editTaskForm.tableName && editTaskForm.tableId) {
    sourceTables.edit = [{
      tableId: editTaskForm.tableId,
      name: editTaskForm.tableName,
    }]
  }
  if (editTaskForm.viewName && editTaskForm.viewId) {
    sourceViews.edit = [{
      viewId: editTaskForm.viewId,
      name: editTaskForm.viewName,
    }]
  }
  sourceFieldInspectInlineError.edit = ''
  mappingWizardFields.edit = []
  loadMappingWizardFromJson('edit')
  void inspectSourceFieldsForWizard('edit', { fromAuto: true })
  editDialogVisible.value = true
}

async function submitEditTask() {
  if (!canManageBitable.value || !editTaskForm.id)
    return

  clearFeedback()
  let mapping: Record<string, unknown>
  let options: Record<string, unknown>
  let writeback: FeishuBitableWritebackConfig
  try {
    mapping = parseJsonText(editTaskForm.mappingText, '字段映射')
    options = parseJsonText(editTaskForm.optionsText, '同步选项')
    writeback = parseJsonText(editTaskForm.writebackText, '状态回填配置') as FeishuBitableWritebackConfig
  }
  catch (error) {
    setError(error instanceof Error ? error.message : '任务参数解析失败。')
    return
  }

  editingTask.value = true
  try {
    await $fetch(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(editTaskForm.id)}`), {
      method: 'PATCH',
      body: {
        name: editTaskForm.name.trim(),
        targetType: editTaskForm.targetType,
        appToken: editTaskForm.appToken.trim(),
        tableId: editTaskForm.tableId.trim(),
        viewId: editTaskForm.viewId.trim(),
        source: buildTaskSourceConfig(editTaskForm),
        writeback,
        isActive: editTaskForm.isActive,
        mapping,
        options,
      },
    })

    editDialogVisible.value = false
    await Promise.all([
      loadTasks(),
      maybeRefreshOpenedTaskDetail(editTaskForm.id),
    ])
    setSuccess('任务已更新。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '任务更新失败。'))
  }
  finally {
    editingTask.value = false
  }
}

function openScheduleDialog(task: FeishuBitableTask) {
  scheduleForm.taskId = task.id
  scheduleForm.taskName = task.name
  scheduleForm.enabled = Boolean(task.schedule.enabled)
  scheduleForm.mode = task.schedule.mode || 'interval'
  scheduleForm.intervalMinutes = Number(task.schedule.intervalMinutes || 60)
  scheduleForm.cronExpr = String(task.schedule.cronExpr || '0 * * * *')
  scheduleForm.timezone = String(task.schedule.timezone || 'Asia/Shanghai')
  scheduleDialogVisible.value = true
}

async function submitScheduleDialog() {
  if (!scheduleForm.taskId)
    return

  const validationMessage = scheduleValidationError.value
  if (validationMessage) {
    setError(validationMessage)
    return
  }

  savingSchedule.value = true
  clearFeedback()
  try {
    await $fetch(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(scheduleForm.taskId)}`), {
      method: 'PATCH',
      body: {
        schedule: {
          enabled: scheduleForm.enabled,
          mode: scheduleForm.mode,
          intervalMinutes: scheduleForm.mode === 'interval' ? Number(scheduleForm.intervalMinutes || 0) : null,
          cronExpr: scheduleForm.mode === 'cron' ? String(scheduleForm.cronExpr || '').trim() : null,
          timezone: String(scheduleForm.timezone || '').trim(),
        } satisfies Partial<FeishuTaskScheduleConfig>,
      },
    })

    scheduleDialogVisible.value = false
    await Promise.all([
      loadTasks(),
      maybeRefreshOpenedTaskDetail(scheduleForm.taskId),
    ])
    setSuccess('定时配置已更新。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '定时配置更新失败。'))
  }
  finally {
    savingSchedule.value = false
  }
}

async function openTaskDetail(task: FeishuBitableTask) {
  detailDrawerVisible.value = true
  await loadTaskDetail(task.id)
  await inspectTaskFields(task.id)
}

async function toggleTaskActive(task: FeishuBitableTask) {
  patchingTaskId.value = task.id
  clearFeedback()
  try {
    await $fetch(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(task.id)}`), {
      method: 'PATCH',
      body: {
        isActive: !task.isActive,
      },
    })

    await Promise.all([
      loadTasks(),
      maybeRefreshOpenedTaskDetail(task.id),
    ])
    setSuccess(`任务状态已切换为${task.isActive ? '停用' : '启用'}。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '任务状态切换失败。'))
  }
  finally {
    patchingTaskId.value = ''
  }
}

async function previewTask(task: FeishuBitableTask) {
  previewTaskId.value = task.id
  clearFeedback()
  try {
    const response = await $fetch<ApiResponse<{
      fetchedCount: number
      createdCount: number
      updatedCount: number
      skippedCount: number
      errorCount: number
      writebackSuccessCount?: number
      writebackErrorCount?: number
    }>>(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(task.id)}/preview`), {
      method: 'POST',
    })

    const payload = response.data
    taskActionMessages[task.id] = `预检：抓取 ${payload.fetchedCount}，可新增 ${payload.createdCount}，可更新 ${payload.updatedCount}，跳过 ${payload.skippedCount}，错误 ${payload.errorCount}，回填成功 ${Number(payload.writebackSuccessCount || 0)}，回填失败 ${Number(payload.writebackErrorCount || 0)}`
    await maybeRefreshOpenedTaskDetail(task.id)
    setSuccess('任务预检完成。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '任务预检失败。'))
  }
  finally {
    previewTaskId.value = ''
  }
}

async function runTask(task: FeishuBitableTask) {
  runningTaskId.value = task.id
  clearFeedback()
  try {
    const response = await $fetch<ApiResponse<{
      status: 'success' | 'partial_success' | 'failed'
      fetchedCount: number
      createdCount: number
      updatedCount: number
      skippedCount: number
      errorCount: number
      writebackSuccessCount?: number
      writebackErrorCount?: number
    }>>(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(task.id)}/run`), {
      method: 'POST',
    })

    const payload = response.data
    taskActionMessages[task.id] = `执行(${payload.status})：抓取 ${payload.fetchedCount}，新增 ${payload.createdCount}，更新 ${payload.updatedCount}，跳过 ${payload.skippedCount}，错误 ${payload.errorCount}，回填成功 ${Number(payload.writebackSuccessCount || 0)}，回填失败 ${Number(payload.writebackErrorCount || 0)}`

    await Promise.all([
      loadTasks(),
      loadRuns(),
      maybeRefreshOpenedTaskDetail(task.id),
    ])

    setSuccess('任务执行完成。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '任务执行失败。'))
  }
  finally {
    runningTaskId.value = ''
  }
}

onMounted(initializePage)
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-[13px] text-slate-900 tracking-tight font-bold uppercase">
            飞书任务中心
          </h1>
          <p class="text-[11px] text-slate-500 mt-1">
            统一管理飞书 Bitable 同步任务、定时调度、运行记录与关联问题。
          </p>
        </div>
        <NuxtLink
          to="/admin/integrations"
          class="text-[10px] text-slate-700 px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50"
        >
          返回集成中心
        </NuxtLink>
      </div>
    </section>

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
            <a-button size="small" type="primary" @click="openConfigDialog">
              打开配置
            </a-button>
          </div>

          <div class="text-[10px] text-slate-600 p-3 border border-slate-200 bg-slate-50 space-y-1">
            <p class="m-0">
              当前状态：{{ config?.enabled ? '已启用' : '未启用' }}，App ID：{{ config?.appId || '-' }}
            </p>
            <p class="m-0">
              当前生效版本：{{ config?.startupEffectiveVersion || '-' }}；
              Commit：{{ config?.startupEffectiveCommitSha || '-' }}
            </p>
            <p class="m-0 text-slate-500">
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
                飞书任务中心
              </h2>
              <p class="text-[10px] text-slate-500 m-0 mt-1">
                任务列表为主入口，支持详情查看、预检、手动执行、启停与定时调度配置。
              </p>
            </div>
            <div class="flex gap-2">
              <a-button size="small" type="primary" @click="openCreateTaskDialog">
                新建任务
              </a-button>
              <a-button size="small" :loading="loadingTasks || loadingRuns" @click="refreshTasksAndRuns">
                刷新
              </a-button>
            </div>
          </div>

          <a-table
            :columns="taskColumns"
            :data="tasks"
            :pagination="false"
            row-key="id"
            size="small"
            :bordered="{ cell: true }"
          >
            <template #name="{ record }">
              <div class="min-w-0">
                <p class="text-[11px] text-slate-900 font-semibold m-0 truncate">
                  {{ record.name }}
                </p>
                <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                  {{ record.id }}
                </p>
              </div>
            </template>

            <template #targetType="{ record }">
              {{ targetTypeLabel(record.targetType) }}
            </template>

            <template #source="{ record }">
              <p class="text-[10px] text-slate-600 font-mono m-0">
                {{ record.source?.appName || record.appToken }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1">
                {{ record.source?.tableName || record.tableId }} {{ (record.source?.viewName || record.viewId) ? ` / ${record.source?.viewName || record.viewId}` : '' }}
              </p>
              <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 break-all">
                {{ record.appToken }} / {{ record.tableId }}{{ record.viewId ? ` / ${record.viewId}` : '' }}
              </p>
            </template>

            <template #schedule="{ record }">
              <div>
                <a-tag :color="record.schedule.enabled ? 'blue' : 'gray'" size="small">
                  {{ record.schedule.enabled ? scheduleModeLabel(record.schedule.mode) : '未启用' }}
                </a-tag>
                <p class="text-[10px] text-slate-600 m-0 mt-1">
                  {{ scheduleSummary(record) }}
                </p>
                <p class="text-[10px] text-slate-400 m-0 mt-1">
                  下次：{{ formatDateTime(record.scheduleRuntime.nextRunAt) }}
                </p>
              </div>
            </template>

            <template #isActive="{ record }">
              <a-tag :color="record.isActive ? 'green' : 'gray'" size="small">
                {{ record.isActive ? 'active' : 'inactive' }}
              </a-tag>
            </template>

            <template #latestRun="{ record }">
              <div>
                <p class="text-[10px] text-slate-700 m-0">
                  {{ latestRunSummary(record) }}
                </p>
                <p v-if="record.scheduleRuntime.lastError" class="text-[10px] text-rose-600 m-0 mt-1 break-all line-clamp-2">
                  调度错误：{{ record.scheduleRuntime.lastError }}
                </p>
              </div>
            </template>

            <template #actions="{ record }">
              <div class="flex flex-wrap gap-1">
                <a-button size="mini" @click="openTaskDetail(record)">
                  详情
                </a-button>
                <a-button size="mini" :loading="previewTaskId === record.id" @click="previewTask(record)">
                  预检
                </a-button>
                <a-button size="mini" type="primary" :loading="runningTaskId === record.id" @click="runTask(record)">
                  手动执行
                </a-button>
                <a-button size="mini" :loading="patchingTaskId === record.id" @click="toggleTaskActive(record)">
                  {{ record.isActive ? '停用' : '启用' }}
                </a-button>
                <a-button size="mini" @click="openEditTaskDialog(record)">
                  编辑
                </a-button>
                <a-button size="mini" @click="openScheduleDialog(record)">
                  定时设置
                </a-button>
              </div>
              <p v-if="taskActionMessages[record.id]" class="text-[10px] text-slate-500 m-0 mt-1">
                {{ taskActionMessages[record.id] }}
              </p>
            </template>
          </a-table>

          <section class="space-y-2">
            <h3 class="text-[11px] text-slate-900 font-semibold m-0">
              全局执行记录
            </h3>
            <a-table
              :columns="runColumns"
              :data="runs"
              :pagination="false"
              row-key="id"
              size="small"
              :bordered="{ cell: true }"
            >
              <template #startedAt="{ record }">
                {{ formatDateTime(record.startedAt) }}
              </template>

              <template #triggerSource="{ record }">
                {{ triggerSourceLabel(record.triggerSource) }}
              </template>

              <template #status="{ record }">
                <span :class="runStatusClass(record.status)">
                  {{ runStatusLabel(record.status) }}
                </span>
              </template>

              <template #stats="{ record }">
                {{ runModeLabel(record) }} /
                抓取 {{ record.fetchedCount }} /
                新增 {{ record.createdCount }} /
                更新 {{ record.updatedCount }} /
                跳过 {{ record.skippedCount }} /
                错误 {{ record.errorCount }}
              </template>

              <template #errorMessage="{ record }">
                <span class="text-[10px]" :class="record.errorMessage ? 'text-rose-600' : 'text-slate-400'">
                  {{ record.errorMessage || '-' }}
                </span>
              </template>
            </a-table>
          </section>
        </section>
      </template>
    </template>

    <a-drawer
      v-model:visible="configDialogVisible"
      title="飞书集成配置"
      :mask-closable="!savingConfig"
      :closable="!savingConfig"
      :esc-to-close="!savingConfig"
      width="980px"
    >
      <div class="space-y-3">
        <div class="gap-2 grid md:grid-cols-2">
          <label class="text-[10px] text-slate-600 font-medium block">
            启用状态
            <div class="mt-1">
              <a-switch v-model="configForm.enabled" />
            </div>
          </label>

          <label class="text-[10px] text-slate-600 font-medium block">
            App ID
            <a-input v-model="configForm.appId" class="mt-1" allow-clear size="small" placeholder="cli_xxx" />
          </label>

          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2">
            OAuth Redirect URI
            <a-input v-model="configForm.oauthRedirectUri" class="mt-1" allow-clear size="small" placeholder="https://domain/api/auth/feishu/callback" />
          </label>

          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2">
            Web SDK Script URL
            <a-input v-model="configForm.webSdkScriptUrl" class="mt-1" allow-clear size="small" placeholder="https://.../h5-js-sdk.js" />
          </label>

          <div class="p-2 border border-slate-200 bg-slate-50 space-y-2 md:col-span-2">
            <div class="flex gap-2 items-center justify-between">
              <p class="text-[10px] text-slate-600 font-semibold m-0">
                启动通知渠道（进程首次启动）
              </p>
              <a-switch v-model="configForm.startupNotifyEnabled" />
            </div>
            <label class="text-[10px] text-slate-600 font-medium block">
              飞书群 chat_id
              <a-input
                v-model="configForm.startupNotifyChatId"
                class="mt-1"
                allow-clear
                size="small"
                placeholder="oc_xxx"
              />
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
            <div class="gap-2 grid md:grid-cols-2">
              <label class="text-[10px] text-slate-600 font-medium block">
                兜底 Version
                <a-input
                  v-model="configForm.startupFallbackVersion"
                  class="mt-1"
                  allow-clear
                  size="small"
                  placeholder="v2026.03.29-main"
                />
              </label>
              <label class="text-[10px] text-slate-600 font-medium block">
                兜底 Commit SHA
                <a-input
                  v-model="configForm.startupFallbackCommitSha"
                  class="mt-1"
                  allow-clear
                  size="small"
                  placeholder="fe77787"
                />
              </label>
            </div>
            <p class="text-[10px] text-slate-500 m-0">
              版本优先级：CI/CD 环境变量（WINLOOP_BUILD_VERSION / WINLOOP_BUILD_COMMIT_SHA）> 构建推导（git）> 集成配置兜底值。
            </p>
          </div>

          <div class="p-2 border border-slate-200 bg-slate-50 space-y-2 md:col-span-2">
            <p class="text-[10px] text-slate-600 font-semibold m-0">
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

          <div class="p-2 border border-slate-200 bg-slate-50 space-y-2 md:col-span-2">
            <p class="text-[10px] text-slate-600 font-semibold m-0">
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

          <div class="p-2 border border-slate-200 bg-slate-50 space-y-2 md:col-span-2">
            <p class="text-[10px] text-slate-600 font-semibold m-0">
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

        <div class="text-[10px] text-slate-500 p-2 border border-slate-200 bg-white space-y-1">
          <p class="m-0">
            App Secret：{{ config?.appSecretConfigured ? '已配置' : '未配置' }}；
            Event Token：{{ config?.eventTokenConfigured ? '已配置' : '未配置' }}；
            Event Encrypt Key：{{ config?.eventEncryptKeyConfigured ? '已配置' : '未配置' }}
          </p>
          <p v-if="config?.updatedAt" class="m-0">
            最近更新：{{ config.updatedAt }}（{{ config.updatedByUserId || 'unknown' }}）
          </p>
        </div>

        <div class="p-2 border border-slate-200 bg-white space-y-2">
          <div class="flex gap-2 items-center justify-between">
            <p class="text-[10px] text-slate-700 font-semibold m-0">
              平台管理员概览
            </p>
            <a-button size="mini" :loading="adminOverviewLoading" @click="loadAdminOverview">
              刷新概览
            </a-button>
          </div>
          <p v-if="adminOverview?.notice" class="text-[10px] text-slate-600 m-0 p-2 border border-slate-200 bg-slate-50">
            {{ adminOverview.notice }}
          </p>
          <section class="p-2 border border-slate-200 bg-slate-50 space-y-1">
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
                class="p-1 border border-slate-200 bg-white"
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

        <AdminFeishuDirectoryPicker
          v-model:keyword="feishuDirectoryKeyword"
          :loading="feishuDirectoryLoading"
          :candidates="feishuDirectoryCandidates"
          :notice="feishuDirectoryNotice"
          :source="feishuDirectorySource"
          :from-cache="feishuDirectoryFromCache"
          :fetched-at="feishuDirectoryFetchedAt"
          :cache-expires-at="feishuDirectoryCacheExpiresAt"
          :total-members="feishuDirectoryTotalMembers"
          :permission-hint="feishuDirectoryPermissionHint"
          :manual-adding-key="manualAddingKey"
          @search="forceRefresh => searchFeishuDirectoryCandidates(undefined, forceRefresh)"
          @add-user="manualAddContestAdmin"
          @add-union="manualAddContestAdminByUnionId"
        />

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
      v-model:visible="createDialogVisible"
      title="新建 Bitable 任务"
      :mask-closable="!creatingTask"
      :closable="!creatingTask"
      :esc-to-close="!creatingTask"
      width="980px"
    >
      <div class="space-y-2">
        <div class="gap-2 grid md:grid-cols-2 xl:grid-cols-3">
          <label class="text-[10px] text-slate-600 font-medium block">
            任务名称
            <a-input v-model="createTaskForm.name" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            目标类型
            <a-select v-model="createTaskForm.targetType" class="mt-1" size="small">
              <a-option value="contest">
                contest
              </a-option>
              <a-option value="track">
                track
              </a-option>
              <a-option value="resource">
                resource
              </a-option>
            </a-select>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            启用状态
            <div class="mt-1">
              <a-switch v-model="createTaskForm.isActive" />
            </div>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            来源辅助检索（可选）
            <div class="mt-1 flex gap-2">
              <a-input v-model="createTaskForm.sourceKeyword" allow-clear size="small" placeholder="输入多维库名称或 appToken（仅辅助）" />
              <a-button size="small" :loading="sourceSearchLoading.create" @click="searchBitableSources('create')">
                搜索
              </a-button>
            </div>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            多维库候选（可选）
            <a-select
              v-model="createTaskForm.appToken"
              class="mt-1"
              allow-search
              allow-clear
              size="small"
              placeholder="可选：从检索结果选择 appToken"
              @change="onAppTokenChanged('create')"
            >
              <a-option v-for="item in sourceApps.create" :key="item.appToken" :value="item.appToken">
                {{ item.name }} ({{ item.appToken }})
              </a-option>
            </a-select>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            粘贴来源链接 / 标识自动解析
            <div class="mt-1 flex gap-2">
              <a-input v-model="createTaskForm.sourceInput" allow-clear size="small" placeholder="支持 URL 或 appToken/tableId/viewId 文本" />
              <a-button size="small" :loading="sourceResolveLoading.create" @click="resolveBitableSourceInput('create')">
                解析
              </a-button>
            </div>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            App Token
            <a-input v-model="createTaskForm.appToken" class="mt-1" allow-clear size="small" @blur="onAppTokenChanged('create')" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            Table ID
            <a-input v-model="createTaskForm.tableId" class="mt-1" allow-clear size="small" @blur="onTableIdChanged('create')" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            View ID
            <a-input v-model="createTaskForm.viewId" class="mt-1" allow-clear size="small" @blur="onViewIdChanged('create')" />
          </label>
          <p class="text-[10px] text-slate-500 m-0 md:col-span-2 xl:col-span-3">
            说明：这里的 `appToken/tableId/viewId` 是“飞书多维库/表/视图”标识，不是飞书开放平台配置里的 `appId/appSecret`。
          </p>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            表/视图候选（需先填 appToken + tableId）
            <div class="mt-1 flex gap-2">
              <a-button size="small" :loading="sourceViewsLoading.create" @click="loadBitableTablesAndViews('create')">
                加载表和视图
              </a-button>
              <a-select
                v-model="createTaskForm.tableId"
                class="flex-1"
                allow-search
                allow-clear
                size="small"
                placeholder="可选：从候选中选择 table"
                @change="onTableIdChanged('create')"
              >
                <a-option v-for="item in sourceTables.create" :key="item.tableId" :value="item.tableId">
                  {{ item.name }} ({{ item.tableId }})
                </a-option>
              </a-select>
              <a-select
                v-model="createTaskForm.viewId"
                class="flex-1"
                allow-search
                allow-clear
                size="small"
                placeholder="可选：从候选中选择 view"
                @change="onViewIdChanged('create')"
              >
                <a-option v-for="item in sourceViews.create" :key="item.viewId" :value="item.viewId">
                  {{ item.name }} ({{ item.viewId }})
                </a-option>
              </a-select>
            </div>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            App 名称（可选）
            <a-input v-model="createTaskForm.appName" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            Table 名称（可选）
            <a-input v-model="createTaskForm.tableName" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            View 名称（可选）
            <a-input v-model="createTaskForm.viewName" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            来源 URL（可选）
            <a-input v-model="createTaskForm.sourceUrl" class="mt-1" allow-clear size="small" />
          </label>
          <div class="text-[10px] text-slate-600 font-medium p-2 border border-slate-200 bg-slate-50 block space-y-2 md:col-span-2 xl:col-span-3">
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <span class="text-slate-700">字段概览</span>
              <span class="text-slate-500">字段总数：{{ mappingWizardFields.create.length }}</span>
            </div>
            <p v-if="sourceFieldInspectLoading.create" class="text-slate-500 m-0">
              字段巡检中...
            </p>
            <p v-if="sourceFieldInspectInlineError.create" class="text-rose-600 m-0 break-all">
              {{ sourceFieldInspectInlineError.create }}
            </p>
            <p
              v-if="sourceFieldInspectInlineError.create && mappingWizardFields.create.length"
              class="text-[10px] text-amber-600 m-0"
            >
              当前展示上次成功巡检结果，请修复后重试。
            </p>
            <p
              v-if="!sourceFieldInspectLoading.create && !sourceFieldInspectInlineError.create && !mappingWizardFields.create.length"
              class="text-slate-500 m-0"
            >
              {{ fieldOverviewEmptyText('create') }}
            </p>
            <div v-if="mappingWizardFields.create.length" class="max-h-[180px] overflow-auto space-y-1">
              <div
                v-for="field in mappingWizardFields.create"
                :key="`create-field-${field.fieldName}`"
                class="p-2 border border-slate-200 bg-white"
              >
                <div class="flex flex-wrap gap-1 items-center justify-between">
                  <span class="text-slate-900 font-medium break-all">{{ field.fieldName }}</span>
                  <span class="text-slate-500">样本命中 {{ field.sampleCount }}</span>
                </div>
                <p class="text-slate-500 m-0 mt-1 break-all">
                  样本：{{ fieldSamplePreview(field.sampleValues) }}
                </p>
              </div>
            </div>
          </div>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            字段映射 JSON
            <a-textarea
              v-model="createTaskForm.mappingText"
              class="mt-1"
              :auto-size="{ minRows: 6, maxRows: 12 }"
            />
          </label>
          <div class="text-[10px] text-slate-600 font-medium p-2 border border-slate-200 bg-slate-50 block space-y-2 md:col-span-2 xl:col-span-3">
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <span>字段映射向导（可选）</span>
              <div class="flex flex-wrap gap-2">
                <a-button size="mini" :loading="sourceFieldInspectLoading.create" @click="inspectSourceFieldsForWizard('create')">
                  巡检字段
                </a-button>
                <a-button size="mini" @click="loadMappingWizardFromJson('create')">
                  从 JSON 读取
                </a-button>
                <a-button size="mini" type="primary" @click="applyMappingWizardToJson('create')">
                  写回 JSON
                </a-button>
              </div>
            </div>
            <p class="text-slate-500 m-0">
              解析或切换来源后会自动刷新候选，必要时可手动“巡检字段”重试。
            </p>
            <div class="space-y-2">
              <div v-for="(item, index) in mappingWizardBindings.create" :key="`create-${index}`" class="p-2 border border-slate-200 bg-white space-y-2">
                <div class="gap-2 grid items-center md:grid-cols-[180px,1fr,1fr,70px]">
                  <a-select v-model="item.targetKey" allow-search size="small" placeholder="目标字段">
                    <a-option v-for="option in getMappingOptionsByMode('create')" :key="option.key" :value="option.key">
                      {{ option.label }}
                    </a-option>
                  </a-select>
                  <a-select v-model="item.sourceField" allow-search allow-create size="small" placeholder="来源字段">
                    <a-option v-for="field in mappingWizardFields.create" :key="field.fieldName" :value="field.fieldName">
                      {{ field.fieldName }}
                    </a-option>
                  </a-select>
                  <a-input v-model="item.transform" allow-clear size="small" placeholder="可选：jsonata transform" />
                  <a-button size="mini" status="danger" @click="removeMappingWizardBinding('create', index)">
                    删除
                  </a-button>
                </div>
                <p
                  v-if="item.sourceField"
                  class="text-slate-500 m-0 break-all"
                >
                  样本：{{ fieldSamplePreview(mappingWizardFields.create.find(field => field.fieldName === item.sourceField)?.sampleValues || []) }}
                </p>
                <p v-if="isMappingSourceFieldInvalid('create', item.sourceField)" class="text-rose-600 m-0 break-all">
                  当前来源字段不存在（已失效，请重新选择）。
                </p>
              </div>
              <a-button size="mini" @click="addMappingWizardBinding('create')">
                + 添加映射行
              </a-button>
            </div>
          </div>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            同步选项 JSON
            <a-textarea
              v-model="createTaskForm.optionsText"
              class="mt-1"
              :auto-size="{ minRows: 6, maxRows: 12 }"
            />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            状态回填 JSON
            <a-textarea
              v-model="createTaskForm.writebackText"
              class="mt-1"
              :auto-size="{ minRows: 6, maxRows: 12 }"
            />
          </label>
        </div>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="creatingTask" @click="createDialogVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="creatingTask" @click="createTask">
            创建任务
          </a-button>
        </div>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="editDialogVisible"
      title="编辑 Bitable 任务"
      :mask-closable="!editingTask"
      :closable="!editingTask"
      :esc-to-close="!editingTask"
      width="980px"
    >
      <div class="space-y-2">
        <div class="gap-2 grid md:grid-cols-2 xl:grid-cols-3">
          <label class="text-[10px] text-slate-600 font-medium block">
            任务名称
            <a-input v-model="editTaskForm.name" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            目标类型
            <a-select v-model="editTaskForm.targetType" class="mt-1" size="small">
              <a-option value="contest">
                contest
              </a-option>
              <a-option value="track">
                track
              </a-option>
              <a-option value="resource">
                resource
              </a-option>
            </a-select>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            启用状态
            <div class="mt-1">
              <a-switch v-model="editTaskForm.isActive" />
            </div>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            来源辅助检索（可选）
            <div class="mt-1 flex gap-2">
              <a-input v-model="editTaskForm.sourceKeyword" allow-clear size="small" placeholder="输入多维库名称或 appToken（仅辅助）" />
              <a-button size="small" :loading="sourceSearchLoading.edit" @click="searchBitableSources('edit')">
                搜索
              </a-button>
            </div>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            多维库候选（可选）
            <a-select
              v-model="editTaskForm.appToken"
              class="mt-1"
              allow-search
              allow-clear
              size="small"
              placeholder="可选：从检索结果选择 appToken"
              @change="onAppTokenChanged('edit')"
            >
              <a-option v-for="item in sourceApps.edit" :key="item.appToken" :value="item.appToken">
                {{ item.name }} ({{ item.appToken }})
              </a-option>
            </a-select>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            粘贴来源链接 / 标识自动解析
            <div class="mt-1 flex gap-2">
              <a-input v-model="editTaskForm.sourceInput" allow-clear size="small" placeholder="支持 URL 或 appToken/tableId/viewId 文本" />
              <a-button size="small" :loading="sourceResolveLoading.edit" @click="resolveBitableSourceInput('edit')">
                解析
              </a-button>
            </div>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            App Token
            <a-input v-model="editTaskForm.appToken" class="mt-1" allow-clear size="small" @blur="onAppTokenChanged('edit')" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            Table ID
            <a-input v-model="editTaskForm.tableId" class="mt-1" allow-clear size="small" @blur="onTableIdChanged('edit')" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            View ID
            <a-input v-model="editTaskForm.viewId" class="mt-1" allow-clear size="small" @blur="onViewIdChanged('edit')" />
          </label>
          <p class="text-[10px] text-slate-500 m-0 md:col-span-2 xl:col-span-3">
            说明：这里的 `appToken/tableId/viewId` 是“飞书多维库/表/视图”标识，不是飞书开放平台配置里的 `appId/appSecret`。
          </p>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            表/视图候选（需先填 appToken + tableId）
            <div class="mt-1 flex gap-2">
              <a-button size="small" :loading="sourceViewsLoading.edit" @click="loadBitableTablesAndViews('edit')">
                加载表和视图
              </a-button>
              <a-select
                v-model="editTaskForm.tableId"
                class="flex-1"
                allow-search
                allow-clear
                size="small"
                placeholder="可选：从候选中选择 table"
                @change="onTableIdChanged('edit')"
              >
                <a-option v-for="item in sourceTables.edit" :key="item.tableId" :value="item.tableId">
                  {{ item.name }} ({{ item.tableId }})
                </a-option>
              </a-select>
              <a-select
                v-model="editTaskForm.viewId"
                class="flex-1"
                allow-search
                allow-clear
                size="small"
                placeholder="可选：从候选中选择 view"
                @change="onViewIdChanged('edit')"
              >
                <a-option v-for="item in sourceViews.edit" :key="item.viewId" :value="item.viewId">
                  {{ item.name }} ({{ item.viewId }})
                </a-option>
              </a-select>
            </div>
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            App 名称（可选）
            <a-input v-model="editTaskForm.appName" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            Table 名称（可选）
            <a-input v-model="editTaskForm.tableName" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            View 名称（可选）
            <a-input v-model="editTaskForm.viewName" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            来源 URL（可选）
            <a-input v-model="editTaskForm.sourceUrl" class="mt-1" allow-clear size="small" />
          </label>
          <div class="text-[10px] text-slate-600 font-medium p-2 border border-slate-200 bg-slate-50 block space-y-2 md:col-span-2 xl:col-span-3">
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <span class="text-slate-700">字段概览</span>
              <span class="text-slate-500">字段总数：{{ mappingWizardFields.edit.length }}</span>
            </div>
            <p v-if="sourceFieldInspectLoading.edit" class="text-slate-500 m-0">
              字段巡检中...
            </p>
            <p v-if="sourceFieldInspectInlineError.edit" class="text-rose-600 m-0 break-all">
              {{ sourceFieldInspectInlineError.edit }}
            </p>
            <p
              v-if="sourceFieldInspectInlineError.edit && mappingWizardFields.edit.length"
              class="text-[10px] text-amber-600 m-0"
            >
              当前展示上次成功巡检结果，请修复后重试。
            </p>
            <p
              v-if="!sourceFieldInspectLoading.edit && !sourceFieldInspectInlineError.edit && !mappingWizardFields.edit.length"
              class="text-slate-500 m-0"
            >
              {{ fieldOverviewEmptyText('edit') }}
            </p>
            <div v-if="mappingWizardFields.edit.length" class="max-h-[180px] overflow-auto space-y-1">
              <div
                v-for="field in mappingWizardFields.edit"
                :key="`edit-field-${field.fieldName}`"
                class="p-2 border border-slate-200 bg-white"
              >
                <div class="flex flex-wrap gap-1 items-center justify-between">
                  <span class="text-slate-900 font-medium break-all">{{ field.fieldName }}</span>
                  <span class="text-slate-500">样本命中 {{ field.sampleCount }}</span>
                </div>
                <p class="text-slate-500 m-0 mt-1 break-all">
                  样本：{{ fieldSamplePreview(field.sampleValues) }}
                </p>
              </div>
            </div>
          </div>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            字段映射 JSON
            <a-textarea
              v-model="editTaskForm.mappingText"
              class="mt-1"
              :auto-size="{ minRows: 6, maxRows: 12 }"
            />
          </label>
          <div class="text-[10px] text-slate-600 font-medium p-2 border border-slate-200 bg-slate-50 block space-y-2 md:col-span-2 xl:col-span-3">
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <span>字段映射向导（可选）</span>
              <div class="flex flex-wrap gap-2">
                <a-button size="mini" :loading="sourceFieldInspectLoading.edit" @click="inspectSourceFieldsForWizard('edit')">
                  巡检字段
                </a-button>
                <a-button size="mini" @click="loadMappingWizardFromJson('edit')">
                  从 JSON 读取
                </a-button>
                <a-button size="mini" type="primary" @click="applyMappingWizardToJson('edit')">
                  写回 JSON
                </a-button>
              </div>
            </div>
            <p class="text-slate-500 m-0">
              解析或切换来源后会自动刷新候选，对已配置任务可先“从 JSON 读取”再调整。
            </p>
            <div class="space-y-2">
              <div v-for="(item, index) in mappingWizardBindings.edit" :key="`edit-${index}`" class="p-2 border border-slate-200 bg-white space-y-2">
                <div class="gap-2 grid items-center md:grid-cols-[180px,1fr,1fr,70px]">
                  <a-select v-model="item.targetKey" allow-search size="small" placeholder="目标字段">
                    <a-option v-for="option in getMappingOptionsByMode('edit')" :key="option.key" :value="option.key">
                      {{ option.label }}
                    </a-option>
                  </a-select>
                  <a-select v-model="item.sourceField" allow-search allow-create size="small" placeholder="来源字段">
                    <a-option v-for="field in mappingWizardFields.edit" :key="field.fieldName" :value="field.fieldName">
                      {{ field.fieldName }}
                    </a-option>
                  </a-select>
                  <a-input v-model="item.transform" allow-clear size="small" placeholder="可选：jsonata transform" />
                  <a-button size="mini" status="danger" @click="removeMappingWizardBinding('edit', index)">
                    删除
                  </a-button>
                </div>
                <p
                  v-if="item.sourceField"
                  class="text-slate-500 m-0 break-all"
                >
                  样本：{{ fieldSamplePreview(mappingWizardFields.edit.find(field => field.fieldName === item.sourceField)?.sampleValues || []) }}
                </p>
                <p v-if="isMappingSourceFieldInvalid('edit', item.sourceField)" class="text-rose-600 m-0 break-all">
                  当前来源字段不存在（已失效，请重新选择）。
                </p>
              </div>
              <a-button size="mini" @click="addMappingWizardBinding('edit')">
                + 添加映射行
              </a-button>
            </div>
          </div>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            同步选项 JSON
            <a-textarea
              v-model="editTaskForm.optionsText"
              class="mt-1"
              :auto-size="{ minRows: 6, maxRows: 12 }"
            />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            状态回填 JSON
            <a-textarea
              v-model="editTaskForm.writebackText"
              class="mt-1"
              :auto-size="{ minRows: 6, maxRows: 12 }"
            />
          </label>
        </div>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="editingTask" @click="editDialogVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="editingTask" @click="submitEditTask">
            保存任务
          </a-button>
        </div>
      </div>
    </a-drawer>

    <a-modal
      v-model:visible="scheduleDialogVisible"
      title="定时执行配置"
      :footer="false"
      :mask-closable="!savingSchedule"
      :closable="!savingSchedule"
      class="max-w-[620px]"
    >
      <div class="space-y-3">
        <p class="text-[11px] text-slate-600 m-0">
          任务：<span class="text-slate-900 font-semibold">{{ scheduleForm.taskName || '-' }}</span>
        </p>

        <div class="gap-2 grid md:grid-cols-2">
          <label class="text-[10px] text-slate-600 font-medium block">
            启用定时
            <div class="mt-1">
              <a-switch v-model="scheduleForm.enabled" />
            </div>
          </label>

          <label class="text-[10px] text-slate-600 font-medium block">
            调度模式
            <a-select v-model="scheduleForm.mode" class="mt-1" size="small" :disabled="!scheduleForm.enabled">
              <a-option value="interval">
                interval
              </a-option>
              <a-option value="cron">
                cron
              </a-option>
            </a-select>
          </label>

          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2">
            时区
            <a-input v-model="scheduleForm.timezone" class="mt-1" size="small" :disabled="!scheduleForm.enabled" placeholder="Asia/Shanghai" />
          </label>

          <label v-if="scheduleForm.mode === 'interval'" class="text-[10px] text-slate-600 font-medium block md:col-span-2">
            间隔分钟（>=5）
            <a-input-number v-model="scheduleForm.intervalMinutes" class="mt-1 w-full" size="small" :min="5" :step="1" :disabled="!scheduleForm.enabled" />
          </label>

          <label v-else class="text-[10px] text-slate-600 font-medium block md:col-span-2">
            Cron（5 段）
            <a-input v-model="scheduleForm.cronExpr" class="mt-1" size="small" :disabled="!scheduleForm.enabled" placeholder="0 * * * *" />
          </label>
        </div>

        <p v-if="scheduleValidationError" class="text-[10px] text-rose-600 m-0">
          {{ scheduleValidationError }}
        </p>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="savingSchedule" @click="scheduleDialogVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="savingSchedule" @click="submitScheduleDialog">
            保存定时配置
          </a-button>
        </div>
      </div>
    </a-modal>

    <a-drawer v-model:visible="detailDrawerVisible" width="760px" title="任务详情" unmount-on-close>
      <template v-if="loadingTaskDetail">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>
      </template>
      <template v-else-if="taskDetail">
        <div class="text-[11px] space-y-3">
          <section class="p-2 border border-slate-200 bg-slate-50 space-y-1">
            <p class="m-0">
              <span class="text-slate-500">任务名称：</span>
              <span class="text-slate-900 font-semibold">{{ taskDetail.name }}</span>
            </p>
            <p class="text-slate-600 font-mono m-0 break-all">
              {{ taskDetail.id }}
            </p>
            <p class="text-slate-600 m-0">
              类型：{{ targetTypeLabel(taskDetail.targetType) }} / 状态：{{ taskDetail.isActive ? 'active' : 'inactive' }}
            </p>
            <p class="text-slate-600 m-0">
              回填配置：{{ writebackSummary(taskDetail) }}
            </p>
            <p class="text-slate-600 font-mono m-0 break-all">
              {{ taskDetail.source?.appName || taskDetail.appToken }} / {{ taskDetail.source?.tableName || taskDetail.tableId }}{{ (taskDetail.source?.viewName || taskDetail.viewId) ? ` / ${taskDetail.source?.viewName || taskDetail.viewId}` : '' }}
            </p>
            <p class="text-slate-400 font-mono m-0 break-all">
              {{ taskDetail.appToken }} / {{ taskDetail.tableId }}{{ taskDetail.viewId ? ` / ${taskDetail.viewId}` : '' }}
            </p>
            <p v-if="taskDetail.source?.sourceUrl" class="text-slate-500 font-mono m-0 break-all">
              {{ taskDetail.source.sourceUrl }}
            </p>
          </section>

          <section class="p-2 border border-slate-200 bg-slate-50 space-y-1">
            <p class="text-slate-700 m-0">
              调度：{{ taskDetail.schedule.enabled ? scheduleModeLabel(taskDetail.schedule.mode) : '未启用' }}
              <span v-if="taskDetail.schedule.enabled" class="text-slate-500">（{{ scheduleSummary(taskDetail) }}）</span>
            </p>
            <p class="text-slate-600 m-0">
              时区：{{ taskDetail.schedule.timezone }}
            </p>
            <p class="text-slate-600 m-0">
              下次执行：{{ formatDateTime(taskDetail.scheduleRuntime.nextRunAt) }}
            </p>
            <p class="text-slate-600 m-0">
              最近调度执行：{{ formatDateTime(taskDetail.scheduleRuntime.lastRunAt) }}
            </p>
            <p v-if="taskDetail.scheduleRuntime.lastError" class="text-rose-600 m-0 break-all">
              调度错误：{{ taskDetail.scheduleRuntime.lastError }}
            </p>

            <div class="mt-2 flex flex-wrap gap-1">
              <a-button size="mini" @click="previewTask(taskDetail)">
                预检
              </a-button>
              <a-button size="mini" type="primary" @click="runTask(taskDetail)">
                手动执行
              </a-button>
              <a-button size="mini" @click="toggleTaskActive(taskDetail)">
                {{ taskDetail.isActive ? '停用' : '启用' }}
              </a-button>
              <a-button size="mini" @click="openEditTaskDialog(taskDetail)">
                编辑
              </a-button>
              <a-button size="mini" @click="openScheduleDialog(taskDetail)">
                定时设置
              </a-button>
            </div>
          </section>

          <section class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-[11px] text-slate-900 font-semibold m-0">
                字段巡检样本（{{ inspectedFields.length }}）
              </h3>
              <a-button size="mini" :loading="inspectingTaskId === taskDetail.id" @click="inspectTaskFields(taskDetail.id)">
                重新巡检
              </a-button>
            </div>
            <a-table
              :columns="[
                { title: '字段名', dataIndex: 'fieldName', width: 220 },
                { title: '覆盖数', dataIndex: 'sampleCount', width: 90 },
                { title: '样本值', dataIndex: 'sampleValues' },
              ]"
              :data="inspectedFields"
              :pagination="false"
              size="small"
              row-key="fieldName"
              :bordered="{ cell: true }"
            >
              <template #sampleValues="{ record }">
                <span class="text-[10px] text-slate-600 break-all">
                  {{ (record.sampleValues || []).join(' | ') || '-' }}
                </span>
              </template>
            </a-table>
          </section>

          <section class="space-y-2">
            <h3 class="text-[11px] text-slate-900 font-semibold m-0">
              最近执行记录（{{ taskDetail.recentRuns.length }}）
            </h3>
            <a-table
              :columns="detailRunColumns"
              :data="taskDetail.recentRuns"
              :pagination="false"
              size="small"
              row-key="id"
              :bordered="{ cell: true }"
            >
              <template #startedAt="{ record }">
                {{ formatDateTime(record.startedAt) }}
              </template>
              <template #triggerSource="{ record }">
                {{ triggerSourceLabel(record.triggerSource) }}
              </template>
              <template #status="{ record }">
                <span :class="runStatusClass(record.status)">
                  {{ runStatusLabel(record.status) }}
                </span>
              </template>
              <template #stats="{ record }">
                {{ runModeLabel(record) }} / 抓取 {{ record.fetchedCount }} / 新增 {{ record.createdCount }} / 更新 {{ record.updatedCount }} / 跳过 {{ record.skippedCount }} / 错误 {{ record.errorCount }}
              </template>
              <template #errorMessage="{ record }">
                <span class="text-[10px]" :class="record.errorMessage ? 'text-rose-600' : 'text-slate-400'">
                  {{ record.errorMessage || '-' }}
                </span>
              </template>
            </a-table>
          </section>

          <section class="space-y-2">
            <h3 class="text-[11px] text-slate-900 font-semibold m-0">
              关联问题（{{ taskDetail.issueStats.total }}）
            </h3>
            <div class="text-[10px] flex flex-wrap gap-2">
              <a-tag color="red">
                open {{ taskDetail.issueStats.open }}
              </a-tag>
              <a-tag color="green">
                resolved {{ taskDetail.issueStats.resolved }}
              </a-tag>
              <a-tag color="gray">
                ignored {{ taskDetail.issueStats.ignored }}
              </a-tag>
            </div>
            <a-table
              :columns="detailIssueColumns"
              :data="taskDetail.issues"
              :pagination="false"
              size="small"
              row-key="id"
              :bordered="{ cell: true }"
            >
              <template #updatedAt="{ record }">
                {{ formatDateTime(record.updatedAt) }}
              </template>
              <template #status="{ record }">
                <a-tag :color="issueStatusColor(record.status)" size="small">
                  {{ issueStatusLabel(record.status) }}
                </a-tag>
              </template>
              <template #recordId="{ record }">
                <span class="text-[10px] font-mono">{{ record.recordId }}</span>
              </template>
              <template #message="{ record }">
                <p class="text-[10px] m-0 break-all line-clamp-2" :class="record.status === 'open' ? 'text-rose-600' : 'text-slate-600'">
                  {{ record.message }}
                </p>
              </template>
            </a-table>
          </section>
        </div>
      </template>
      <template v-else>
        <p class="text-[11px] text-slate-500 m-0">
          暂无详情数据。
        </p>
      </template>
    </a-drawer>
  </div>
</template>
