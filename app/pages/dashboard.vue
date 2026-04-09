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
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

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
const normalizedPath = computed(() => route.path.replace(/\/+$/, '') || '/')
const isDashboardIndex = computed(() => normalizedPath.value === '/dashboard')

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
    const meResponse = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
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

watch(isDashboardIndex, async (value) => {
  if (!value)
    return
  await Promise.all([loadPlatformPanel(), loadOverview()])
}, { immediate: true })
</script>

<template>
  <NuxtPage v-if="!isDashboardIndex" />
  <div v-else class="space-y-8">
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
          to="/dashboard/analytics"
          class="text-sm font-semibold px-4 py-2 border border-slate-200 rounded-lg bg-white flex gap-2 transition-colors items-center hover:bg-slate-50"
        >
          <span class="material-symbols-outlined text-lg">monitoring</span>
          综合分析
        </NuxtLink>
        <NuxtLink
          :to="{ path: '/team', query: { create: '1' } }"
          class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-blue-700 flex gap-2 transition-colors items-center hover:bg-blue-600"
        >
          <span class="material-symbols-outlined text-lg">add</span>
          新建项目
        </NuxtLink>
      </div>
    </section>

    <section class="p-5 border border-slate-200 rounded-2xl bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h3 class="text-lg text-slate-900 font-bold flex gap-2 items-center">
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
          class="text-xs text-slate-700 font-semibold px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          进入平台管理
        </NuxtLink>
      </div>

      <div class="mt-4 gap-3 grid md:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="item in portalCards"
          :key="item.id"
          :to="item.to"
          class="p-4 border border-slate-100 rounded-xl transition-all hover:border-blue-200 hover:bg-blue-50/40"
        >
          <div class="text-slate-900 font-semibold flex gap-2 items-center">
            <span class="material-symbols-outlined text-blue-700">{{ item.icon }}</span>
            {{ item.title }}
          </div>
          <p class="text-xs text-slate-600 leading-relaxed mt-2">
            {{ item.desc }}
          </p>
        </NuxtLink>
      </div>

      <div class="mt-4 gap-4 grid xl:grid-cols-2">
        <article class="p-4 border border-slate-100 rounded-xl">
          <div class="flex items-center justify-between">
            <h4 class="text-sm text-slate-900 font-semibold">
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
              class="border border-slate-100 rounded-lg bg-slate-100 h-8 animate-pulse"
            />
          </div>
          <div v-else-if="platformContests.length === 0" class="text-xs text-slate-500 mt-3">
            暂无可展示赛事。
          </div>
          <div v-else class="mt-3 space-y-2">
            <NuxtLink
              v-for="item in platformContests"
              :key="item.id"
              :to="`/contests/${item.id}`"
              class="px-3 py-2 border border-slate-100 rounded-lg flex items-center justify-between hover:border-slate-300"
            >
              <span class="text-xs text-slate-700 pr-2 truncate">{{ item.name }}</span>
              <span class="text-[10px] text-slate-500 whitespace-nowrap">{{ item.status || 'published' }}</span>
            </NuxtLink>
          </div>
        </article>

        <article class="p-4 border border-slate-100 rounded-xl">
          <h4 class="text-sm text-slate-900 font-semibold">
            当前平台权限
          </h4>
          <div v-if="platformLoading" class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="index in 4"
              :key="`dashboard-permission-skeleton-${index}`"
              class="rounded-full bg-slate-200 h-5 w-28 animate-pulse"
            />
          </div>
          <div v-else-if="platformPermissions.length === 0" class="text-xs text-slate-500 mt-3">
            当前账号暂无平台管理权限（普通用户模式）。
          </div>
          <div v-else class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="permission in platformPermissions"
              :key="permission"
              class="text-[10px] text-emerald-700 font-semibold px-2 py-1 rounded-full bg-emerald-50"
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

    <section v-if="overviewLoading" class="text-sm text-slate-500 p-4 border border-slate-200 rounded-lg bg-white">
      正在加载 Dashboard 概览...
    </section>

    <section v-if="overviewError" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
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
