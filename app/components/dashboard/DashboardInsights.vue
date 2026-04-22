<script setup lang="ts">
import type { DashboardInsight } from '~/types/dashboard'

withDefaults(defineProps<{
  insights?: DashboardInsight[]
  loading?: boolean
  moreTo?: string
}>(), {
  insights: () => [],
  loading: false,
  moreTo: '/team',
})

const badgeClassMap: Record<DashboardInsight['tone'], string> = {
  primary: 'db-chip db-chip-primary',
  success: 'db-chip db-chip-success',
}
</script>

<template>
  <section class="db-appear" style="animation-delay: 300ms;">
    <div class="mb-4 flex flex-wrap gap-2.5 items-end justify-between">
      <div>
        <p class="db-eyebrow db-eyebrow-tight">
          AI Insights
        </p>
        <h3 class="text-xl text-slate-900 tracking-[-0.03em] font-black flex gap-2 items-center">
          <span class="text-[var(--db-primary)] rounded-xl bg-[var(--db-primary-soft)] flex h-9 w-9 items-center justify-center">
            <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
          </span>
          AI 智能洞察
        </h3>
        <p class="db-muted text-sm leading-5 mt-1.5">
          将当前最值得关注的趋势、项目进度与建议动作集中展示。
        </p>
      </div>
      <NuxtLink :to="moreTo" class="db-btn db-btn-ghost db-focus-ring text-sm font-semibold px-3 py-2 border border-slate-200 rounded-md bg-white hover:bg-slate-50">
        查看全部
      </NuxtLink>
    </div>

    <div v-if="loading" class="gap-3 grid grid-cols-1 md:grid-cols-2">
      <article
        v-for="index in 2"
        :key="`dashboard-insight-skeleton-${index}`"
        class="db-panel p-4"
      >
        <div class="flex gap-3 items-center justify-between">
          <div class="db-skeleton rounded-full h-7 w-24" />
          <div class="db-skeleton rounded-full h-5 w-16" />
        </div>
        <div class="db-skeleton mt-4 rounded-xl h-6 w-3/4" />
        <div class="db-skeleton mt-3 rounded-xl h-[4.5rem] w-full" />
        <div class="db-skeleton mt-4 rounded-xl h-11 w-full" />
      </article>
    </div>

    <div v-else-if="insights.length === 0" class="db-panel db-panel-muted text-sm text-slate-500 px-4 py-4">
      当前暂无可展示的智能洞察。
    </div>

    <div v-else class="gap-3 grid grid-cols-1 md:grid-cols-2">
      <article
        v-for="item in insights"
        :key="item.id"
        class="db-panel db-hover-lift group p-4 relative overflow-hidden"
      >
        <div class="rounded-full bg-[rgba(36,84,215,0.08)] h-24 w-24 right-[-18px] top-[-26px] absolute blur-2xl" />
        <div class="relative">
          <div class="mb-3 flex gap-3 items-start justify-between">
            <span :class="badgeClassMap[item.tone]">
              {{ item.tag }}
            </span>
            <span class="text-xs text-[var(--db-subtle)]">
              {{ item.publishedAt }}
            </span>
          </div>

          <h4 class="text-base text-slate-900 leading-6 font-bold transition-colors group-hover:text-[var(--db-primary)]">
            {{ item.title }}
          </h4>
          <p class="db-muted text-sm leading-6 mt-2">
            {{ item.description }}
          </p>

          <div class="mt-4 px-3 py-2.5 border border-[var(--db-border)] rounded-xl bg-[var(--db-bg-alt)] flex flex-wrap gap-2.5 items-center justify-between">
            <span class="text-sm text-slate-600 font-medium flex gap-2 items-center">
              <span class="text-[var(--db-primary)] rounded-lg bg-white flex h-7 w-7 shadow-sm items-center justify-center">
                <span class="material-symbols-outlined text-[15px]">{{ item.metricIcon }}</span>
              </span>
              {{ item.metricText }}
            </span>
            <span class="db-chip db-chip-primary text-[11px] font-semibold px-2.5 py-1 rounded-md">
              {{ item.actionText }}
            </span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
