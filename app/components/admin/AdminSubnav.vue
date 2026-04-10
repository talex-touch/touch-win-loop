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

const tabItems = computed(() => {
  return items.map(item => ({
    key: item.to,
    label: item.label,
    to: item.to,
  }))
})

const activeKey = computed(() => {
  const current = items.find(item => isActive(item.to))
  return current?.to || ''
})
</script>

<template>
  <SectionCard compact>
    <PillTabs :items="tabItems" :active-key="activeKey" />
  </SectionCard>
</template>
