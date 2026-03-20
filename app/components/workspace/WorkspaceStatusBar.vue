<script setup lang="ts">
withDefaults(defineProps<{
  statusLine?: string
  loading?: boolean
  aiReady?: boolean
  line?: number
  column?: number
}>(), {
  statusLine: '',
  loading: false,
  aiReady: true,
  line: 12,
  column: 45,
})
</script>

<template>
  <footer class="px-3 border-t border-slate-200 bg-white flex shrink-0 h-6 items-center justify-between">
    <div class="text-[10px] text-slate-500 font-medium flex gap-4 min-w-0 items-center">
      <div class="flex gap-1 items-center">
        <span class="material-symbols-outlined text-[12px] text-blue-600">cloud_done</span>
        <span>已同步至云端</span>
      </div>
      <div class="gap-1 hidden items-center md:flex">
        <span class="material-symbols-outlined text-[12px]">code</span>
        <span>UTF-8</span>
      </div>
      <div class="max-w-72 truncate">
        <span v-if="loading" class="align-middle rounded bg-slate-200 h-2.5 w-28 inline-block animate-pulse" />
        <span v-else>{{ statusLine || '系统就绪' }}</span>
      </div>
    </div>
    <div class="text-[10px] text-slate-500 font-medium gap-4 hidden items-center md:flex">
      <span>行 {{ line }}, 列 {{ column }}</span>
      <span>Space: 4</span>
      <span class="font-bold" :class="aiReady ? 'text-blue-600' : 'text-amber-600'">
        {{ aiReady ? 'Analysis Ready' : 'AI Working' }}
      </span>
    </div>
  </footer>
</template>
