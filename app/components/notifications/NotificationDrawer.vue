<script setup lang="ts">
import type { UserNotification } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  workspaceId?: string
  variant?: 'default' | 'rail'
}>(), {
  workspaceId: '',
  variant: 'default',
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

const isRailVariant = computed(() => props.variant === 'rail')

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
  <transition v-if="isRailVariant" name="notification-drawer-aside">
    <aside
      v-if="drawerVisible"
      data-testid="workspace-left-rail-notification-aside"
      class="notification-drawer-aside"
      aria-label="通知中心"
    >
      <div class="notification-drawer-aside__header">
        <div>
          <p class="notification-drawer-aside__title">
            通知中心
          </p>
          <p class="notification-drawer-aside__subtitle">
            当前未读 {{ unreadCount }}
          </p>
        </div>
        <div class="notification-drawer-aside__actions">
          <button
            class="notification-drawer-aside__action"
            type="button"
            :disabled="markingAllRead || unreadCount <= 0"
            @click="center.markAllRead"
          >
            {{ markingAllRead ? '处理中...' : '全部已读' }}
          </button>
          <button
            class="notification-drawer-aside__action"
            type="button"
            @click="center.closeDrawer"
          >
            收起
          </button>
        </div>
      </div>

      <div class="notification-drawer-aside__body">
        <div v-if="loading && items.length === 0" class="notification-drawer-aside__state">
          <a-spin />
        </div>

        <div v-else-if="errorText && items.length === 0" class="notification-drawer-aside__error">
          {{ errorText }}
        </div>

        <div v-else-if="items.length === 0" class="notification-drawer-aside__state">
          <a-empty description="当前没有可展示的通知" />
        </div>

        <div v-else class="notification-drawer-aside__list">
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="notification-drawer-aside__item"
            :class="normalizeString(item.readAt)
              ? 'notification-drawer-aside__item--read'
              : 'notification-drawer-aside__item--unread'"
            @click="center.openNotification(item)"
          >
            <div class="notification-drawer-aside__item-header">
              <div class="notification-drawer-aside__item-main">
                <div class="notification-drawer-aside__item-meta">
                  <span class="notification-drawer-aside__item-category">
                    {{ categoryLabel(item) }}
                  </span>
                  <span v-if="!normalizeString(item.readAt)" class="notification-drawer-aside__item-dot" />
                </div>
                <p class="notification-drawer-aside__item-title">
                  {{ item.title }}
                </p>
                <p class="notification-drawer-aside__item-body">
                  {{ item.body }}
                </p>
                <p
                  v-if="normalizeString(item.payload?.fullBody) && normalizeString(item.payload?.fullBody) !== item.body"
                  class="notification-drawer-aside__item-extra"
                >
                  {{ item.payload?.fullBody }}
                </p>
              </div>
              <span class="notification-drawer-aside__item-time">
                {{ formatDateTime(item.createdAt) }}
              </span>
            </div>
            <div v-if="normalizeString(item.actionLabel)" class="notification-drawer-aside__item-action">
              {{ item.actionLabel }}
            </div>
          </button>
        </div>
      </div>

      <div class="notification-drawer-aside__footer">
        <button
          class="notification-drawer-aside__footer-button"
          type="button"
          :disabled="!nextCursor || loadingMore"
          @click="center.loadMore"
        >
          {{ loadingMore ? '加载中...' : (nextCursor ? '加载更多' : '没有更多通知') }}
        </button>
      </div>
    </aside>
  </transition>

  <a-drawer
    v-else
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

<style scoped>
.notification-drawer-aside {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 100%;
  width: min(var(--workspace-left-panel-width, 304px), calc(100vw - 108px));
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px 16px;
  border: 1px solid #dde6f3;
  border-left-color: #e7edf7;
  border-radius: 0 20px 20px 0;
  background: linear-gradient(180deg, #fcfdff 0%, #f7fbff 100%);
  box-shadow: 18px 0 38px rgba(29, 43, 66, 0.12);
  overflow: hidden;
  z-index: 60;
}

.notification-drawer-aside__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.notification-drawer-aside__title {
  margin: 0;
  color: #2f466d;
  font-size: var(--wl-text-body-sm);
  font-weight: 700;
}

.notification-drawer-aside__subtitle {
  margin: 4px 0 0;
  color: #8190a7;
  font-size: var(--wl-text-caption);
}

.notification-drawer-aside__actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.notification-drawer-aside__action,
.notification-drawer-aside__footer-button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d6e1ef;
  border-radius: 8px;
  background: #ffffff;
  color: #45608d;
  font-size: var(--wl-text-caption);
  cursor: pointer;
}

.notification-drawer-aside__action:hover,
.notification-drawer-aside__footer-button:hover {
  background: #eef5ff;
}

.notification-drawer-aside__action:disabled,
.notification-drawer-aside__footer-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.notification-drawer-aside__body {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 12px;
  overflow-y: auto;
  padding-right: 2px;
}

.notification-drawer-aside__state {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-drawer-aside__error {
  padding: 12px;
  border: 1px solid #fecdd3;
  border-radius: 12px;
  background: #fff1f2;
  color: #be123c;
  font-size: var(--wl-text-caption);
}

.notification-drawer-aside__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-drawer-aside__item {
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

.notification-drawer-aside__item--unread {
  border-color: #bfdbfe;
  background: rgba(239, 246, 255, 0.92);
}

.notification-drawer-aside__item:hover {
  background: #f8fbff;
}

.notification-drawer-aside__item-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.notification-drawer-aside__item-main {
  min-width: 0;
  flex: 1;
}

.notification-drawer-aside__item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-drawer-aside__item-category {
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

.notification-drawer-aside__item-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #f43f5e;
  flex-shrink: 0;
}

.notification-drawer-aside__item-title {
  margin: 10px 0 0;
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
}

.notification-drawer-aside__item-body {
  margin: 6px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.notification-drawer-aside__item-extra {
  margin: 6px 0 0;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.6;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.notification-drawer-aside__item-time {
  color: #94a3b8;
  font-size: 10px;
  line-height: 1.2;
  flex-shrink: 0;
}

.notification-drawer-aside__item-action {
  margin-top: 10px;
  color: #2563eb;
  font-size: 11px;
}

.notification-drawer-aside__footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e8eef7;
}

.notification-drawer-aside__footer-button {
  width: 100%;
}

.notification-drawer-aside-enter-active,
.notification-drawer-aside-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.notification-drawer-aside-enter-from,
.notification-drawer-aside-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}
</style>
