<script setup lang="ts">
import type {
  DashboardCompetition,
  DashboardFeedFilter,
  DashboardScheduleItem,
  DashboardSkillMetric,
} from '~/types/dashboard'

withDefaults(defineProps<{
  competitions?: DashboardCompetition[]
  activeFeedFilter?: DashboardFeedFilter
  skillMetrics?: DashboardSkillMetric[]
  scheduleItems?: DashboardScheduleItem[]
  loading?: boolean
}>(), {
  competitions: () => [],
  activeFeedFilter: 'all',
  skillMetrics: () => [],
  scheduleItems: () => [],
  loading: false,
})

const emit = defineEmits<{
  'update:activeFeedFilter': [value: DashboardFeedFilter]
}>()
</script>

<template>
  <div class="flex flex-col gap-4 col-span-12 h-full min-h-0 xl:gap-5 lg:col-span-4">
    <section class="db-appear text-white px-4 py-4 db-panel db-panel-elevated overflow-hidden" style="animation-delay: 400ms; background: linear-gradient(145deg, #1f4fd3 0%, #3772ff 52%, #2aa7dc 100%);">
      <div class="flex gap-3 items-start justify-between">
        <div>
          <p class="text-xs text-white/70 tracking-[0.16em] font-semibold uppercase">
            Skill Snapshot
          </p>
          <h4 class="text-lg tracking-[-0.03em] font-black mt-1.5">
            个人竞争力分析
          </h4>
        </div>
        <span class="rounded-xl bg-white/[0.16] flex h-9 w-9 items-center justify-center">
          <span class="material-symbols-outlined text-[20px]">track_changes</span>
        </span>
      </div>

      <p class="text-sm text-white/[0.82] leading-6 mt-2">
        您在“算法竞赛”类目下的全国排名超过了 88% 的用户，建议增加在“大数据分析”方向的投入。
      </p>

      <div v-if="loading" class="mt-4 space-y-3">
        <div
          v-for="index in 2"
          :key="`dashboard-skill-skeleton-${index}`"
          class="space-y-2"
        >
          <div class="rounded-xl h-5 w-2/5 db-skeleton" style="background: rgba(255, 255, 255, 0.18);" />
          <div class="rounded-full h-2.5 w-full db-skeleton" style="background: rgba(255, 255, 255, 0.2);" />
        </div>
      </div>

      <div v-else-if="skillMetrics.length === 0" class="text-sm text-white/80 mt-4 px-3 py-3 border border-white/[0.18] rounded-xl bg-white/10">
        暂无可展示的能力评分数据。
      </div>

      <div v-else class="mt-4 space-y-3">
        <div v-for="metric in skillMetrics" :key="metric.id">
          <div class="text-[12px] font-bold mb-2 flex justify-between">
            <span>{{ metric.label }}</span>
            <span>{{ metric.score }}/100</span>
          </div>
          <div class="rounded-full bg-white/20 h-2 w-full overflow-hidden">
            <div class="rounded-full bg-white h-full transition-all duration-500" :style="{ width: `${metric.score}%` }" />
          </div>
        </div>
      </div>

      <button class="text-sm text-[var(--db-primary)] font-semibold mt-4 px-4 py-2.5 rounded-lg bg-white/90 db-btn w-full" type="button" title="即将开放" disabled>
        查看完整画像
      </button>
    </section>

    <section class="db-appear px-4 py-4 db-panel" style="animation-delay: 440ms;">
      <div class="flex gap-3 items-center justify-between">
        <div>
          <p class="db-eyebrow db-eyebrow-tight">
            Weekly Schedule
          </p>
          <h3 class="text-lg text-slate-900 tracking-[-0.03em] font-black">
            本周日程
          </h3>
        </div>
        <span class="db-chip text-[11px] db-chip-muted font-semibold px-2.5 py-1 rounded-md">
          {{ scheduleItems.length }} 项
        </span>
      </div>

      <div v-if="loading" class="mt-4 space-y-3">
        <div
          v-for="index in 3"
          :key="`dashboard-schedule-skeleton-${index}`"
          class="rounded-[18px] h-16 db-skeleton"
        />
      </div>

      <div v-else-if="scheduleItems.length === 0" class="text-sm text-slate-500 mt-4 px-3 py-4 db-panel db-panel-muted">
        本周暂无关键日程提醒。
      </div>

      <div v-else class="mt-4 space-y-3">
        <article
          v-for="item in scheduleItems"
          :key="item.id"
          class="px-3 py-3 border border-slate-200 db-hover-lift rounded-xl bg-slate-50 flex gap-2.5"
        >
          <div class="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white flex shrink-0 flex-col min-w-[54px] items-center justify-center">
            <span class="text-[10px] text-[var(--db-subtle)] tracking-[0.12em] font-bold uppercase">{{ item.month }}</span>
            <span class="text-base text-slate-900 tracking-[-0.02em] font-black mt-1">{{ item.day }}</span>
          </div>
          <div class="min-w-0">
            <p class="text-sm text-slate-900 leading-6 font-semibold">
              {{ item.title }}
            </p>
            <p class="text-xs db-muted mt-1">
              {{ item.time }}
            </p>
          </div>
        </article>
      </div>
    </section>

    <div class="flex-1 min-h-0">
      <DashboardCompetitionFeed
        class="h-full"
        :active-filter="activeFeedFilter"
        :competitions="competitions"
        :loading="loading"
        scrollable
        @update:active-filter="emit('update:activeFeedFilter', $event)"
      />
    </div>
  </div>
</template>
