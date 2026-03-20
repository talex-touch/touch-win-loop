<script setup lang="ts">
import type { ApiResponse, AuthMeResult, PlatformPermission } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

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
    const response = await $fetch<ApiResponse<AuthMeResult>>(endpoint('/auth/me'))
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
  <div class="space-y-3 text-[11px]">
    <section class="border border-slate-200 bg-white p-3">
      <h1 class="text-[13px] font-bold tracking-tight text-slate-900 uppercase">
        平台管理总览
      </h1>
      <p class="mt-1 text-[11px] text-slate-500">
        最小可用录入台：赛事、资料、计费、权限。
      </p>
    </section>

    <section v-if="loading" class="border border-slate-200 bg-white p-3">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="5" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="border border-rose-200 bg-rose-50 p-3 text-rose-600">
      {{ errorText }}
    </section>

    <section
      v-else-if="!canManageContest && !canManagePricing && !canManageRoles"
      class="border border-rose-200 bg-rose-50 p-3 text-rose-600"
    >
      403：当前账号没有平台管理权限。
    </section>

    <template v-else>
      <section class="border border-slate-200 bg-white overflow-hidden">
        <div class="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Permission Summary
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4">
          <div
            v-for="item in summaryRows"
            :key="item.label"
            class="border-r border-b border-slate-200 px-3 py-2 last:border-r-0"
          >
            <p class="text-[10px] uppercase text-slate-400 tracking-wider">
              {{ item.label }}
            </p>
            <p
              class="mt-1 text-[12px] font-bold"
              :class="item.tone === 'ok' ? 'text-emerald-600' : 'text-slate-700'"
            >
              {{ item.value }}
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <NuxtLink to="/admin/users" class="border border-slate-200 bg-white p-3 hover:bg-slate-50">
          <p class="text-[12px] font-bold text-slate-900">
            用户管理
          </p>
          <p class="mt-1 text-[11px] text-slate-500">
            用户状态、角色、会话治理
          </p>
        </NuxtLink>

        <NuxtLink to="/admin/organizations" class="border border-slate-200 bg-white p-3 hover:bg-slate-50">
          <p class="text-[12px] font-bold text-slate-900">
            组织管理
          </p>
          <p class="mt-1 text-[11px] text-slate-500">
            席位、套餐、组织维度配置
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/contests"
          class="border border-slate-200 bg-white p-3 hover:bg-slate-50"
        >
          <p class="text-[12px] font-bold text-slate-900">
            赛事管理
          </p>
          <p class="mt-1 text-[11px] text-slate-500">
            赛事基础信息、赛道、时间轴、rubric
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/ai-prompts"
          class="border border-slate-200 bg-white p-3 hover:bg-slate-50"
        >
          <p class="text-[12px] font-bold text-slate-900">
            AI 配置
          </p>
          <p class="mt-1 text-[11px] text-slate-500">
            Providers / Channels / Models / Audits / Logs 平台控制台
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/resources"
          class="border border-slate-200 bg-white p-3 hover:bg-slate-50"
        >
          <p class="text-[12px] font-bold text-slate-900">
            资料管理
          </p>
          <p class="mt-1 text-[11px] text-slate-500">
            14 类资料入口、状态流转
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManagePricing"
          to="/admin/billing"
          class="border border-slate-200 bg-white p-3 hover:bg-slate-50"
        >
          <p class="text-[12px] font-bold text-slate-900">
            套餐计费
          </p>
          <p class="mt-1 text-[11px] text-slate-500">
            套餐规则配置、费用估算
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageRoles"
          to="/admin/roles"
          class="border border-slate-200 bg-white p-3 hover:bg-slate-50"
        >
          <p class="text-[12px] font-bold text-slate-900">
            角色权限
          </p>
          <p class="mt-1 text-[11px] text-slate-500">
            分配 platform / contest / pricing 角色
          </p>
        </NuxtLink>
      </section>
    </template>
  </div>
</template>
