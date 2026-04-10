<script setup lang="ts">
import NotificationDrawer from './NotificationDrawer.vue'

const props = withDefaults(defineProps<{
  workspaceId?: string
  compact?: boolean
  variant?: 'default' | 'rail'
}>(), {
  workspaceId: '',
  compact: false,
  variant: 'default',
})

const emit = defineEmits<{
  open: []
}>()

const center = useNotificationCenter()
const { initialized, unreadCount } = center

watch(() => props.workspaceId, (value) => {
  center.setWorkspaceId(value)
  if (import.meta.client && !initialized.value)
    void center.refresh({ silent: true })
}, { immediate: true })

const isRailVariant = computed(() => props.variant === 'rail')

function openDrawer() {
  emit('open')
  void center.openDrawer()
}
</script>

<template>
  <div class="inline-flex relative">
    <button
      type="button"
      aria-label="打开通知中心"
      class="notification-bell-button"
      :class="[
        isRailVariant
          ? 'notification-bell-button--rail'
          : 'border border-slate-200 rounded-xl bg-white shadow-sm hover:bg-slate-50',
        !isRailVariant && props.compact ? 'h-8 w-8' : '',
        !isRailVariant && !props.compact ? 'h-10 w-10' : '',
      ]"
      @click="openDrawer"
    >
      <span
        class="material-symbols-outlined text-slate-600"
        :class="isRailVariant ? 'notification-bell-button__icon--rail' : (props.compact ? 'text-xl' : 'text-[22px]')"
      >
        notifications
      </span>
      <span
        v-if="unreadCount > 0"
        class="notification-bell-button__badge"
        :class="isRailVariant ? 'notification-bell-button__badge--rail' : 'right-1 top-1'"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
      <span v-if="isRailVariant" class="notification-bell-button__popover" aria-hidden="true">
        通知中心
      </span>
    </button>

    <NotificationDrawer :workspace-id="props.workspaceId" />
  </div>
</template>

<style scoped>
.notification-bell-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.notification-bell-button--rail {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #6b7b95;
}

.notification-bell-button--rail:hover,
.notification-bell-button--rail:focus-visible {
  background: #f4f7fc;
  color: #3a557f;
}

.notification-bell-button--rail:focus-visible {
  outline: 2px solid #cddcf7;
  outline-offset: 1px;
}

.notification-bell-button__icon--rail {
  font-size: 23px;
  line-height: 1;
  font-variation-settings:
    'FILL' 0,
    'wght' 320,
    'opsz' 24;
}

.notification-bell-button__badge {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #f43f5e;
  color: #ffffff;
  font-size: 10px;
  line-height: 1;
}

.notification-bell-button__badge--rail {
  top: 5px;
  right: 4px;
}

.notification-bell-button__popover {
  position: absolute;
  top: 50%;
  left: calc(100% + 10px);
  transform: translateY(-50%);
  padding: 6px 9px;
  border: 1px solid rgba(214, 222, 236, 0.96);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  color: #334155;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(31, 45, 70, 0.12);
  pointer-events: auto;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    visibility 0.16s ease;
  z-index: 40;
}

.notification-bell-button--rail:hover .notification-bell-button__popover,
.notification-bell-button--rail:focus-visible .notification-bell-button__popover {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0);
}
</style>
