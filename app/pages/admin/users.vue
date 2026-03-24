<script setup lang="ts">
import type { ApiResponse, AuthMeResult, PlatformRole } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface UserAdminRow {
  userId: string
  username: string
  roles: PlatformRole[]
  status: 'active' | 'inactive' | 'disabled'
  createdAt: string
  updatedAt: string
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()

const loading = ref(true)
const canAssign = ref(false)
const errorText = ref('')
const successText = ref('')
const rows = ref<UserAdminRow[]>([])
const savingRole = ref(false)
const savingStatus = ref(false)
const editDialogVisible = ref(false)
const page = ref(1)
const pageSize = ref(10)

const form = reactive<{
  targetUserId: string
  platformSuperAdmin: boolean
  contestAdmin: boolean
  pricingAdmin: boolean
  status: 'active' | 'disabled'
}>({
  targetUserId: '',
  platformSuperAdmin: false,
  contestAdmin: false,
  pricingAdmin: false,
  status: 'active',
})

const columns = [
  { title: '用户', dataIndex: 'username', slotName: 'user' },
  { title: '角色', dataIndex: 'roles', slotName: 'roles', width: 260 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 120 },
  { title: '创建时间', dataIndex: 'createdAt', slotName: 'createdAt', width: 160 },
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', width: 160 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120, fixed: 'right' as const },
]

function formatDate(value: string): string {
  return value?.replace('T', ' ').slice(0, 16) || '-'
}

function statusColor(status: UserAdminRow['status']): 'green' | 'gray' | 'red' {
  if (status === 'active')
    return 'green'
  if (status === 'disabled')
    return 'red'
  return 'gray'
}

const selectedUser = computed(() => {
  return rows.value.find(item => item.userId === form.targetUserId) || null
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

watch([rows, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(rows.value.length / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

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
  form.platformSuperAdmin = row.roles.includes('platform_super_admin')
  form.contestAdmin = row.roles.includes('contest_admin')
  form.pricingAdmin = row.roles.includes('pricing_admin')
  form.status = row.status === 'disabled' ? 'disabled' : 'active'
}

function openEditDialog(row: UserAdminRow) {
  fillForm(row)
  editDialogVisible.value = true
}

function clearForm() {
  form.targetUserId = ''
  form.platformSuperAdmin = false
  form.contestAdmin = false
  form.pricingAdmin = false
  form.status = 'active'
}

async function loadPermission() {
  const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
  canAssign.value = (response.data.user.platformPermissions || []).includes('role.assign')
}

async function loadUsers(preferredUserId?: string) {
  try {
    const response = await $fetch<ApiResponse<UserAdminRow[]>>(endpoint('/admin/users'))
    rows.value = response.data
    const next = rows.value.find(item => item.userId === (preferredUserId || form.targetUserId))
      || rows.value[0]
    if (next)
      fillForm(next)
    else
      clearForm()
  }
  catch (error: any) {
    rows.value = []
    clearForm()
    errorText.value = String(error?.data?.message || '用户信息加载失败。')
  }
}

async function saveRoles() {
  if (!selectedUser.value)
    return
  savingRole.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint('/admin/platform-roles'), {
      method: 'POST',
      body: {
        targetUserId: selectedUser.value.userId,
        roles: selectedRoles(),
      },
    })
    successText.value = '角色更新成功。'
    await loadUsers(selectedUser.value.userId)
  }
  catch (error: any) {
    successText.value = ''
    errorText.value = String(error?.data?.message || '角色更新失败。')
  }
  finally {
    savingRole.value = false
  }
}

async function saveStatus() {
  if (!selectedUser.value)
    return
  savingStatus.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/users/${selectedUser.value.userId}/status`), {
      method: 'PATCH',
      body: {
        status: form.status,
      },
    })
    successText.value = '用户状态更新成功。'
    await loadUsers(selectedUser.value.userId)
  }
  catch (error: any) {
    successText.value = ''
    errorText.value = String(error?.data?.message || '状态更新失败。')
  }
  finally {
    savingStatus.value = false
  }
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
    errorText.value = String(error?.data?.message || '用户信息加载失败。')
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
              <div class="min-w-0">
                <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                  {{ record.username }}
                </p>
                <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                  {{ record.userId }}
                </p>
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
                {{ record.status }}
              </a-tag>
            </template>

            <template #createdAt="{ record }">
              <span class="text-[10px] text-slate-500">{{ formatDate(record.createdAt) }}</span>
            </template>

            <template #updatedAt="{ record }">
              <span class="text-[10px] text-slate-500">{{ formatDate(record.updatedAt) }}</span>
            </template>

            <template #actions="{ record }">
              <a-button size="mini" @click="openEditDialog(record)">
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

      <a-modal
        v-model:visible="editDialogVisible"
        :footer="false"
        title="编辑用户"
        width="520px"
      >
        <div v-if="selectedUser" class="text-[11px] space-y-3">
          <div class="text-[10px] text-slate-600 p-2 border border-slate-200 bg-slate-50">
            <p class="text-[11px] text-slate-900 font-bold m-0">
              {{ selectedUser.username }}
            </p>
            <p class="font-mono m-0 mt-1">
              {{ selectedUser.userId }}
            </p>
          </div>

          <div class="space-y-2">
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
            <a-button long size="small" :loading="savingRole" type="primary" @click="saveRoles">
              保存角色
            </a-button>
          </div>

          <div class="pt-3 border-t border-slate-200 space-y-2">
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
            <a-button long size="small" :loading="savingStatus" status="danger" @click="saveStatus">
              保存状态
            </a-button>
          </div>
        </div>

        <div v-else class="text-[11px] text-slate-500">
          未找到用户信息，请关闭后重试。
        </div>
      </a-modal>
    </template>
  </div>
</template>
