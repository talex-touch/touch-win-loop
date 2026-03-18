<script setup lang="ts">
const route = useRoute()

const links = [
  { to: '/dashboard', label: '首页' },
  { to: '/workspace', label: '工作台' },
  { to: '/contests', label: '竞赛库' },
  { to: '/resources', label: '资料中心' },
  { to: '/topics', label: '选题建议' },
  { to: '/reviews', label: '作品评审' },
  { to: '/defense', label: '模拟答辩' },
]

const hideGlobalHeader = computed(() => route.path.startsWith('/workspace'))
</script>

<template>
  <div class="text-black bg-white min-h-screen">
    <header v-if="!hideGlobalHeader" class="px-2 border-b border-gray-300 flex gap-2 h-11 items-center justify-between">
      <div class="text-xs tracking-wide font-semibold whitespace-nowrap">
        WINLOOP AI WORKBENCH
      </div>
      <nav class="flex gap-1 items-center overflow-x-auto">
        <NuxtLink
          v-for="item in links"
          :key="item.to"
          :to="item.to"
          class="text-xs px-2 py-1 border border-transparent whitespace-nowrap hover:border-gray-300"
          active-class="border-gray-900 font-semibold"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </header>
    <main :class="hideGlobalHeader ? 'min-h-screen' : 'min-h-[calc(100vh-44px)]'">
      <slot />
    </main>
  </div>
</template>
