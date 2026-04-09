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
    <div class="mb-5 flex flex-wrap gap-3 items-end justify-between">
      <div>
        <p class="db-eyebrow db-eyebrow-tight">
          AI Insights
        </p>
        <h3 class="text-2xl font-black tracking-[-0.03em] text-slate-900 flex gap-2 items-center">
          <span class="rounded-2xl bg-[var(--db-primary-soft)] text-[var(--db-primary)] flex h-10 w-10 items-center justify-center">
            <span class="material-symbols-outlined text-[20px]">auto_awesome</span>
          </span>
          AI 智能洞察
        </h3>
        <p class="db-muted mt-2 text-sm leading-6">
          将当前最值得关注的趋势、项目进度与建议动作集中展示。
        </p>
      </div>
      <NuxtLink :to="moreTo" class="db-btn db-btn-ghost db-focus-ring">
        查看全部
      </NuxtLink>
    </div>

    <div v-if="loading" class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <article
        v-for="index in 2"
        :key="`dashboard-insight-skeleton-${index}`"
        class="db-panel p-5"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="db-skeleton h-7 w-24 rounded-full" />
          <div class="db-skeleton h-5 w-16 rounded-full" />
        </div>
        <div class="db-skeleton mt-5 h-7 w-3/4 rounded-2xl" />
        <div class="db-skeleton mt-3 h-20 w-full rounded-[18px]" />
        <div class="db-skeleton mt-5 h-12 w-full rounded-[18px]" />
      </article>
    </div>

    <div v-else-if="insights.length === 0" class="db-panel db-panel-muted px-5 py-6 text-sm text-slate-500">
      当前暂无可展示的智能洞察。
    </div>

    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <article
        v-for="item in insights"
        :key="item.id"
        class="db-panel db-hover-lift group relative overflow-hidden p-5"
      >
        <div class="absolute right-[-18px] top-[-26px] h-24 w-24 rounded-full bg-[rgba(36,84,215,0.08)] blur-2xl" />
        <div class="relative">
          <div class="mb-4 flex items-start justify-between gap-3">
            <span :class="badgeClassMap[item.tone]">
              {{ item.tag }}
            </span>
            <span class="text-xs text-[var(--db-subtle)]">
              {{ item.publishedAt }}
            </span>
          </div>

          <h4 class="text-lg font-bold leading-7 text-slate-900 transition-colors group-hover:text-[var(--db-primary)]">
            {{ item.title }}
          </h4>
          <p class="db-muted mt-3 text-sm leading-7">
            {{ item.description }}
          </p>

          <div class="mt-5 rounded-[18px] border border-[var(--db-border)] bg-[var(--db-bg-alt)] px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
            <span class="text-sm text-slate-600 font-medium flex gap-2 items-center">
              <span class="rounded-xl bg-white text-[var(--db-primary)] flex h-8 w-8 items-center justify-center shadow-sm">
                <span class="material-symbols-outlined text-base">{{ item.metricIcon }}</span>
              </span>
              {{ item.metricText }}
            </span>
            <span class="db-chip db-chip-primary">
              {{ item.actionText }}
            </span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
