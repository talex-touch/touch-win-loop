<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  Contest,
  PlatformPermission,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: '竞赛分析 Dashboard',
})

const {
  feedFilter,
  summary,
  quickActions: baseQuickActions,
  visibleInsights,
  visibleCompetitions,
  skillMetrics,
  scheduleItems,
  overviewLoading,
  overviewError,
  loadOverview,
} = useDashboardWorkspace()

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const platformPermissions = ref<PlatformPermission[]>([])
const platformContests = ref<Contest[]>([])
const platformLoading = ref(false)
const platformError = ref('')

const canManageContest = computed(() => {
  return platformPermissions.value.some(item =>
    ['contest.read_internal', 'contest.write', 'contest.publish', 'contest.archive'].includes(item),
  )
})
const canManagePricing = computed(() => platformPermissions.value.includes('pricing.write'))
const canManageRoles = computed(() => platformPermissions.value.includes('role.assign'))
const hasPlatformPortal = computed(() => canManageContest.value || canManagePricing.value || canManageRoles.value)

const quickActions = computed(() => {
  const items = [...baseQuickActions]
  if (canManageContest.value) {
    items.push({
      id: 'admin-contests',
      label: '赛事录入',
      icon: 'edit_note',
      to: '/admin/contests',
    })
  }
  if (canManagePricing.value) {
    items.push({
      id: 'admin-billing',
      label: '席位计费',
      icon: 'payments',
      to: '/admin/billing',
    })
  }
  return items
})

const portalCards = computed(() => {
  const cards: Array<{ id: string, title: string, desc: string, to: string, icon: string }> = [
    {
      id: 'contest-library',
      title: '竞赛总库',
      desc: '搜索筛选竞赛，查看详情、赛道与评分规则。',
      to: '/contests',
      icon: 'trophy',
    },
    {
      id: 'resource-center',
      title: '资料中心',
      desc: '按分类/年份/可访问性检索权威资料。',
      to: '/resources',
      icon: 'folder_open',
    },
  ]

  if (canManageContest.value) {
    cards.push({
      id: 'contest-admin',
      title: '赛事录入台',
      desc: '录入赛事、赛道、时间轴、Rubric 与资料并发布。',
      to: '/admin/contests',
      icon: 'edit_square',
    })
  }
  if (canManagePricing.value) {
    cards.push({
      id: 'pricing-admin',
      title: '套餐席位计费',
      desc: '维护套餐规则，按席位估算工作区费用。',
      to: '/admin/billing',
      icon: 'attach_money',
    })
  }
  if (canManageRoles.value) {
    cards.push({
      id: 'role-admin',
      title: '平台角色分配',
      desc: '给用户分配 contest_admin / pricing_admin 等角色。',
      to: '/admin/roles',
      icon: 'manage_accounts',
    })
  }

  return cards
})

async function loadPlatformPanel() {
  platformLoading.value = true
  platformError.value = ''
  try {
    const meResponse = await $fetch<ApiResponse<AuthMeResult>>(endpoint('/auth/me'))
    platformPermissions.value = meResponse.data.user.platformPermissions || []

    if (canManageContest.value) {
      const adminContestsResponse = await $fetch<ApiResponse<Contest[]>>(endpoint('/admin/contests'))
      platformContests.value = adminContestsResponse.data.slice(0, 5)
    }
    else {
      const contestsResponse = await $fetch<ApiResponse<Contest[]>>(endpoint('/contests'), {
        query: {
          page: 1,
          pageSize: 5,
          sort: 'deadline',
        },
      })
      platformContests.value = contestsResponse.data
    }
  }
  catch (error: any) {
    platformContests.value = []
    platformPermissions.value = []
    platformError.value = String(error?.data?.message || '')
  }
  finally {
    platformLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadPlatformPanel(), loadOverview()])
})
</script>

<template>
  <div class="space-y-8">
    <section class="flex flex-wrap gap-4 items-end justify-between">
      <div>
        <h2 class="text-3xl text-slate-900 tracking-tight font-extrabold">
          {{ summary.greeting }}
        </h2>
        <p class="text-slate-500 mt-1">
          {{ summary.subtitle }}
        </p>
        <div class="text-xs mt-3 flex flex-wrap gap-2">
          <span class="text-blue-700 font-semibold px-2 py-1 rounded-full bg-blue-100">进行中 {{ summary.ongoingCount }}</span>
          <span class="text-slate-700 font-semibold px-2 py-1 rounded-full bg-slate-200">即将开始 {{ summary.upcomingCount }}</span>
          <span class="text-emerald-700 font-semibold px-2 py-1 rounded-full bg-emerald-100">洞察 {{ summary.insightCount }}</span>
        </div>
      </div>

      <div class="flex gap-3">
        <button class="text-sm font-semibold px-4 py-2 border border-slate-200 rounded-lg bg-white flex gap-2 transition-colors items-center hover:bg-slate-50">
          <span class="material-symbols-outlined text-lg">download</span>
          导出报告
        </button>
        <NuxtLink
          to="/workspace"
          class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-blue-700 flex gap-2 transition-colors items-center hover:bg-blue-600"
        >
          <span class="material-symbols-outlined text-lg">add</span>
          新建分析
        </NuxtLink>
      </div>
    </section>

    <section class="border border-slate-200 rounded-2xl bg-white p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span class="material-symbols-outlined text-blue-700">hub</span>
            平台能力中心
          </h3>
          <p class="text-sm text-slate-500 mt-1">
            将赛事总库、资料中心与平台管理能力整合到 Dashboard。
          </p>
        </div>
        <NuxtLink
          v-if="hasPlatformPortal"
          to="/admin"
          class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          进入平台管理
        </NuxtLink>
      </div>

      <div class="grid gap-3 mt-4 md:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="item in portalCards"
          :key="item.id"
          :to="item.to"
          class="border border-slate-100 rounded-xl p-4 transition-all hover:border-blue-200 hover:bg-blue-50/40"
        >
          <div class="flex items-center gap-2 text-slate-900 font-semibold">
            <span class="material-symbols-outlined text-blue-700">{{ item.icon }}</span>
            {{ item.title }}
          </div>
          <p class="text-xs text-slate-600 mt-2 leading-relaxed">
            {{ item.desc }}
          </p>
        </NuxtLink>
      </div>

      <div class="grid gap-4 mt-4 xl:grid-cols-2">
        <article class="border border-slate-100 rounded-xl p-4">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold text-slate-900">
              最近赛事动态
            </h4>
            <NuxtLink to="/contests" class="text-xs text-blue-700 hover:underline">
              查看全部
            </NuxtLink>
          </div>
          <div v-if="platformLoading" class="mt-3 space-y-2">
            <div
              v-for="index in 4"
              :key="`dashboard-contest-skeleton-${index}`"
              class="h-8 rounded-lg border border-slate-100 bg-slate-100 animate-pulse"
            />
          </div>
          <div v-else-if="platformContests.length === 0" class="text-xs text-slate-500 mt-3">
            暂无可展示赛事。
          </div>
          <div v-else class="space-y-2 mt-3">
            <NuxtLink
              v-for="item in platformContests"
              :key="item.id"
              :to="`/contests/${item.id}`"
              class="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:border-slate-300"
            >
              <span class="text-xs text-slate-700 truncate pr-2">{{ item.name }}</span>
              <span class="text-[10px] text-slate-500 whitespace-nowrap">{{ item.status || 'published' }}</span>
            </NuxtLink>
          </div>
        </article>

        <article class="border border-slate-100 rounded-xl p-4">
          <h4 class="text-sm font-semibold text-slate-900">
            当前平台权限
          </h4>
          <div v-if="platformLoading" class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="index in 4"
              :key="`dashboard-permission-skeleton-${index}`"
              class="h-5 w-28 rounded-full bg-slate-200 animate-pulse"
            />
          </div>
          <div v-else-if="platformPermissions.length === 0" class="text-xs text-slate-500 mt-3">
            当前账号暂无平台管理权限（普通用户模式）。
          </div>
          <div v-else class="flex flex-wrap gap-2 mt-3">
            <span
              v-for="permission in platformPermissions"
              :key="permission"
              class="rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[10px] font-semibold"
            >
              {{ permission }}
            </span>
          </div>
          <p v-if="platformError" class="text-[10px] text-rose-500 mt-3">
            {{ platformError }}
          </p>
        </article>
      </div>
    </section>

    <section v-if="overviewLoading" class="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
      正在加载 Dashboard 概览...
    </section>

    <section v-if="overviewError" class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
      {{ overviewError }}
    </section>

    <div class="gap-8 grid grid-cols-12">
      <div class="col-span-12 space-y-8 lg:col-span-8">
        <DashboardInsights :insights="visibleInsights" />
        <DashboardCompetitionFeed v-model:active-filter="feedFilter" :competitions="visibleCompetitions" />
      </div>

      <DashboardRightRail
        :quick-actions="quickActions"
        :skill-metrics="skillMetrics"
        :schedule-items="scheduleItems"
      />
    </div>
  </div>
</template>
