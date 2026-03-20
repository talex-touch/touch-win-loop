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

const router = useRouter()

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function goBack() {
  if (import.meta.client && window.history.length > 1) {
    router.back()
    return
  }

  navigateTo('/dashboard')
}
</script>

<template>
  <header class="px-4 border-b border-slate-200 bg-white flex shrink-0 h-12 items-center justify-between z-10">
    <div class="flex gap-4 min-w-0 items-center">
      <button
        class="px-1 py-0.5 rounded flex gap-2 min-w-0 items-center hover:bg-slate-100"
        type="button"
        @click="goBack"
      >
        <span class="material-symbols-outlined text-xl text-blue-600">dataset</span>
        <span class="text-sm tracking-tight font-bold truncate">
          竞赛分析工作台
          <span class="text-slate-300 font-normal mx-1">/</span>
          <span class="text-xs text-slate-500 font-medium">{{ projectName }}</span>
        </span>
      </button>
      <nav class="ml-2 gap-1 hidden items-center lg:flex">
        <button class="text-xs font-medium px-3 py-1 rounded hover:bg-slate-100">
          文件
        </button>
        <button class="text-xs font-medium px-3 py-1 rounded hover:bg-slate-100">
          编辑
        </button>
        <button class="text-xs font-medium px-3 py-1 rounded hover:bg-slate-100">
          视图
        </button>
        <button class="text-xs text-blue-600 font-medium px-3 py-1 rounded bg-blue-50 hover:bg-blue-100">
          智能辅助
        </button>
      </nav>
    </div>
    <div class="flex gap-3 items-center">
      <div class="w-76 hidden relative lg:block">
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
      <div class="text-[11px] text-slate-500 text-right hidden lg:block">
        <div class="text-slate-700 font-medium max-w-64 truncate">
          {{ contestName }}
        </div>
        <div class="max-w-64 truncate">
          {{ trackName }}
        </div>
      </div>
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
