<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: string
}>(), {
  modelValue: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <header class="relative z-10 px-4 py-4 md:px-8 md:py-5">
    <div class="flex flex-wrap gap-3 items-center justify-between">
      <div class="flex flex-1 gap-3 min-w-0 items-center">
        <NuxtLink
          to="/dashboard"
          class="db-btn db-btn-primary db-focus-ring h-11 w-11 px-0 shrink-0 lg:hidden"
          aria-label="返回仪表盘首页"
        >
          <span class="material-symbols-outlined text-lg">dashboard</span>
        </NuxtLink>

        <div class="db-panel db-panel-soft flex flex-1 gap-3 items-center min-w-0 px-3 py-2.5 md:px-4">
          <div class="rounded-2xl bg-[var(--db-primary-soft)] text-[var(--db-primary)] flex h-10 w-10 shrink-0 items-center justify-center">
            <span class="material-symbols-outlined text-[20px]">search</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[11px] text-[var(--db-subtle)] font-semibold tracking-[0.14em] uppercase">
              工作台搜索
            </p>
            <input
              :value="modelValue"
              class="db-focus-ring text-sm text-slate-900 bg-transparent border-none outline-none mt-1 px-0 py-0 w-full placeholder:text-slate-400"
              placeholder="搜索赛事、洞察或项目台入口"
              type="text"
              @input="onInput"
            >
          </div>
        </div>
      </div>

      <div class="flex shrink-0 gap-3 items-center">
        <div class="db-chip db-chip-muted hidden md:inline-flex">
          <span class="material-symbols-outlined text-base">space_dashboard</span>
          仪表盘概览
        </div>
        <button class="db-btn db-btn-ghost db-focus-ring h-11 w-11 px-0 relative" type="button" aria-label="通知中心">
          <span class="material-symbols-outlined text-slate-600">notifications</span>
          <span class="border-2 border-white rounded-full bg-rose-500 h-2.5 w-2.5 right-2.5 top-2.5 absolute" />
        </button>
      </div>
    </div>
  </header>
</template>
