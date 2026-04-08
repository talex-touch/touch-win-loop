<script setup lang="ts">
import NotificationDrawer from './NotificationDrawer.vue'

const props = withDefaults(defineProps<{
  workspaceId?: string
  compact?: boolean
}>(), {
  workspaceId: '',
  compact: false,
})

const center = useNotificationCenter()
const { initialized, unreadCount } = center

watch(() => props.workspaceId, (value) => {
  center.setWorkspaceId(value)
  if (import.meta.client && !initialized.value)
    void center.refresh({ silent: true })
}, { immediate: true })
</script>

<template>
  <div class="relative">
    <button
      type="button"
      aria-label="打开通知中心"
      class="border border-slate-200 rounded-xl bg-white shadow-sm flex items-center justify-center relative transition-colors hover:bg-slate-50"
      :class="props.compact ? 'h-8 w-8' : 'h-10 w-10'"
      @click="center.openDrawer"
    >
      <span class="material-symbols-outlined text-slate-600" :class="props.compact ? 'text-xl' : 'text-[22px]'">notifications</span>
      <span
        v-if="unreadCount > 0"
        class="text-[10px] text-white rounded-full bg-rose-500 min-w-[16px] h-4 px-1 top-1 right-1 absolute flex items-center justify-center"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <NotificationDrawer :workspace-id="props.workspaceId" />
  </div>
</template>
