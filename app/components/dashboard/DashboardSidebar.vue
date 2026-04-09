<script setup lang="ts">
import type { ApiResponse, FeishuAuthAuditItem, FeishuAuthBindStatus, FeishuAuthUnbindResult, FeishuIntegrationConfig, WorkspaceWithQuota } from '~~/shared/types/domain'
import type { DashboardMenuItem, DashboardTopic } from '~/types/dashboard'
import { readActiveWorkspacePreference, writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

const props = withDefaults(defineProps<{
  menuItems?: DashboardMenuItem[]
  topics?: DashboardTopic[]
  analystName?: string
  analystTier?: string
  analystAvatar?: string
  showAdminBadge?: boolean
  workspaceOptions?: WorkspaceWithQuota[]
}>(), {
  menuItems: () => [],
  topics: () => [],
  analystName: '分析师 张明',
  analystTier: '高级会员',
  analystAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAgO3szaJLN0mB5xXQFUAcenjGXOhK0fc6jH78_wVb6AgKHW2rx7If2DG7Zro9-woZuymuskn7rGkTJWIN-l2SRqi6dvqXNZqAE8LUhcHv4Z7uY-ptVO0eKI9sZzfUw9Jp1lzLiYTdYykbvVyXdkKLj9TeWaK9DipDXCk0g0Tgtir3CsIXTaFlEbB7EtggaKgtgnWMXjiAiW1uwj-4mVXyLJqdaJfAvFHWfRaX1dosZdLgVxspcp2tPArmit3IFKKQ4HpECByj_ZGI1',
  showAdminBadge: false,
  workspaceOptions: () => [],
})

const route = useRoute()
const authApiFetch = useAuthApiFetch()
const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const profileDialogVisible = ref(false)
const loggingOut = ref(false)
const actionError = ref('')
const feishuBindLoading = ref(false)
const feishuBindRedirecting = ref(false)
const feishuUnbinding = ref(false)
const feishuUnbindConfirmVisible = ref(false)
const feishuUnbindConfirmText = ref('')
const feishuAuditLoading = ref(false)
const feishuBindError = ref('')
const feishuBindSuccess = ref('')
const feishuBindStatus = ref<FeishuAuthBindStatus | null>(null)
const feishuMeta = ref<FeishuIntegrationConfig | null>(null)
const feishuAudits = ref<FeishuAuthAuditItem[]>([])
const selectedWorkspaceId = ref('')
const profileDialogTitleId = 'dashboard-profile-dialog-title'

function isMenuItemActive(item: DashboardMenuItem): boolean {
  if (item.to === '/dashboard')
    return route.path === '/dashboard'
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const routeTeamId = computed(() => {
  const normalizedPath = route.path.replace(/\/+$/, '')
  const matched = normalizedPath.match(/^\/(?:team|workspace)\/([^/]+)(?:\/project\/[^/]+)?$/)
  return matched?.[1] || ''
})

watch(
  [routeTeamId, () => props.workspaceOptions],
  ([currentId, options]) => {
    const workspaceList = options || []
    if (currentId && workspaceList.some(item => item.workspace.id === currentId)) {
      selectedWorkspaceId.value = currentId
      writeActiveWorkspacePreference(currentId)
      return
    }

    const storedWorkspaceId = readActiveWorkspacePreference()
    if (storedWorkspaceId && workspaceList.some(item => item.workspace.id === storedWorkspaceId)) {
      selectedWorkspaceId.value = storedWorkspaceId
      return
    }

    selectedWorkspaceId.value = workspaceList[0]?.workspace.id || ''
    if (selectedWorkspaceId.value)
      writeActiveWorkspacePreference(selectedWorkspaceId.value)
  },
  { immediate: true },
)

function openProfileDialog() {
  const routeBindError = readFeishuBindErrorFromRoute()
  actionError.value = ''
  feishuBindError.value = routeBindError
  feishuBindSuccess.value = ''
  feishuUnbindConfirmVisible.value = false
  feishuUnbindConfirmText.value = ''
  profileDialogVisible.value = true
  clearFeishuBindQueryParamsFromUrl()
  void Promise.allSettled([
    loadFeishuMeta(),
    loadFeishuBindStatus(),
    loadFeishuAudits(),
  ])
}

function closeProfileDialog() {
  if (loggingOut.value)
    return
  profileDialogVisible.value = false
}

async function logout() {
  loggingOut.value = true
  actionError.value = ''
  try {
    await authApiFetch('/auth/logout', {
      method: 'POST',
    })
    profileDialogVisible.value = false
    await navigateTo('/login')
  }
  catch (error: any) {
    actionError.value = String(error?.data?.message || '退出失败，请稍后重试。')
  }
  finally {
    loggingOut.value = false
  }
}

async function loadFeishuMeta() {
  try {
    const response = await authApiFetch<ApiResponse<FeishuIntegrationConfig>>('/auth/feishu/meta')
    feishuMeta.value = response.data
  }
  catch {
    feishuMeta.value = null
  }
}

async function loadFeishuBindStatus() {
  feishuBindLoading.value = true
  feishuBindError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<FeishuAuthBindStatus>>('/auth/feishu/bind-status')
    feishuBindStatus.value = response.data
  }
  catch (error: any) {
    feishuBindStatus.value = null
    feishuBindError.value = String(error?.data?.message || '飞书绑定状态加载失败。')
  }
  finally {
    feishuBindLoading.value = false
  }
}

function readRouteQueryText(name: string): string {
  if (import.meta.client) {
    const params = new URLSearchParams(window.location.search)
    return String(params.get(name) || '').trim()
  }
  const raw = route.query[name]
  return Array.isArray(raw) ? String(raw[0] || '').trim() : String(raw || '').trim()
}

function readFeishuBindErrorFromRoute(): string {
  const bindError = readRouteQueryText('feishuBindError')
  const boundUser = readRouteQueryText('feishuBoundUser')
  if (!bindError)
    return ''
  if (!boundUser)
    return bindError
  return `${bindError}（关联账号：${boundUser}）`
}

function clearFeishuBindQueryParamsFromUrl() {
  if (!import.meta.client)
    return

  const url = new URL(window.location.href)
  let changed = false
  for (const key of ['feishuBindError', 'feishuConflictCode', 'feishuBoundUser']) {
    if (!url.searchParams.has(key))
      continue
    url.searchParams.delete(key)
    changed = true
  }

  if (!changed)
    return

  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

function formatAuditAction(action: FeishuAuthAuditItem['action']): string {
  if (action === 'auth.feishu.bind.self')
    return '绑定飞书'
  return '解绑飞书'
}

async function loadFeishuAudits() {
  feishuAuditLoading.value = true
  try {
    const response = await authApiFetch<ApiResponse<FeishuAuthAuditItem[]>>('/auth/feishu/audits?limit=8')
    feishuAudits.value = response.data || []
  }
  catch {
    feishuAudits.value = []
  }
  finally {
    feishuAuditLoading.value = false
  }
}

async function startFeishuBind() {
  if (!import.meta.client || feishuBindRedirecting.value)
    return

  feishuBindError.value = ''
  feishuBindSuccess.value = ''
  if (!feishuMeta.value)
    await loadFeishuMeta()

  if (!feishuMeta.value?.enabled) {
    feishuBindError.value = '飞书登录尚未启用，请联系管理员。'
    return
  }

  feishuBindRedirecting.value = true
  const redirectTarget = route.fullPath && route.fullPath.startsWith('/') ? route.fullPath : '/dashboard'
  const url = endpoint(`/auth/feishu/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
  window.location.href = url
}

async function unbindFeishu() {
  if (feishuUnbinding.value)
    return

  if (!feishuBindStatus.value?.linked) {
    feishuBindError.value = '当前账号未绑定飞书。'
    return
  }

  const normalized = String(feishuUnbindConfirmText.value || '').trim().toUpperCase()
  if (normalized !== 'UNBIND') {
    feishuBindError.value = '请输入确认口令 UNBIND 后再解绑。'
    return
  }

  feishuUnbinding.value = true
  feishuBindError.value = ''
  feishuBindSuccess.value = ''
  try {
    const response = await authApiFetch<ApiResponse<FeishuAuthUnbindResult>>('/auth/feishu/unbind', {
      method: 'POST',
      body: {
        confirmText: normalized,
      },
    })
    feishuBindStatus.value = response.data.status
    feishuBindSuccess.value = response.data.removedCount > 0
      ? `解绑成功，已移除 ${response.data.removedCount} 条飞书身份。`
      : '当前账号没有可解绑的飞书身份。'
    feishuUnbindConfirmVisible.value = false
    feishuUnbindConfirmText.value = ''
    await loadFeishuAudits()
  }
  catch (error: any) {
    feishuBindError.value = String(error?.data?.message || '解绑飞书失败，请稍后重试。')
  }
  finally {
    feishuUnbinding.value = false
  }
}

function openFeishuUnbindConfirm() {
  feishuBindError.value = ''
  feishuBindSuccess.value = ''
  feishuUnbindConfirmVisible.value = true
  feishuUnbindConfirmText.value = ''
}

function cancelFeishuUnbindConfirm() {
  if (feishuUnbinding.value)
    return
  feishuUnbindConfirmVisible.value = false
  feishuUnbindConfirmText.value = ''
}

watch(
  () => route.fullPath,
  () => {
    if (!profileDialogVisible.value)
      return
    feishuBindError.value = readFeishuBindErrorFromRoute()
  },
)

async function onWorkspaceSwitch(workspaceId: string) {
  const targetId = String(workspaceId || '').trim()
  if (!targetId)
    return

  selectedWorkspaceId.value = targetId
  writeActiveWorkspacePreference(targetId)

  if (routeTeamId.value === targetId)
    return

  await navigateTo(`/team/${targetId}`)
}
</script>

<template>
  <aside class="hidden w-[288px] shrink-0 flex-col border-r border-[var(--db-border)] bg-white/[0.72] backdrop-blur-xl lg:flex">
    <div class="p-5">
      <div class="db-panel db-panel-soft px-5 py-4">
        <div class="flex gap-3 items-center">
          <div class="text-white rounded-[18px] bg-[var(--db-primary)] flex h-11 w-11 items-center justify-center shadow-[0_14px_28px_rgba(36,84,215,0.22)]">
            <span class="material-symbols-outlined text-[22px]">analytics</span>
          </div>
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--db-subtle)]">
              Analysis Workspace
            </p>
            <h1 class="mt-1 text-lg font-black tracking-[-0.03em] text-slate-900">
              竞赛分析平台
            </h1>
          </div>
        </div>
        <p class="db-muted mt-3 text-sm leading-6">
          围绕赛事、资料与项目推进构建的统一分析工作台。
        </p>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <div class="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--db-subtle)]">
        工作台导航
      </div>
      <nav class="mt-3 space-y-2">
        <NuxtLink
          v-for="item in props.menuItems"
          :key="item.id"
          :to="item.to"
          class="db-focus-ring group relative flex items-center gap-3 rounded-[18px] px-3.5 py-3 transition-all"
          :class="isMenuItemActive(item)
            ? 'bg-[var(--db-primary-soft)] text-[var(--db-primary)] shadow-[0_12px_28px_rgba(36,84,215,0.12)]'
            : 'text-slate-600 hover:bg-white/[0.86] hover:text-slate-900'"
        >
          <span
            class="rounded-2xl flex h-10 w-10 shrink-0 items-center justify-center transition-colors"
            :class="isMenuItemActive(item) ? 'bg-white text-[var(--db-primary)]' : 'bg-[var(--db-bg)] text-slate-500 group-hover:text-[var(--db-primary)]'"
          >
            <span class="material-symbols-outlined text-[21px]">{{ item.icon }}</span>
          </span>
          <span class="min-w-0 flex-1 truncate font-semibold">{{ item.label }}</span>
          <span
            v-if="isMenuItemActive(item)"
            class="h-2.5 w-2.5 rounded-full bg-[var(--db-primary)]"
          />
        </NuxtLink>
      </nav>

      <div class="db-panel db-panel-muted mt-6 p-4">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--db-subtle)]">
          热门话题
        </p>
        <ul class="mt-3 space-y-2.5">
          <li
            v-for="topic in props.topics"
            :key="topic.id"
            class="db-hover-lift rounded-[16px] border border-[var(--db-border)] bg-white/70 px-3 py-2.5 text-sm text-slate-600 flex gap-2 items-center"
          >
            <span class="text-xs text-[var(--db-primary)] font-bold">#</span>
            <span class="truncate">{{ topic.label }}</span>
          </li>
        </ul>
      </div>

      <div class="db-panel mt-4 p-4">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--db-subtle)]">
          工作区入口
        </p>
        <WorkspaceSwitchEntry
          v-if="props.workspaceOptions.length > 0"
          class="mt-3"
          mode="select"
          label="项目台切换"
          :model-value="selectedWorkspaceId"
          :workspace-options="props.workspaceOptions"
          :show-quota="false"
          @update:model-value="onWorkspaceSwitch"
        />
        <WorkspaceSwitchEntry
          v-else
          class="mt-3"
          mode="link"
          label="项目台"
          icon="workspaces"
          to="/team"
        />
      </div>

      <div class="db-panel mt-4 p-3.5 flex gap-3 items-center">
        <img
          :src="props.analystAvatar"
          class="border border-[var(--db-border)] rounded-full h-11 w-11 object-cover shadow-sm"
          alt="用户头像"
        >
        <div class="min-w-0 flex-1">
          <p class="text-sm text-slate-900 font-semibold truncate">
            {{ props.analystName }}
          </p>
          <p
            v-if="props.showAdminBadge"
            class="db-chip db-chip-warning mt-1"
          >
            管理页
          </p>
          <p class="db-muted text-xs truncate" :class="props.showAdminBadge ? 'mt-1.5' : 'mt-1'">
            {{ props.analystTier }}
          </p>
        </div>
        <button
          class="db-btn db-btn-ghost db-focus-ring h-10 w-10 px-0 ml-auto"
          title="个人设置"
          type="button"
          @click="openProfileDialog"
        >
          <span class="material-symbols-outlined text-[20px]">settings</span>
        </button>
      </div>
    </div>
  </aside>

  <Teleport to="body">
    <div
      v-if="profileDialogVisible"
      class="dashboard-profile-dialog p-4 bg-slate-950/30 backdrop-blur-sm flex items-center inset-0 justify-center fixed z-50"
      aria-modal="true"
      :aria-labelledby="profileDialogTitleId"
      role="dialog"
      @click.self="closeProfileDialog"
    >
      <div class="db-panel db-panel-soft p-4 max-w-sm w-full" style="box-shadow: var(--db-shadow-lg);">
        <div class="flex items-center justify-between">
          <h3 :id="profileDialogTitleId" class="text-base text-slate-900 font-semibold">
            个人信息
          </h3>
          <button
            class="db-btn db-btn-ghost db-focus-ring h-8 w-8 px-0"
            type="button"
            @click="closeProfileDialog"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div class="mt-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
          <p class="text-sm text-slate-900 font-semibold">
            {{ props.analystName }}
          </p>
          <p class="text-xs text-slate-500 mt-1">
            {{ props.analystTier }}
          </p>
        </div>

        <div class="mt-3 p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-2">
          <div class="flex gap-2 items-center justify-between">
            <p class="text-sm text-slate-900 font-semibold m-0">
              飞书账号
            </p>
            <span
              class="text-[10px] px-2 py-0.5 border rounded-full"
              :class="feishuBindStatus?.linked ? 'text-emerald-700 border-emerald-300 bg-emerald-50' : 'text-slate-600 border-slate-300 bg-white'"
            >
              {{ feishuBindStatus?.linked ? '已绑定' : '未绑定' }}
            </span>
          </div>
          <p v-if="feishuBindStatus?.linked && feishuBindStatus.unionId" class="text-[10px] text-slate-500 font-mono m-0 break-all">
            unionId: {{ feishuBindStatus.unionId }}
          </p>
          <p v-if="feishuBindStatus?.linked && feishuBindStatus.updatedAt" class="text-[10px] text-slate-500 m-0">
            最近同步：{{ feishuBindStatus.updatedAt }}
          </p>
          <p v-if="feishuBindError" class="text-xs text-rose-600 m-0">
            {{ feishuBindError }}
          </p>
          <p v-if="feishuBindSuccess" class="text-xs text-emerald-600 m-0">
            {{ feishuBindSuccess }}
          </p>
          <div class="flex gap-2 items-center justify-end">
            <button class="dense-btn" :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding" @click="loadFeishuBindStatus">
              {{ feishuBindLoading ? '刷新中...' : '刷新状态' }}
            </button>
            <button
              class="dense-btn !text-blue-700 !border-blue-300 hover:!bg-blue-50"
              :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding"
              @click="startFeishuBind"
            >
              {{ feishuBindRedirecting ? '跳转中...' : (feishuBindStatus?.linked ? '重新绑定飞书' : '绑定飞书') }}
            </button>
            <button
              v-if="feishuBindStatus?.linked"
              class="dense-btn !text-rose-700 !border-rose-300 hover:!bg-rose-50"
              :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding"
              @click="openFeishuUnbindConfirm"
            >
              {{ feishuUnbinding ? '解绑中...' : '解绑飞书' }}
            </button>
          </div>
          <div v-if="feishuUnbindConfirmVisible" class="p-2 border border-rose-200 rounded-lg bg-rose-50 space-y-2">
            <p class="text-[11px] text-rose-700 m-0">
              解绑后将移除当前账号所有飞书身份映射。请输入 <span class="font-mono">UNBIND</span> 确认。
            </p>
            <input
              v-model="feishuUnbindConfirmText"
              type="text"
              class="text-sm px-2 py-1 border border-rose-300 rounded w-full"
              placeholder="输入 UNBIND"
              :disabled="feishuUnbinding"
            >
            <div class="flex gap-2 items-center justify-end">
              <button class="dense-btn" :disabled="feishuUnbinding" @click="cancelFeishuUnbindConfirm">
                取消
              </button>
              <button
                class="dense-btn !text-rose-700 !border-rose-300 hover:!bg-rose-100"
                :disabled="feishuUnbinding"
                @click="unbindFeishu"
              >
                {{ feishuUnbinding ? '解绑中...' : '确认解绑' }}
              </button>
            </div>
          </div>
        </div>

        <div class="mt-3 p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-2">
          <div class="flex gap-2 items-center justify-between">
            <p class="text-sm text-slate-900 font-semibold m-0">
              最近操作
            </p>
            <button class="dense-btn" :disabled="feishuAuditLoading" @click="loadFeishuAudits">
              {{ feishuAuditLoading ? '加载中...' : '刷新' }}
            </button>
          </div>
          <p v-if="!feishuAudits.length" class="text-xs text-slate-500 m-0">
            暂无绑定/解绑记录
          </p>
          <div v-else class="max-h-[140px] overflow-auto space-y-1">
            <div
              v-for="item in feishuAudits"
              :key="item.id"
              class="text-xs p-2 border border-slate-200 rounded bg-white flex gap-2 items-center justify-between"
            >
              <span class="text-slate-700">{{ formatAuditAction(item.action) }}</span>
              <span class="text-slate-500 font-mono">{{ item.createdAt }}</span>
            </div>
          </div>
        </div>

        <p v-if="actionError" class="text-xs text-rose-600 mt-3">
          {{ actionError }}
        </p>

        <div class="mt-4 flex gap-2 items-center justify-end">
          <button class="dense-btn" :disabled="loggingOut" @click="closeProfileDialog">
            关闭
          </button>
          <button
            class="dense-btn !text-rose-700 !border-rose-300 hover:!bg-rose-50"
            :disabled="loggingOut"
            @click="logout"
          >
            {{ loggingOut ? '退出中...' : '退出登录' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
