<script setup lang="ts">
const route = useRoute()

const items = [
  { to: '/admin', label: '管理首页' },
  { to: '/admin/contests', label: '赛事管理' },
  { to: '/admin/integrations', label: '集成中心' },
  { to: '/admin/billing', label: '套餐计费' },
  { to: '/admin/roles', label: '角色分配' },
]

function isActive(path: string): boolean {
  if (path === '/admin')
    return route.path === '/admin'
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<template>
  <nav class="p-2 border border-slate-200 rounded-lg bg-white">
    <div class="flex flex-wrap gap-2">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="text-xs font-medium px-3 py-1.5 rounded transition-colors"
        :class="isActive(item.to)
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
      >
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
