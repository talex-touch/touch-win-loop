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
}>(), {
  quickActions: () => [],
  skillMetrics: () => [],
  scheduleItems: () => [],
})
</script>

<template>
  <div class="col-span-12 space-y-8 lg:col-span-4">
    <section>
      <h3 class="text-lg text-slate-900 font-bold mb-4">
        工作台快捷访问
      </h3>
      <div class="gap-3 grid grid-cols-2">
        <NuxtLink
          v-for="item in quickActions"
          :key="item.id"
          :to="item.to"
          class="group p-4 border border-slate-100 rounded-xl bg-white flex flex-col gap-2 transition-all items-center hover:bg-blue-50"
        >
          <span class="material-symbols-outlined text-slate-400 transition-colors group-hover:text-blue-700">{{ item.icon }}</span>
          <span class="text-sm text-slate-700 font-medium">{{ item.label }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="text-white p-6 rounded-2xl shadow-blue-200/70 shadow-xl from-blue-700 to-blue-500 bg-gradient-to-br">
      <h4 class="text-lg font-bold mb-2">
        个人竞争力分析
      </h4>
      <p class="text-sm text-white/80 leading-relaxed mb-6">
        您在“算法竞赛”类目下的全国排名超过了 88% 的用户，建议增加在“大数据分析”方向的投入。
      </p>
      <div class="space-y-4">
        <div v-for="metric in skillMetrics" :key="metric.id">
          <div class="text-xs font-bold mb-1 flex justify-between">
            <span>{{ metric.label }}</span>
            <span>{{ metric.score }}/100</span>
          </div>
          <div class="rounded-full bg-white/20 h-1.5 w-full overflow-hidden">
            <div class="rounded-full bg-white h-full" :style="{ width: `${metric.score}%` }" />
          </div>
        </div>
      </div>
      <button class="text-sm text-blue-700 font-bold mt-6 py-2 rounded-lg bg-white w-full transition-colors hover:bg-slate-50">
        查看完整画像
      </button>
    </section>

    <section class="p-5 border border-slate-100 rounded-xl bg-white">
      <h3 class="text-sm text-slate-900 font-bold mb-4">
        本周日程
      </h3>
      <div class="space-y-3">
        <article v-for="item in scheduleItems" :key="item.id" class="flex gap-3">
          <div class="text-slate-500 px-2 py-1 border border-slate-100 rounded bg-slate-50 flex shrink-0 flex-col items-center">
            <span class="text-[10px] font-bold uppercase">{{ item.month }}</span>
            <span class="text-sm text-slate-900 font-bold">{{ item.day }}</span>
          </div>
          <div>
            <p class="text-xs text-slate-900 font-bold">
              {{ item.title }}
            </p>
            <p class="text-[10px] text-slate-400">
              {{ item.time }}
            </p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
