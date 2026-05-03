<script setup lang="ts">
const props = defineProps<{
  contestId: string
}>()

const route = useRoute()
const mobileExpanded = ref(false)

const tabItems = computed(() => {
  const id = props.contestId
  return [
    { key: 'overview', label: '概览', to: `/admin/contests/${id}` },
    { key: 'basic', label: '基础信息', to: `/admin/contests/${id}/overview/edit` },
    { key: 'faq', label: 'FAQ', to: `/admin/contests/${id}/faq` },
    { key: 'tracks', label: '赛道', to: `/admin/contests/${id}/tracks` },
    { key: 'track-timelines', label: '赛道时间线', to: `/admin/contests/${id}/track-timelines` },
    { key: 'timelines', label: '时间节点', to: `/admin/contests/${id}/timelines` },
    { key: 'rubrics', label: '评委细则', to: `/admin/contests/${id}/rubrics` },
    { key: 'guidelines', label: '赛道详解', to: `/admin/contests/${id}/judge-guidelines` },
    { key: 'resources', label: '资料', to: `/admin/contests/${id}/resources` },
    { key: 'releases', label: '版本发布', to: `/admin/contests/${id}/releases` },
    { key: 'knowledge', label: '知识库治理', to: `/admin/contests/${id}/knowledge` },
    { key: 'prompts', label: 'AI提示词', to: `/admin/contests/${id}/ai-prompts` },
    { key: 'audit', label: '审计历史', to: `/admin/contests/${id}/audit` },
  ]
})

function isActive(to: string): boolean {
  if (to === `/admin/contests/${props.contestId}`)
    return route.path === to
  return route.path === to || route.path.startsWith(`${to}/`)
}

const tabs = computed(() => {
  return tabItems.value.map(item => ({
    key: item.key,
    label: item.label,
    to: item.to,
  }))
})

const activeKey = computed(() => {
  return tabItems.value.find(item => isActive(item.to))?.key || ''
})

const activeLabel = computed(() => {
  return tabItems.value.find(item => item.key === activeKey.value)?.label || '竞赛模块'
})

const mobilePanelId = computed(() => `contest-workspace-tabs-${props.contestId || 'current'}`)

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
  <SectionCard compact class="contest-workspace-tabs-card">
    <button
      type="button"
      class="contest-workspace-tabs-mobile-trigger"
      :aria-expanded="mobileExpanded ? 'true' : 'false'"
      :aria-controls="mobilePanelId"
      @click="toggleMobileExpanded"
    >
      <span class="contest-workspace-tabs-mobile-label">{{ activeLabel }}</span>
      <span
        class="contest-workspace-tabs-mobile-icon i-heroicons-outline-chevron-down"
        :class="{ 'is-expanded': mobileExpanded }"
      />
    </button>
    <div
      :id="mobilePanelId"
      class="contest-workspace-tabs-panel"
      :class="{ 'is-mobile-expanded': mobileExpanded }"
    >
      <PillTabs :items="tabs" :active-key="activeKey" />
    </div>
  </SectionCard>
</template>

<style scoped>
.contest-workspace-tabs-card {
  min-width: 0;
  overflow: hidden;
}

.contest-workspace-tabs-mobile-trigger {
  display: none;
}

.contest-workspace-tabs-panel {
  min-width: 0;
}

:deep(.wl-pill-tabs) {
  min-width: 0;
}

@media (max-width: 640px) {
  .contest-workspace-tabs-mobile-trigger {
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

  .contest-workspace-tabs-mobile-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contest-workspace-tabs-mobile-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    transition: transform 0.18s ease;
  }

  .contest-workspace-tabs-mobile-icon.is-expanded {
    transform: rotate(180deg);
  }

  .contest-workspace-tabs-panel {
    display: none;
    margin-top: 8px;
  }

  .contest-workspace-tabs-panel.is-mobile-expanded {
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
