<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  FeishuAdminManualAddResult,
  FeishuAdminOverview,
  FeishuBitableSourceConfig,
  FeishuBitableSync,
  FeishuBitableTableMeta,
  FeishuBitableViewMeta,
  FeishuIntegrationConfig,
  PlatformPermission,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type SecretMode = 'keep' | 'replace' | 'clear'
type BuildValueSource = 'env' | 'runtime' | 'fallback' | 'missing'
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

const loadingPermissions = ref(true)
const loadingConfig = ref(false)
const loadingSyncs = ref(false)
const savingConfig = ref(false)
const adminOverviewLoading = ref(false)
const creatingSync = ref(false)
const manualAddingKey = ref('')

const createSyncDrawerVisible = ref(false)
const createSourceMode = ref<CreateSyncSourceMode>('url')
const configDialogVisible = ref(false)

const errorText = ref('')
const successText = ref('')
const permissions = ref<PlatformPermission[]>([])
const config = ref<FeishuIntegrationConfigView | null>(null)
const adminOverview = ref<FeishuAdminOverview | null>(null)
const syncs = ref<FeishuBitableSync[]>([])

const syncColumns = [
  { title: '同步信息', dataIndex: 'name', slotName: 'name', width: 220 },
  { title: '主库来源', dataIndex: 'source', slotName: 'source', width: 340 },
  { title: '子表同步项', dataIndex: 'itemCount', slotName: 'itemCount', width: 140 },
  { title: '最近执行', dataIndex: 'latestRun', slotName: 'latestRun', width: 220 },
  { title: '问题', dataIndex: 'issueStats', slotName: 'issueStats', width: 120 },
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', width: 170 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 180 },
]

const canManageConfig = computed(() => permissions.value.includes('role.assign'))
const canManageBitable = computed(() => permissions.value.includes('contest.write'))
const canAccessPage = computed(() => canManageConfig.value || canManageBitable.value)
const loadingAny = computed(() => loadingPermissions.value || loadingConfig.value || loadingSyncs.value)

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
  load: loadFeishuDirectoryBrowser,
} = useFeishuDirectoryBrowser({
  endpoint,
  canSearch: () => canManageConfig.value,
  onError: setError,
})

const configForm = reactive({
  enabled: false,
  appId: '',
  oauthRedirectUri: '',
  adminGroupIdsText: '',
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

const createSyncForm = reactive({
  name: '',
  sourceInput: '',
  appName: '',
  appToken: '',
  tableName: '',
  tableId: '',
  viewName: '',
  viewId: '',
  sourceUrl: '',
})

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
  if (source === 'fallback')
    return '集成配置兜底'
  return '未命中'
}

function syncLatestRunSummary(sync: FeishuBitableSync): string {
  if (!sync.latestRunSummary)
    return '暂无执行记录'
  return `${formatDateTime(sync.latestRunSummary.startedAt)} / ${runStatusLabel(sync.latestRunSummary.status)} / ${triggerSourceLabel(sync.latestRunSummary.triggerSource)}`
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

function fillConfigForm(payload: FeishuIntegrationConfig) {
  configForm.enabled = Boolean(payload.enabled)
  configForm.appId = payload.appId || ''
  configForm.oauthRedirectUri = payload.oauthRedirectUri || ''
  configForm.adminGroupIdsText = Array.isArray(payload.adminGroupIds) ? payload.adminGroupIds.join('\n') : ''
  configForm.webSdkScriptUrl = payload.webSdkScriptUrl || ''
  configForm.startupNotifyEnabled = Boolean(payload.startupNotifyEnabled)
  configForm.startupNotifyChatId = payload.startupNotifyChatId || ''
  configForm.startupNotifyRemark = payload.startupNotifyRemark || ''
  configForm.startupFallbackVersion = payload.startupFallbackVersion || ''
  configForm.startupFallbackCommitSha = payload.startupFallbackCommitSha || ''
  resetSecretInputs()
}

function buildDefaultSyncName(): string {
  let maxIndex = 0
  for (const sync of syncs.value) {
    const match = String(sync.name || '').trim().match(/^多维同步\s+(\d+)$/)
    if (!match)
      continue
    const index = Number(match[1] || 0)
    if (Number.isInteger(index) && index > maxIndex)
      maxIndex = index
  }
  return `多维同步 ${maxIndex + 1}`
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
  }
}

function resetCreateSyncForm() {
  createSyncForm.name = buildDefaultSyncName()
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

async function loadSyncs() {
  if (!canManageBitable.value) {
    syncs.value = []
    return
  }

  loadingSyncs.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableSync[]>>(endpoint('/admin/integrations/feishu/bitable-syncs'))
    syncs.value = response.data || []
  }
  catch (error: any) {
    syncs.value = []
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
    const tablesResponse = await $fetch<ApiResponse<FeishuBitableTableMeta[]>>(endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables`))
    sourceTables.value = tablesResponse.data || []

    if (!tableId) {
      sourceViews.value = []
      onTableIdChanged()
      setSuccess(`已加载 ${sourceTables.value.length} 个子表，请先选择子表后再加载视图。`)
      return
    }

    const viewsResponse = await $fetch<ApiResponse<SourceViewsPayload>>(endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`))
    sourceViews.value = viewsResponse.data.views || []
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
    const response = await $fetch<ApiResponse<FeishuBitableSourceConfig>>(endpoint('/admin/integrations/feishu/bitable/sources/resolve'), {
      method: 'POST',
      body: {
        input: sourceInput,
      },
    })
    const source = response.data
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
    const response = await $fetch<ApiResponse<FeishuIntegrationConfig>>(endpoint('/admin/integrations/feishu/config'), {
      method: 'PATCH',
      body: {
        enabled: configForm.enabled,
        appId: configForm.appId.trim(),
        oauthRedirectUri: configForm.oauthRedirectUri.trim(),
        adminGroupIds: parseMultilineList(configForm.adminGroupIdsText),
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

function openCreateSyncDrawer() {
  resetCreateSyncForm()
  createSourceMode.value = 'url'
  createSyncDrawerVisible.value = true
}

function openConfigDialog() {
  clearFeedback()
  configDialogVisible.value = true
  void Promise.allSettled([
    loadAdminOverview(),
    loadFeishuDirectoryBrowser(),
  ])
}

async function createSync() {
  if (!canManageBitable.value)
    return

  clearFeedback()
  const resolvedSource = buildCreateSourceConfig()
  const appToken = resolvedSource.appToken.trim()
  const name = createSyncForm.name.trim() || createSyncForm.appName.trim() || buildDefaultSyncName()
  if (!appToken) {
    setError('新增同步信息时，主库 appToken 为必填。')
    return
  }

  creatingSync.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableSync>>(endpoint('/admin/integrations/feishu/bitable-syncs'), {
      method: 'POST',
      body: {
        name,
        source: {
          ...resolvedSource,
          appToken,
        },
      },
    })
    const createdSync = response.data
    createSyncDrawerVisible.value = false
    await loadSyncs()
    setSuccess('多维同步信息已创建。请继续在全屏页面配置子表映射。')
    await navigateTo({
      path: `/admin/integrations/feishu/bitables/${createdSync.id}`,
      query: {
        ...(createSyncForm.tableId.trim() ? { draftTableId: createSyncForm.tableId.trim() } : {}),
        ...(createSyncForm.viewId.trim() ? { draftViewId: createSyncForm.viewId.trim() } : {}),
      },
    })
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
  await loadPermissions()
  if (!canAccessPage.value)
    return

  await Promise.all([
    loadConfig(),
    loadSyncs(),
  ])
}

onMounted(initializePage)
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-[13px] text-slate-900 tracking-tight font-bold uppercase">
            飞书多维同步中心
          </h1>
          <p class="text-[11px] text-slate-500 mt-1">
            统一管理飞书多维主库、子表同步项、运行记录与回填链路。
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
                一条记录代表一个飞书多维主库。创建后进入全屏页面，继续配置多个子表同步项与字段映射。
              </p>
            </div>
            <div class="flex gap-2">
              <a-button size="small" type="primary" @click="openCreateSyncDrawer">
                新建同步信息
              </a-button>
              <a-button size="small" :loading="loadingSyncs" @click="refreshSyncList">
                刷新
              </a-button>
            </div>
          </div>

          <a-table
            :columns="syncColumns"
            :data="syncs"
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

            <template #source="{ record }">
              <p class="text-[10px] text-slate-600 font-mono m-0">
                {{ record.source?.appName || record.source?.appToken }}
              </p>
              <p class="text-[10px] text-slate-400 font-mono m-0 mt-1 break-all">
                {{ record.source?.appToken || '-' }}
              </p>
            </template>

            <template #itemCount="{ record }">
              <div class="space-y-1">
                <a-tag color="arcoblue" size="small">
                  {{ record.itemCount }} 个子表项
                </a-tag>
                <p class="text-[10px] text-slate-500 m-0">
                  已启用 {{ record.enabledItemCount }}
                </p>
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

            <template #issueStats="{ record }">
              <a-tag :color="record.issueStats.open ? 'red' : 'gray'" size="small">
                待处理 {{ record.issueStats.open }}
              </a-tag>
            </template>

            <template #updatedAt="{ record }">
              {{ formatDateTime(record.updatedAt) }}
            </template>

            <template #actions="{ record }">
              <div class="flex flex-wrap gap-1">
                <a-button size="mini" type="primary" @click="navigateTo(`/admin/integrations/feishu/bitables/${record.id}`)">
                  进入编辑页
                </a-button>
              </div>
            </template>
          </a-table>
        </section>
      </template>
    </template>

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
              Event Encrypt Key：{{ config?.eventEncryptKeyConfigured ? '已配置' : '未配置' }}
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
        <div class="p-3 border border-slate-200 bg-slate-50">
          <p class="text-[11px] text-slate-700 m-0">
            创建阶段只识别并保存主库来源。字段映射、回填、预检与启用都在创建成功后的全屏页面里继续配置。
          </p>
        </div>

        <div class="gap-3 grid md:grid-cols-1">
          <label class="text-[10px] text-slate-600 font-medium block">
            同步信息名称
            <a-input v-model="createSyncForm.name" class="mt-1" allow-clear size="small" placeholder="留空时优先使用主库名称，否则自动生成多维同步 N" />
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
                      placeholder="可选：带一个 draft table 进入编辑页"
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
                      placeholder="可选：带一个 draft view 进入编辑页"
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
                      placeholder="可选：带一个 draft table 进入编辑页"
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
                      placeholder="可选：带一个 draft view 进入编辑页"
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
            创建成功后会自动进入全屏多维配置页；如果这里已经带了 table/view，会作为待创建子表同步项草稿带过去。
          </p>
        </div>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="creatingSync" @click="createSyncDrawerVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="creatingSync" @click="createSync">
            创建并进入编辑页
          </a-button>
        </div>
      </div>
    </a-drawer>
  </div>
</template>
