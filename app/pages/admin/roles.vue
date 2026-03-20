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
}

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

const loading = ref(true)
const saving = ref(false)
const assignDialogVisible = ref(false)
const errorText = ref('')
const successText = ref('')
const data = ref<RoleApiResult | null>(null)
const page = ref(1)
const pageSize = ref(10)

const form = reactive({
  targetUserId: '',
  platformSuperAdmin: false,
  contestAdmin: false,
  pricingAdmin: false,
})

const columns = [
  { title: '用户', dataIndex: 'username', slotName: 'user' },
  { title: '角色', dataIndex: 'roles', slotName: 'roles' },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120 },
]

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const canAssign = computed(() => {
  return data.value?.current.permissions.includes('role.assign') || false
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
  if (form.platformSuperAdmin)
    roles.push('platform_super_admin')
  if (form.contestAdmin)
    roles.push('contest_admin')
  if (form.pricingAdmin)
    roles.push('pricing_admin')
  return roles
}

function fillForm(assignment: PlatformRoleAssignment) {
  form.targetUserId = assignment.userId
  form.platformSuperAdmin = assignment.roles.includes('platform_super_admin')
  form.contestAdmin = assignment.roles.includes('contest_admin')
  form.pricingAdmin = assignment.roles.includes('pricing_admin')
}

function resetForm() {
  form.targetUserId = ''
  form.platformSuperAdmin = false
  form.contestAdmin = false
  form.pricingAdmin = false
}

function openCreateDialog() {
  resetForm()
  assignDialogVisible.value = true
}

function openEditDialog(assignment: PlatformRoleAssignment) {
  fillForm(assignment)
  assignDialogVisible.value = true
}

async function loadData() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<RoleApiResult>>(endpoint('/admin/platform-roles'))
    data.value = response.data
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
  const targetUserId = form.targetUserId.trim()
  if (!targetUserId) {
    errorText.value = 'targetUserId 不能为空。'
    return
  }
  saving.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint('/admin/platform-roles'), {
      method: 'POST',
      body: {
        targetUserId,
        roles: selectedRoles(),
      },
    })
    successText.value = '角色分配已更新。'
    await loadData()
    assignDialogVisible.value = false
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
  <div class="space-y-3 text-[11px]">
    <section v-if="loading" class="border border-slate-200 bg-white p-3">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <template v-else-if="data">
      <section class="border border-slate-200 bg-white p-3">
        <p class="m-0 text-[12px] font-semibold text-slate-900">
          当前登录用户：{{ data.current.username }}（{{ data.current.userId }}）
        </p>
        <p class="m-0 mt-1 text-[11px] text-slate-600">
          角色：{{ data.current.roles.join(', ') || '无' }}
        </p>
        <p class="m-0 mt-1 text-[11px] text-slate-600">
          权限：{{ data.current.permissions.join(', ') || '无' }}
        </p>
      </section>

      <section
        v-if="!canAssign"
        class="border border-rose-200 bg-rose-50 p-3 text-rose-600"
      >
        403：当前账号没有 role.assign 权限，仅可查看自身角色信息。
      </section>

      <template v-else>
        <section class="border border-slate-200 bg-white p-3">
          <div class="mb-3 flex items-center justify-end">
            <a-button size="small" type="primary" @click="openCreateDialog">
              新建分配
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
                  <p class="m-0 truncate text-[12px] font-semibold text-slate-900">
                    {{ record.username }}
                  </p>
                  <p class="m-0 mt-1 truncate font-mono text-[10px] text-slate-500">
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

    <section v-if="errorText" class="border border-rose-200 bg-rose-50 p-3 text-rose-600">
      {{ errorText }}
    </section>
    <section v-if="successText" class="border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
      {{ successText }}
    </section>

    <a-modal
      v-model:visible="assignDialogVisible"
      :footer="false"
      title="角色分配"
      width="460px"
    >
      <div class="space-y-2 text-[11px]">
        <a-input v-model="form.targetUserId" size="small" placeholder="目标用户 ID（targetUserId）" />
        <label class="flex items-center gap-2 text-[11px] text-slate-700">
          <a-checkbox v-model="form.platformSuperAdmin" />
          platform_super_admin
        </label>
        <label class="flex items-center gap-2 text-[11px] text-slate-700">
          <a-checkbox v-model="form.contestAdmin" />
          contest_admin
        </label>
        <label class="flex items-center gap-2 text-[11px] text-slate-700">
          <a-checkbox v-model="form.pricingAdmin" />
          pricing_admin
        </label>
        <a-button long size="small" :loading="saving" type="primary" @click="submitAssignment">
          保存角色分配
        </a-button>
      </div>
    </a-modal>
  </div>
</template>
