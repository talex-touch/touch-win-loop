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
      desc: '按分类、年份与可访问性检索权威资料。',
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

const heroBadges = computed(() => {
  return [
    {
      id: 'status-insight',
      label: `智能洞察 ${summary.value.insightCount} 条`,
      className: 'db-chip db-chip-success',
    },
    {
      id: 'status-platform',
      label: hasPlatformPortal.value ? '已启用平台能力入口' : '标准用户工作台',
      className: 'db-chip db-chip-primary',
    },
  ]
})

const heroFocusItems = computed(() => {
  return [
    {
      id: 'focus-ongoing',
      label: summary.value.ongoingCount > 0
        ? `当前有 ${summary.value.ongoingCount} 场进行中赛事需要持续跟进`
        : '当前没有进行中赛事，可优先整理资料与报名窗口',
      icon: 'target',
    },
    {
      id: 'focus-upcoming',
      label: summary.value.upcomingCount > 0
        ? `有 ${summary.value.upcomingCount} 场即将开始赛事值得提前准备`
        : '近期赛程较平稳，可聚焦项目完善与资料沉淀',
      icon: 'event_upcoming',
    },
    {
      id: 'focus-insight',
      label: summary.value.insightCount > 0
        ? '智能洞察已同步，可直接查看重点提示'
        : '智能洞察尚未生成，可稍后刷新查看',
      icon: 'auto_awesome',
    },
  ]
})

const summaryCards = computed(() => {
  return [
    {
      id: 'ongoing',
      label: '进行中赛事',
      value: summary.value.ongoingCount,
      icon: 'trophy',
      hint: '优先跟进提交窗口临近的赛事',
      badgeClass: 'db-chip db-chip-primary',
      valueClass: 'text-[var(--db-primary)]',
    },
    {
      id: 'upcoming',
      label: '即将开始',
      value: summary.value.upcomingCount,
      icon: 'schedule',
      hint: '尽早准备赛道资料与报名信息',
      badgeClass: 'db-chip db-chip-warning',
      valueClass: 'text-[var(--db-warning)]',
    },
    {
      id: 'insights',
      label: '智能洞察',
      value: summary.value.insightCount,
      icon: 'lightbulb',
      hint: '抓取当前最值得关注的数据结论',
      badgeClass: 'db-chip db-chip-success',
      valueClass: 'text-[var(--db-success)]',
    },
  ]
})

const showOverviewSkeleton = computed(() => {
  return overviewLoading.value
    && visibleInsights.value.length === 0
    && visibleCompetitions.value.length === 0
    && skillMetrics.value.length === 0
    && scheduleItems.value.length === 0
})

const showOverviewError = computed(() => Boolean(overviewError.value))

function permissionToneClass(permission: PlatformPermission): string {
  if (permission === 'pricing.write')
    return 'db-chip db-chip-warning'
  if (permission === 'role.assign')
    return 'db-chip db-chip-primary'
  return 'db-chip db-chip-success'
}

function formatContestStatus(status?: string): string {
  if (status === 'draft')
    return '草稿'
  if (status === 'archived')
    return '已归档'
  return '已发布'
}

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

onMounted(async () => {
  await Promise.all([loadPlatformPanel(), loadOverview()])
})
</script>

<template>
  <div class="space-y-6 xl:space-y-8">
    <section class="db-panel db-panel-soft db-panel-elevated db-appear relative overflow-hidden px-5 py-6 md:px-7 md:py-7">
      <div class="pointer-events-none absolute inset-y-0 right-0 w-2/5 opacity-80">
        <div class="absolute right-[-10%] top-[-14%] h-48 w-48 rounded-full bg-[rgba(36,84,215,0.14)] blur-3xl" />
        <div class="absolute bottom-[-18%] right-[12%] h-44 w-44 rounded-full bg-[rgba(14,165,233,0.12)] blur-3xl" />
      </div>

      <div class="relative grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)] xl:items-end">
        <div class="min-w-0">
          <p class="db-eyebrow">
            Dashboard Overview
          </p>
          <h2 class="db-title text-3xl font-black md:text-[2.5rem]">
            {{ summary.greeting }}
          </h2>
          <p class="db-muted mt-3 max-w-2xl text-sm leading-7 md:text-[15px]">
            {{ summary.subtitle }}
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="badge in heroBadges"
              :key="badge.id"
              :class="badge.className"
            >
              {{ badge.label }}
            </span>
          </div>

          <div class="mt-6 flex flex-wrap gap-3">
            <button class="db-btn db-btn-ghost db-focus-ring" type="button" title="即将开放" disabled>
              <span class="material-symbols-outlined text-lg">download</span>
              导出报告
            </button>
            <NuxtLink
              :to="{ path: '/team', query: { create: '1' } }"
              class="db-btn db-btn-primary db-focus-ring"
            >
              <span class="material-symbols-outlined text-lg">add</span>
              新建项目
            </NuxtLink>
          </div>
        </div>

        <div class="db-panel db-panel-muted relative z-10 p-4 md:p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--db-subtle)]">
                今日聚焦
              </p>
              <h3 class="mt-2 text-lg font-bold text-slate-900">
                让核心数据更快进入操作流
              </h3>
            </div>
            <div class="rounded-2xl bg-[var(--db-primary-soft)] text-[var(--db-primary)] flex h-11 w-11 items-center justify-center">
              <span class="material-symbols-outlined text-[22px]">insights</span>
            </div>
          </div>

          <div class="mt-4 space-y-3">
            <article
              v-for="item in heroFocusItems"
              :key="item.id"
              class="db-hover-lift rounded-[18px] border border-[var(--db-border)] bg-white/80 px-4 py-3"
            >
              <div class="flex gap-3 items-start">
                <span class="rounded-2xl bg-[var(--db-bg)] text-[var(--db-primary)] flex h-9 w-9 shrink-0 items-center justify-center">
                  <span class="material-symbols-outlined text-[18px]">{{ item.icon }}</span>
                </span>
                <div class="min-w-0">
                  <p class="text-sm leading-6 text-slate-700">
                    {{ item.label }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="(item, index) in summaryCards"
        :key="item.id"
        class="db-panel db-hover-lift db-appear relative overflow-hidden p-5"
        :style="{ animationDelay: `${120 + index * 60}ms` }"
      >
        <div class="absolute right-[-10px] top-[-14px] h-20 w-20 rounded-full bg-[rgba(36,84,215,0.08)] blur-2xl" />
        <div class="relative flex items-start justify-between gap-3">
          <div>
            <span :class="item.badgeClass">
              {{ item.label }}
            </span>
            <p class="mt-4 text-4xl font-black tracking-[-0.04em]" :class="item.valueClass">
              {{ item.value }}
            </p>
            <p class="db-muted mt-2 text-sm leading-6">
              {{ item.hint }}
            </p>
          </div>
          <div class="rounded-2xl bg-[var(--db-bg)] text-[var(--db-primary)] flex h-12 w-12 items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[22px]">{{ item.icon }}</span>
          </div>
        </div>
      </article>
    </section>

    <section class="db-panel db-panel-soft db-appear p-5 md:p-6" style="animation-delay: 220ms;">
      <div class="flex flex-wrap gap-3 items-start justify-between">
        <div class="min-w-0">
          <p class="db-eyebrow db-eyebrow-tight">
            Platform Hub
          </p>
          <h3 class="text-2xl font-black tracking-[-0.03em] text-slate-900">
            平台能力中心
          </h3>
          <p class="db-muted mt-2 max-w-2xl text-sm leading-7">
            将赛事总库、资料中心与平台管理能力收敛到统一工作台，让常用入口、权限状态和关键赛事信息都在同一屏内可见。
          </p>
        </div>

        <div class="flex flex-wrap gap-2 items-center">
          <span class="db-chip db-chip-muted">
            <span class="material-symbols-outlined text-base">grid_view</span>
            {{ portalCards.length }} 个工作入口
          </span>
          <NuxtLink
            v-if="hasPlatformPortal"
            to="/admin"
            class="db-btn db-btn-ghost db-focus-ring"
          >
            进入平台管理
          </NuxtLink>
        </div>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="item in portalCards"
          :key="item.id"
          :to="item.to"
          class="db-panel db-panel-muted db-hover-lift db-focus-ring group px-4 py-4"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="rounded-2xl bg-[var(--db-primary-soft)] text-[var(--db-primary)] flex h-11 w-11 shrink-0 items-center justify-center">
              <span class="material-symbols-outlined text-[22px]">{{ item.icon }}</span>
            </div>
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--db-subtle)]">
              {{ item.id.replace(/-/g, ' ') }}
            </span>
          </div>
          <h4 class="mt-4 text-base font-bold text-slate-900 transition-colors group-hover:text-[var(--db-primary)]">
            {{ item.title }}
          </h4>
          <p class="db-muted mt-2 text-sm leading-6">
            {{ item.desc }}
          </p>
        </NuxtLink>
      </div>

      <div class="mt-6 grid gap-4 xl:grid-cols-2">
        <article class="db-panel px-4 py-4 md:px-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h4 class="text-base font-bold text-slate-900">
                最近赛事动态
              </h4>
              <p class="db-muted mt-1 text-xs">
                优先展示当前账号可见的最新赛事记录
              </p>
            </div>
            <NuxtLink to="/contests" class="db-chip db-chip-primary db-focus-ring">
              查看全部
            </NuxtLink>
          </div>

          <div v-if="platformLoading && platformContests.length === 0" class="mt-4 space-y-3">
            <div
              v-for="index in 4"
              :key="`dashboard-contest-skeleton-${index}`"
              class="db-skeleton h-16 rounded-[18px]"
            />
          </div>

          <div v-else-if="platformContests.length === 0" class="db-panel db-panel-muted mt-4 px-4 py-5 text-sm text-slate-500">
            暂无可展示赛事。
          </div>

          <div v-else class="mt-4 space-y-3">
            <NuxtLink
              v-for="item in platformContests"
              :key="item.id"
              :to="`/contests/${item.id}`"
              class="db-hover-lift db-focus-ring flex items-center justify-between gap-3 rounded-[18px] border border-[var(--db-border)] bg-white px-4 py-3"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-slate-900">
                  {{ item.name }}
                </p>
                <p class="db-muted mt-1 text-xs truncate">
                  {{ item.summary || item.organizer || '查看赛事详情与赛道信息' }}
                </p>
              </div>
              <span class="db-chip db-chip-muted shrink-0">
                {{ formatContestStatus(item.status) }}
              </span>
            </NuxtLink>
          </div>
        </article>

        <article class="db-panel px-4 py-4 md:px-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h4 class="text-base font-bold text-slate-900">
                当前平台权限
              </h4>
              <p class="db-muted mt-1 text-xs">
                用于决定平台入口与管理能力是否可见
              </p>
            </div>
            <span class="db-chip db-chip-muted">
              {{ platformPermissions.length }} 项权限
            </span>
          </div>

          <div v-if="platformLoading && platformPermissions.length === 0" class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="index in 4"
              :key="`dashboard-permission-skeleton-${index}`"
              class="db-skeleton h-8 w-28 rounded-full"
            />
          </div>

          <div v-else-if="platformPermissions.length === 0" class="db-panel db-panel-muted mt-4 px-4 py-5 text-sm text-slate-500">
            当前账号暂无平台管理权限，首页将保持标准用户视图。
          </div>

          <div v-else class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="permission in platformPermissions"
              :key="permission"
              :class="permissionToneClass(permission)"
            >
              {{ permission }}
            </span>
          </div>

          <p v-if="platformError" class="mt-3 text-xs text-rose-600">
            {{ platformError }}
          </p>
        </article>
      </div>
    </section>

    <section
      v-if="showOverviewSkeleton"
      class="db-panel db-panel-muted db-appear px-5 py-5 text-sm text-slate-500"
      style="animation-delay: 260ms;"
    >
      <div class="flex items-center gap-3">
        <span class="rounded-2xl bg-[var(--db-primary-soft)] text-[var(--db-primary)] flex h-10 w-10 items-center justify-center">
          <span class="material-symbols-outlined text-[20px]">hourglass_top</span>
        </span>
        <div>
          <p class="font-semibold text-slate-900">
            正在加载 Dashboard 概览
          </p>
          <p class="db-muted mt-1 text-xs">
            正在同步赛事、洞察与个人工作台数据。
          </p>
        </div>
      </div>
    </section>

    <section
      v-if="showOverviewError"
      class="db-panel db-appear border-[rgba(217,72,95,0.18)] bg-[var(--db-danger-soft)] px-5 py-5 text-sm text-rose-700"
      style="animation-delay: 280ms;"
    >
      <div class="flex items-start gap-3">
        <span class="rounded-2xl bg-white/80 text-rose-600 flex h-10 w-10 shrink-0 items-center justify-center">
          <span class="material-symbols-outlined text-[20px]">error</span>
        </span>
        <div>
          <p class="font-semibold">
            Dashboard 概览加载失败
          </p>
          <p class="mt-1 text-sm leading-6">
            {{ overviewError }}
          </p>
        </div>
      </div>
    </section>

    <div class="grid grid-cols-12 gap-6 xl:gap-8">
      <div class="col-span-12 space-y-6 xl:space-y-8 lg:col-span-8">
        <DashboardInsights :insights="visibleInsights" :loading="overviewLoading && visibleInsights.length === 0" />
        <DashboardCompetitionFeed
          v-model:active-filter="feedFilter"
          :competitions="visibleCompetitions"
          :loading="overviewLoading && visibleCompetitions.length === 0"
        />
      </div>

      <DashboardRightRail
        :quick-actions="quickActions"
        :skill-metrics="skillMetrics"
        :schedule-items="scheduleItems"
        :loading="overviewLoading && skillMetrics.length === 0 && scheduleItems.length === 0"
      />
    </div>
  </div>
</template>
