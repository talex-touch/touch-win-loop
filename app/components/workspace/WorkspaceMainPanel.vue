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
  <section class="flex-1 bg-slate-50 flex flex-col overflow-hidden min-w-0">
    <div class="h-10 border-b border-slate-200 bg-white flex items-center shrink-0">
      <div class="flex items-center px-4 py-2 border-r border-slate-200 bg-slate-50 h-full gap-2 min-w-[180px]">
        <span class="material-symbols-outlined text-sm text-blue-400">analytics</span>
        <span class="text-xs font-medium truncate">核心指标对标.xlsx</span>
        <span class="material-symbols-outlined text-[14px] ml-auto text-slate-400">close</span>
      </div>
      <div class="hidden md:flex items-center px-4 py-2 border-r border-slate-200 bg-white h-full gap-2 min-w-[180px]">
        <span class="material-symbols-outlined text-sm text-blue-600">flowsheet</span>
        <span class="text-xs text-slate-500 truncate">申报流程梳理</span>
        <span class="material-symbols-outlined text-[14px] ml-auto text-slate-400">close</span>
      </div>
      <button class="p-2 text-slate-400 hover:text-slate-600">
        <span class="material-symbols-outlined text-sm">add</span>
      </button>
    </div>

    <div class="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2 text-[11px] text-slate-400">
      <span>竞赛分析</span>
      <span class="material-symbols-outlined text-[12px]">chevron_right</span>
      <span>{{ selectedContest?.name || '未选择竞赛' }}</span>
      <span class="material-symbols-outlined text-[12px]">chevron_right</span>
      <span class="text-slate-600 font-medium">{{ selectedTrack?.name || '指标映射视图' }}</span>
    </div>

    <div class="flex-1 overflow-auto p-4 md:p-6">
      <div class="max-w-5xl mx-auto space-y-4">
        <div class="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div class="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-blue-600 text-xl">account_tree</span>
              <div>
                <h2 class="text-sm font-bold">
                  数据对标与映射逻辑
                </h2>
                <div class="text-[11px] text-slate-500 mt-0.5">
                  {{ selectedTrack?.summary || '请选择竞赛与赛道，开始对标分析。' }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <select
                class="h-8 rounded border border-slate-200 px-2 text-xs outline-none focus:border-blue-500 bg-white min-w-46"
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
              <button class="text-[11px] font-bold bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-50 transition-colors">
                自动对齐
              </button>
              <button class="text-[11px] font-bold bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500 transition-colors">
                导出分析报表
              </button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse min-w-180">
              <thead>
                <tr class="bg-slate-50/60 text-slate-500">
                  <th class="px-4 py-2 font-semibold border-b border-slate-200">
                    要求指标 (竞赛要求)
                  </th>
                  <th class="px-4 py-2 font-semibold border-b border-slate-200 text-center">
                    关联度
                  </th>
                  <th class="px-4 py-2 font-semibold border-b border-slate-200">
                    对应项目能力点
                  </th>
                  <th class="px-4 py-2 font-semibold border-b border-slate-200">
                    佐证材料状态
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                <tr
                  v-for="row in mappingRows"
                  :key="row.id"
                  class="hover:bg-blue-50/40 transition-colors"
                >
                  <td class="px-4 py-3.5">
                    <div class="font-medium text-slate-900">
                      {{ row.metric }}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1">
                      {{ row.hint }}
                    </div>
                  </td>
                  <td class="px-4 py-3.5 text-center">
                    <span class="inline-block w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <span
                        class="block h-full"
                        :class="toneMeta[row.tone].barClass"
                        :style="{ width: `${row.score}%` }"
                      />
                    </span>
                  </td>
                  <td class="px-4 py-3.5">
                    <div class="text-slate-700">
                      {{ row.ability }}
                    </div>
                    <div class="text-[10px] text-blue-600 mt-1 font-medium">
                      <span v-for="tag in row.tags" :key="`${row.id}-${tag}`" class="mr-2">{{ tag }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3.5">
                    <span
                      class="px-2 py-0.5 rounded-full font-bold text-[10px]"
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

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div class="flex items-center gap-2 mb-4">
              <span class="material-symbols-outlined text-blue-500 text-sm">hub</span>
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">核心词云图</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="word in keywordCloud"
                :key="word.label"
                class="px-2 py-1 rounded text-[10px]"
                :class="word.active ? 'bg-blue-50 text-blue-600 font-bold' : 'bg-slate-50 text-slate-600'"
              >
                {{ word.label }} ({{ word.count }})
              </span>
            </div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div class="flex items-center gap-2 mb-4">
              <span class="material-symbols-outlined text-green-500 text-sm">show_chart</span>
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">竞争力评估趋势</span>
            </div>
            <div class="h-16 flex items-end gap-1.5">
              <div
                v-for="(height, index) in trendBars"
                :key="`trend-${index}`"
                class="flex-1 rounded-t transition-all"
                :class="index === trendBars.length - 1 ? 'bg-blue-500 animate-pulse' : 'bg-blue-200'"
                :style="{ height: `${height}%` }"
              />
            </div>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div class="text-xs font-bold text-slate-700 mb-2">
            可用资料预览（{{ selectedResources.length }}）
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div
              v-for="resource in selectedResources.slice(0, 6)"
              :key="resource.id"
              class="rounded border border-slate-200 p-2 bg-slate-50/60"
            >
              <div class="text-xs font-semibold text-slate-800 truncate">
                {{ resource.title }}
              </div>
              <div class="text-[10px] text-slate-500 mt-1">
                {{ resource.type }} / {{ resource.year }} / {{ resource.availability }}
              </div>
            </div>
            <div v-if="selectedResources.length === 0" class="rounded border border-dashed border-slate-200 p-2 text-[11px] text-slate-400">
              当前竞赛暂无资料，请先切换竞赛或稍后重试。
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
