<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: string
  projectName?: string
  contestName?: string
  trackName?: string
}>(), {
  modelValue: '',
  projectName: '项目分析-01',
  contestName: '未选择竞赛',
  trackName: '未选择赛道',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <header class="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4 shrink-0 z-10">
    <div class="flex items-center gap-4 min-w-0">
      <div class="flex items-center gap-2 min-w-0">
        <span class="material-symbols-outlined text-blue-600 text-xl">dataset</span>
        <span class="text-sm font-bold tracking-tight truncate">
          竞赛分析工作台
          <span class="text-slate-300 font-normal mx-1">/</span>
          <span class="text-slate-500 font-medium text-xs">{{ projectName }}</span>
        </span>
      </div>
      <nav class="hidden items-center ml-2 gap-1 lg:flex">
        <button class="px-3 py-1 text-xs font-medium rounded hover:bg-slate-100">
          文件
        </button>
        <button class="px-3 py-1 text-xs font-medium rounded hover:bg-slate-100">
          编辑
        </button>
        <button class="px-3 py-1 text-xs font-medium rounded hover:bg-slate-100">
          视图
        </button>
        <button class="px-3 py-1 text-xs font-medium rounded text-blue-600 bg-blue-50 hover:bg-blue-100">
          智能辅助
        </button>
      </nav>
    </div>
    <div class="flex items-center gap-3">
      <div class="relative hidden lg:block w-76">
        <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
        <input
          :value="modelValue"
          class="w-full bg-slate-50 border border-slate-200 rounded py-1 pl-8 pr-4 text-xs focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none"
          placeholder="搜索资源、文档或指令..."
          type="text"
          @input="onInput"
        >
        <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 border border-slate-200 px-1 rounded">⌘K</span>
      </div>
      <div class="hidden text-[11px] text-slate-500 text-right lg:block">
        <div class="font-medium text-slate-700 truncate max-w-64">
          {{ contestName }}
        </div>
        <div class="truncate max-w-64">
          {{ trackName }}
        </div>
      </div>
      <button class="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors">
        <span class="material-symbols-outlined text-xl">notifications</span>
      </button>
      <div class="w-6 h-6 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
        <img
          alt="avatar"
          class="w-full h-full object-cover"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCpeK3ZzVd7LtrOg5h6iFhJ5azRbuUFRmmaMGNaVkipoRx2KeXJvGzjOem-njmZ1X2K7E5eZq7iEGey_U1YoWT2pMOklyV-WBBdEXaeAsz-Gr76uirUlHq69Ry0Fs7j56my_Rkzmsqgd-IwpFzP7GnGQQLMOQ5ow_q8rIICxDOttJQY_PinNCZcLPjEAJaTIm6TZKjFhUquEDOc_dJHU_4nZZUHpVc9q77XvmnEtM5aBVMhBO4J0oNIfiA6rLO49eLZ9IVEQs_CTyPt"
        >
      </div>
    </div>
  </header>
</template>
