<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  FeishuAdminManualAddResult,
  FeishuAdminOverview,
  FeishuBitableSyncRun,
  FeishuBitableTask,
  FeishuBitableTaskDetail,
  FeishuBitableTaskTargetType,
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

const createDialogVisible = ref(false)
const configDialogVisible = ref(false)
const editDialogVisible = ref(false)
const scheduleDialogVisible = ref(false)
const detailDrawerVisible = ref(false)

const errorText = ref('')
const successText = ref('')
const permissions = ref<PlatformPermission[]>([])
const config = ref<FeishuIntegrationConfig | null>(null)
const adminOverview = ref<FeishuAdminOverview | null>(null)
const tasks = ref<FeishuBitableTask[]>([])
const runs = ref<FeishuBitableSyncRun[]>([])
const taskDetail = ref<FeishuBitableTaskDetail | null>(null)
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
  appToken: '',
  tableId: '',
  viewId: '',
  isActive: true,
  mappingText: DEFAULT_MAPPING_TEXT,
  optionsText: DEFAULT_OPTIONS_TEXT,
})

const editTaskForm = reactive({
  id: '',
  name: '',
  targetType: 'contest' as FeishuBitableTaskTargetType,
  appToken: '',
  tableId: '',
  viewId: '',
  isActive: true,
  mappingText: '{}',
  optionsText: '{}',
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
    const response = await $fetch<ApiResponse<FeishuIntegrationConfig>>(endpoint('/admin/integrations/feishu/config'))
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
    setError(String(error?.data?.message || '任务详情加载失败。'))
  }
  finally {
    loadingTaskDetail.value = false
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

  savingConfig.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuIntegrationConfig>>(endpoint('/admin/integrations/feishu/config'), {
      method: 'PATCH',
      body: {
        enabled: configForm.enabled,
        appId: configForm.appId.trim(),
        oauthRedirectUri: configForm.oauthRedirectUri.trim(),
        webSdkScriptUrl: configForm.webSdkScriptUrl.trim(),
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
  createTaskForm.appToken = ''
  createTaskForm.tableId = ''
  createTaskForm.viewId = ''
  createTaskForm.isActive = true
  createTaskForm.mappingText = DEFAULT_MAPPING_TEXT
  createTaskForm.optionsText = DEFAULT_OPTIONS_TEXT
}

function openCreateTaskDialog() {
  resetCreateTaskForm()
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
  try {
    mapping = parseJsonText(createTaskForm.mappingText, '字段映射')
    options = parseJsonText(createTaskForm.optionsText, '同步选项')
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
  editTaskForm.appToken = task.appToken
  editTaskForm.tableId = task.tableId
  editTaskForm.viewId = task.viewId
  editTaskForm.isActive = task.isActive
  editTaskForm.mappingText = JSON.stringify(task.mapping || {}, null, 2)
  editTaskForm.optionsText = JSON.stringify(task.options || {}, null, 2)
  editDialogVisible.value = true
}

async function submitEditTask() {
  if (!canManageBitable.value || !editTaskForm.id)
    return

  clearFeedback()
  let mapping: Record<string, unknown>
  let options: Record<string, unknown>
  try {
    mapping = parseJsonText(editTaskForm.mappingText, '字段映射')
    options = parseJsonText(editTaskForm.optionsText, '同步选项')
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
    }>>(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(task.id)}/preview`), {
      method: 'POST',
    })

    const payload = response.data
    taskActionMessages[task.id] = `预检：抓取 ${payload.fetchedCount}，可新增 ${payload.createdCount}，可更新 ${payload.updatedCount}，跳过 ${payload.skippedCount}，错误 ${payload.errorCount}`
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
    }>>(endpoint(`/admin/integrations/feishu/bitable-tasks/${encodeURIComponent(task.id)}/run`), {
      method: 'POST',
    })

    const payload = response.data
    taskActionMessages[task.id] = `执行(${payload.status})：抓取 ${payload.fetchedCount}，新增 ${payload.createdCount}，更新 ${payload.updatedCount}，跳过 ${payload.skippedCount}，错误 ${payload.errorCount}`

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
                {{ record.appToken }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1">
                {{ record.tableId }} {{ record.viewId ? ` / ${record.viewId}` : '' }}
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

    <a-modal
      v-model:visible="createDialogVisible"
      title="新建 Bitable 任务"
      :footer="false"
      :mask-closable="!creatingTask"
      :closable="!creatingTask"
      class="max-w-[920px]"
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
          <label class="text-[10px] text-slate-600 font-medium block">
            App Token
            <a-input v-model="createTaskForm.appToken" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            Table ID
            <a-input v-model="createTaskForm.tableId" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            View ID
            <a-input v-model="createTaskForm.viewId" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            字段映射 JSON
            <a-textarea
              v-model="createTaskForm.mappingText"
              class="mt-1"
              :auto-size="{ minRows: 6, maxRows: 12 }"
            />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            同步选项 JSON
            <a-textarea
              v-model="createTaskForm.optionsText"
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
    </a-modal>

    <a-modal
      v-model:visible="editDialogVisible"
      title="编辑 Bitable 任务"
      :footer="false"
      :mask-closable="!editingTask"
      :closable="!editingTask"
      class="max-w-[920px]"
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
          <label class="text-[10px] text-slate-600 font-medium block">
            App Token
            <a-input v-model="editTaskForm.appToken" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            Table ID
            <a-input v-model="editTaskForm.tableId" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block">
            View ID
            <a-input v-model="editTaskForm.viewId" class="mt-1" allow-clear size="small" />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            字段映射 JSON
            <a-textarea
              v-model="editTaskForm.mappingText"
              class="mt-1"
              :auto-size="{ minRows: 6, maxRows: 12 }"
            />
          </label>
          <label class="text-[10px] text-slate-600 font-medium block md:col-span-2 xl:col-span-3">
            同步选项 JSON
            <a-textarea
              v-model="editTaskForm.optionsText"
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
    </a-modal>

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
            <p class="text-slate-600 font-mono m-0 break-all">
              {{ taskDetail.appToken }} / {{ taskDetail.tableId }}{{ taskDetail.viewId ? ` / ${taskDetail.viewId}` : '' }}
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
                抓取 {{ record.fetchedCount }} / 新增 {{ record.createdCount }} / 更新 {{ record.updatedCount }} / 跳过 {{ record.skippedCount }} / 错误 {{ record.errorCount }}
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
