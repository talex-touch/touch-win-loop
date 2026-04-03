<script setup lang="ts">
import type { DashboardInsight } from '~/types/dashboard'

withDefaults(defineProps<{
  insights?: DashboardInsight[]
}>(), {
  insights: () => [],
})

const badgeClassMap: Record<DashboardInsight['tone'], string> = {
  primary: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
}
</script>

<template>
  <section>
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg text-slate-900 font-bold flex gap-2 items-center">
        <span class="material-symbols-outlined text-blue-700">auto_awesome</span>
        AI 智能洞察
      </h3>
      <NuxtLink to="/workspace" class="text-sm text-blue-700 font-medium hover:underline">
        查看全部
      </NuxtLink>
    </div>

    <div class="gap-4 grid grid-cols-1 md:grid-cols-2">
      <article
        v-for="item in insights"
        :key="item.id"
        class="group p-5 border border-blue-100 rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md"
      >
        <div class="mb-3 flex items-start justify-between">
          <span class="text-[10px] tracking-wider font-bold px-2 py-1 rounded uppercase" :class="badgeClassMap[item.tone]">
            {{ item.tag }}
          </span>
          <span class="text-xs text-slate-400">{{ item.publishedAt }}</span>
        </div>
        <h4 class="text-slate-900 font-bold transition-colors group-hover:text-blue-700">
          {{ item.title }}
        </h4>
        <p class="text-sm text-slate-600 leading-relaxed mt-2">
          {{ item.description }}
        </p>
        <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium flex gap-1 items-center">
            <span class="material-symbols-outlined text-xs">{{ item.metricIcon }}</span>
            {{ item.metricText }}
          </span>
          <button class="text-xs text-blue-700 font-bold flex gap-1 items-center">
            {{ item.actionText }}
            <span class="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
