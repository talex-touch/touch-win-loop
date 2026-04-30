<script setup lang="ts">
import type {
  ApiResponse,
  WorkspaceFeishuDirectoryUserCandidate,
  WorkspaceFeishuIntegrationSnapshot,
  WorkspaceFeishuMemberSyncPreview,
  WorkspaceIntegrationExternalSourceType,
} from '~~/shared/types/domain'

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
const importing = ref(false)
const errorText = ref('')
const successText = ref('')
const tenantKeyDraft = ref('')
const tenantNameDraft = ref('')
const whitelistDraft = ref('')
const importProjectIdDraft = ref('')
const importSourceTypeDraft = ref<WorkspaceIntegrationExternalSourceType>('feishu_doc')
const importTitleDraft = ref('')
const importTokenDraft = ref('')
const importOriginalUrlDraft = ref('')
const importContentDraft = ref('')
const importBitableTableIdDraft = ref('')
const importBitableViewIdDraft = ref('')
const memberPreview = ref<WorkspaceFeishuMemberSyncPreview | null>(null)

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
const importJobs = computed(() => snapshot.value?.importJobs || [])
const externalResources = computed(() => snapshot.value?.externalResources || [])
const importTokenPlaceholder = computed(() => {
  if (importSourceTypeDraft.value === 'feishu_bitable')
    return 'app_token'
  if (importSourceTypeDraft.value === 'feishu_drive_file')
    return 'file_token'
  if (importSourceTypeDraft.value === 'feishu_wiki')
    return 'wiki token'
  return 'document_id'
})

function syncDrafts(next: WorkspaceFeishuIntegrationSnapshot | null) {
  tenantKeyDraft.value = next?.connection?.tenantKey || ''
  tenantNameDraft.value = next?.connection?.tenantName || ''
  whitelistDraft.value = (next?.policy?.userIds || []).join('\n')
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
    errorText.value = String(error?.data?.message || '飞书第三方平台状态加载失败。')
  }
  finally {
    loading.value = false
  }
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
    const response = await authApiFetch<ApiResponse<WorkspaceFeishuIntegrationSnapshot>>(`/teams/${workspaceId}/integrations/feishu`, {
      method: 'PATCH',
      body: {
        syncPolicy: {
          userIds: whitelistDraft.value.split(/\s+/g).filter(Boolean),
          defaultWorkspaceRole: 'member',
          autoLoginEnabled: true,
        },
      },
    })
    snapshot.value = response.data
    syncDrafts(response.data)
    successText.value = '飞书租户已认领，成员策略已保存。'
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

async function previewMemberSync() {
  const workspaceId = String(props.workspaceId || '').trim()
  if (!workspaceId || previewing.value || !canEdit.value)
    return
  previewing.value = true
  errorText.value = ''
  try {
    const directoryResponse = await authApiFetch<ApiResponse<{
      candidates: WorkspaceFeishuDirectoryUserCandidate[]
      diagnosticCode?: string
      diagnosticMessage?: string
    }>>(`/teams/${workspaceId}/integrations/feishu/directory/search`)
    if (directoryResponse.data.diagnosticCode && directoryResponse.data.diagnosticCode !== 'ok')
      throw new Error(directoryResponse.data.diagnosticMessage || '飞书通讯录搜索失败。')
    const response = await authApiFetch<ApiResponse<WorkspaceFeishuMemberSyncPreview>>(`/teams/${workspaceId}/integrations/feishu/member-sync/preview`, {
      method: 'POST',
      body: {
        candidates: directoryResponse.data.candidates || [],
      },
    })
    memberPreview.value = response.data
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '飞书成员同步预览失败。')
  }
  finally {
    previewing.value = false
  }
}

async function importFeishuSource() {
  const workspaceId = String(props.workspaceId || '').trim()
  const projectId = String(importProjectIdDraft.value || '').trim()
  const token = String(importTokenDraft.value || '').trim()
  if (!workspaceId || !projectId || !token || importing.value)
    return
  importing.value = true
  errorText.value = ''
  successText.value = ''
  const sourceMetadata: Record<string, unknown> = {}
  if (importSourceTypeDraft.value === 'feishu_bitable') {
    sourceMetadata.appToken = token
    sourceMetadata.tableId = importBitableTableIdDraft.value
    sourceMetadata.viewId = importBitableViewIdDraft.value
  }
  try {
    await authApiFetch(`/teams/${workspaceId}/integrations/feishu/imports`, {
      method: 'POST',
      body: {
        projectId,
        sources: [
          {
            type: importSourceTypeDraft.value,
            token,
            title: importTitleDraft.value || token,
            originalUrl: importOriginalUrlDraft.value,
            content: importSourceTypeDraft.value === 'feishu_drive_file' ? '' : importContentDraft.value,
            metadata: sourceMetadata,
          },
        ],
      },
    })
    successText.value = '飞书资源导入任务已完成。'
    await loadSnapshot()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '飞书资源导入失败。')
  }
  finally {
    importing.value = false
  }
}

watch(
  () => props.workspaceId,
  () => {
    memberPreview.value = null
    void loadSnapshot()
  },
  { immediate: true },
)
</script>

<template>
  <section data-testid="user-settings-third-party-platforms-panel" class="space-y-4">
    <div v-if="props.isPersonalWorkspace" class="px-4 py-3 border border-amber-200 rounded-lg bg-amber-50">
      <p class="text-sm text-amber-900 font-semibold">
        第三方平台属于 Business 工作空间能力
      </p>
      <p class="text-xs text-amber-700 mt-1">
        个人空间可查看入口，连接、成员同步和导入需要升级到团队工作空间。
      </p>
    </div>

    <div class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex gap-3 items-start justify-between">
        <div>
          <p class="text-sm text-slate-900 font-semibold">
            飞书
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
          添加 WinLoop 到飞书
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

      <div class="mt-3">
        <label class="text-xs text-slate-600 block space-y-1">
          <span class="text-slate-700 font-semibold">成员白名单 unionId</span>
          <textarea v-model="whitelistDraft" class="px-3 py-2 outline-none border border-slate-200 rounded-lg min-h-[84px] w-full focus:border-blue-500" :disabled="!canEdit || saving" placeholder="每行一个 unionId" />
        </label>
      </div>

      <div class="mt-4 flex flex-wrap gap-2 justify-end">
        <button class="text-xs text-slate-700 font-semibold px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-40" type="button" :disabled="!canEdit || previewing" @click="previewMemberSync">
          预览成员同步
        </button>
        <button class="text-xs text-white font-semibold px-3 py-2 rounded-lg bg-slate-900 disabled:opacity-40" type="button" :disabled="!canEdit || saving" @click="saveConnection">
          认领租户/修复连接
        </button>
      </div>

      <div v-if="memberPreview" class="text-xs text-slate-600 mt-4 gap-2 grid md:grid-cols-4">
        <div>新增 {{ memberPreview.createCount }}</div>
        <div>更新 {{ memberPreview.updateCount }}</div>
        <div>跳过 {{ memberPreview.skipCount }}</div>
        <div>冲突 {{ memberPreview.conflictCount }}</div>
      </div>
    </div>

    <div class="p-4 border border-slate-200 rounded-lg bg-white">
      <p class="text-sm text-slate-900 font-semibold">
        数据导入
      </p>
      <div class="mt-3 gap-3 grid md:grid-cols-4">
        <input v-model="importProjectIdDraft" class="text-xs px-3 outline-none border border-slate-200 rounded-lg h-9 focus:border-blue-500" placeholder="projectId">
        <select v-model="importSourceTypeDraft" class="text-xs px-3 outline-none border border-slate-200 rounded-lg bg-white h-9 focus:border-blue-500">
          <option value="feishu_doc">
            文档
          </option>
          <option value="feishu_wiki">
            Wiki
          </option>
          <option value="feishu_drive_file">
            云盘文件
          </option>
          <option value="feishu_bitable">
            多维表
          </option>
        </select>
        <input v-model="importTokenDraft" class="text-xs px-3 outline-none border border-slate-200 rounded-lg h-9 focus:border-blue-500" :placeholder="importTokenPlaceholder">
        <input v-model="importTitleDraft" class="text-xs px-3 outline-none border border-slate-200 rounded-lg h-9 focus:border-blue-500" placeholder="资源标题">
      </div>
      <div class="mt-3 gap-3 grid md:grid-cols-3">
        <input v-model="importOriginalUrlDraft" class="text-xs px-3 outline-none border border-slate-200 rounded-lg h-9 focus:border-blue-500" placeholder="原始链接">
        <input v-if="importSourceTypeDraft === 'feishu_bitable'" v-model="importBitableTableIdDraft" class="text-xs px-3 outline-none border border-slate-200 rounded-lg h-9 focus:border-blue-500" placeholder="table_id">
        <input v-if="importSourceTypeDraft === 'feishu_bitable'" v-model="importBitableViewIdDraft" class="text-xs px-3 outline-none border border-slate-200 rounded-lg h-9 focus:border-blue-500" placeholder="view_id 可选">
      </div>
      <textarea v-if="importSourceTypeDraft !== 'feishu_drive_file'" v-model="importContentDraft" class="text-xs mt-3 px-3 py-2 outline-none border border-slate-200 rounded-lg min-h-[84px] w-full focus:border-blue-500" placeholder="可选：导入文本预览" />
      <div class="mt-3 flex justify-end">
        <button class="text-xs text-white font-semibold px-3 py-2 rounded-lg bg-slate-900 disabled:opacity-40" type="button" :disabled="!canImportFeishuResource || importing" @click="importFeishuSource">
          导入飞书资源
        </button>
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

    <p v-if="errorText" class="user-settings-feedback user-settings-feedback--danger">
      {{ errorText }}
    </p>
    <p v-else-if="successText" class="user-settings-feedback">
      {{ successText }}
    </p>
  </section>
</template>
