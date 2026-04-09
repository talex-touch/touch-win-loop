<script setup lang="ts">
import type {
  DashboardQuickAction,
  DashboardScheduleItem,
  DashboardSkillMetric,
} from '~/types/dashboard'

withDefaults(defineProps<{
  quickActions?: DashboardQuickAction[]
  skillMetrics?: DashboardSkillMetric[]
  scheduleItems?: DashboardScheduleItem[]
  loading?: boolean
}>(), {
  quickActions: () => [],
  skillMetrics: () => [],
  scheduleItems: () => [],
  loading: false,
})
</script>

<template>
  <div class="col-span-12 space-y-6 lg:col-span-4 xl:space-y-8">
    <section class="db-appear" style="animation-delay: 360ms;">
      <div class="mb-4">
        <p class="db-eyebrow db-eyebrow-tight">
          Quick Actions
        </p>
        <h3 class="text-2xl text-slate-900 tracking-[-0.03em] font-black">
          工作台快捷访问
        </h3>
      </div>

      <div class="gap-3 grid grid-cols-2">
        <NuxtLink
          v-for="item in quickActions"
          :key="item.id"
          :to="item.to"
          class="db-panel db-hover-lift db-focus-ring group px-4 py-4"
        >
          <div class="text-slate-500 rounded-2xl bg-[var(--db-bg)] flex h-11 w-11 transition-colors items-center justify-center group-hover:text-[var(--db-primary)]">
            <span class="material-symbols-outlined text-[20px]">{{ item.icon }}</span>
          </div>
          <div class="mt-4">
            <p class="text-sm text-slate-900 font-semibold">
              {{ item.label }}
            </p>
            <p class="db-muted text-xs mt-1">
              直达常用入口
            </p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section class="db-panel db-panel-elevated db-appear text-white px-5 py-5 overflow-hidden" style="animation-delay: 400ms; background: linear-gradient(145deg, #1f4fd3 0%, #3772ff 52%, #2aa7dc 100%);">
      <div class="flex gap-4 items-start justify-between">
        <div>
          <p class="text-xs text-white/70 tracking-[0.16em] font-semibold uppercase">
            Skill Snapshot
          </p>
          <h4 class="text-xl tracking-[-0.03em] font-black mt-2">
            个人竞争力分析
          </h4>
        </div>
        <span class="rounded-2xl bg-white/[0.16] flex h-11 w-11 items-center justify-center">
          <span class="material-symbols-outlined text-[22px]">track_changes</span>
        </span>
      </div>

      <p class="text-sm text-white/[0.82] leading-7 mt-3">
        您在“算法竞赛”类目下的全国排名超过了 88% 的用户，建议增加在“大数据分析”方向的投入。
      </p>

      <div v-if="loading" class="mt-5 space-y-4">
        <div
          v-for="index in 2"
          :key="`dashboard-skill-skeleton-${index}`"
          class="space-y-2"
        >
          <div class="db-skeleton rounded-2xl h-5 w-2/5" style="background: rgba(255, 255, 255, 0.18);" />
          <div class="db-skeleton rounded-full h-2.5 w-full" style="background: rgba(255, 255, 255, 0.2);" />
        </div>
      </div>

      <div v-else-if="skillMetrics.length === 0" class="text-sm text-white/80 mt-5 px-4 py-4 border border-white/[0.18] rounded-[18px] bg-white/10">
        暂无可展示的能力评分数据。
      </div>

      <div v-else class="mt-5 space-y-4">
        <div v-for="metric in skillMetrics" :key="metric.id">
          <div class="text-xs font-bold mb-2 flex justify-between">
            <span>{{ metric.label }}</span>
            <span>{{ metric.score }}/100</span>
          </div>
          <div class="rounded-full bg-white/20 h-2 w-full overflow-hidden">
            <div class="rounded-full bg-white h-full transition-all duration-500" :style="{ width: `${metric.score}%` }" />
          </div>
        </div>
      </div>

      <button class="db-btn text-[var(--db-primary)] mt-6 bg-white/90 w-full" type="button" title="即将开放" disabled>
        查看完整画像
      </button>
    </section>

    <section class="db-panel db-appear px-5 py-5" style="animation-delay: 440ms;">
      <div class="flex gap-3 items-center justify-between">
        <div>
          <p class="db-eyebrow db-eyebrow-tight">
            Weekly Schedule
          </p>
          <h3 class="text-xl text-slate-900 tracking-[-0.03em] font-black">
            本周日程
          </h3>
        </div>
        <span class="db-chip db-chip-muted">
          {{ scheduleItems.length }} 项
        </span>
      </div>

      <div v-if="loading" class="mt-4 space-y-3">
        <div
          v-for="index in 3"
          :key="`dashboard-schedule-skeleton-${index}`"
          class="db-skeleton rounded-[18px] h-16"
        />
      </div>

      <div v-else-if="scheduleItems.length === 0" class="db-panel db-panel-muted text-sm text-slate-500 mt-4 px-4 py-5">
        本周暂无关键日程提醒。
      </div>

      <div v-else class="mt-4 space-y-3">
        <article
          v-for="item in scheduleItems"
          :key="item.id"
          class="db-hover-lift px-4 py-3 border border-[var(--db-border)] rounded-[18px] bg-[var(--db-bg-alt)] flex gap-3"
        >
          <div class="px-3 py-2 border border-[var(--db-border)] rounded-[16px] bg-white flex shrink-0 flex-col min-w-[60px] items-center justify-center">
            <span class="text-[10px] text-[var(--db-subtle)] tracking-[0.12em] font-bold uppercase">{{ item.month }}</span>
            <span class="text-lg text-slate-900 tracking-[-0.02em] font-black mt-1">{{ item.day }}</span>
          </div>
          <div class="min-w-0">
            <p class="text-sm text-slate-900 leading-6 font-semibold">
              {{ item.title }}
            </p>
            <p class="db-muted text-xs mt-1">
              {{ item.time }}
            </p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
