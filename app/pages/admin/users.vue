<script setup lang="ts">
import type { ApiResponse, AuthMeResult, PlatformRole } from '~~/shared/types/domain'
import { formatFileSize } from '~~/shared/constants/project-resource-upload'
import {
  isUserAvatarUploadFileSupported,
  USER_AVATAR_UPLOAD_ACCEPT_ATTR,
  USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  USER_AVATAR_UPLOAD_TYPES_LABEL,
} from '~~/shared/constants/user-avatar-upload'
import { resolveAuthDisplayMessage, resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

definePageMeta({
  layout: 'admin',
})

type UserStatus = 'active' | 'inactive' | 'disabled'
type DrawerMode = 'create' | 'edit'
type DrawerTab = 'profile' | 'security' | 'detail'

interface UserAdminRow {
  userId: string
  username: string
  avatarUrl?: string | null
  roles: PlatformRole[]
  status: UserStatus
  source: string
  identityProviders: string[]
  activeSessionCount: number
  totalSessionCount: number
  workspaceCount: number
  projectCount: number
  lastSessionAt: string
  createdAt: string
  updatedAt: string
}

interface UserIdentity {
  provider: string
  providerUserId: string
  profile: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface UserSessionSummary {
  id: string
  status: 'active' | 'expired' | 'revoked'
  createdAt: string
  expiresAt: string
  revokedAt?: string | null
}

interface UserWorkspaceSummary {
  workspaceId: string
  name: string
  type: string
  roles: string[]
  updatedAt: string
}

interface UserProjectSummary {
  projectId: string
  title: string
  role: string
  status: string
  updatedAt: string
}

interface UserAdminDetail extends UserAdminRow {
  identities: UserIdentity[]
  sessions: UserSessionSummary[]
  workspaces: UserWorkspaceSummary[]
  projects: UserProjectSummary[]
}

interface MagicLinkResult {
  url: string
  expiresAt: string
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

const loading = ref(true)
const canAssign = ref(false)
const errorText = ref('')
const successText = ref('')
const rows = ref<UserAdminRow[]>([])
const savingProfile = ref(false)
const savingRole = ref(false)
const savingStatus = ref(false)
const creatingUser = ref(false)
const avatarUploading = ref(false)
const avatarFileInputRef = ref<HTMLInputElement | null>(null)
const detailLoading = ref(false)
const detail = ref<UserAdminDetail | null>(null)
const drawerVisible = ref(false)
const drawerMode = ref<DrawerMode>('edit')
const activeTab = ref<DrawerTab>('profile')
const page = ref(1)
const pageSize = ref(10)
const generatedMagicLink = ref<MagicLinkResult | null>(null)
const magicLinkLoading = ref(false)
const magicLinkCopied = ref(false)
let magicLinkCopyTimer: ReturnType<typeof setTimeout> | null = null

const form = reactive<{
  targetUserId: string
  username: string
  initialPassword: string
  platformSuperAdmin: boolean
  contestAdmin: boolean
  pricingAdmin: boolean
  status: 'active' | 'disabled'
}>({
  targetUserId: '',
  username: '',
  initialPassword: '',
  platformSuperAdmin: false,
  contestAdmin: false,
  pricingAdmin: false,
  status: 'active',
})

const columns = [
  { title: '用户', dataIndex: 'username', slotName: 'user', width: 360 },
  { title: '角色', dataIndex: 'roles', slotName: 'roles', width: 260 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 140 },
  { title: '来源', dataIndex: 'source', slotName: 'source', width: 140 },
  { title: '活跃', dataIndex: 'activeSessionCount', slotName: 'activity', width: 150 },
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', width: 160 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120, fixed: 'right' as const },
]

const selectedUser = computed(() => {
  return rows.value.find(item => item.userId === form.targetUserId) || detail.value
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

const activeUsers = computed(() => rows.value.filter(item => item.status === 'active').length)
const disabledUsers = computed(() => rows.value.filter(item => item.status === 'disabled').length)
const oauthUsers = computed(() => rows.value.filter(item => item.identityProviders.length > 0).length)

const drawerTitle = computed(() => {
  if (drawerMode.value === 'create')
    return '新建用户'
  return selectedUser.value ? `用户详情：${selectedUser.value.username}` : '用户详情'
})

watch([rows, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(rows.value.length / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

function formatDate(value: string): string {
  return value?.replace('T', ' ').slice(0, 16) || '-'
}

function formatRelativeDate(value: string): string {
  if (!value)
    return '从未登录'
  return formatDate(value)
}

function statusColor(status: UserStatus): 'green' | 'gray' | 'red' {
  if (status === 'active')
    return 'green'
  if (status === 'disabled')
    return 'red'
  return 'gray'
}

function statusLabel(status: UserStatus): string {
  if (status === 'active')
    return 'active'
  if (status === 'disabled')
    return 'disabled'
  return 'inactive'
}

function sessionStatusColor(status: UserSessionSummary['status']): 'green' | 'gray' | 'red' {
  if (status === 'active')
    return 'green'
  if (status === 'revoked')
    return 'red'
  return 'gray'
}

function selectedRoles(): PlatformRole[] {
  const roles: PlatformRole[] = []
  if (form.platformSuperAdmin)
    roles.push('platform_super_admin')
  if (form.contestAdmin)
    roles.push('contest_admin')
  if (form.pricingAdmin)
    roles.push('pricing_admin')
  return roles
}

function fillForm(row: UserAdminRow) {
  form.targetUserId = row.userId
  form.username = row.username
  form.initialPassword = ''
  form.platformSuperAdmin = row.roles.includes('platform_super_admin')
  form.contestAdmin = row.roles.includes('contest_admin')
  form.pricingAdmin = row.roles.includes('pricing_admin')
  form.status = row.status === 'disabled' ? 'disabled' : 'active'
}

function clearForm() {
  form.targetUserId = ''
  form.username = ''
  form.initialPassword = ''
  form.platformSuperAdmin = false
  form.contestAdmin = false
  form.pricingAdmin = false
  form.status = 'active'
  detail.value = null
  generatedMagicLink.value = null
}

function setSuccess(message: string) {
  successText.value = message
  errorText.value = ''
}

function setError(message: string) {
  errorText.value = message
  successText.value = ''
}

async function requestApi<T>(path: string, options: RequestInit = {}, fallbackMessage = '请求失败。'): Promise<T> {
  const response = await fetch(endpoint(path), {
    credentials: 'include',
    ...options,
    headers: options.body instanceof FormData
      ? options.headers
      : {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw new Error(String(payload?.message || fallbackMessage))
  return payload.data
}

async function loadPermission() {
  const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
  canAssign.value = (response.data.user.platformPermissions || []).includes('role.assign')
}

async function loadUsers(preferredUserId?: string) {
  try {
    rows.value = await requestApi<UserAdminRow[]>('/admin/users', {}, '用户信息加载失败。')
    const preferred = preferredUserId || form.targetUserId
    const next = preferred ? rows.value.find(item => item.userId === preferred) : null
    if (next)
      fillForm(next)
    else if (!drawerVisible.value)
      clearForm()
  }
  catch (error: any) {
    rows.value = []
    clearForm()
    setError(String(error?.message || '用户信息加载失败。'))
  }
}

async function loadUserDetail(userId: string) {
  if (!userId)
    return
  detailLoading.value = true
  try {
    detail.value = await requestApi<UserAdminDetail>(`/admin/users/${userId}`, {}, '用户详情加载失败。')
    fillForm(detail.value)
  }
  catch (error: any) {
    setError(String(error?.message || '用户详情加载失败。'))
  }
  finally {
    detailLoading.value = false
  }
}

function openCreateDrawer() {
  clearForm()
  drawerMode.value = 'create'
  activeTab.value = 'profile'
  drawerVisible.value = true
}

async function openEditDrawer(row: UserAdminRow) {
  drawerMode.value = 'edit'
  activeTab.value = 'profile'
  generatedMagicLink.value = null
  fillForm(row)
  drawerVisible.value = true
  await loadUserDetail(row.userId)
}

async function createUser() {
  creatingUser.value = true
  try {
    const created = await requestApi<UserAdminRow>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: form.username,
        password: form.initialPassword,
        roles: selectedRoles(),
        disabled: form.status === 'disabled',
      }),
    }, '用户创建失败。')
    setSuccess('用户创建成功。')
    await loadUsers(created.userId)
    drawerMode.value = 'edit'
    await loadUserDetail(created.userId)
  }
  catch (error: any) {
    setError(String(error?.message || '用户创建失败。'))
  }
  finally {
    creatingUser.value = false
  }
}

async function saveProfile() {
  if (!selectedUser.value)
    return
  savingProfile.value = true
  try {
    await requestApi<UserAdminRow>(`/admin/users/${selectedUser.value.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        username: form.username,
      }),
    }, '用户资料更新失败。')
    setSuccess('用户资料更新成功。')
    await loadUsers(selectedUser.value.userId)
    await loadUserDetail(selectedUser.value.userId)
  }
  catch (error: any) {
    setError(String(error?.message || '用户资料更新失败。'))
  }
  finally {
    savingProfile.value = false
  }
}

async function saveRoles() {
  if (!selectedUser.value)
    return
  savingRole.value = true
  try {
    await requestApi<unknown>('/admin/platform-roles', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: selectedUser.value.userId,
        roles: selectedRoles(),
      }),
    }, '角色更新失败。')
    setSuccess('角色更新成功。')
    await loadUsers(selectedUser.value.userId)
    await loadUserDetail(selectedUser.value.userId)
  }
  catch (error: any) {
    setError(String(error?.message || '角色更新失败。'))
  }
  finally {
    savingRole.value = false
  }
}

async function saveStatus() {
  if (!selectedUser.value)
    return
  savingStatus.value = true
  try {
    await requestApi<unknown>(`/admin/users/${selectedUser.value.userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: form.status,
      }),
    }, '状态更新失败。')
    setSuccess('用户状态更新成功。')
    await loadUsers(selectedUser.value.userId)
    await loadUserDetail(selectedUser.value.userId)
  }
  catch (error: any) {
    setError(String(error?.message || '状态更新失败。'))
  }
  finally {
    savingStatus.value = false
  }
}

function triggerAvatarUpload() {
  if (avatarUploading.value || drawerMode.value !== 'edit')
    return
  avatarFileInputRef.value?.click()
}

async function handleAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file || !selectedUser.value)
    return

  const fileName = String(file.name || '').trim()
  if (!isUserAvatarUploadFileSupported(fileName)) {
    setError(`头像格式不支持，支持格式：${USER_AVATAR_UPLOAD_TYPES_LABEL}。`)
    if (input)
      input.value = ''
    return
  }

  if (file.size > USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES) {
    setError(`头像文件过大，单文件上限 ${formatFileSize(USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES)}。`)
    if (input)
      input.value = ''
    return
  }

  avatarUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file, fileName)
    await requestApi<unknown>(`/admin/users/${selectedUser.value.userId}/avatar`, {
      method: 'POST',
      body: formData,
    }, '头像上传失败。')
    setSuccess('头像已更新。')
    await loadUsers(selectedUser.value.userId)
    await loadUserDetail(selectedUser.value.userId)
  }
  catch (error: any) {
    setError(String(error?.message || '头像上传失败。'))
  }
  finally {
    avatarUploading.value = false
    if (input)
      input.value = ''
  }
}

async function clearAvatar() {
  if (!selectedUser.value)
    return
  avatarUploading.value = true
  try {
    await requestApi<unknown>(`/admin/users/${selectedUser.value.userId}/avatar`, {
      method: 'DELETE',
    }, '头像清除失败。')
    setSuccess('头像已清除。')
    await loadUsers(selectedUser.value.userId)
    await loadUserDetail(selectedUser.value.userId)
  }
  catch (error: any) {
    setError(String(error?.message || '头像清除失败。'))
  }
  finally {
    avatarUploading.value = false
  }
}

async function generateMagicLink() {
  if (!selectedUser.value)
    return
  magicLinkLoading.value = true
  generatedMagicLink.value = null
  try {
    generatedMagicLink.value = await requestApi<MagicLinkResult>(`/admin/users/${selectedUser.value.userId}/magic-link`, {
      method: 'POST',
      body: JSON.stringify({
        ttlMinutes: 15,
        redirect: '/dashboard',
      }),
    }, '登录链接生成失败。')
    setSuccess('登录链接已生成。')
  }
  catch (error: any) {
    setError(String(error?.message || '登录链接生成失败。'))
  }
  finally {
    magicLinkLoading.value = false
  }
}

function copyTextWithFallback(text: string): boolean {
  if (!import.meta.client)
    return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  }
  finally {
    document.body.removeChild(textarea)
  }
  return copied
}

async function copyMagicLink() {
  const url = generatedMagicLink.value?.url || ''
  if (!url)
    return

  let copied = false
  if (import.meta.client && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url)
      copied = true
    }
    catch {
      copied = false
    }
  }
  if (!copied)
    copied = copyTextWithFallback(url)

  magicLinkCopied.value = copied
  if (magicLinkCopyTimer)
    clearTimeout(magicLinkCopyTimer)
  magicLinkCopyTimer = setTimeout(() => {
    magicLinkCopied.value = false
  }, 1800)
  if (copied)
    setSuccess('登录链接已复制。')
}

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await loadPermission()
    if (canAssign.value)
      await loadUsers()
  }
  catch (error: any) {
    const info = resolveAuthRequestErrorInfo(error)
    if (info.isUnauthorized) {
      await navigateTo({
        path: '/login',
        query: { redirect: resolveLoginRedirectTarget(route, '/admin/users') },
      }, { replace: true })
      return
    }
    setError(resolveAuthDisplayMessage(error, '用户信息加载失败。'))
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="!canAssign" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      403：当前账号没有 `role.assign` 权限，无法访问用户管理。
    </section>

    <template v-else>
      <section class="p-3 border border-slate-200 bg-white">
        <div class="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <p class="text-[13px] text-slate-900 font-semibold m-0">
              用户管理
            </p>
            <p class="text-[10px] text-slate-500 m-0 mt-1">
              维护账号资料、平台角色、登录状态与认证来源。
            </p>
          </div>
          <div class="flex gap-2 items-center">
            <a-button size="small" @click="loadUsers()">
              <template #icon>
                <span class="i-heroicons-outline-arrow-path" />
              </template>
              刷新
            </a-button>
            <a-button size="small" type="primary" @click="openCreateDrawer">
              <template #icon>
                <span class="i-heroicons-outline-user-plus" />
              </template>
              新建用户
            </a-button>
          </div>
        </div>

        <div class="mt-3 grid gap-2 md:grid-cols-4">
          <div class="p-3 border border-slate-200 bg-slate-50">
            <p class="text-[10px] text-slate-500 m-0">
              用户总数
            </p>
            <p class="text-lg text-slate-900 font-semibold m-0 mt-1">
              {{ rows.length }}
            </p>
          </div>
          <div class="p-3 border border-emerald-200 bg-emerald-50">
            <p class="text-[10px] text-emerald-700 m-0">
              活跃用户
            </p>
            <p class="text-lg text-emerald-900 font-semibold m-0 mt-1">
              {{ activeUsers }}
            </p>
          </div>
          <div class="p-3 border border-rose-200 bg-rose-50">
            <p class="text-[10px] text-rose-700 m-0">
              已禁用
            </p>
            <p class="text-lg text-rose-900 font-semibold m-0 mt-1">
              {{ disabledUsers }}
            </p>
          </div>
          <div class="p-3 border border-sky-200 bg-sky-50">
            <p class="text-[10px] text-sky-700 m-0">
              第三方来源
            </p>
            <p class="text-lg text-sky-900 font-semibold m-0 mt-1">
              {{ oauthUsers }}
            </p>
          </div>
        </div>
      </section>

      <section>
        <div class="p-3 border border-slate-200 bg-white">
          <a-table
            :bordered="{ cell: true }"
            :columns="columns"
            :data="pagedRows"
            :pagination="false"
            row-key="userId"
            size="small"
          >
            <template #user="{ record }">
              <div class="min-w-0 flex gap-2 items-center">
                <UnifiedAvatar :name="record.username" :src="record.avatarUrl" :size="30" />
                <div class="min-w-0">
                  <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                    {{ record.username }}
                  </p>
                  <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                    {{ record.userId }}
                  </p>
                </div>
              </div>
            </template>

            <template #roles="{ record }">
              <div class="flex flex-wrap gap-1">
                <a-tag
                  v-for="role in (record.roles.length > 0 ? record.roles : ['member'])"
                  :key="`${record.userId}-${role}`"
                  bordered
                  size="small"
                >
                  {{ role }}
                </a-tag>
              </div>
            </template>

            <template #status="{ record }">
              <a-tag :color="statusColor(record.status)" size="small">
                {{ statusLabel(record.status) }}
              </a-tag>
            </template>

            <template #source="{ record }">
              <div class="flex flex-wrap gap-1">
                <a-tag
                  v-for="provider in (record.identityProviders.length ? record.identityProviders : [record.source])"
                  :key="`${record.userId}-${provider}`"
                  size="small"
                >
                  {{ provider }}
                </a-tag>
              </div>
            </template>

            <template #activity="{ record }">
              <div class="text-[10px] text-slate-500 leading-5">
                <p class="m-0">
                  会话 {{ record.activeSessionCount }}/{{ record.totalSessionCount }}
                </p>
                <p class="m-0 truncate">
                  {{ formatRelativeDate(record.lastSessionAt) }}
                </p>
              </div>
            </template>

            <template #updatedAt="{ record }">
              <span class="text-[10px] text-slate-500">{{ formatDate(record.updatedAt) }}</span>
            </template>

            <template #actions="{ record }">
              <a-button size="mini" @click="openEditDrawer(record)">
                编辑
              </a-button>
            </template>
          </a-table>

          <div class="mt-3 flex justify-end">
            <a-pagination
              :current="page"
              :page-size="pageSize"
              :page-size-options="[10, 20, 50]"
              :show-total="true"
              :total="rows.length"
              size="small"
              @change="(value: number) => page = value"
              @page-size-change="(value: number) => { pageSize = value; page = 1 }"
            />
          </div>
        </div>
      </section>

      <section v-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
        {{ errorText }}
      </section>
      <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
        {{ successText }}
      </section>

      <a-drawer
        v-model:visible="drawerVisible"
        :width="720"
        :title="drawerTitle"
        unmount-on-close
      >
        <input
          ref="avatarFileInputRef"
          type="file"
          class="sr-only"
          :accept="USER_AVATAR_UPLOAD_ACCEPT_ATTR"
          @change="handleAvatarFileChange"
        >

        <div class="text-[11px] pb-8 space-y-4">
          <div class="p-3 border border-slate-200 bg-slate-50">
            <div class="flex gap-3 items-center justify-between">
              <div class="min-w-0 flex gap-3 items-center">
                <UnifiedAvatar :name="form.username || selectedUser?.username" :src="selectedUser?.avatarUrl" :size="44" />
                <div class="min-w-0">
                  <p class="text-[13px] text-slate-900 font-semibold m-0 truncate">
                    {{ form.username || '新用户' }}
                  </p>
                  <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                    {{ form.targetUserId || '创建后生成 ID' }}
                  </p>
                </div>
              </div>
              <a-tag v-if="drawerMode === 'edit' && selectedUser" :color="statusColor(selectedUser.status)" size="small">
                {{ selectedUser.status }}
              </a-tag>
            </div>
          </div>

          <a-tabs v-model:active-key="activeTab" type="rounded" size="small">
            <a-tab-pane key="profile" title="资料与角色">
              <div class="space-y-4">
                <section class="space-y-2">
                  <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
                    基本资料
                  </p>
                  <a-input v-model="form.username" size="small" placeholder="用户名" />
                  <a-input
                    v-if="drawerMode === 'create'"
                    v-model="form.initialPassword"
                    size="small"
                    type="password"
                    placeholder="初始密码，至少 6 位"
                  />
                  <div v-if="drawerMode === 'edit'" class="flex flex-wrap gap-2">
                    <a-button size="small" :loading="savingProfile" type="primary" @click="saveProfile">
                      保存资料
                    </a-button>
                    <a-button size="small" :loading="avatarUploading" @click="triggerAvatarUpload">
                      更换头像
                    </a-button>
                    <a-button size="small" :disabled="avatarUploading" status="danger" @click="clearAvatar">
                      清除头像
                    </a-button>
                  </div>
                </section>

                <section class="pt-3 border-t border-slate-200 space-y-2">
                  <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
                    平台角色
                  </p>
                  <label class="text-[11px] text-slate-700 flex gap-2 items-center">
                    <a-checkbox v-model="form.platformSuperAdmin" />
                    platform_super_admin
                  </label>
                  <label class="text-[11px] text-slate-700 flex gap-2 items-center">
                    <a-checkbox v-model="form.contestAdmin" />
                    contest_admin
                  </label>
                  <label class="text-[11px] text-slate-700 flex gap-2 items-center">
                    <a-checkbox v-model="form.pricingAdmin" />
                    pricing_admin
                  </label>
                  <a-button
                    v-if="drawerMode === 'edit'"
                    size="small"
                    :loading="savingRole"
                    type="primary"
                    @click="saveRoles"
                  >
                    保存角色
                  </a-button>
                </section>

                <section class="pt-3 border-t border-slate-200 space-y-2">
                  <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
                    用户状态
                  </p>
                  <a-select v-model="form.status" size="small">
                    <a-option value="active">
                      active（启用）
                    </a-option>
                    <a-option value="disabled">
                      disabled（禁用）
                    </a-option>
                  </a-select>
                  <a-button
                    v-if="drawerMode === 'edit'"
                    size="small"
                    :loading="savingStatus"
                    status="danger"
                    @click="saveStatus"
                  >
                    保存状态
                  </a-button>
                </section>

                <a-button
                  v-if="drawerMode === 'create'"
                  long
                  size="small"
                  :loading="creatingUser"
                  type="primary"
                  @click="createUser"
                >
                  创建用户
                </a-button>
              </div>
            </a-tab-pane>

            <a-tab-pane key="security" title="登录与安全" :disabled="drawerMode === 'create'">
              <div v-if="selectedUser" class="space-y-4">
                <section class="space-y-2">
                  <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
                    一次性登录链接
                  </p>
                  <p class="text-[10px] text-slate-500 m-0 leading-5">
                    链接 15 分钟内有效，首次访问后立即换发正常会话并撤销该票据。
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <a-button size="small" :loading="magicLinkLoading" type="primary" @click="generateMagicLink">
                      生成 magic link
                    </a-button>
                    <a-button size="small" :disabled="!generatedMagicLink?.url" @click="copyMagicLink">
                      {{ magicLinkCopied ? '已复制' : '复制链接' }}
                    </a-button>
                  </div>
                  <div v-if="generatedMagicLink" class="p-2 border border-slate-200 bg-slate-50">
                    <p class="text-[10px] text-slate-500 m-0">
                      过期时间：{{ formatDate(generatedMagicLink.expiresAt) }}
                    </p>
                    <p class="text-[10px] text-slate-600 font-mono break-all m-0 mt-2">
                      {{ generatedMagicLink.url }}
                    </p>
                  </div>
                </section>

                <section class="pt-3 border-t border-slate-200 space-y-2">
                  <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
                    会话状态
                  </p>
                  <div v-if="detailLoading" class="p-2">
                    <a-skeleton :animation="true">
                      <a-skeleton-line :rows="4" />
                    </a-skeleton>
                  </div>
                  <div v-else-if="detail?.sessions.length" class="space-y-2">
                    <div
                      v-for="session in detail.sessions"
                      :key="session.id"
                      class="p-2 border border-slate-200 bg-white flex gap-3 items-start justify-between"
                    >
                      <div class="min-w-0">
                        <p class="text-[10px] text-slate-900 font-mono m-0 truncate">
                          {{ session.id }}
                        </p>
                        <p class="text-[10px] text-slate-500 m-0 mt-1">
                          创建 {{ formatDate(session.createdAt) }} · 过期 {{ formatDate(session.expiresAt) }}
                        </p>
                      </div>
                      <a-tag :color="sessionStatusColor(session.status)" size="small">
                        {{ session.status }}
                      </a-tag>
                    </div>
                  </div>
                  <a-empty v-else description="暂无会话记录" />
                </section>
              </div>
            </a-tab-pane>

            <a-tab-pane key="detail" title="详细状态" :disabled="drawerMode === 'create'">
              <div v-if="detailLoading" class="p-2">
                <a-skeleton :animation="true">
                  <a-skeleton-line :rows="8" />
                </a-skeleton>
              </div>

              <div v-else-if="detail" class="space-y-4">
                <section class="grid gap-2 md:grid-cols-3">
                  <div class="p-3 border border-slate-200 bg-slate-50">
                    <p class="text-[10px] text-slate-500 m-0">
                      工作空间
                    </p>
                    <p class="text-lg text-slate-900 font-semibold m-0 mt-1">
                      {{ detail.workspaceCount }}
                    </p>
                  </div>
                  <div class="p-3 border border-slate-200 bg-slate-50">
                    <p class="text-[10px] text-slate-500 m-0">
                      项目
                    </p>
                    <p class="text-lg text-slate-900 font-semibold m-0 mt-1">
                      {{ detail.projectCount }}
                    </p>
                  </div>
                  <div class="p-3 border border-slate-200 bg-slate-50">
                    <p class="text-[10px] text-slate-500 m-0">
                      最近登录
                    </p>
                    <p class="text-[11px] text-slate-900 font-semibold m-0 mt-2">
                      {{ formatRelativeDate(detail.lastSessionAt) }}
                    </p>
                  </div>
                </section>

                <section class="space-y-2">
                  <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
                    认证来源
                  </p>
                  <div v-if="detail.identities.length" class="space-y-2">
                    <div
                      v-for="identity in detail.identities"
                      :key="`${identity.provider}-${identity.providerUserId}`"
                      class="p-2 border border-slate-200 bg-white"
                    >
                      <div class="flex gap-2 items-center justify-between">
                        <a-tag size="small">
                          {{ identity.provider }}
                        </a-tag>
                        <span class="text-[10px] text-slate-500">{{ formatDate(identity.updatedAt) }}</span>
                      </div>
                      <p class="text-[10px] text-slate-600 font-mono break-all m-0 mt-2">
                        {{ identity.providerUserId }}
                      </p>
                      <p class="text-[10px] text-slate-500 break-all m-0 mt-1">
                        {{ JSON.stringify(identity.profile) }}
                      </p>
                    </div>
                  </div>
                  <a-empty v-else description="本地密码账号，无第三方绑定" />
                </section>

                <section class="space-y-2">
                  <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
                    工作空间
                  </p>
                  <div v-if="detail.workspaces.length" class="space-y-2">
                    <div
                      v-for="workspace in detail.workspaces"
                      :key="workspace.workspaceId"
                      class="p-2 border border-slate-200 bg-white"
                    >
                      <p class="text-[11px] text-slate-900 font-semibold m-0">
                        {{ workspace.name }}
                      </p>
                      <p class="text-[10px] text-slate-500 m-0 mt-1">
                        {{ workspace.type }} · {{ workspace.roles.join(', ') || 'member' }}
                      </p>
                    </div>
                  </div>
                  <a-empty v-else description="暂无工作空间成员记录" />
                </section>

                <section class="space-y-2">
                  <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
                    项目
                  </p>
                  <div v-if="detail.projects.length" class="space-y-2">
                    <div
                      v-for="project in detail.projects"
                      :key="project.projectId"
                      class="p-2 border border-slate-200 bg-white"
                    >
                      <p class="text-[11px] text-slate-900 font-semibold m-0">
                        {{ project.title }}
                      </p>
                      <p class="text-[10px] text-slate-500 m-0 mt-1">
                        {{ project.role }} · {{ project.status }} · {{ formatDate(project.updatedAt) }}
                      </p>
                    </div>
                  </div>
                  <a-empty v-else description="暂无项目成员记录" />
                </section>
              </div>

              <a-empty v-else description="未加载到用户详情" />
            </a-tab-pane>
          </a-tabs>
        </div>
      </a-drawer>
    </template>
  </div>
</template>
