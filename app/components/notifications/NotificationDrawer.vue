<script setup lang="ts">
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
    width="420px"
    unmount-on-close
    title="通知中心"
  >
    <template #title>
      <div class="pr-4 flex items-center justify-between">
        <div>
          <p class="text-sm text-slate-900 font-semibold m-0">
            通知中心
          </p>
          <p class="text-[11px] text-slate-500 m-0 mt-1">
            当前未读 {{ unreadCount }}
          </p>
        </div>
        <a-button
          size="mini"
          type="outline"
          :disabled="markingAllRead || unreadCount <= 0"
          @click="center.markAllRead"
        >
          {{ markingAllRead ? '处理中...' : '全部已读' }}
        </a-button>
      </div>
    </template>

    <NotificationListContent surface="drawer" />
  </a-drawer>
</template>
