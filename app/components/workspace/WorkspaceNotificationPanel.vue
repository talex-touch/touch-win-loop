<script setup lang="ts">
import NotificationListContent from '~/components/notifications/NotificationListContent.vue'

const props = withDefaults(defineProps<{
  workspaceId?: string
  active?: boolean
}>(), {
  workspaceId: '',
  active: false,
})

const center = useNotificationCenter()
const {
  initialized,
  markingAllRead,
  unreadCount,
} = center

const summaryText = computed(() => {
  return unreadCount.value > 0
    ? `当前未读 ${unreadCount.value}`
    : '暂无新消息'
})

watch(() => props.workspaceId, (value) => {
  center.setWorkspaceId(value)
  if (import.meta.client && props.active)
    void center.refresh()
}, { immediate: true })

watch(() => props.active, (next, previous) => {
  if (!import.meta.client || !next)
    return
  if (next === previous && initialized.value)
    return
  void center.refresh()
}, { immediate: true })
</script>

<template>
  <div class="workspace-left-panel__feature">
    <div class="workspace-left-panel__body no-scrollbar">
      <section class="workspace-notification-panel">
        <div class="workspace-notification-panel__header">
          <div>
            <h3>通知中心</h3>
          </div>
          <UiButton
            class="workspace-notification-panel__mark-read"
            variant="secondary"
            :loading="markingAllRead"
            :disabled="unreadCount <= 0"
            @click="center.markAllRead"
          >
            全部已读
          </UiButton>
        </div>

        <div class="workspace-notification-panel__summary">
          {{ summaryText }}
        </div>

        <NotificationListContent surface="workspace" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.workspace-notification-panel {
  margin: 0 12px 12px;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
}

.workspace-notification-panel h3 {
  margin: 0;
  color: #3b4a66;
  font-size: 13px;
  font-weight: 700;
}

.workspace-notification-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-notification-panel :deep(.workspace-notification-panel__mark-read.ui-button.arco-btn) {
  min-height: 34px;
  height: 34px;
  padding-inline: 12px;
  border-radius: 10px;
  font-size: 12px;
}

.workspace-notification-panel__summary {
  margin: 12px 0 10px;
  color: #4b5f82;
  font-size: 12px;
  font-weight: 600;
}
</style>
