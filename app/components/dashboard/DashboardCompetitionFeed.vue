<script setup lang="ts">
import type {
  DashboardCompetition,
  DashboardCompetitionTone,
  DashboardFeedFilter,
} from '~/types/dashboard'

withDefaults(defineProps<{
  competitions?: DashboardCompetition[]
  activeFilter?: DashboardFeedFilter
}>(), {
  competitions: () => [],
  activeFilter: 'all',
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
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
}

function statusClass(status: DashboardCompetition['status']): string {
  if (status === 'ongoing')
    return 'bg-green-100 text-green-700'
  return 'bg-slate-100 text-slate-600'
}
</script>

<template>
  <section>
    <div class="mb-4 flex flex-wrap gap-4 items-center justify-between">
      <h3 class="text-lg text-slate-900 font-bold flex gap-2 items-center">
        <span class="material-symbols-outlined text-blue-700">rss_feed</span>
        赛事动态流
      </h3>
      <div class="flex gap-2">
        <button
          v-for="tab in feedTabs"
          :key="tab.value"
          class="text-xs font-medium px-3 py-1 rounded-full transition-colors"
          :class="activeFilter === tab.value ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
          @click="emit('update:activeFilter', tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="space-y-3">
      <article
        v-for="item in competitions"
        :key="item.id"
        class="p-4 border border-slate-100 rounded-xl bg-white flex transition-all items-center hover:border-blue-200"
      >
        <div class="text-xl rounded-lg flex shrink-0 h-12 w-12 items-center justify-center" :class="toneClassMap[item.tone]">
          <span class="material-symbols-outlined text-2xl">{{ item.icon }}</span>
        </div>
        <div class="ml-4 flex-1 min-w-0">
          <div class="flex flex-wrap gap-2 items-center">
            <h5 class="text-slate-900 font-bold truncate">
              {{ item.title }}
            </h5>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded" :class="statusClass(item.status)">
              {{ item.stage }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            {{ item.level }} • {{ item.deadline }}
          </p>
        </div>
        <div class="ml-4 text-right shrink-0">
          <button class="text-xs font-bold px-3 py-1.5 border border-slate-200 rounded-lg transition-colors hover:bg-slate-50">
            {{ item.actionText }}
          </button>
        </div>
      </article>

      <div v-if="competitions.length === 0" class="text-sm text-slate-400 p-6 text-center border border-slate-200 rounded-xl border-dashed bg-white">
        当前筛选条件下暂无赛事动态
      </div>
    </div>
  </section>
</template>
