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
  <header class="px-4 border-b border-blue-100 bg-white flex shrink-0 gap-4 h-16 items-center justify-between md:px-8">
    <div class="flex flex-1 gap-4 max-w-xl min-w-0 items-center">
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

    <div class="flex shrink-0 gap-4 items-center">
      <button class="rounded-lg flex h-10 w-10 items-center justify-center relative hover:bg-slate-100">
        <span class="material-symbols-outlined text-slate-600">notifications</span>
        <span class="border-2 border-white rounded-full bg-red-500 h-2 w-2 right-2 top-2 absolute" />
      </button>
    </div>
  </header>
</template>
