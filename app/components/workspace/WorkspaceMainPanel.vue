<script setup lang="ts">
import type { Contest, Resource, Track } from '~~/shared/types/domain'
import type {
  MappingTone,
  WorkspaceKeyword,
  WorkspaceMappingRow,
  WorkspaceStatusToneMeta,
} from '~/types/workspace'

const props = withDefaults(defineProps<{
  selectedContest?: Contest | null
  selectedTrack?: Track | null
  selectedTrackId?: string
  selectedContestId?: string
  contests?: Contest[]
  selectedResources?: Resource[]
  major?: string
  discipline?: string
  level?: string
  trackType?: string
  topK?: number
  openSettingsSignal?: number
  mappingRows?: WorkspaceMappingRow[]
  keywordCloud?: WorkspaceKeyword[]
  trendBars?: number[]
  toneMeta: Record<MappingTone, WorkspaceStatusToneMeta>
}>(), {
  selectedContest: null,
  selectedTrack: null,
  selectedTrackId: '',
  selectedContestId: '',
  contests: () => [],
  selectedResources: () => [],
  major: '',
  discipline: '',
  level: '',
  trackType: '',
  topK: 6,
  openSettingsSignal: 0,
  mappingRows: () => [],
  keywordCloud: () => [],
  trendBars: () => [],
})

const emit = defineEmits<{
  'update:selectedTrackId': [value: string]
  'update:selectedContestId': [value: string]
  'update:major': [value: string]
  'update:discipline': [value: string]
  'update:level': [value: string]
  'update:trackType': [value: string]
  'update:topK': [value: number]
}>()

type WorkspaceMainTabId = 'mapping' | 'flow' | 'settings'

interface WorkspaceMainTab {
  id: WorkspaceMainTabId
  title: string
  icon: string
}

const allTabs: WorkspaceMainTab[] = [
  {
    id: 'mapping',
    title: '核心指标对标.xlsx',
    icon: 'analytics',
  },
  {
    id: 'flow',
    title: '申报流程梳理',
    icon: 'flowsheet',
  },
  {
    id: 'settings',
    title: '当前详细设置',
    icon: 'settings',
  },
]

const openTabs = ref<WorkspaceMainTab[]>(allTabs.filter(tab => tab.id !== 'settings'))
const activeTabId = ref<WorkspaceMainTabId>('mapping')

const activeTab = computed(() => {
  return openTabs.value.find(tab => tab.id === activeTabId.value) || openTabs.value[0] || allTabs[0]
})

const draggingTabId = ref<WorkspaceMainTabId | ''>('')
const dragOverTabId = ref<WorkspaceMainTabId | ''>('')

function findTab(tabId: WorkspaceMainTabId): WorkspaceMainTab | undefined {
  return allTabs.find(tab => tab.id === tabId)
}

function ensureTabOpen(tabId: WorkspaceMainTabId, activate = true) {
  const existed = openTabs.value.some(tab => tab.id === tabId)
  if (!existed) {
    const target = findTab(tabId)
    if (target)
      openTabs.value = [...openTabs.value, target]
  }

  if (activate)
    activeTabId.value = tabId
}

function activateTab(tabId: WorkspaceMainTabId) {
  activeTabId.value = tabId
}

function closeTab(tabId: WorkspaceMainTabId) {
  if (openTabs.value.length <= 1)
    return

  const closingIndex = openTabs.value.findIndex(tab => tab.id === tabId)
  openTabs.value = openTabs.value.filter(tab => tab.id !== tabId)

  if (activeTabId.value !== tabId)
    return

  const fallbackIndex = Math.max(closingIndex - 1, 0)
  const fallbackTab = openTabs.value[fallbackIndex] || openTabs.value[0] || allTabs[0]
  if (!fallbackTab)
    return
  activeTabId.value = fallbackTab.id
}

function moveTab(fromId: WorkspaceMainTabId, toId: WorkspaceMainTabId) {
  if (fromId === toId)
    return

  const nextTabs = [...openTabs.value]
  const fromIndex = nextTabs.findIndex(tab => tab.id === fromId)
  const toIndex = nextTabs.findIndex(tab => tab.id === toId)
  if (fromIndex < 0 || toIndex < 0)
    return

  const [moved] = nextTabs.splice(fromIndex, 1)
  if (!moved)
    return

  nextTabs.splice(toIndex, 0, moved)
  openTabs.value = nextTabs
}

function onTabDragStart(tabId: WorkspaceMainTabId) {
  draggingTabId.value = tabId
  dragOverTabId.value = ''
}

function onTabDragOver(tabId: WorkspaceMainTabId, event: DragEvent) {
  if (!draggingTabId.value || draggingTabId.value === tabId)
    return
  event.preventDefault()
  dragOverTabId.value = tabId
}

function onTabDrop(tabId: WorkspaceMainTabId, event: DragEvent) {
  event.preventDefault()
  const fromId = draggingTabId.value
  if (!fromId || fromId === tabId) {
    dragOverTabId.value = ''
    return
  }

  moveTab(fromId, tabId)
  dragOverTabId.value = ''
}

function onTabDragEnd() {
  draggingTabId.value = ''
  dragOverTabId.value = ''
}

function onTopKInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  emit('update:topK', Number.isNaN(value) ? 1 : value)
}

watch(() => props.openSettingsSignal, (next, previous) => {
  if (next === previous)
    return
  ensureTabOpen('settings', true)
})
</script>

<template>
  <section class="bg-slate-50 flex flex-1 flex-col min-w-0 overflow-hidden">
    <div class="border-b border-slate-200 bg-white flex shrink-0 h-10 items-center">
      <div
        v-for="tab in openTabs"
        :key="tab.id"
        class="px-2 border-r border-slate-200 flex gap-1 h-full min-w-[180px] items-center"
        :class="[
          tab.id === activeTabId ? 'bg-slate-50' : 'bg-white',
          dragOverTabId === tab.id ? 'ring-1 ring-inset ring-blue-300' : '',
        ]"
        draggable="true"
        @dragstart="onTabDragStart(tab.id)"
        @dragover="onTabDragOver(tab.id, $event)"
        @drop="onTabDrop(tab.id, $event)"
        @dragend="onTabDragEnd"
      >
        <button
          class="text-xs text-left flex flex-1 gap-2 h-full min-w-0 items-center"
          :class="tab.id === activeTabId ? 'text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'"
          type="button"
          @click="activateTab(tab.id)"
        >
          <span class="material-symbols-outlined text-sm" :class="tab.id === activeTabId ? 'text-blue-500' : 'text-slate-400'">{{ tab.icon }}</span>
          <span class="truncate">{{ tab.title }}</span>
        </button>

        <button
          class="text-slate-400 p-1 rounded hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          type="button"
          :disabled="openTabs.length <= 1"
          @click.stop="closeTab(tab.id)"
        >
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    </div>

    <div class="text-[11px] text-slate-400 px-4 py-2 border-b border-slate-200 bg-white flex gap-2 items-center">
      <span>竞赛分析</span>
      <span class="material-symbols-outlined text-[12px]">chevron_right</span>
      <span>{{ selectedContest?.name || '未选择竞赛' }}</span>
      <span class="material-symbols-outlined text-[12px]">chevron_right</span>
      <span class="text-slate-600 font-medium">{{ activeTab?.title || selectedTrack?.name || '指标映射视图' }}</span>
    </div>

    <div class="p-4 flex-1 overflow-auto md:p-6">
      <div v-if="activeTabId === 'mapping'" class="mx-auto max-w-5xl space-y-4">
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
              当前项目暂无资料，请从左侧资源管理器上传或手动添加。
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeTabId === 'flow'" class="mx-auto max-w-5xl space-y-4">
        <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex gap-3 items-center">
            <span class="material-symbols-outlined text-xl text-blue-600">flowsheet</span>
            <div>
              <h2 class="text-sm font-bold">
                申报流程梳理
              </h2>
              <div class="text-[11px] text-slate-500 mt-0.5">
                按当前竞赛与资料状态，拆分可执行的申报步骤。
              </div>
            </div>
          </div>

          <ol class="divide-slate-200 divide-y">
            <li class="p-4 flex gap-3 items-start">
              <span class="text-[11px] text-blue-600 font-bold rounded-full bg-blue-50 flex h-5 w-5 items-center justify-center">1</span>
              <div>
                <div class="text-xs text-slate-800 font-semibold">
                  赛题确认
                </div>
                <p class="text-[11px] text-slate-500 mt-1">
                  锁定目标竞赛与赛道，形成统一申报边界。
                </p>
                <p class="text-[11px] mt-1" :class="selectedContest && selectedTrack ? 'text-emerald-600' : 'text-amber-600'">
                  {{ selectedContest && selectedTrack ? `已锁定：${selectedContest.name} / ${selectedTrack.name}` : '待处理：请先在左侧选择竞赛与赛道。' }}
                </p>
              </div>
            </li>
            <li class="p-4 flex gap-3 items-start">
              <span class="text-[11px] text-blue-600 font-bold rounded-full bg-blue-50 flex h-5 w-5 items-center justify-center">2</span>
              <div>
                <div class="text-xs text-slate-800 font-semibold">
                  材料归档
                </div>
                <p class="text-[11px] text-slate-500 mt-1">
                  汇总可用规则、往届样例与公开数据，沉淀成资料池。
                </p>
                <p class="text-[11px] mt-1" :class="selectedResources.length > 0 ? 'text-emerald-600' : 'text-amber-600'">
                  {{ selectedResources.length > 0 ? `已归档 ${selectedResources.length} 份资料` : '待处理：当前资料池为空。' }}
                </p>
              </div>
            </li>
            <li class="p-4 flex gap-3 items-start">
              <span class="text-[11px] text-blue-600 font-bold rounded-full bg-blue-50 flex h-5 w-5 items-center justify-center">3</span>
              <div>
                <div class="text-xs text-slate-800 font-semibold">
                  指标映射
                </div>
                <p class="text-[11px] text-slate-500 mt-1">
                  将竞赛评分要求映射到项目能力点，识别缺口并补齐。
                </p>
                <p class="text-[11px] mt-1" :class="mappingRows.length > 0 ? 'text-emerald-600' : 'text-amber-600'">
                  {{ mappingRows.length > 0 ? `已生成 ${mappingRows.length} 条映射指标` : '待处理：尚未生成映射指标。' }}
                </p>
              </div>
            </li>
            <li class="p-4 flex gap-3 items-start">
              <span class="text-[11px] text-blue-600 font-bold rounded-full bg-blue-50 flex h-5 w-5 items-center justify-center">4</span>
              <div>
                <div class="text-xs text-slate-800 font-semibold">
                  提交与答辩准备
                </div>
                <p class="text-[11px] text-slate-500 mt-1">
                  产出最终材料包，并完成关键问答演练。
                </p>
                <p class="text-[11px] text-slate-500 mt-1">
                  建议在右侧切换到“提交表单”和“AI 辅助-答辩模拟”继续推进。
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div class="gap-4 grid grid-cols-1 md:grid-cols-2">
          <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
            <div class="text-xs text-slate-700 font-semibold mb-3">
              材料齐备度
            </div>
            <div class="rounded-full bg-slate-100 h-2 overflow-hidden">
              <span
                class="bg-blue-500 h-full block"
                :style="{ width: `${Math.min(selectedResources.length * 20, 100)}%` }"
              />
            </div>
            <p class="text-[11px] text-slate-500 mt-2">
              当前进度：{{ Math.min(selectedResources.length * 20, 100) }}%
            </p>
          </div>
          <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
            <div class="text-xs text-slate-700 font-semibold mb-2">
              当前建议
            </div>
            <p class="text-[11px] text-slate-500">
              优先补齐“缺失材料”项，再回到“核心指标对标.xlsx”验证关联度是否提升。
            </p>
          </div>
        </div>
      </div>

      <div v-else class="mx-auto max-w-4xl space-y-4">
        <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex gap-3 items-center">
            <span class="material-symbols-outlined text-xl text-blue-600">settings</span>
            <div>
              <h2 class="text-sm font-bold">
                当前详细设置
              </h2>
              <div class="text-[11px] text-slate-500 mt-0.5">
                在此集中配置当前工作区的核心信息。
              </div>
            </div>
          </div>

          <div class="p-4 space-y-4">
            <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
              <label class="text-xs text-slate-600 space-y-1">
                <span class="block">专业</span>
                <input
                  :value="major"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  placeholder="专业"
                  @input="emit('update:major', ($event.target as HTMLInputElement).value)"
                >
              </label>

              <label class="text-xs text-slate-600 space-y-1">
                <span class="block">学科/方向</span>
                <input
                  :value="discipline"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  placeholder="学科/方向"
                  @input="emit('update:discipline', ($event.target as HTMLInputElement).value)"
                >
              </label>

              <label class="text-xs text-slate-600 space-y-1">
                <span class="block">竞赛级别</span>
                <select
                  :value="level"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  @change="emit('update:level', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">
                    级别（全部）
                  </option>
                  <option value="national">
                    national
                  </option>
                  <option value="provincial">
                    provincial
                  </option>
                  <option value="school">
                    school
                  </option>
                  <option value="industry">
                    industry
                  </option>
                </select>
              </label>

              <label class="text-xs text-slate-600 space-y-1">
                <span class="block">赛道偏好</span>
                <input
                  :value="trackType"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  placeholder="赛道偏好"
                  @input="emit('update:trackType', ($event.target as HTMLInputElement).value)"
                >
              </label>

              <label class="text-xs text-slate-600 space-y-1">
                <span class="block">当前竞赛</span>
                <select
                  :value="selectedContestId"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  @change="emit('update:selectedContestId', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="" disabled>
                    选择竞赛
                  </option>
                  <option v-for="contest in contests" :key="contest.id" :value="contest.id">
                    {{ contest.name }}
                  </option>
                </select>
              </label>

              <label class="text-xs text-slate-600 space-y-1">
                <span class="block">当前赛道</span>
                <select
                  :value="selectedTrackId"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  @change="emit('update:selectedTrackId', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="" disabled>
                    选择赛道
                  </option>
                  <option v-for="track in selectedContest?.tracks || []" :key="track.id" :value="track.id">
                    {{ track.name }}
                  </option>
                </select>
              </label>

              <label class="text-xs text-slate-600 space-y-1">
                <span class="block">返回条数</span>
                <input
                  :value="topK"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  max="20"
                  min="1"
                  type="number"
                  @input="onTopKInput"
                >
              </label>
            </div>

            <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
              当前资料总数：{{ selectedResources.length }} · 当前映射指标：{{ mappingRows.length }} · 当前关键词：{{ keywordCloud.length }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
