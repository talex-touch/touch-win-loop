<script setup lang="ts">
import type {
  DashboardCompetition,
  DashboardCompetitionTone,
  DashboardFeedFilter,
} from '~/types/dashboard'

withDefaults(defineProps<{
  competitions?: DashboardCompetition[]
  activeFilter?: DashboardFeedFilter
  loading?: boolean
}>(), {
  competitions: () => [],
  activeFilter: 'all',
  loading: false,
})

const emit = defineEmits<{
  'update:activeFilter': [value: DashboardFeedFilter]
}>()

const feedTabs: { label: string, value: DashboardFeedFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '进行中', value: 'ongoing' },
  { label: '即将开始', value: 'upcoming' },
]

const toneClassMap: Record<DashboardCompetitionTone, string> = {
  blue: 'bg-[var(--db-primary-soft)] text-[var(--db-primary)]',
  violet: 'bg-[#f2edff] text-[#6f54d7]',
  amber: 'bg-[var(--db-warning-soft)] text-[var(--db-warning)]',
}

function statusClass(status: DashboardCompetition['status']): string {
  if (status === 'ongoing')
    return 'db-chip db-chip-success'
  return 'db-chip db-chip-warning'
}
</script>

<template>
  <section class="db-appear" style="animation-delay: 340ms;">
    <div class="mb-5 flex flex-wrap gap-4 items-end justify-between">
      <div>
        <p class="db-eyebrow db-eyebrow-tight">
          Competition Feed
        </p>
        <h3 class="text-2xl font-black tracking-[-0.03em] text-slate-900 flex gap-2 items-center">
          <span class="rounded-2xl bg-[var(--db-primary-soft)] text-[var(--db-primary)] flex h-10 w-10 items-center justify-center">
            <span class="material-symbols-outlined text-[20px]">rss_feed</span>
          </span>
          赛事动态流
        </h3>
        <p class="db-muted mt-2 text-sm leading-6">
          按赛程状态浏览当前最值得关注的赛事，快速进入详情与规则页。
        </p>
      </div>

      <div class="db-panel db-panel-muted inline-flex gap-2 p-1.5">
        <button
          v-for="tab in feedTabs"
          :key="tab.value"
          class="db-focus-ring rounded-[14px] px-4 py-2 text-xs font-semibold transition-colors"
          :class="activeFilter === tab.value ? 'bg-[var(--db-primary)] text-white shadow-[0_12px_24px_rgba(36,84,215,0.18)]' : 'text-slate-600 hover:bg-white'"
          type="button"
          @click="emit('update:activeFilter', tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="space-y-3">
      <article
        v-for="index in 3"
        :key="`dashboard-competition-skeleton-${index}`"
        class="db-panel p-4"
      >
        <div class="flex gap-4 items-center">
          <div class="db-skeleton h-14 w-14 rounded-[18px] shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="db-skeleton h-6 w-3/5 rounded-2xl" />
            <div class="db-skeleton mt-3 h-5 w-4/5 rounded-2xl" />
          </div>
          <div class="db-skeleton h-10 w-24 rounded-[14px] shrink-0" />
        </div>
      </article>
    </div>

    <div v-else-if="competitions.length === 0" class="db-panel db-panel-muted px-5 py-6 text-center text-sm text-slate-500">
      当前筛选条件下暂无赛事动态。
    </div>

    <div v-else class="space-y-3">
      <article
        v-for="item in competitions"
        :key="item.id"
        class="db-panel db-hover-lift p-4 md:p-5"
      >
        <div class="flex flex-col gap-4 md:flex-row md:items-center">
          <div class="flex gap-4 min-w-0 flex-1 items-start md:items-center">
            <div class="rounded-[18px] flex shrink-0 h-14 w-14 items-center justify-center" :class="toneClassMap[item.tone]">
              <span class="material-symbols-outlined text-[26px]">{{ item.icon }}</span>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap gap-2 items-center">
                <h5 class="truncate text-lg font-bold tracking-[-0.02em] text-slate-900">
                  {{ item.title }}
                </h5>
                <span :class="statusClass(item.status)">
                  {{ item.stage }}
                </span>
              </div>
              <p class="db-muted mt-2 text-sm leading-6">
                {{ item.level }} · {{ item.deadline }}
              </p>
            </div>
          </div>

          <div class="flex justify-end">
            <NuxtLink
              :to="`/contests/${item.id}`"
              class="db-btn db-btn-ghost db-focus-ring"
            >
              {{ item.actionText }}
              <span class="material-symbols-outlined text-base">arrow_outward</span>
            </NuxtLink>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
