<script setup lang="ts">
import type { ApiResponse, AuthMeResult, PlatformPermission } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const authApiFetch = useAuthApiFetch()

const loading = ref(true)
const errorText = ref('')
const permissions = ref<PlatformPermission[]>([])

const canManageContest = computed(() => {
  return permissions.value.some(item =>
    ['contest.read_internal', 'contest.write', 'contest.publish', 'contest.archive'].includes(item),
  )
})
const canManagePricing = computed(() => permissions.value.includes('pricing.write'))
const canManageRoles = computed(() => permissions.value.includes('role.assign'))
const canManageIntegrations = computed(() => {
  return canManageRoles.value || permissions.value.includes('contest.write')
})
const canManageRuntimeSettings = computed(() => permissions.value.includes('contest.write'))

const summaryRows = computed(() => {
  return [
    { label: '赛事内容管理', value: canManageContest.value ? '已授权' : '未授权', tone: canManageContest.value ? 'ok' : 'mute' },
    { label: '计费规则管理', value: canManagePricing.value ? '已授权' : '未授权', tone: canManagePricing.value ? 'ok' : 'mute' },
    { label: '平台角色分配', value: canManageRoles.value ? '已授权' : '未授权', tone: canManageRoles.value ? 'ok' : 'mute' },
    { label: '当前权限数', value: String(permissions.value.length), tone: 'mute' },
  ]
})

async function loadPermissions() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    permissions.value = response.data.user.platformPermissions || []
  }
  catch (error: any) {
    permissions.value = []
    errorText.value = String(error?.data?.message || '权限加载失败，请先登录。')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadPermissions)
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <h1 class="text-[13px] text-slate-900 tracking-tight font-bold uppercase">
        平台管理总览
      </h1>
      <p class="text-[11px] text-slate-500 mt-1">
        最小可用录入台：赛事、资料、计费、权限。
      </p>
    </section>

    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="5" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <section
      v-else-if="!canManageContest && !canManagePricing && !canManageRoles"
      class="text-rose-600 p-3 border border-rose-200 bg-rose-50"
    >
      403：当前账号没有平台管理权限。
    </section>

    <template v-else>
      <section class="border border-slate-200 bg-white overflow-hidden">
        <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
          Permission Summary
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4">
          <div
            v-for="item in summaryRows"
            :key="item.label"
            class="px-3 py-2 border-b border-r border-slate-200 last:border-r-0"
          >
            <p class="text-[10px] text-slate-400 tracking-wider uppercase">
              {{ item.label }}
            </p>
            <p
              class="text-[12px] font-bold mt-1"
              :class="item.tone === 'ok' ? 'text-emerald-600' : 'text-slate-700'"
            >
              {{ item.value }}
            </p>
          </div>
        </div>
      </section>

      <section class="gap-2 grid md:grid-cols-2 xl:grid-cols-3">
        <NuxtLink to="/admin/users" class="p-3 border border-slate-200 bg-white hover:bg-slate-50">
          <p class="text-[12px] text-slate-900 font-bold">
            用户管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            用户状态、角色、会话治理
          </p>
        </NuxtLink>

        <NuxtLink to="/admin/organizations" class="p-3 border border-slate-200 bg-white hover:bg-slate-50">
          <p class="text-[12px] text-slate-900 font-bold">
            组织管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            席位、套餐、组织维度配置
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/contests"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            赛事管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            赛事基础信息、赛道、时间轴、rubric
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/resources"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            资料管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            14 类资料入口、状态流转
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageIntegrations"
          to="/admin/integrations"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            集成中心
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            飞书登录、管理员组同步、Bitable 映射任务
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageRuntimeSettings"
          to="/admin/runtime-settings"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            运行设置
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            调度参数、回收参数、自动 seed 开关（UI 覆盖 Env）
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/resource-preview-worker"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            文档转换监控
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            查看转换任务进度、调度状态、成功率、调用次数与失败分析
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/resource-recycle-worker"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            回收站清理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            查看清理任务状态、最近运行结果与回收站积压
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManagePricing"
          to="/admin/billing"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            套餐计费
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            套餐规则配置、费用估算
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageRoles"
          to="/admin/roles"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            角色权限
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            分配 platform / contest / pricing 角色
          </p>
        </NuxtLink>
      </section>
    </template>
  </div>
</template>
