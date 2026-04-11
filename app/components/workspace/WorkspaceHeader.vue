<script setup lang="ts">
import WorkspaceAiToggleButton from '~/components/workspace/WorkspaceAiToggleButton.vue'

type WorkspaceWorkbenchMode = 'project' | 'defense' | 'final_review'

interface WorkspaceQuickSwitchProject {
  projectId: string
  workspaceId: string
  title: string
  workspaceName: string
  updatedAt: string
}

const props = withDefaults(defineProps<{
  projectName?: string
  myProjects?: WorkspaceQuickSwitchProject[]
  recentProjects?: WorkspaceQuickSwitchProject[]
  workbenchMode?: WorkspaceWorkbenchMode
  metaKShortcutLabel?: string
  aiCollapsed?: boolean
}>(), {
  projectName: '未命名项目',
  myProjects: () => [],
  recentProjects: () => [],
  workbenchMode: 'project',
  metaKShortcutLabel: '⌘K',
  aiCollapsed: false,
})

const emit = defineEmits<{
  (event: 'update:workbenchMode', value: WorkspaceWorkbenchMode): void
  (event: 'quickSwitchProject', value: { projectId: string, workspaceId: string }): void
  (event: 'openMetaK'): void
  (event: 'toggleAiSidebar'): void
}>()

const quickSwitchOpen = ref(false)
const quickSwitchRef = ref<HTMLElement | null>(null)

const hasQuickSwitchOptions = computed(() => {
  return props.myProjects.length > 0 || props.recentProjects.length > 0
})

function formatShortTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '-'

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function toggleQuickSwitch() {
  if (!hasQuickSwitchOptions.value)
    return

  quickSwitchOpen.value = !quickSwitchOpen.value
}

function closeQuickSwitch() {
  quickSwitchOpen.value = false
}

function switchProject(item: WorkspaceQuickSwitchProject) {
  emit('quickSwitchProject', {
    projectId: item.projectId,
    workspaceId: item.workspaceId,
  })
  closeQuickSwitch()
}

function goWorkspaceList() {
  closeQuickSwitch()
  navigateTo('/team')
}

function openMetaK() {
  closeQuickSwitch()
  emit('openMetaK')
}

function selectWorkbench(mode: WorkspaceWorkbenchMode) {
  if (props.workbenchMode === mode)
    return
  emit('update:workbenchMode', mode)
}

function handleGlobalPointerDown(event: Event) {
  const target = event.target as Node | null
  if (!target)
    return

  if (quickSwitchOpen.value) {
    const quickSwitchContainer = quickSwitchRef.value
    if (!quickSwitchContainer || !quickSwitchContainer.contains(target))
      closeQuickSwitch()
  }
}

function handleGlobalEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  closeQuickSwitch()
}

onMounted(() => {
  if (!import.meta.client)
    return
  document.addEventListener('pointerdown', handleGlobalPointerDown)
  document.addEventListener('keydown', handleGlobalEscape)
})

onBeforeUnmount(() => {
  if (!import.meta.client)
    return
  document.removeEventListener('pointerdown', handleGlobalPointerDown)
  document.removeEventListener('keydown', handleGlobalEscape)
})
</script>

<template>
  <header class="px-4 border-b border-slate-200 bg-white flex shrink-0 gap-3 h-12 items-center z-10">
    <div class="flex flex-1 gap-2 min-w-0 items-center">
      <nav
        aria-label="项目工作区面包屑"
        class="flex gap-1 min-w-0 items-center"
      >
        <span class="material-symbols-outlined text-xl text-blue-600">dataset</span>
        <button
          class="text-sm text-slate-900 font-bold px-1 py-0.5 rounded transition-colors hover:bg-slate-100"
          type="button"
          @click="goWorkspaceList"
        >
          项目台
        </button>
        <span class="text-sm text-slate-300/75 leading-none font-normal mx-0.5">/</span>

        <div ref="quickSwitchRef" class="min-w-0 relative">
          <button
            class="text-xs text-slate-600 font-semibold px-1 py-0.5 rounded inline-flex gap-1 max-w-72 min-w-0 transition-colors items-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!hasQuickSwitchOptions"
            title="快速切换项目"
            type="button"
            @click.stop="toggleQuickSwitch"
          >
            <span class="leading-none truncate">{{ projectName }}</span>
            <span class="material-symbols-outlined text-[12px] text-slate-500/70 leading-none shrink-0 block translate-y-[0.5px] rotate-90">swap_horiz</span>
          </button>

          <div
            v-if="quickSwitchOpen"
            class="mt-2 p-2 border border-slate-200 rounded-lg bg-white max-h-96 w-80 shadow-lg left-0 top-full absolute z-20 overflow-y-auto"
          >
            <div class="text-[11px] text-slate-500 px-2 pb-2 pt-1">
              快速切换
            </div>
            <section class="space-y-1">
              <p class="text-[11px] text-slate-500 px-2">
                我的项目
              </p>
              <button
                v-for="item in props.myProjects"
                :key="`mine-${item.projectId}`"
                class="px-2 py-1.5 text-left rounded-md w-full transition-colors hover:bg-slate-50"
                type="button"
                @click="switchProject(item)"
              >
                <div class="text-xs text-slate-800 font-medium truncate">
                  {{ item.title }}
                </div>
                <div class="text-[11px] text-slate-500 flex gap-2 items-center justify-between">
                  <span class="truncate">{{ item.workspaceName }}</span>
                  <span class="shrink-0">{{ formatShortTime(item.updatedAt) }}</span>
                </div>
              </button>
              <p v-if="props.myProjects.length === 0" class="text-[11px] text-slate-400 px-2 py-1">
                暂无可切换项目
              </p>
            </section>

            <section class="mt-2 pt-2 border-t border-slate-100 space-y-1">
              <p class="text-[11px] text-slate-500 px-2">
                最近项目
              </p>
              <button
                v-for="item in props.recentProjects"
                :key="`recent-${item.projectId}`"
                class="px-2 py-1.5 text-left rounded-md w-full transition-colors hover:bg-slate-50"
                type="button"
                @click="switchProject(item)"
              >
                <div class="text-xs text-slate-800 font-medium truncate">
                  {{ item.title }}
                </div>
                <div class="text-[11px] text-slate-500 flex gap-2 items-center justify-between">
                  <span class="truncate">{{ item.workspaceName }}</span>
                  <span class="shrink-0">{{ formatShortTime(item.updatedAt) }}</span>
                </div>
              </button>
              <p v-if="props.recentProjects.length === 0" class="text-[11px] text-slate-400 px-2 py-1">
                暂无最近项目
              </p>
            </section>
          </div>
        </div>
      </nav>
    </div>
    <div class="shrink-0 max-w-[42vw] w-[28rem]">
      <button
        type="button"
        class="px-1.5 text-left border border-slate-200 rounded-lg bg-white h-7 w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        data-testid="workspace-header-metak-trigger"
        @click="openMetaK"
      >
        <span class="flex gap-1.5 min-w-0 items-center">
          <span class="text-blue-600 rounded-md bg-blue-50 inline-flex shrink-0 h-[22px] w-[22px] items-center justify-center">
            <span class="material-symbols-outlined text-[14px]">search</span>
          </span>
          <span class="text-[11px] text-slate-500 flex-1 min-w-0 block truncate leading-none">
            搜索命令、资源、会议或项目
          </span>
          <span class="text-[9px] text-slate-400 leading-none font-semibold px-1.5 py-0.5 border border-slate-200 rounded-md bg-slate-50 shrink-0">
            {{ metaKShortcutLabel }}
          </span>
        </span>
      </button>
    </div>

    <div class="flex flex-1 gap-2 items-center justify-end">
      <div
        data-testid="workspace-header-workbench-tabs"
        class="p-0.5 border border-slate-200 rounded-xl bg-slate-100/80 inline-flex gap-0.5 items-center"
      >
        <button
          class="text-xs px-3 py-1.5 rounded-[10px] transition-colors"
          :class="workbenchMode === 'project'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'"
          type="button"
          @click="selectWorkbench('project')"
        >
          项目工作台
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded-[10px] transition-colors"
          :class="workbenchMode === 'defense'
            ? 'bg-[#d4a017] text-white shadow-sm'
            : 'text-slate-500 hover:text-amber-700'"
          type="button"
          @click="selectWorkbench('defense')"
        >
          答辩工作台
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded-[10px] transition-colors"
          :class="workbenchMode === 'final_review'
            ? 'bg-[#2563eb] text-white shadow-sm'
            : 'text-slate-500 hover:text-blue-700'"
          type="button"
          @click="selectWorkbench('final_review')"
        >
          终审工作台
        </button>
      </div>
      <WorkspaceAiToggleButton
        :collapsed="props.aiCollapsed"
        @toggle="emit('toggleAiSidebar')"
      />
    </div>
  </header>
</template>
