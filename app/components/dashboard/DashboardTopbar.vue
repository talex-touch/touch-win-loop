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
  <header class="px-4 pr-20 border-b border-blue-100 bg-white shrink-0 h-16 relative overflow-visible md:px-8 md:pr-24">
    <div class="flex gap-4 h-full max-w-xl min-w-0 items-center">
      <NuxtLink to="/dashboard" class="text-white rounded-lg bg-blue-700 flex shrink-0 h-10 w-10 items-center justify-center lg:hidden">
        <span class="material-symbols-outlined text-lg">dashboard</span>
      </NuxtLink>
      <div class="min-w-0 w-full relative">
        <span class="material-symbols-outlined text-xl text-slate-400 left-3 top-1/2 absolute -translate-y-1/2">search</span>
        <input
          :value="modelValue"
          class="text-sm py-2 pl-10 pr-4 outline-none rounded-lg border-none bg-slate-100 w-full transition-all focus:ring-2 focus:ring-blue-200"
          placeholder="搜索赛事、报告或团队..."
          type="text"
          @input="onInput"
        >
      </div>
    </div>

    <div class="right-4 top-1/2 absolute z-20 -translate-y-1/2 md:right-8">
      <NotificationBellButton :workspace-id="workspaceId" />
    </div>
  </header>
</template>
