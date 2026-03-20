<script setup lang="ts">
import type { Contest, Resource, Track } from '~~/shared/types/domain'
import type {
  MappingTone,
  WorkspaceKeyword,
  WorkspaceMappingRow,
  WorkspaceStatusToneMeta,
} from '~/types/workspace'

withDefaults(defineProps<{
  selectedContest?: Contest | null
  selectedTrack?: Track | null
  selectedTrackId?: string
  selectedResources?: Resource[]
  mappingRows?: WorkspaceMappingRow[]
  keywordCloud?: WorkspaceKeyword[]
  trendBars?: number[]
  toneMeta: Record<MappingTone, WorkspaceStatusToneMeta>
}>(), {
  selectedContest: null,
  selectedTrack: null,
  selectedTrackId: '',
  selectedResources: () => [],
  mappingRows: () => [],
  keywordCloud: () => [],
  trendBars: () => [],
})

const emit = defineEmits<{
  'update:selectedTrackId': [value: string]
}>()
</script>

<template>
  <section class="bg-slate-50 flex flex-1 flex-col min-w-0 overflow-hidden">
    <div class="border-b border-slate-200 bg-white flex shrink-0 h-10 items-center">
      <div class="px-4 py-2 border-r border-slate-200 bg-slate-50 flex gap-2 h-full min-w-[180px] items-center">
        <span class="material-symbols-outlined text-sm text-blue-400">analytics</span>
        <span class="text-xs font-medium truncate">核心指标对标.xlsx</span>
        <span class="material-symbols-outlined text-[14px] text-slate-400 ml-auto">close</span>
      </div>
      <div class="px-4 py-2 border-r border-slate-200 bg-white gap-2 h-full min-w-[180px] hidden items-center md:flex">
        <span class="material-symbols-outlined text-sm text-blue-600">flowsheet</span>
        <span class="text-xs text-slate-500 truncate">申报流程梳理</span>
        <span class="material-symbols-outlined text-[14px] text-slate-400 ml-auto">close</span>
      </div>
      <button class="text-slate-400 p-2 hover:text-slate-600">
        <span class="material-symbols-outlined text-sm">add</span>
      </button>
    </div>

    <div class="text-[11px] text-slate-400 px-4 py-2 border-b border-slate-200 bg-white flex gap-2 items-center">
      <span>竞赛分析</span>
      <span class="material-symbols-outlined text-[12px]">chevron_right</span>
      <span>{{ selectedContest?.name || '未选择竞赛' }}</span>
      <span class="material-symbols-outlined text-[12px]">chevron_right</span>
      <span class="text-slate-600 font-medium">{{ selectedTrack?.name || '指标映射视图' }}</span>
    </div>

    <div class="p-4 flex-1 overflow-auto md:p-6">
      <div class="mx-auto max-w-5xl space-y-4">
        <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div class="flex gap-3 items-center">
              <span class="material-symbols-outlined text-xl text-blue-600">account_tree</span>
              <div>
                <h2 class="text-sm font-bold">
                  数据对标与映射逻辑
                </h2>
                <div class="text-[11px] text-slate-500 mt-0.5">
                  {{ selectedTrack?.summary || '请选择竞赛与赛道，开始对标分析。' }}
                </div>
              </div>
            </div>
            <div class="flex gap-2 items-center">
              <select
                class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 min-w-46 focus:border-blue-500"
                :value="selectedTrackId"
                @change="emit('update:selectedTrackId', ($event.target as HTMLSelectElement).value)"
              >
                <option value="" disabled>
                  选择赛道
                </option>
                <option v-for="track in selectedContest?.tracks || []" :key="track.id" :value="track.id">
                  {{ track.name }}
                </option>
              </select>
              <button class="text-[11px] font-bold px-2 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50">
                自动对齐
              </button>
              <button class="text-[11px] text-white font-bold px-2 py-1 rounded bg-blue-600 transition-colors hover:bg-blue-500">
                导出分析报表
              </button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="text-xs text-left min-w-180 w-full border-collapse">
              <thead>
                <tr class="text-slate-500 bg-slate-50/60">
                  <th class="font-semibold px-4 py-2 border-b border-slate-200">
                    要求指标 (竞赛要求)
                  </th>
                  <th class="font-semibold px-4 py-2 text-center border-b border-slate-200">
                    关联度
                  </th>
                  <th class="font-semibold px-4 py-2 border-b border-slate-200">
                    对应项目能力点
                  </th>
                  <th class="font-semibold px-4 py-2 border-b border-slate-200">
                    佐证材料状态
                  </th>
                </tr>
              </thead>
              <tbody class="divide-slate-200 divide-y">
                <tr
                  v-for="row in mappingRows"
                  :key="row.id"
                  class="transition-colors hover:bg-blue-50/40"
                >
                  <td class="px-4 py-3.5">
                    <div class="text-slate-900 font-medium">
                      {{ row.metric }}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1">
                      {{ row.hint }}
                    </div>
                  </td>
                  <td class="px-4 py-3.5 text-center">
                    <span class="rounded-full bg-slate-100 h-1.5 w-20 inline-block overflow-hidden">
                      <span
                        class="h-full block"
                        :class="toneMeta[row.tone].barClass"
                        :style="{ width: `${row.score}%` }"
                      />
                    </span>
                  </td>
                  <td class="px-4 py-3.5">
                    <div class="text-slate-700">
                      {{ row.ability }}
                    </div>
                    <div class="text-[10px] text-blue-600 font-medium mt-1">
                      <span v-for="tag in row.tags" :key="`${row.id}-${tag}`" class="mr-2">{{ tag }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3.5">
                    <span
                      class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      :class="toneMeta[row.tone].badgeClass"
                    >
                      {{ toneMeta[row.tone].label }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="gap-4 grid grid-cols-1 md:grid-cols-2">
          <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
            <div class="mb-4 flex gap-2 items-center">
              <span class="material-symbols-outlined text-sm text-blue-500">hub</span>
              <span class="text-xs text-slate-500 tracking-wider font-bold uppercase">核心词云图</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="word in keywordCloud"
                :key="word.label"
                class="text-[10px] px-2 py-1 rounded"
                :class="word.active ? 'bg-blue-50 text-blue-600 font-bold' : 'bg-slate-50 text-slate-600'"
              >
                {{ word.label }} ({{ word.count }})
              </span>
            </div>
          </div>
          <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
            <div class="mb-4 flex gap-2 items-center">
              <span class="material-symbols-outlined text-sm text-green-500">show_chart</span>
              <span class="text-xs text-slate-500 tracking-wider font-bold uppercase">竞争力评估趋势</span>
            </div>
            <div class="flex gap-1.5 h-16 items-end">
              <div
                v-for="(height, index) in trendBars"
                :key="`trend-${index}`"
                class="rounded-t flex-1 transition-all"
                :class="index === trendBars.length - 1 ? 'bg-blue-500 animate-pulse' : 'bg-blue-200'"
                :style="{ height: `${height}%` }"
              />
            </div>
          </div>
        </div>

        <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
          <div class="text-xs text-slate-700 font-bold mb-2">
            可用资料预览（{{ selectedResources.length }}）
          </div>
          <div class="gap-2 grid grid-cols-1 md:grid-cols-2">
            <div
              v-for="resource in selectedResources.slice(0, 6)"
              :key="resource.id"
              class="p-2 border border-slate-200 rounded bg-slate-50/60"
            >
              <div class="text-xs text-slate-800 font-semibold truncate">
                {{ resource.title }}
              </div>
              <div class="text-[10px] text-slate-500 mt-1">
                {{ resource.type }} / {{ resource.year }} / {{ resource.availability }}
              </div>
            </div>
            <div v-if="selectedResources.length === 0" class="text-[11px] text-slate-400 p-2 border border-slate-200 rounded border-dashed">
              当前竞赛暂无资料，请先切换竞赛或稍后重试。
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
