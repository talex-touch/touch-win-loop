<script setup lang="ts">
import NotificationListContent from '~/components/notifications/NotificationListContent.vue'

const props = withDefaults(defineProps<{
  workspaceId?: string
}>(), {
  workspaceId: '',
})

const center = useNotificationCenter()
const {
  drawerVisible,
  markingAllRead,
  unreadCount,
} = center

watch(() => props.workspaceId, (value) => {
  center.setWorkspaceId(value)
}, { immediate: true })
</script>

<template>
  <a-drawer
    v-model:visible="drawerVisible"
    width="min(520px, calc(100vw - 24px))"
    unmount-on-close
    :footer="false"
    body-class="notification-drawer__body"
    class="notification-drawer"
    title="通知中心"
  >
    <template #title>
      <div class="notification-drawer__header">
        <div class="notification-drawer__title-group">
          <p class="notification-drawer__title">
            通知中心
          </p>
          <p class="notification-drawer__subtitle">
            当前未读 {{ unreadCount }}
          </p>
        </div>
        <button
          type="button"
          class="notification-drawer__mark-read"
          :disabled="markingAllRead || unreadCount <= 0"
          @click="center.markAllRead"
        >
          <span class="material-symbols-outlined notification-drawer__mark-read-icon" aria-hidden="true">
            check_circle
          </span>
          {{ markingAllRead ? '处理中...' : '全部已读' }}
        </button>
      </div>
    </template>

    <NotificationListContent surface="drawer" />
  </a-drawer>
</template>

<style scoped>
.notification-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-right: 28px;
}

.notification-drawer__title-group {
  min-width: 0;
}

.notification-drawer__title {
  margin: 0;
  color: #0f172a;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.25;
}

.notification-drawer__subtitle {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.3;
}

.notification-drawer__mark-read {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #bfdbfe;
  border-radius: 7px;
  background: #f8fbff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    opacity 0.18s ease;
}

.notification-drawer__mark-read:not(:disabled):hover {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}

.notification-drawer__mark-read:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.notification-drawer__mark-read-icon {
  font-size: 15px;
  line-height: 1;
  font-variation-settings:
    'FILL' 0,
    'wght' 420,
    'opsz' 20;
}

.notification-drawer :deep(.arco-drawer) {
  overflow: hidden;
  border-left: 1px solid rgba(226, 232, 240, 0.9);
  background: #f8fafc;
  box-shadow: -18px 0 42px rgba(15, 23, 42, 0.12);
}

.notification-drawer :deep(.arco-drawer-header) {
  min-height: 68px;
  padding: 18px 18px 12px 20px;
  border-bottom: 0;
  background: #f8fafc;
}

.notification-drawer :deep(.arco-drawer-title) {
  flex: 1;
  min-width: 0;
}

.notification-drawer :deep(.arco-drawer-close-btn) {
  top: 19px;
  right: 18px;
  color: #475569;
}

.notification-drawer :deep(.notification-drawer__body.arco-drawer-body) {
  display: flex;
  min-height: 0;
  padding: 0 20px 18px;
  background: #f8fafc;
}

@media (max-width: 560px) {
  .notification-drawer__header {
    gap: 10px;
    padding-right: 24px;
  }

  .notification-drawer__title {
    font-size: 16px;
  }

  .notification-drawer__mark-read {
    height: 26px;
    padding: 0 8px;
    font-size: 11px;
  }

  .notification-drawer :deep(.arco-drawer-header) {
    padding: 16px 14px 10px 16px;
  }

  .notification-drawer :deep(.notification-drawer__body.arco-drawer-body) {
    padding: 0 14px 14px;
  }
}
</style>
