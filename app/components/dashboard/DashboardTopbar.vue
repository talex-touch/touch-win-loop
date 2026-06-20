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

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <header class="px-3 pr-16 border-b border-blue-100 bg-white shrink-0 h-14 relative overflow-visible md:px-4 md:pr-20">
    <div class="flex gap-3 h-full max-w-xl min-w-0 items-center">
      <NuxtLink to="/dashboard" class="text-white rounded-md bg-blue-700 flex shrink-0 h-9 w-9 items-center justify-center lg:hidden">
        <span class="material-symbols-outlined text-base">dashboard</span>
      </NuxtLink>
      <div class="min-w-0 w-full relative">
        <span class="material-symbols-outlined text-lg text-slate-400 left-3 top-1/2 absolute -translate-y-1/2">search</span>
        <input
          :value="modelValue"
          class="text-sm py-2 pl-9 pr-3 outline-none rounded-md border-none bg-slate-100 w-full transition-all focus:ring-2 focus:ring-blue-200"
          placeholder="搜索赛事、报告或团队..."
          type="text"
          @input="onInput"
        >
      </div>
    </div>

    <div class="right-3 top-1/2 absolute z-20 -translate-y-1/2 md:right-4">
      <NotificationBellButton :workspace-id="workspaceId" />
    </div>
  </header>
</template>
