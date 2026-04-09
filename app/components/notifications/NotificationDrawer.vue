<script setup lang="ts">
import type { UserNotification } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  workspaceId?: string
}>(), {
  workspaceId: '',
})

const center = useNotificationCenter()
const {
  drawerVisible,
  errorText,
  items,
  loading,
  loadingMore,
  markingAllRead,
  nextCursor,
  unreadCount,
} = center

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function categoryLabel(item: UserNotification): string {
  if (item.category === 'platform')
    return '平台'
  if (item.category === 'contest')
    return '比赛'
  return '协作'
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '-'

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

watch(() => props.workspaceId, (value) => {
  center.setWorkspaceId(value)
}, { immediate: true })
</script>

<template>
  <a-drawer
    :visible="drawerVisible"
    width="420px"
    unmount-on-close
    title="通知中心"
    @cancel="center.closeDrawer"
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

    <div class="flex flex-col h-full">
      <div v-if="loading && items.length === 0" class="py-12 flex items-center justify-center">
        <a-spin />
      </div>

      <div v-else-if="errorText && items.length === 0" class="text-[12px] text-rose-600 p-3 border border-rose-200 rounded bg-rose-50">
        {{ errorText }}
      </div>

      <div v-else-if="items.length === 0" class="py-12">
        <a-empty description="当前没有可展示的通知" />
      </div>

      <div v-else class="overflow-y-auto space-y-2">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="p-3 text-left border rounded-lg w-full transition-colors"
          :class="normalizeString(item.readAt)
            ? 'border-slate-200 bg-white hover:bg-slate-50'
            : 'border-blue-200 bg-blue-50/70 hover:bg-blue-50'"
          @click="center.openNotification(item)"
        >
          <div class="flex gap-2 items-start justify-between">
            <div class="min-w-0">
              <div class="flex gap-2 items-center">
                <span class="text-[10px] text-slate-500 px-1.5 py-0.5 border border-slate-200 rounded bg-white">
                  {{ categoryLabel(item) }}
                </span>
                <span v-if="!normalizeString(item.readAt)" class="border border-white rounded-full bg-rose-500 shrink-0 h-2 w-2" />
              </div>
              <p class="text-[13px] text-slate-900 font-semibold m-0 mt-2">
                {{ item.title }}
              </p>
              <p class="text-[12px] text-slate-600 leading-5 m-0 mt-1 whitespace-pre-wrap">
                {{ item.body }}
              </p>
              <p
                v-if="normalizeString(item.payload?.fullBody) && normalizeString(item.payload?.fullBody) !== item.body"
                class="text-[11px] text-slate-500 leading-5 m-0 mt-1 line-clamp-3"
              >
                {{ item.payload?.fullBody }}
              </p>
            </div>
            <span class="text-[10px] text-slate-400 shrink-0">
              {{ formatDateTime(item.createdAt) }}
            </span>
          </div>
          <div v-if="normalizeString(item.actionLabel)" class="text-[11px] text-blue-600 mt-2">
            {{ item.actionLabel }}
          </div>
        </button>
      </div>

      <div class="mt-3 pt-3 border-t border-slate-100">
        <a-button
          long
          type="outline"
          :disabled="!nextCursor || loadingMore"
          @click="center.loadMore"
        >
          {{ loadingMore ? '加载中...' : (nextCursor ? '加载更多' : '没有更多通知') }}
        </a-button>
      </div>
    </div>
  </a-drawer>
</template>
