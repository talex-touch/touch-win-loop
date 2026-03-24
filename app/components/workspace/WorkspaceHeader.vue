<script setup lang="ts">
interface WorkspaceQuickSwitchProject {
  projectId: string
  workspaceId: string
  title: string
  workspaceName: string
  updatedAt: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  projectName?: string
  myProjects?: WorkspaceQuickSwitchProject[]
  recentProjects?: WorkspaceQuickSwitchProject[]
}>(), {
  modelValue: '',
  projectName: '未命名项目',
  myProjects: () => [],
  recentProjects: () => [],
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'quickSwitchProject', value: { projectId: string, workspaceId: string }): void
  (event: 'finalReview'): void
}>()

const quickSwitchOpen = ref(false)
const quickSwitchRef = ref<HTMLElement | null>(null)

const hasQuickSwitchOptions = computed(() => {
  return props.myProjects.length > 0 || props.recentProjects.length > 0
})

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

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

function openFinalReview() {
  closeQuickSwitch()
  emit('finalReview')
}

function handleGlobalPointerDown(event: Event) {
  if (!quickSwitchOpen.value)
    return

  const container = quickSwitchRef.value
  const target = event.target as Node | null
  if (!container || !target)
    return

  if (container.contains(target))
    return

  closeQuickSwitch()
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
        aria-label="工作区面包屑"
        class="flex gap-1 min-w-0 items-center"
      >
        <span class="material-symbols-outlined text-xl text-blue-600">dataset</span>
        <button
          class="text-sm text-slate-900 font-bold px-1 py-0.5 rounded transition-colors hover:bg-slate-100"
          type="button"
          @click="goWorkspaceList"
        >
          竞赛分析工作台
        </button>
        <span class="text-slate-300 font-normal mx-0.5">/</span>

        <div ref="quickSwitchRef" class="min-w-0 relative">
          <button
            class="text-xs text-slate-600 font-semibold px-1 py-0.5 rounded inline-flex gap-1 max-w-72 min-w-0 transition-colors items-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!hasQuickSwitchOptions"
            title="快速切换项目"
            type="button"
            @click.stop="toggleQuickSwitch"
          >
            <span class="truncate">{{ projectName }}</span>
            <span class="material-symbols-outlined text-sm shrink-0 block rotate-90">swap_horiz</span>
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
    <div class="shrink-0 max-w-[40vw] w-96 relative">
      <span class="material-symbols-outlined text-sm text-slate-400 left-2.5 top-1/2 absolute -translate-y-1/2">search</span>
      <input
        :value="modelValue"
        class="text-xs py-1 pl-8 pr-4 outline-none border border-slate-200 rounded bg-slate-50 w-full focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        placeholder="搜索资源、文档或指令..."
        type="text"
        @input="onInput"
      >
      <span class="text-[10px] text-slate-400 px-1 border border-slate-200 rounded right-2 top-1/2 absolute -translate-y-1/2">⌘K</span>
    </div>

    <div class="flex flex-1 gap-2 items-center justify-end">
      <button
        class="text-xs text-white font-semibold px-3 py-1.5 rounded bg-slate-900 hover:opacity-90"
        type="button"
        @click="openFinalReview"
      >
        终审
      </button>
      <button class="text-slate-500 p-1.5 rounded transition-colors hover:bg-slate-100">
        <span class="material-symbols-outlined text-xl">notifications</span>
      </button>
      <div class="border border-slate-300 rounded-full bg-slate-200 h-6 w-6 overflow-hidden">
        <img
          alt="avatar"
          class="h-full w-full object-cover"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCpeK3ZzVd7LtrOg5h6iFhJ5azRbuUFRmmaMGNaVkipoRx2KeXJvGzjOem-njmZ1X2K7E5eZq7iEGey_U1YoWT2pMOklyV-WBBdEXaeAsz-Gr76uirUlHq69Ry0Fs7j56my_Rkzmsqgd-IwpFzP7GnGQQLMOQ5ow_q8rIICxDOttJQY_PinNCZcLPjEAJaTIm6TZKjFhUquEDOc_dJHU_4nZZUHpVc9q77XvmnEtM5aBVMhBO4J0oNIfiA6rLO49eLZ9IVEQs_CTyPt"
        >
      </div>
    </div>
  </header>
</template>
