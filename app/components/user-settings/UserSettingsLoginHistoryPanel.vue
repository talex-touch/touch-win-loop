<script setup lang="ts">
import type { AuthSessionHistoryItem } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  authSessions?: AuthSessionHistoryItem[]
  authSessionsLoading?: boolean
  authSessionsError?: string
  formatDateTime: (value: string) => string
  resolveSessionStatusClass: (status: AuthSessionHistoryItem['status']) => string
  formatSessionStatusLabel: (status: AuthSessionHistoryItem['status']) => string
}>(), {
  authSessions: () => [],
  authSessionsLoading: false,
  authSessionsError: '',
})
</script>

<template>
  <div class="user-settings-panel user-settings-panel--stack">
    <p class="sr-only">
      个人登录历史
    </p>

    <p v-if="props.authSessionsError" class="user-settings-feedback user-settings-feedback--danger">
      {{ props.authSessionsError }}
    </p>

    <div v-else-if="props.authSessions.length > 0" class="user-settings-session-list">
      <div
        v-for="session in props.authSessions"
        :key="session.id"
        class="user-settings-session-item"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap gap-2 items-center">
            <p class="text-sm text-slate-900 font-semibold">
              {{ props.formatDateTime(session.createdAt) }}
            </p>
            <span :class="props.resolveSessionStatusClass(session.status)">
              {{ props.formatSessionStatusLabel(session.status) }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-2">
            有效至 {{ props.formatDateTime(session.expiresAt) }}
          </p>
          <p class="text-xs text-slate-400 font-mono mt-2 break-all">
            session: {{ session.id }}
          </p>
        </div>
      </div>
    </div>

    <div v-else class="user-settings-empty">
      {{ props.authSessionsLoading ? '登录历史加载中...' : '当前账号暂无可见登录历史。' }}
    </div>
  </div>
</template>
