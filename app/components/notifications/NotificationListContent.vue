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

  <div v-else class="notification-list-content notification-list-content--drawer">
    <div v-if="loading && items.length === 0" class="notification-list-content__drawer-state">
      <a-spin />
    </div>

    <div v-else-if="errorText && items.length === 0" class="notification-list-content__drawer-error">
      {{ errorText }}
    </div>

    <div v-else-if="items.length === 0" class="notification-list-content__drawer-state">
      <a-empty description="当前没有可展示的通知" />
    </div>

    <div v-else class="notification-list-content__drawer-stack">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="notification-list-content__drawer-item"
        :class="normalizeString(item.readAt)
          ? 'notification-list-content__drawer-item--read'
          : 'notification-list-content__drawer-item--unread'"
        @click="center.openNotification(item)"
      >
        <div class="notification-list-content__drawer-item-head">
          <div class="notification-list-content__drawer-item-main">
            <div class="notification-list-content__drawer-item-meta">
              <span class="notification-list-content__drawer-item-category">
                {{ categoryLabel(item) }}
              </span>
              <span
                v-if="!normalizeString(item.readAt)"
                class="notification-list-content__drawer-item-dot"
              />
            </div>
            <p class="notification-list-content__drawer-item-title">
              {{ item.title }}
            </p>
            <p class="notification-list-content__drawer-item-body">
              {{ item.body }}
            </p>
            <p
              v-if="normalizeString(item.payload?.fullBody) && normalizeString(item.payload?.fullBody) !== item.body"
              class="notification-list-content__drawer-item-extra"
            >
              {{ item.payload?.fullBody }}
            </p>
          </div>
          <span class="notification-list-content__drawer-item-time">
            {{ formatDateTime(item.createdAt) }}
          </span>
        </div>
        <div v-if="normalizeString(item.actionLabel)" class="notification-list-content__drawer-item-action">
          {{ item.actionLabel }}
        </div>
      </button>
    </div>

    <div class="notification-list-content__drawer-more-shell">
      <button
        class="notification-list-content__drawer-more"
        type="button"
        :disabled="!nextCursor || loadingMore"
        @click="center.loadMore"
      >
        {{ loadingMore ? '加载中...' : (nextCursor ? '加载更多' : '没有更多通知') }}
      </button>
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

.notification-list-content--drawer {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.notification-list-content__drawer-stack {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 0 2px 2px;
}

.notification-list-content__drawer-state {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-list-content__drawer-error {
  margin-top: 4px;
  padding: 12px 14px;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  background: #fff1f2;
  color: #be123c;
  font-size: 12px;
  line-height: 1.6;
}

.notification-list-content__drawer-item {
  width: 100%;
  padding: 14px 14px 13px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  text-align: left;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.notification-list-content__drawer-item--unread {
  border-color: #dbeafe;
}

.notification-list-content__drawer-item:hover {
  border-color: #c7d2fe;
  background: #fbfdff;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.notification-list-content__drawer-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.notification-list-content__drawer-item-main {
  min-width: 0;
  flex: 1;
}

.notification-list-content__drawer-item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notification-list-content__drawer-item-category {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  background: #eef4ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.notification-list-content__drawer-item-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #f43f5e;
  flex-shrink: 0;
}

.notification-list-content__drawer-item-title {
  margin: 12px 0 0;
  color: #111827;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.notification-list-content__drawer-item-body {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.notification-list-content__drawer-item-extra {
  display: -webkit-box;
  margin: 5px 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: #718096;
  font-size: 11px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.notification-list-content__drawer-item-time {
  margin-top: 2px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  flex-shrink: 0;
}

.notification-list-content__drawer-item-action {
  margin-top: 12px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.notification-list-content__drawer-more-shell {
  flex-shrink: 0;
  padding-top: 12px;
}

.notification-list-content__drawer-more {
  position: relative;
  display: flex;
  width: 100%;
  height: 34px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 1px solid #dbeafe;
  border-radius: 7px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  line-height: 1;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.notification-list-content__drawer-more::before,
.notification-list-content__drawer-more::after {
  content: '';
  width: min(92px, 24%);
  height: 1px;
  background: #e2e8f0;
}

.notification-list-content__drawer-more:not(:disabled):hover {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.notification-list-content__drawer-more:disabled {
  cursor: default;
}

@media (max-width: 560px) {
  .notification-list-content__drawer-stack {
    gap: 10px;
  }

  .notification-list-content__drawer-item {
    padding: 13px 12px 12px;
  }

  .notification-list-content__drawer-item-head {
    gap: 10px;
  }

  .notification-list-content__drawer-item-title {
    font-size: 13px;
  }

  .notification-list-content__drawer-item-time {
    font-size: 10px;
  }
}
</style>
