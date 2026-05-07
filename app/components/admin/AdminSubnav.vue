<script setup lang="ts">
const route = useRoute()
const mobileExpanded = ref(false)

const items = [
  { to: '/admin', label: '管理首页' },
  { to: '/admin/contests', label: '赛事管理' },
  { to: '/admin/canvas-library', label: '画布资源库' },
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

const activeLabel = computed(() => {
  return items.find(item => item.to === activeKey.value)?.label || '管理导航'
})

function toggleMobileExpanded(): void {
  mobileExpanded.value = !mobileExpanded.value
}

function closeMobileExpanded(): void {
  mobileExpanded.value = false
}

watch(() => route.fullPath, () => {
  closeMobileExpanded()
})
</script>

<template>
  <SectionCard compact class="admin-subnav-card">
    <button
      type="button"
      class="admin-subnav-mobile-trigger"
      :aria-expanded="mobileExpanded ? 'true' : 'false'"
      aria-controls="admin-subnav-panel"
      @click="toggleMobileExpanded"
    >
      <span class="admin-subnav-mobile-label">{{ activeLabel }}</span>
      <span
        class="admin-subnav-mobile-icon i-heroicons-outline-chevron-down"
        :class="{ 'is-expanded': mobileExpanded }"
      />
    </button>
    <div
      id="admin-subnav-panel"
      class="admin-subnav-tabs"
      :class="{ 'is-mobile-expanded': mobileExpanded }"
    >
      <PillTabs :items="tabItems" :active-key="activeKey" />
    </div>
  </SectionCard>
</template>

<style scoped>
.admin-subnav-card {
  min-width: 0;
  overflow: hidden;
}

.admin-subnav-mobile-trigger {
  display: none;
}

.admin-subnav-tabs {
  min-width: 0;
}

:deep(.wl-pill-tabs) {
  min-width: 0;
}

@media (max-width: 640px) {
  .admin-subnav-mobile-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    border: 1px solid var(--wl-border);
    border-radius: var(--wl-radius-md);
    background: var(--wl-surface-muted);
    padding: 0 10px;
    color: var(--wl-text-primary);
    font-size: var(--wl-text-body-sm);
    font-weight: 700;
  }

  .admin-subnav-mobile-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-subnav-mobile-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    transition: transform 0.18s ease;
  }

  .admin-subnav-mobile-icon.is-expanded {
    transform: rotate(180deg);
  }

  .admin-subnav-tabs {
    display: none;
    margin-top: 8px;
  }

  .admin-subnav-tabs.is-mobile-expanded {
    display: block;
  }

  :deep(.wl-pill-tabs) {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
  }

  :deep(.wl-pill-tab) {
    width: 100%;
    justify-content: flex-start;
    border-radius: var(--wl-radius-md);
  }
}
</style>
