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
  <div class="col-span-12 space-y-6 xl:space-y-8 lg:col-span-4">
    <section class="db-appear" style="animation-delay: 360ms;">
      <div class="mb-4">
        <p class="db-eyebrow db-eyebrow-tight">
          Quick Actions
        </p>
        <h3 class="text-2xl font-black tracking-[-0.03em] text-slate-900">
          工作台快捷访问
        </h3>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <NuxtLink
          v-for="item in quickActions"
          :key="item.id"
          :to="item.to"
          class="db-panel db-hover-lift db-focus-ring group px-4 py-4"
        >
          <div class="rounded-2xl bg-[var(--db-bg)] text-slate-500 group-hover:text-[var(--db-primary)] flex h-11 w-11 items-center justify-center transition-colors">
            <span class="material-symbols-outlined text-[20px]">{{ item.icon }}</span>
          </div>
          <div class="mt-4">
            <p class="text-sm font-semibold text-slate-900">
              {{ item.label }}
            </p>
            <p class="db-muted mt-1 text-xs">
              直达常用入口
            </p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section class="db-panel db-panel-elevated db-appear overflow-hidden px-5 py-5 text-white" style="animation-delay: 400ms; background: linear-gradient(145deg, #1f4fd3 0%, #3772ff 52%, #2aa7dc 100%);">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
            Skill Snapshot
          </p>
          <h4 class="mt-2 text-xl font-black tracking-[-0.03em]">
            个人竞争力分析
          </h4>
        </div>
        <span class="rounded-2xl bg-white/[0.16] flex h-11 w-11 items-center justify-center">
          <span class="material-symbols-outlined text-[22px]">track_changes</span>
        </span>
      </div>

      <p class="mt-3 text-sm leading-7 text-white/[0.82]">
        您在“算法竞赛”类目下的全国排名超过了 88% 的用户，建议增加在“大数据分析”方向的投入。
      </p>

      <div v-if="loading" class="mt-5 space-y-4">
        <div
          v-for="index in 2"
          :key="`dashboard-skill-skeleton-${index}`"
          class="space-y-2"
        >
          <div class="db-skeleton h-5 w-2/5 rounded-2xl" style="background: rgba(255, 255, 255, 0.18);" />
          <div class="db-skeleton h-2.5 w-full rounded-full" style="background: rgba(255, 255, 255, 0.2);" />
        </div>
      </div>

      <div v-else-if="skillMetrics.length === 0" class="mt-5 rounded-[18px] border border-white/[0.18] bg-white/10 px-4 py-4 text-sm text-white/80">
        暂无可展示的能力评分数据。
      </div>

      <div v-else class="mt-5 space-y-4">
        <div v-for="metric in skillMetrics" :key="metric.id">
          <div class="mb-2 text-xs font-bold flex justify-between">
            <span>{{ metric.label }}</span>
            <span>{{ metric.score }}/100</span>
          </div>
          <div class="rounded-full bg-white/20 h-2 w-full overflow-hidden">
            <div class="rounded-full bg-white h-full transition-all duration-500" :style="{ width: `${metric.score}%` }" />
          </div>
        </div>
      </div>

      <button class="db-btn mt-6 w-full bg-white/90 text-[var(--db-primary)]" type="button" title="即将开放" disabled>
        查看完整画像
      </button>
    </section>

    <section class="db-panel db-appear px-5 py-5" style="animation-delay: 440ms;">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="db-eyebrow db-eyebrow-tight">
            Weekly Schedule
          </p>
          <h3 class="text-xl font-black tracking-[-0.03em] text-slate-900">
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
          class="db-skeleton h-16 rounded-[18px]"
        />
      </div>

      <div v-else-if="scheduleItems.length === 0" class="db-panel db-panel-muted mt-4 px-4 py-5 text-sm text-slate-500">
        本周暂无关键日程提醒。
      </div>

      <div v-else class="mt-4 space-y-3">
        <article
          v-for="item in scheduleItems"
          :key="item.id"
          class="db-hover-lift rounded-[18px] border border-[var(--db-border)] bg-[var(--db-bg-alt)] px-4 py-3 flex gap-3"
        >
          <div class="rounded-[16px] border border-[var(--db-border)] bg-white px-3 py-2 flex shrink-0 flex-col items-center justify-center min-w-[60px]">
            <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--db-subtle)]">{{ item.month }}</span>
            <span class="mt-1 text-lg font-black tracking-[-0.02em] text-slate-900">{{ item.day }}</span>
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold leading-6 text-slate-900">
              {{ item.title }}
            </p>
            <p class="db-muted mt-1 text-xs">
              {{ item.time }}
            </p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
