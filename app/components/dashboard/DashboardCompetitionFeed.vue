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
  scrollable?: boolean
}>(), {
  competitions: () => [],
  activeFilter: 'all',
  loading: false,
  scrollable: false,
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
  <section
    class="db-appear"
    :class="scrollable ? 'h-full min-h-0 flex flex-col' : ''"
    style="animation-delay: 340ms;"
  >
    <div class="mb-4 flex shrink-0 flex-wrap gap-3 items-end justify-between">
      <div>
        <p class="db-eyebrow db-eyebrow-tight">
          Competition Feed
        </p>
        <h3 class="text-xl text-slate-900 tracking-[-0.03em] font-black flex gap-2 items-center">
          <span class="text-[var(--db-primary)] rounded-xl bg-[var(--db-primary-soft)] flex h-9 w-9 items-center justify-center">
            <span class="material-symbols-outlined text-[18px]">rss_feed</span>
          </span>
          赛事动态流
        </h3>
        <p class="text-sm db-muted leading-5 mt-1.5">
          按赛程状态浏览当前最值得关注的赛事，快速进入详情与规则页。
        </p>
      </div>

      <div class="p-1 db-panel db-panel-muted inline-flex gap-1.5">
        <button
          v-for="tab in feedTabs"
          :key="tab.value"
          class="text-[13px] font-semibold px-3 py-1.5 db-focus-ring rounded-xl transition-colors"
          :class="activeFilter === tab.value ? 'bg-[var(--db-primary)] text-white shadow-[0_10px_20px_rgba(36,84,215,0.14)]' : 'text-slate-600 hover:bg-white'"
          type="button"
          @click="emit('update:activeFilter', tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div
      v-if="loading"
      class="space-y-3"
      :class="scrollable ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''"
    >
      <article
        v-for="index in 3"
        :key="`dashboard-competition-skeleton-${index}`"
        class="p-4 db-panel"
      >
        <div class="flex gap-4 items-center">
          <div class="rounded-xl shrink-0 h-12 w-12 db-skeleton" />
          <div class="flex-1 min-w-0">
            <div class="rounded-xl h-5 w-3/5 db-skeleton" />
            <div class="mt-2.5 rounded-xl h-4 w-4/5 db-skeleton" />
          </div>
          <div class="rounded-xl shrink-0 h-9 w-24 db-skeleton" />
        </div>
      </article>
    </div>

    <div
      v-else-if="competitions.length === 0"
      class="text-sm text-slate-500 px-4 py-4 text-center db-panel db-panel-muted"
      :class="scrollable ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''"
    >
      当前筛选条件下暂无赛事动态。
    </div>

    <div
      v-else
      class="space-y-3"
      :class="scrollable ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''"
    >
      <article
        v-for="item in competitions"
        :key="item.id"
        class="px-4 py-3.5 db-panel db-hover-lift"
      >
        <div class="flex flex-col gap-3">
          <div class="flex flex-1 gap-3 min-w-0 items-start">
            <div class="rounded-xl flex shrink-0 h-12 w-12 items-center justify-center" :class="toneClassMap[item.tone]">
              <span class="material-symbols-outlined text-[22px]">{{ item.icon }}</span>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap gap-2 items-center">
                <h5 class="text-base text-slate-900 tracking-[-0.02em] font-bold truncate">
                  {{ item.title }}
                </h5>
                <span :class="statusClass(item.status)">
                  {{ item.stage }}
                </span>
              </div>
              <p class="text-sm db-muted leading-5 mt-1.5">
                {{ item.level }} · {{ item.deadline }}
              </p>
            </div>
          </div>

          <div class="flex justify-end">
            <NuxtLink
              :to="`/contests/${item.id}`"
              class="text-sm db-btn-ghost font-semibold px-3 py-2 db-focus-ring border border-slate-200 rounded-md bg-white db-btn hover:bg-slate-50"
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
