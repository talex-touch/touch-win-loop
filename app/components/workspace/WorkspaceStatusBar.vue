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
  <footer class="h-6 border-t border-slate-200 bg-white flex items-center justify-between px-3 shrink-0">
    <div class="flex items-center gap-4 text-[10px] text-slate-500 font-medium min-w-0">
      <div class="flex items-center gap-1">
        <span class="material-symbols-outlined text-[12px] text-blue-600">cloud_done</span>
        <span>已同步至云端</span>
      </div>
      <div class="hidden items-center gap-1 md:flex">
        <span class="material-symbols-outlined text-[12px]">code</span>
        <span>UTF-8</span>
      </div>
      <div class="truncate max-w-72">
        <span v-if="loading" class="inline-block h-2.5 w-28 rounded bg-slate-200 align-middle animate-pulse" />
        <span v-else>{{ statusLine || '系统就绪' }}</span>
      </div>
    </div>
    <div class="hidden md:flex items-center gap-4 text-[10px] text-slate-500 font-medium">
      <span>行 {{ line }}, 列 {{ column }}</span>
      <span>Space: 4</span>
      <span class="font-bold" :class="aiReady ? 'text-blue-600' : 'text-amber-600'">
        {{ aiReady ? 'Analysis Ready' : 'AI Working' }}
      </span>
    </div>
  </footer>
</template>
