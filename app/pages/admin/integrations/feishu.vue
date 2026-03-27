<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  FeishuAdminGroupReconcileResult,
  FeishuBitableSyncRun,
  FeishuBitableTask,
  FeishuBitableTaskTargetType,
  FeishuIntegrationConfig,
  PlatformPermission,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type SecretMode = 'keep' | 'replace' | 'clear'

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loadingPermissions = ref(true)
const loadingConfig = ref(false)
const loadingTasks = ref(false)
const loadingRuns = ref(false)
const savingConfig = ref(false)
const reconciling = ref(false)
const creatingTask = ref(false)
const patchingTaskId = ref('')
const previewTaskId = ref('')
const runningTaskId = ref('')
const editingTask = ref(false)
const taskDialogVisible = ref(false)

const errorText = ref('')
const successText = ref('')
const permissions = ref<PlatformPermission[]>([])
const config = ref<FeishuIntegrationConfig | null>(null)
const reconcileResult = ref<FeishuAdminGroupReconcileResult | null>(null)
const tasks = ref<FeishuBitableTask[]>([])
const runs = ref<FeishuBitableSyncRun[]>([])
const taskActionMessages = reactive<Record<string, string>>({})

const taskColumns = [
  { title: '任务名称', dataIndex: 'name', slotName: 'name', width: 200 },
  { title: '目标类型', dataIndex: 'targetType', slotName: 'targetType', width: 110 },
  { title: '数据源', dataIndex: 'source', slotName: 'source', width: 240 },
  { title: '状态', dataIndex: 'isActive', slotName: 'isActive', width: 100 },
  { title: '最近运行', dataIndex: 'lastRunAt', slotName: 'lastRunAt', width: 180 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 360 },
]

const runColumns = [
  { title: '开始时间', dataIndex: 'startedAt', width: 180 },
  { title: '任务', dataIndex: 'taskName', width: 180 },
  { title: '触发来源', dataIndex: 'triggerSource', width: 100 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 120 },
  { title: '结果统计', dataIndex: 'stats', slotName: 'stats', width: 260 },
  { title: '错误', dataIndex: 'errorMessage', slotName: 'errorMessage' },
]

const canManageConfig = computed(() => permissions.value.includes('role.assign'))
const canManageBitable = computed(() => permissions.value.includes('contest.write'))
const canAccessPage = computed(() => canManageConfig.value || canManageBitable.value)
const loadingAny = computed(() => loadingPermissions.value || loadingConfig.value || loadingTasks.value || loadingRuns.value)

const configForm = reactive({
  enabled: false,
  appId: '',
  oauthRedirectUri: '',
  adminGroupIdsText: '',
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
  mappingText: `{
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
}`,
  optionsText: `{
  "contestId": "",
  "defaultVisibility": "internal",
  "defaultStatus": "active",
  "defaultResourceCategory": "basic_info",
  "defaultResourceAccessLevel": "public"
}`,
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

function parseGroupIds(text: string): string[] {
  const source = String(text || '')
  const parts = source.split(/[,\s]+/g).map(item => item.trim()).filter(Boolean)
  return Array.from(new Set(parts))
}

function renderGroupIds(groupIds: string[]): string {
  return Array.from(new Set((groupIds || []).map(item => String(item || '').trim()).filter(Boolean))).join('\n')
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
  configForm.adminGroupIdsText = renderGroupIds(payload.adminGroupIds || [])
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

async function refreshTasksAndRuns() {
  await Promise.all([
    loadTasks(),
    loadRuns(),
  ])
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
        adminGroupIds: parseGroupIds(configForm.adminGroupIdsText),
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
    setSuccess('飞书集成配置已保存。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '飞书配置保存失败。'))
  }
  finally {
    savingConfig.value = false
  }
}

async function reconcileAdminGroups() {
  if (!canManageConfig.value)
    return

  clearFeedback()
  reconciling.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuAdminGroupReconcileResult>>(endpoint('/admin/integrations/feishu/admin-groups/reconcile'), {
      method: 'POST',
    })
    reconcileResult.value = response.data
    setSuccess('飞书管理员组已完成一次全量对账。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '管理员组对账失败。'))
  }
  finally {
    reconciling.value = false
  }
}

function resetCreateTaskForm() {
  createTaskForm.name = ''
  createTaskForm.targetType = 'contest'
  createTaskForm.appToken = ''
  createTaskForm.tableId = ''
  createTaskForm.viewId = ''
  createTaskForm.isActive = true
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
    await loadTasks()
    setSuccess('Bitable 任务已创建。')
    resetCreateTaskForm()
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
  taskDialogVisible.value = true
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
    await loadTasks()
    taskDialogVisible.value = false
    setSuccess('任务已更新。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '任务更新失败。'))
  }
  finally {
    editingTask.value = false
  }
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
    await loadTasks()
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
            飞书集成
          </h1>
          <p class="text-[11px] text-slate-500 mt-1">
            支持 OAuth 登录、管理员组自动授权、Bitable 字段映射与同步任务。
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
        <section class="p-3 border border-slate-200 bg-white space-y-3">
          <div>
            <h2 class="text-[12px] text-slate-900 font-semibold m-0">
              飞书配置与同步
            </h2>
            <p class="text-[10px] text-slate-500 m-0 mt-1">
              按权限分别管理：`role.assign` 负责配置与管理员同步；`contest.write` 负责 Bitable 任务。
            </p>
          </div>

          <template v-if="canManageConfig">
            <section class="p-3 border border-slate-200 bg-slate-50 space-y-3">
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

                <label class="text-[10px] text-slate-600 font-medium block md:col-span-2">
                  管理员组 ID 列表（逗号/空格/换行分隔）
                  <a-textarea
                    v-model="configForm.adminGroupIdsText"
                    class="mt-1"
                    :auto-size="{ minRows: 2, maxRows: 6 }"
                    placeholder="ou_xxx"
                  />
                </label>

                <div class="p-2 border border-slate-200 bg-white space-y-2 md:col-span-2">
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

                <div class="p-2 border border-slate-200 bg-white space-y-2 md:col-span-2">
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

                <div class="p-2 border border-slate-200 bg-white space-y-2 md:col-span-2">
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

              <div class="flex flex-wrap gap-2 items-center">
                <a-button size="small" type="primary" :loading="savingConfig" @click="saveConfig">
                  保存飞书配置
                </a-button>
                <a-button size="small" :loading="reconciling" @click="reconcileAdminGroups">
                  手动全量对账管理员组
                </a-button>
              </div>

              <div class="text-[10px] text-slate-500 space-y-1">
                <p class="m-0">
                  App Secret：{{ config?.appSecretConfigured ? '已配置' : '未配置' }}；
                  Event Token：{{ config?.eventTokenConfigured ? '已配置' : '未配置' }}；
                  Event Encrypt Key：{{ config?.eventEncryptKeyConfigured ? '已配置' : '未配置' }}
                </p>
                <p v-if="config?.updatedAt" class="m-0">
                  最近更新：{{ config.updatedAt }}（{{ config.updatedByUserId || 'unknown' }}）
                </p>
              </div>

              <div v-if="reconcileResult" class="text-[10px] text-slate-600 p-2 border border-slate-200 bg-white">
                <p class="m-0">
                  对账时间：{{ reconcileResult.synchronizedAt }}
                </p>
                <p class="m-0 mt-1">
                  组成员总数 {{ reconcileResult.totalGroupMembers }}，
                  新建账号 {{ reconcileResult.createdUsers }}，
                  授权 contest_admin {{ reconcileResult.grantedContestAdmin }}，
                  撤销 contest_admin {{ reconcileResult.revokedContestAdmin }}，
                  跳过 {{ reconcileResult.skippedMembers }}
                </p>
              </div>
            </section>
          </template>

          <section v-if="canManageBitable" class="p-3 border border-slate-200 bg-slate-50 space-y-3">
            <h3 class="text-[11px] text-slate-900 font-semibold m-0">
              Bitable 任务
            </h3>

            <div class="gap-2 grid md:grid-cols-2 xl:grid-cols-4">
              <label class="text-[10px] text-slate-600 font-medium block">
                任务名称
                <a-input v-model="createTaskForm.name" class="mt-1" allow-clear size="small" placeholder="例如：飞书竞赛主表同步" />
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
                App Token
                <a-input v-model="createTaskForm.appToken" class="mt-1" allow-clear size="small" placeholder="bascnxxx" />
              </label>
              <label class="text-[10px] text-slate-600 font-medium block">
                Table ID
                <a-input v-model="createTaskForm.tableId" class="mt-1" allow-clear size="small" placeholder="tblxxxx" />
              </label>
              <label class="text-[10px] text-slate-600 font-medium block">
                View ID（可选）
                <a-input v-model="createTaskForm.viewId" class="mt-1" allow-clear size="small" placeholder="vewxxxx" />
              </label>
              <label class="text-[10px] text-slate-600 font-medium block">
                默认启用
                <div class="mt-1">
                  <a-switch v-model="createTaskForm.isActive" />
                </div>
              </label>
              <label class="text-[10px] text-slate-600 font-medium block md:col-span-2">
                字段映射 JSON
                <a-textarea
                  v-model="createTaskForm.mappingText"
                  class="mt-1"
                  :auto-size="{ minRows: 6, maxRows: 12 }"
                />
              </label>
              <label class="text-[10px] text-slate-600 font-medium block md:col-span-2">
                同步选项 JSON
                <a-textarea
                  v-model="createTaskForm.optionsText"
                  class="mt-1"
                  :auto-size="{ minRows: 6, maxRows: 12 }"
                />
              </label>
            </div>

            <div class="flex flex-wrap gap-2">
              <a-button size="small" type="primary" :loading="creatingTask" @click="createTask">
                新增任务
              </a-button>
              <a-button size="small" :loading="loadingTasks || loadingRuns" @click="refreshTasksAndRuns">
                刷新任务与日志
              </a-button>
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

              <template #isActive="{ record }">
                <a-tag :color="record.isActive ? 'green' : 'gray'" size="small">
                  {{ record.isActive ? 'active' : 'inactive' }}
                </a-tag>
              </template>

              <template #lastRunAt="{ record }">
                {{ record.lastRunAt || '尚未运行' }}
              </template>

              <template #actions="{ record }">
                <div class="flex flex-wrap gap-1">
                  <a-button size="mini" :loading="previewTaskId === record.id" @click="previewTask(record)">
                    预检
                  </a-button>
                  <a-button size="mini" type="primary" :loading="runningTaskId === record.id" @click="runTask(record)">
                    执行
                  </a-button>
                  <a-button size="mini" :loading="patchingTaskId === record.id" @click="toggleTaskActive(record)">
                    {{ record.isActive ? '停用' : '启用' }}
                  </a-button>
                  <a-button size="mini" @click="openEditTaskDialog(record)">
                    编辑
                  </a-button>
                </div>
                <p v-if="taskActionMessages[record.id]" class="text-[10px] text-slate-500 m-0 mt-1">
                  {{ taskActionMessages[record.id] }}
                </p>
              </template>
            </a-table>

            <a-table
              :columns="runColumns"
              :data="runs"
              :pagination="false"
              row-key="id"
              size="small"
              :bordered="{ cell: true }"
            >
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

    <a-modal
      v-model:visible="taskDialogVisible"
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
          <a-button size="small" :disabled="editingTask" @click="taskDialogVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="editingTask" @click="submitEditTask">
            保存任务
          </a-button>
        </div>
      </div>
    </a-modal>
  </div>
</template>
