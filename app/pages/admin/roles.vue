<script setup lang="ts">
import type {
  ApiResponse,
  PlatformPermission,
  PlatformRole,
  PlatformRoleAssignment,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface RoleApiResult {
  current: {
    userId: string
    username: string
    roles: PlatformRole[]
    permissions: PlatformPermission[]
  }
  assignments: PlatformRoleAssignment[]
  users?: Array<{
    userId: string
    username: string
    roles: PlatformRole[]
  }>
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const saving = ref(false)
const assignDrawerVisible = ref(false)
const errorText = ref('')
const successText = ref('')
const data = ref<RoleApiResult | null>(null)
const page = ref(1)
const pageSize = ref(10)

const form = reactive({
  targetUserIds: [] as string[],
  userAdmin: false,
  contestAdmin: false,
  pricingAdmin: false,
})

const columns = [
  { title: '用户', dataIndex: 'username', slotName: 'user' },
  { title: '角色', dataIndex: 'roles', slotName: 'roles' },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120 },
]

const canAssign = computed(() => {
  return data.value?.current.permissions.includes('role.assign') || false
})
const userOptions = computed(() => {
  return assignableUsers.value.map(user => ({
    label: `${user.username}（${user.userId}）`,
    value: user.userId,
  }))
})
const assignableUsers = computed(() => {
  return (data.value?.users || []).filter(user => !user.roles.includes('platform_super_admin'))
})
const selectedUserCount = computed(() => form.targetUserIds.length)
const allAssignableUserIds = computed(() => assignableUsers.value.map(user => user.userId))
const allAssignableRolesSelected = computed(() => form.userAdmin && form.contestAdmin && form.pricingAdmin)
const noAssignableRolesSelected = computed(() => !form.userAdmin && !form.contestAdmin && !form.pricingAdmin)
const selectedRoleLabels = computed(() => selectedRoles())
const selectedUserPreview = computed(() => {
  const selected = new Set(form.targetUserIds)
  return assignableUsers.value.filter(user => selected.has(user.userId)).slice(0, 8)
})

const pagedAssignments = computed(() => {
  const list = data.value?.assignments || []
  const start = (page.value - 1) * pageSize.value
  return list.slice(start, start + pageSize.value)
})

watch([() => data.value?.assignments?.length || 0, pageSize], () => {
  const total = data.value?.assignments.length || 0
  const maxPage = Math.max(1, Math.ceil(total / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

function selectedRoles(): PlatformRole[] {
  const roles: PlatformRole[] = []
  if (form.userAdmin)
    roles.push('user_admin')
  if (form.contestAdmin)
    roles.push('contest_admin')
  if (form.pricingAdmin)
    roles.push('pricing_admin')
  return roles
}

function fillForm(assignment: PlatformRoleAssignment) {
  if (assignment.roles.includes('platform_super_admin')) {
    resetForm()
    return
  }
  form.targetUserIds = [assignment.userId]
  form.userAdmin = assignment.roles.includes('user_admin')
  form.contestAdmin = assignment.roles.includes('contest_admin')
  form.pricingAdmin = assignment.roles.includes('pricing_admin')
}

function resetForm() {
  form.targetUserIds = []
  form.userAdmin = false
  form.contestAdmin = false
  form.pricingAdmin = false
}

function openCreateDrawer() {
  resetForm()
  assignDrawerVisible.value = true
}

function openEditDrawer(assignment: PlatformRoleAssignment) {
  fillForm(assignment)
  assignDrawerVisible.value = true
}

function selectAllUsers() {
  form.targetUserIds = [...allAssignableUserIds.value]
}

function clearUsers() {
  form.targetUserIds = []
}

function selectAllRoles() {
  form.userAdmin = true
  form.contestAdmin = true
  form.pricingAdmin = true
}

function clearRoles() {
  form.userAdmin = false
  form.contestAdmin = false
  form.pricingAdmin = false
}

function invertRoles() {
  form.userAdmin = !form.userAdmin
  form.contestAdmin = !form.contestAdmin
  form.pricingAdmin = !form.pricingAdmin
}

async function loadData() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await fetch(endpoint('/admin/platform-roles'), {
      credentials: 'include',
    })
    const payload = await response.json().catch(() => null) as ApiResponse<RoleApiResult> | null
    if (!response.ok || !payload || payload.code !== 0)
      throw new Error(String(payload?.message || '角色信息加载失败。'))
    data.value = payload.data
  }
  catch (error: any) {
    data.value = null
    errorText.value = String(error?.data?.message || '角色信息加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function submitAssignment() {
  if (!canAssign.value)
    return
  if (form.targetUserIds.length === 0) {
    errorText.value = '请至少选择一个目标用户。'
    return
  }
  saving.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const response = await fetch(endpoint('/admin/platform-roles'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetUserIds: form.targetUserIds,
        roles: selectedRoles(),
      }),
    })
    const payload = await response.json().catch(() => null) as ApiResponse<unknown> | null
    if (!response.ok || (payload && payload.code !== 0))
      throw new Error(String(payload?.message || '角色分配失败。'))
    successText.value = `角色分配已更新，共处理 ${form.targetUserIds.length} 个用户。`
    await loadData()
    assignDrawerVisible.value = false
  }
  catch (error: any) {
    successText.value = ''
    errorText.value = String(error?.data?.message || '角色分配失败。')
  }
  finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <template v-else-if="data">
      <section class="p-3 border border-slate-200 bg-white">
        <p class="text-[12px] text-slate-900 font-semibold m-0">
          当前登录用户：{{ data.current.username }}（{{ data.current.userId }}）
        </p>
        <p class="text-[11px] text-slate-600 m-0 mt-1">
          角色：{{ data.current.roles.join(', ') || '无' }}
        </p>
        <p class="text-[11px] text-slate-600 m-0 mt-1">
          权限：{{ data.current.permissions.join(', ') || '无' }}
        </p>
      </section>

      <section
        v-if="!canAssign"
        class="text-rose-600 p-3 border border-rose-200 bg-rose-50"
      >
        403：当前账号没有 role.assign 权限，仅可查看自身角色信息。
      </section>

      <template v-else>
        <section class="p-3 border border-slate-200 bg-white">
          <div class="mb-3 flex items-center justify-end">
            <a-button size="small" type="primary" @click="openCreateDrawer">
              批量分配
            </a-button>
          </div>
          <section>
            <a-table
              :bordered="{ cell: true }"
              :columns="columns"
              :data="pagedAssignments"
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

              <template #actions="{ record }">
                <a-button size="mini" :disabled="record.roles.includes('platform_super_admin')" @click="openEditDrawer(record)">
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
                :total="data.assignments.length"
                size="small"
                @change="(value: number) => page = value"
                @page-size-change="(value: number) => { pageSize = value; page = 1 }"
              />
            </div>
          </section>
        </section>
      </template>
    </template>

    <section v-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>
    <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
      {{ successText }}
    </section>

    <a-drawer
      v-model:visible="assignDrawerVisible"
      title="角色分配"
      :width="560"
      :footer="false"
      unmount-on-close
    >
      <div class="text-[11px] pb-6 space-y-4">
        <section class="text-amber-800 leading-5 p-3 border border-amber-200 bg-amber-50">
          此入口只支持分配普通内置角色：user_admin、contest_admin、pricing_admin。platform_super_admin 是唯一超管，不允许在批量分配中授予或移除。
        </section>

        <section class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
              目标用户
            </p>
            <div class="flex gap-2">
              <a-button size="mini" @click="selectAllUsers">
                全选用户
              </a-button>
              <a-button size="mini" @click="clearUsers">
                清空
              </a-button>
            </div>
          </div>
          <a-select
            v-model="form.targetUserIds"
            :options="userOptions"
            allow-search
            multiple
            size="small"
            placeholder="选择一个或多个目标用户"
          />
          <p class="text-[10px] text-slate-500 m-0">
            已选择 {{ selectedUserCount }} 个用户；超管账号会自动排除。
          </p>
        </section>

        <section class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
              普通角色
            </p>
            <div class="flex gap-2">
              <a-button size="mini" :disabled="allAssignableRolesSelected" @click="selectAllRoles">
                全选角色
              </a-button>
              <a-button size="mini" @click="invertRoles">
                反选
              </a-button>
              <a-button size="mini" :disabled="noAssignableRolesSelected" @click="clearRoles">
                清空
              </a-button>
            </div>
          </div>
          <div class="gap-2 grid">
            <label class="text-[11px] text-slate-700 flex gap-2 items-center">
              <a-checkbox v-model="form.userAdmin" />
              user_admin（用户管理）
            </label>
            <label class="text-[11px] text-slate-700 flex gap-2 items-center">
              <a-checkbox v-model="form.contestAdmin" />
              contest_admin（赛事内容）
            </label>
            <label class="text-[11px] text-slate-700 flex gap-2 items-center">
              <a-checkbox v-model="form.pricingAdmin" />
              pricing_admin（套餐计费）
            </label>
          </div>
        </section>

        <section class="p-3 border border-slate-200 bg-slate-50 space-y-2">
          <p class="text-[10px] text-slate-500 tracking-wider font-bold m-0 uppercase">
            分配预览
          </p>
          <p class="text-[11px] text-slate-700 m-0">
            将为 {{ selectedUserCount }} 个用户设置角色：{{ selectedRoleLabels.join(', ') || '无平台角色' }}
          </p>
          <div v-if="selectedUserPreview.length" class="flex flex-wrap gap-1">
            <a-tag v-for="user in selectedUserPreview" :key="user.userId" size="small">
              {{ user.username }}
            </a-tag>
          </div>
        </section>

        <div class="flex gap-2 justify-end">
          <a-button size="small" @click="assignDrawerVisible = false">
            取消
          </a-button>
          <a-button size="small" :loading="saving" type="primary" :disabled="selectedUserCount === 0" @click="submitAssignment">
            保存角色分配
          </a-button>
        </div>
      </div>
    </a-drawer>
  </div>
</template>
