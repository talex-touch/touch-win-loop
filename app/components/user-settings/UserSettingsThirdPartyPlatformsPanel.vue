<script setup lang="ts">
import type {
  ApiResponse,
  WorkspaceFeishuDirectoryUserCandidate,
  WorkspaceFeishuIntegrationSnapshot,
  WorkspaceFeishuMemberSyncPreview,
  WorkspaceFeishuMemberSyncResult,
} from '~~/shared/types/domain'

type FeishuMemberRoleDraft = 'admin' | 'manager' | 'member'

const props = withDefaults(defineProps<{
  workspaceId?: string
  isPersonalWorkspace?: boolean
  canManage?: boolean
}>(), {
  workspaceId: '',
  isPersonalWorkspace: false,
  canManage: false,
})

const authApiFetch = useAuthApiFetch()

const snapshot = ref<WorkspaceFeishuIntegrationSnapshot | null>(null)
const loading = ref(false)
const installing = ref(false)
const saving = ref(false)
const previewing = ref(false)
const errorText = ref('')
const successText = ref('')
const tenantKeyDraft = ref('')
const tenantNameDraft = ref('')
const directoryQuery = ref('')
const directoryLoading = ref(false)
const directoryDiagnostic = ref('')
const directoryCandidates = ref<WorkspaceFeishuDirectoryUserCandidate[]>([])
const selectedFeishuUnionIds = ref<string[]>([])
const selectedFeishuDepartmentIds = ref<string[]>([])
const selectedFeishuGroupIds = ref<string[]>([])
const roleMappingDrafts = ref<Record<string, FeishuMemberRoleDraft>>({})
const memberPreview = ref<WorkspaceFeishuMemberSyncPreview | null>(null)
const memberSyncResult = ref<WorkspaceFeishuMemberSyncResult | null>(null)
const syncing = ref(false)

const connected = computed(() => snapshot.value?.connected === true)
const tokenHealth = computed(() => String(snapshot.value?.connection?.capabilities?.tokenHealth || '').trim())
const tokenHealthText = computed(() => {
  if (tokenHealth.value === 'ok')
    return 'token 正常'
  if (tokenHealth.value === 'missing_app_ticket')
    return '平台尚未收到 app_ticket'
  if (tokenHealth.value === 'missing_tenant_key')
    return '等待认领飞书租户'
  if (tokenHealth.value === 'tenant_token_failed')
    return '租户 token 检查失败'
  return connected.value ? '等待 token 健康检查' : '未建立连接'
})
const connectionStatusText = computed(() => {
  const status = String(snapshot.value?.connection?.status || '').trim()
  if (status === 'connected')
    return '已连接'
  if (status === 'disabled')
    return '已断开'
  if (status === 'uninstalled')
    return '租户已卸载'
  if (status === 'needs_reauth')
    return '需要重新授权'
  return '未连接'
})

const canEdit = computed(() => props.canManage && !props.isPersonalWorkspace)
const canImportFeishuResource = computed(() => connected.value && tokenHealth.value === 'ok')
const canSyncFeishuMembers = computed(() => canEdit.value && connected.value && tokenHealth.value === 'ok')
const importJobs = computed(() => snapshot.value?.importJobs || [])
const externalResources = computed(() => snapshot.value?.externalResources || [])
const diagnosticSummary = computed(() => snapshot.value?.diagnosticSummary || null)
const memberSyncSummary = computed(() => snapshot.value?.memberSyncSummary || diagnosticSummary.value?.memberSyncSummary || {})
const importSummary = computed(() => diagnosticSummary.value?.importSummary || {})
const auditLogs = computed(() => snapshot.value?.auditLogs || [])
const memberDiagnosticSamples = computed(() => {
  const samples = memberSyncSummary.value.diagnosticSamples
  return Array.isArray(samples) ? samples.slice(0, 5) : []
})
const selectedUnionIdSet = computed(() => new Set(selectedFeishuUnionIds.value))
const selectedCandidates = computed(() => directoryCandidates.value.filter(candidate => selectedUnionIdSet.value.has(candidate.unionId)))
const departmentOptions = computed(() => buildDirectoryScopeOptions('departmentIds'))
const groupOptions = computed(() => buildDirectoryScopeOptions('groupIds'))
const memberSyncDisabledText = computed(() => {
  if (canSyncFeishuMembers.value)
    return ''
  if (!canEdit.value)
    return '仅工作空间 owner/admin 可配置飞书成员同步。'
  return tokenHealthText.value
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function formatSummaryNumber(summary: Record<string, unknown>, key: string): string {
  const value = Number(summary?.[key] || 0)
  if (!Number.isFinite(value))
    return '0'
  return String(Math.max(0, Math.trunc(value)))
}

function formatAuditStatus(status: string): string {
  if (status === 'success')
    return '成功'
  if (status === 'warning')
    return '警告'
  if (status === 'error')
    return '失败'
  return '信息'
}

function uniqueStrings(items: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const rawItem of items) {
    const item = normalizeString(rawItem)
    if (!item || seen.has(item))
      continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function buildDirectoryScopeOptions(key: 'departmentIds' | 'groupIds') {
  const counter = new Map<string, number>()
  for (const candidate of directoryCandidates.value) {
    for (const id of candidate[key] || []) {
      const normalizedId = normalizeString(id)
      if (!normalizedId)
        continue
      counter.set(normalizedId, (counter.get(normalizedId) || 0) + 1)
    }
  }
  return [...counter.entries()]
    .map(([id, count]) => ({
      id,
      count,
      label: key === 'departmentIds' ? `部门 ${id}` : `群 ${id}`,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function buildSyncPolicyPatch() {
  const roleMappings: Record<string, Exclude<FeishuMemberRoleDraft, 'member'>> = {}
  for (const unionId of uniqueStrings(selectedFeishuUnionIds.value)) {
    const role = roleMappingDrafts.value[unionId]
    if (role === 'admin' || role === 'manager')
      roleMappings[unionId] = role
  }

  return {
    userIds: uniqueStrings(selectedFeishuUnionIds.value),
    departmentIds: uniqueStrings(selectedFeishuDepartmentIds.value),
    groupIds: uniqueStrings(selectedFeishuGroupIds.value),
    roleMappings,
    defaultWorkspaceRole: 'member',
  }
}

function syncDrafts(next: WorkspaceFeishuIntegrationSnapshot | null) {
  tenantKeyDraft.value = next?.connection?.tenantKey || ''
  tenantNameDraft.value = next?.connection?.tenantName || ''
  const policy = next?.policy
  selectedFeishuUnionIds.value = [...(policy?.userIds || [])]
  selectedFeishuDepartmentIds.value = [...(policy?.departmentIds || [])]
  selectedFeishuGroupIds.value = [...(policy?.groupIds || [])]
  const nextRoleMappings: Record<string, FeishuMemberRoleDraft> = {}
  for (const unionId of selectedFeishuUnionIds.value)
    nextRoleMappings[unionId] = policy?.roleMappings?.[unionId] || 'member'
  roleMappingDrafts.value = nextRoleMappings
}

async function loadSnapshot() {
  const workspaceId = String(props.workspaceId || '').trim()
  if (!workspaceId)
    return
  loading.value = true
  errorText.value = ''
  try {
    const response = await authApiFetch<ApiResponse<WorkspaceFeishuIntegrationSnapshot>>(`/teams/${workspaceId}/integrations/feishu`)
    snapshot.value = response.data
    syncDrafts(response.data)
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '飞书连接器状态加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function saveSyncPolicy(workspaceId: string) {
  const response = await authApiFetch<ApiResponse<WorkspaceFeishuIntegrationSnapshot>>(`/teams/${workspaceId}/integrations/feishu`, {
    method: 'PATCH',
    body: {
      syncPolicy: buildSyncPolicyPatch(),
    },
  })
  snapshot.value = response.data
  syncDrafts(response.data)
  return response.data
}

async function saveConnection() {
  const workspaceId = String(props.workspaceId || '').trim()
  if (!workspaceId || saving.value || !canEdit.value)
    return
  saving.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const claimResponse = await authApiFetch<ApiResponse<WorkspaceFeishuIntegrationSnapshot>>(`/teams/${workspaceId}/integrations/feishu/claim`, {
      method: 'POST',
      body: {
        tenantKey: tenantKeyDraft.value,
        tenantName: tenantNameDraft.value,
      },
    })
    snapshot.value = claimResponse.data
    await saveSyncPolicy(workspaceId)
    successText.value = '飞书租户已认领，成员同步策略已保存。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '飞书租户认领失败。')
  }
  finally {
    saving.value = false
  }
}

async function startFeishuInstall() {
  const workspaceId = String(props.workspaceId || '').trim()
  if (!workspaceId || installing.value || !canEdit.value)
    return
  installing.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const response = await authApiFetch<ApiResponse<{
      installUrl: string
      state: string
      expiresAt: string
      snapshot: WorkspaceFeishuIntegrationSnapshot
    }>>(`/teams/${workspaceId}/integrations/feishu/install-session`, {
      method: 'POST',
    })
    snapshot.value = response.data.snapshot
    syncDrafts(response.data.snapshot)
    if (response.data.installUrl)
      window.open(response.data.installUrl, '_blank', 'noopener,noreferrer')
    successText.value = '已创建飞书安装会话，完成安装后回到这里认领 tenantKey。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '飞书安装会话创建失败。')
  }
  finally {
    installing.value = false
  }
}

async function loadDirectoryCandidates() {
  const workspaceId = String(props.workspaceId || '').trim()
  if (!workspaceId || directoryLoading.value || !canSyncFeishuMembers.value)
    return
  directoryLoading.value = true
  directoryDiagnostic.value = ''
  errorText.value = ''
  try {
    const query = directoryQuery.value.trim()
    const suffix = query ? `?q=${encodeURIComponent(query)}` : ''
    const response = await authApiFetch<ApiResponse<{
      candidates: WorkspaceFeishuDirectoryUserCandidate[]
      diagnosticCode?: string
      diagnosticMessage?: string
    }>>(`/teams/${workspaceId}/integrations/feishu/directory/search${suffix}`)
    directoryCandidates.value = response.data.candidates || []
    if (response.data.diagnosticCode && response.data.diagnosticCode !== 'ok')
      directoryDiagnostic.value = response.data.diagnosticMessage || '飞书通讯录暂不可用。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || error?.message || '飞书通讯录搜索失败。')
  }
  finally {
    directoryLoading.value = false
  }
}

function onUserSelectionChanged(candidate: WorkspaceFeishuDirectoryUserCandidate) {
  const unionId = normalizeString(candidate.unionId)
  if (!unionId)
    return
  if (selectedUnionIdSet.value.has(unionId) && !roleMappingDrafts.value[unionId])
    roleMappingDrafts.value[unionId] = 'member'
  if (!selectedUnionIdSet.value.has(unionId)) {
    const next = { ...roleMappingDrafts.value }
    delete next[unionId]
    roleMappingDrafts.value = next
  }
}

async function previewMemberSync() {
  const workspaceId = String(props.workspaceId || '').trim()
  if (!workspaceId || previewing.value || !canSyncFeishuMembers.value)
    return
  previewing.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await saveSyncPolicy(workspaceId)
    const response = await authApiFetch<ApiResponse<WorkspaceFeishuMemberSyncPreview>>(`/teams/${workspaceId}/integrations/feishu/member-sync/preview`, {
      method: 'POST',
      body: {},
    })
    memberPreview.value = response.data
    memberSyncResult.value = null
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '飞书成员同步预览失败。')
  }
  finally {
    previewing.value = false
  }
}

async function runMemberSync() {
  const workspaceId = String(props.workspaceId || '').trim()
  if (!workspaceId || syncing.value || !canSyncFeishuMembers.value)
    return
  syncing.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await saveSyncPolicy(workspaceId)
    const response = await authApiFetch<ApiResponse<WorkspaceFeishuMemberSyncResult>>(`/teams/${workspaceId}/integrations/feishu/member-sync/run`, {
      method: 'POST',
      body: {},
    })
    memberSyncResult.value = response.data
    memberPreview.value = response.data
    successText.value = '飞书成员同步已执行。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '飞书成员同步执行失败。')
  }
  finally {
    syncing.value = false
  }
}

async function openProjectFeishuImportEntry() {
  const workspaceId = String(props.workspaceId || '').trim()
  if (!workspaceId)
    return
  await navigateTo(`/team/${workspaceId}`)
}

watch(
  () => props.workspaceId,
  () => {
    memberPreview.value = null
    memberSyncResult.value = null
    directoryDiagnostic.value = ''
    void loadSnapshot()
  },
  { immediate: true },
)
</script>

<template>
  <section data-testid="user-settings-third-party-platforms-panel" class="space-y-4">
    <div v-if="props.isPersonalWorkspace" class="px-4 py-3 border border-amber-200 rounded-lg bg-amber-50">
      <p class="text-sm text-amber-900 font-semibold">
        连接器属于 Business 工作空间能力
      </p>
      <p class="text-xs text-amber-700 mt-1">
        个人空间可查看入口，连接、成员同步和导入需要升级到团队工作空间。
      </p>
    </div>

    <div class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex gap-3 items-start justify-between">
        <div>
          <p class="text-sm text-slate-900 font-semibold">
            飞书连接器
          </p>
          <p class="text-xs text-slate-500 mt-1">
            {{ connectionStatusText }}
          </p>
        </div>
        <button class="text-xs text-slate-600 font-semibold" type="button" :disabled="loading" @click="loadSnapshot">
          刷新
        </button>
      </div>
      <div class="text-xs text-slate-500 mt-3">
        {{ tokenHealthText }}<span v-if="snapshot?.connection?.lastError"> · {{ snapshot.connection.lastError }}</span>
      </div>

      <div class="mt-4">
        <button class="text-xs text-white font-semibold px-3 py-2 rounded-lg bg-blue-600 disabled:opacity-40" type="button" :disabled="!canEdit || installing" @click="startFeishuInstall">
          连接飞书租户
        </button>
      </div>

      <div class="mt-4 gap-3 grid md:grid-cols-2">
        <label class="text-xs text-slate-600 block space-y-1">
          <span class="text-slate-700 font-semibold">Tenant Key</span>
          <input v-model="tenantKeyDraft" class="px-3 outline-none border border-slate-200 rounded-lg h-9 w-full focus:border-blue-500" :disabled="!canEdit || saving" placeholder="tenant_key">
        </label>
        <label class="text-xs text-slate-600 block space-y-1">
          <span class="text-slate-700 font-semibold">租户名称</span>
          <input v-model="tenantNameDraft" class="px-3 outline-none border border-slate-200 rounded-lg h-9 w-full focus:border-blue-500" :disabled="!canEdit || saving" placeholder="飞书企业名称">
        </label>
      </div>

      <div class="mt-4 p-3 border border-slate-200 rounded-lg bg-slate-50">
        <div class="flex flex-wrap gap-3 items-start justify-between">
          <div>
            <p class="text-sm text-slate-900 font-semibold">
              健康诊断
            </p>
            <p class="text-xs text-slate-500 mt-1">
              {{ diagnosticSummary?.tokenHealthText || tokenHealthText }}
            </p>
          </div>
          <span class="text-xs text-slate-500">{{ diagnosticSummary?.connectionStatus || snapshot?.connection?.status || 'pending' }}</span>
        </div>
        <p v-if="diagnosticSummary?.lastError" class="text-xs text-rose-600 mt-2">
          {{ diagnosticSummary.lastError }}
        </p>

        <div class="mt-3 gap-2 grid md:grid-cols-2">
          <div class="p-3 border border-slate-200 rounded-lg bg-white">
            <p class="text-xs text-slate-700 font-semibold">
              最近同步
            </p>
            <div class="text-xs text-slate-500 mt-2 gap-2 grid grid-cols-2">
              <span>新增 {{ formatSummaryNumber(memberSyncSummary, 'createCount') }}</span>
              <span>更新 {{ formatSummaryNumber(memberSyncSummary, 'updateCount') }}</span>
              <span>冲突 {{ formatSummaryNumber(memberSyncSummary, 'conflictCount') }}</span>
              <span>席位失败 {{ formatSummaryNumber(memberSyncSummary, 'seatFailedCount') }}</span>
            </div>
            <div v-if="memberDiagnosticSamples.length" class="text-xs text-slate-500 mt-2 space-y-1">
              <div v-for="sample in memberDiagnosticSamples" :key="`${sample.code}:${sample.unionId || sample.message}`">
                {{ sample.code }} · {{ sample.message }}
              </div>
            </div>
          </div>

          <div class="p-3 border border-slate-200 rounded-lg bg-white">
            <p class="text-xs text-slate-700 font-semibold">
              最近导入
            </p>
            <div class="text-xs text-slate-500 mt-2 gap-2 grid grid-cols-2">
              <span>导入 {{ formatSummaryNumber(importSummary, 'importedCount') }}</span>
              <span>跳过 {{ formatSummaryNumber(importSummary, 'skippedCount') }}</span>
              <span>失败 {{ formatSummaryNumber(importSummary, 'failedCount') }}</span>
              <span>任务 {{ importSummary.latestJobId ? '已记录' : '暂无' }}</span>
            </div>
            <p class="text-xs text-slate-400 mt-2">
              连接器仅导入数据和同步成员，不参与平台登录。
            </p>
          </div>
        </div>
      </div>

      <div class="mt-4 pt-4 border-t border-slate-100">
        <div class="flex flex-wrap gap-3 items-start justify-between">
          <div>
            <p class="text-sm text-slate-900 font-semibold">
              成员同步
            </p>
            <p class="text-xs text-slate-500 mt-1">
              默认角色为 member，仅显式用户可映射为 manager/admin；平台登录由全局身份提供方处理。
            </p>
          </div>
          <button class="text-xs text-white font-semibold px-3 py-2 rounded-lg bg-slate-900 disabled:opacity-40" type="button" :disabled="!canEdit || saving" @click="saveConnection">
            认领租户/保存策略
          </button>
        </div>

        <p v-if="memberSyncDisabledText" class="text-xs text-amber-700 mt-3">
          {{ memberSyncDisabledText }}
        </p>

        <div class="mt-3 flex gap-2">
          <input
            v-model="directoryQuery"
            class="px-3 outline-none border border-slate-200 rounded-lg flex-1 h-9 min-w-0 focus:border-blue-500"
            :disabled="!canSyncFeishuMembers || directoryLoading"
            placeholder="搜索飞书成员"
            @keyup.enter="loadDirectoryCandidates"
          >
          <button
            class="text-xs text-slate-700 font-semibold px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-40"
            type="button"
            :disabled="!canSyncFeishuMembers || directoryLoading"
            @click="loadDirectoryCandidates"
          >
            {{ directoryLoading ? '刷新中' : '刷新通讯录' }}
          </button>
        </div>

        <p v-if="directoryDiagnostic" class="text-xs text-amber-700 mt-2">
          {{ directoryDiagnostic }}
        </p>

        <div class="mt-3 gap-3 grid lg:grid-cols-3">
          <div class="p-3 border border-slate-200 rounded-lg min-h-[132px]">
            <div class="text-xs text-slate-700 font-semibold">
              用户白名单
            </div>
            <div v-if="directoryCandidates.length" class="mt-2 max-h-52 overflow-auto space-y-2">
              <label v-for="candidate in directoryCandidates" :key="candidate.unionId" class="text-xs text-slate-600 flex gap-2 items-start">
                <input
                  v-model="selectedFeishuUnionIds"
                  class="mt-0.5"
                  type="checkbox"
                  :value="candidate.unionId"
                  :disabled="!canSyncFeishuMembers"
                  @change="onUserSelectionChanged(candidate)"
                >
                <span class="min-w-0">
                  <span class="text-slate-800 font-medium block truncate">{{ candidate.name || candidate.unionId }}</span>
                  <span class="text-slate-400 block truncate">{{ candidate.email || candidate.unionId }}</span>
                </span>
              </label>
            </div>
            <p v-else class="text-xs text-slate-400 mt-3">
              刷新通讯录后选择成员
            </p>
          </div>

          <div class="p-3 border border-slate-200 rounded-lg min-h-[132px]">
            <div class="text-xs text-slate-700 font-semibold">
              部门白名单
            </div>
            <div v-if="departmentOptions.length" class="mt-2 max-h-52 overflow-auto space-y-2">
              <label v-for="department in departmentOptions" :key="department.id" class="text-xs text-slate-600 flex gap-2 items-center">
                <input v-model="selectedFeishuDepartmentIds" type="checkbox" :value="department.id" :disabled="!canSyncFeishuMembers">
                <span class="truncate">{{ department.label }} · {{ department.count }} 人</span>
              </label>
            </div>
            <p v-else class="text-xs text-slate-400 mt-3">
              当前通讯录结果暂无部门信息
            </p>
          </div>

          <div class="p-3 border border-slate-200 rounded-lg min-h-[132px]">
            <div class="text-xs text-slate-700 font-semibold">
              群白名单
            </div>
            <div v-if="groupOptions.length" class="mt-2 max-h-52 overflow-auto space-y-2">
              <label v-for="group in groupOptions" :key="group.id" class="text-xs text-slate-600 flex gap-2 items-center">
                <input v-model="selectedFeishuGroupIds" type="checkbox" :value="group.id" :disabled="!canSyncFeishuMembers">
                <span class="truncate">{{ group.label }} · {{ group.count }} 人</span>
              </label>
            </div>
            <p v-else class="text-xs text-slate-400 mt-3">
              当前通讯录结果暂无群信息
            </p>
          </div>
        </div>

        <div v-if="selectedCandidates.length" class="mt-3 p-3 border border-slate-200 rounded-lg">
          <div class="text-xs text-slate-700 font-semibold">
            用户级角色映射
          </div>
          <div class="mt-2 space-y-2">
            <div v-for="candidate in selectedCandidates" :key="candidate.unionId" class="text-xs text-slate-600 flex gap-3 items-center justify-between">
              <span class="truncate">{{ candidate.name || candidate.unionId }}</span>
              <select v-model="roleMappingDrafts[candidate.unionId]" class="px-2 border border-slate-200 rounded-lg bg-white h-8" :disabled="!canSyncFeishuMembers">
                <option value="member">
                  member
                </option>
                <option value="manager">
                  manager
                </option>
                <option value="admin">
                  admin
                </option>
              </select>
            </div>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2 justify-end">
          <button class="text-xs text-slate-700 font-semibold px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-40" type="button" :disabled="!canSyncFeishuMembers || previewing" @click="previewMemberSync">
            预览成员同步
          </button>
          <button class="text-xs text-white font-semibold px-3 py-2 rounded-lg bg-blue-600 disabled:opacity-40" type="button" :disabled="!canSyncFeishuMembers || syncing" @click="runMemberSync">
            执行成员同步
          </button>
        </div>

        <div v-if="memberPreview" class="text-xs text-slate-600 mt-4 gap-2 grid md:grid-cols-6">
          <div>新增 {{ memberPreview.createCount }}</div>
          <div>更新 {{ memberPreview.updateCount }}</div>
          <div>跳过 {{ memberPreview.skipCount }}</div>
          <div>冲突 {{ memberPreview.conflictCount }}</div>
          <div>席位失败 {{ memberPreview.seatFailedCount || 0 }}</div>
          <div>角色映射 {{ memberPreview.roleMappingAppliedCount || 0 }}</div>
        </div>

        <div v-if="memberPreview?.diagnostics?.length" class="text-xs text-slate-500 mt-3 space-y-1">
          <div v-for="diagnostic in memberPreview.diagnostics.slice(0, 5)" :key="`${diagnostic.code}:${diagnostic.unionId || diagnostic.message}`">
            {{ diagnostic.code }} · {{ diagnostic.message }}<span v-if="diagnostic.count"> · {{ diagnostic.count }}</span>
          </div>
        </div>

        <p v-if="memberSyncResult" class="text-xs text-slate-500 mt-3">
          已创建 {{ memberSyncResult.createdUserIds.length }} 人，已更新 {{ memberSyncResult.updatedUserIds.length }} 人。
        </p>
      </div>
    </div>

    <div class="p-4 border border-slate-200 rounded-lg bg-white">
      <p class="text-sm text-slate-900 font-semibold">
        数据导入
      </p>
      <div class="mt-3 flex flex-wrap gap-3 items-center justify-between">
        <p class="text-xs text-slate-500">
          请在项目资源管理器使用“从飞书导入”，系统会自动绑定当前项目并标记为连接器导入资源。
        </p>
        <button
          class="text-xs text-slate-700 font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:opacity-40"
          type="button"
          :disabled="!canImportFeishuResource"
          @click="openProjectFeishuImportEntry"
        >
          去项目资源管理器导入
        </button>
      </div>
      <div v-if="!canImportFeishuResource" class="text-xs text-amber-700 mt-2">
        {{ tokenHealthText }}
      </div>
    </div>

    <div class="gap-3 grid md:grid-cols-2">
      <div class="p-4 border border-slate-200 rounded-lg bg-white">
        <p class="text-sm text-slate-900 font-semibold">
          最近导入任务
        </p>
        <div v-if="importJobs.length" class="mt-3 space-y-2">
          <div v-for="job in importJobs.slice(0, 4)" :key="job.id" class="text-xs text-slate-600 flex gap-3 justify-between">
            <span class="truncate">{{ job.projectId }}</span>
            <span>{{ job.status }} · {{ job.importedCount }}/{{ job.sourceCount }}</span>
          </div>
        </div>
        <p v-else class="text-xs text-slate-400 mt-3">
          暂无导入任务
        </p>
      </div>
      <div class="p-4 border border-slate-200 rounded-lg bg-white">
        <p class="text-sm text-slate-900 font-semibold">
          已映射资源
        </p>
        <div v-if="externalResources.length" class="mt-3 space-y-2">
          <div v-for="item in externalResources.slice(0, 4)" :key="item.id" class="text-xs text-slate-600 flex gap-3 justify-between">
            <span class="truncate">{{ item.metadata.sourceTitle || item.externalToken }}</span>
            <span>{{ item.lastImportStatus }}</span>
          </div>
        </div>
        <p v-else class="text-xs text-slate-400 mt-3">
          暂无外部资源映射
        </p>
      </div>
    </div>

    <div class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex gap-3 items-center justify-between">
        <p class="text-sm text-slate-900 font-semibold">
          审计日志
        </p>
        <span class="text-xs text-slate-400">{{ auditLogs.length }} 条</span>
      </div>
      <div v-if="auditLogs.length" class="mt-3 space-y-2">
        <div v-for="item in auditLogs.slice(0, 6)" :key="item.id" class="text-xs text-slate-600 flex gap-3 justify-between">
          <span class="min-w-0">
            <span class="text-slate-800 block truncate">{{ item.summary || item.action }}</span>
            <span class="text-slate-400 block truncate">{{ item.action }}</span>
          </span>
          <span class="text-slate-500 shrink-0">{{ formatAuditStatus(item.status) }}</span>
        </div>
      </div>
      <p v-else class="text-xs text-slate-400 mt-3">
        暂无审计日志
      </p>
    </div>

    <p v-if="errorText" class="user-settings-feedback user-settings-feedback--danger">
      {{ errorText }}
    </p>
    <p v-else-if="successText" class="user-settings-feedback">
      {{ successText }}
    </p>
  </section>
</template>
