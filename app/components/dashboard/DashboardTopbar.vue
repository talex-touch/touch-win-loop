<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: string
  analystName?: string
  analystTier?: string
}>(), {
  modelValue: '',
  analystName: '分析师 张明',
  analystTier: '高级会员',
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
      <div class="bg-slate-200 h-8 w-px hidden sm:block" />
      <div class="pl-2 gap-3 hidden items-center sm:flex">
        <div class="text-right">
          <p class="text-sm font-semibold">
            {{ analystName }}
          </p>
          <p class="text-xs text-slate-500">
            {{ analystTier }}
          </p>
        </div>
        <img
          class="border border-slate-200 rounded-full h-10 w-10 object-cover"
          alt="用户头像"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAgO3szaJLN0mB5xXQFUAcenjGXOhK0fc6jH78_wVb6AgKHW2rx7If2DG7Zro9-woZuymuskn7rGkTJWIN-l2SRqi6dvqXNZqAE8LUhcHv4Z7uY-ptVO0eKI9sZzfUw9Jp1lzLiYTdYykbvVyXdkKLj9TeWaK9DipDXCk0g0Tgtir3CsIXTaFlEbB7EtggaKgtgnWMXjiAiW1uwj-4mVXyLJqdaJfAvFHWfRaX1dosZdLgVxspcp2tPArmit3IFKKQ4HpECByj_ZGI1"
        >
      </div>
    </div>
  </header>
</template>
