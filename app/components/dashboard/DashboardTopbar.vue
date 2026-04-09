<script setup lang="ts">
import NotificationBellButton from '~/components/notifications/NotificationBellButton.vue'

withDefaults(defineProps<{
  modelValue?: string
  workspaceId?: string
}>(), {
  modelValue: '',
  workspaceId: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const searchLabelId = 'dashboard-topbar-search-label'
const searchInputId = 'dashboard-topbar-search-input'

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <header class="px-4 py-4 relative z-10 md:px-8 md:py-5">
    <div class="flex flex-wrap gap-3 items-center justify-between">
      <div class="flex flex-1 gap-3 min-w-0 items-center">
        <NuxtLink
          to="/dashboard"
          class="db-btn db-btn-primary db-focus-ring px-0 shrink-0 h-11 w-11 lg:hidden"
          aria-label="返回仪表盘首页"
        >
          <span class="material-symbols-outlined text-lg">dashboard</span>
        </NuxtLink>

        <div class="db-panel db-panel-soft px-3 py-2.5 flex flex-1 gap-3 min-w-0 items-center md:px-4">
          <div class="text-[var(--db-primary)] rounded-2xl bg-[var(--db-primary-soft)] flex shrink-0 h-10 w-10 items-center justify-center">
            <span class="material-symbols-outlined text-[20px]">search</span>
          </div>
          <div class="flex-1 min-w-0">
            <label
              :id="searchLabelId"
              :for="searchInputId"
              class="text-[11px] text-[var(--db-subtle)] tracking-[0.14em] font-semibold uppercase"
            >
              工作台搜索
            </label>
            <input
              :id="searchInputId"
              :aria-labelledby="searchLabelId"
              :value="modelValue"
              class="db-focus-ring text-sm text-slate-900 mt-1 px-0 py-0 outline-none border-none bg-transparent w-full placeholder:text-slate-400"
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
        <NotificationBellButton :workspace-id="workspaceId" />
      </div>
    </div>
  </header>
</template>
