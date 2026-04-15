<script setup lang="ts">
import type { UserNotification } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  surface?: 'drawer' | 'workspace'
}>(), {
  surface: 'drawer',
})

const center = useNotificationCenter()
const {
  errorText,
  items,
  loading,
  loadingMore,
  nextCursor,
} = center

const isWorkspaceSurface = computed(() => props.surface === 'workspace')

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
</script>

<template>
  <div
    v-if="isWorkspaceSurface"
    data-testid="workspace-left-panel-notification-module"
    class="notification-list-content notification-list-content--workspace"
  >
    <div v-if="loading && items.length === 0" class="notification-list-content__state">
      <a-spin />
    </div>

    <div v-else-if="errorText && items.length === 0" class="notification-list-content__error">
      {{ errorText }}
    </div>

    <div v-else-if="items.length === 0" class="notification-list-content__state">
      <a-empty description="当前没有可展示的通知" />
    </div>

    <div v-else class="notification-list-content__workspace-stack">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="notification-list-content__workspace-item"
        :class="normalizeString(item.readAt)
          ? 'notification-list-content__workspace-item--read'
          : 'notification-list-content__workspace-item--unread'"
        @click="center.openNotification(item)"
      >
        <div class="notification-list-content__workspace-item-head">
          <div class="notification-list-content__workspace-item-main">
            <div class="notification-list-content__workspace-item-meta">
              <span class="notification-list-content__workspace-item-category">
                {{ categoryLabel(item) }}
              </span>
              <span
                v-if="!normalizeString(item.readAt)"
                class="notification-list-content__workspace-item-dot"
              />
            </div>
            <p class="notification-list-content__workspace-item-title">
              {{ item.title }}
            </p>
            <p class="notification-list-content__workspace-item-body">
              {{ item.body }}
            </p>
            <p
              v-if="normalizeString(item.payload?.fullBody) && normalizeString(item.payload?.fullBody) !== item.body"
              class="notification-list-content__workspace-item-extra"
            >
              {{ item.payload?.fullBody }}
            </p>
          </div>
          <span class="notification-list-content__workspace-item-time">
            {{ formatDateTime(item.createdAt) }}
          </span>
        </div>
        <div
          v-if="normalizeString(item.actionLabel)"
          class="notification-list-content__workspace-item-action"
        >
          {{ item.actionLabel }}
        </div>
      </button>
    </div>

    <button
      class="workspace-btn workspace-btn--ghost notification-list-content__workspace-more"
      type="button"
      :disabled="!nextCursor || loadingMore"
      @click="center.loadMore"
    >
      {{ loadingMore ? '加载中...' : (nextCursor ? '加载更多' : '没有更多通知') }}
    </button>
  </div>

  <div v-else class="flex flex-col h-full">
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
</template>

<style scoped>
.notification-list-content--workspace {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
}

.notification-list-content__workspace-stack {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 2px;
}

.notification-list-content__state {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-list-content__error {
  padding: 12px;
  border: 1px solid #fecdd3;
  border-radius: 12px;
  background: #fff1f2;
  color: #be123c;
  font-size: var(--wl-text-caption);
}

.notification-list-content__workspace-item {
  width: 100%;
  padding: 12px;
  border: 1px solid #dde6f3;
  border-radius: 14px;
  background: #ffffff;
  text-align: left;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

.notification-list-content__workspace-item--unread {
  border-color: #bfdbfe;
  background: rgba(239, 246, 255, 0.92);
}

.notification-list-content__workspace-item:hover {
  background: #f8fbff;
}

.notification-list-content__workspace-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.notification-list-content__workspace-item-main {
  min-width: 0;
  flex: 1;
}

.notification-list-content__workspace-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-list-content__workspace-item-category {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border: 1px solid #d6e1ef;
  border-radius: 999px;
  background: #ffffff;
  color: #64748b;
  font-size: 10px;
  line-height: 1;
}

.notification-list-content__workspace-item-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #f43f5e;
  flex-shrink: 0;
}

.notification-list-content__workspace-item-title {
  margin: 10px 0 0;
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
}

.notification-list-content__workspace-item-body {
  margin: 6px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.notification-list-content__workspace-item-extra {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 11px;
  line-height: 1.5;
}

.notification-list-content__workspace-item-time {
  color: #94a3b8;
  font-size: 10px;
  line-height: 1.3;
  flex-shrink: 0;
}

.notification-list-content__workspace-item-action {
  margin-top: 10px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 600;
}

.notification-list-content__workspace-more {
  width: 100%;
  justify-content: center;
}
</style>
