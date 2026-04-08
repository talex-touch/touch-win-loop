<script setup lang="ts">
import {
  resolveWorkspaceCollabPresenceInitial,
  type WorkspaceCollabPresenceUser,
} from '~/components/workspace/collab/presence'

const props = withDefaults(defineProps<{
  users?: WorkspaceCollabPresenceUser[]
}>(), {
  users: () => [],
})

const presenceCount = computed(() => props.users.length)

function roleLabel(role: WorkspaceCollabPresenceUser['role']): string {
  if (role === 'owner')
    return '所有者'
  if (role === 'manager')
    return '管理者'
  if (role === 'editor')
    return '编辑者'
  if (role === 'viewer')
    return '查看者'
  return '未分配角色'
}

function activityStateLabel(user: WorkspaceCollabPresenceUser): string {
  return user.activityState === 'background' ? '后台协作中' : '在线协作中'
}

function formatDateTime(value?: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '-'

  const date = new Date(normalized)
  if (!Number.isFinite(date.getTime()))
    return normalized

  return date.toLocaleString('zh-CN', { hour12: false })
}

function selectionRangeText(user: WorkspaceCollabPresenceUser): string {
  const selection = user.selection
  if (!selection)
    return '光标信息待同步'
  if (selection.isCollapsed)
    return `位置 行 ${selection.headLine}，列 ${selection.headColumn}`
  return `范围 ${selection.anchorLine}:${selection.anchorColumn} - ${selection.headLine}:${selection.headColumn}`
}

function selectionPreviewText(user: WorkspaceCollabPresenceUser): string {
  const selection = user.selection
  if (!selection || selection.isCollapsed || !selection.selectedTextPreview)
    return '未选中文本'
  return `已选 ${selection.selectionLength} 字 · ${selection.selectedTextPreview}`
}
</script>

<template>
  <section class="border-t border-slate-200 bg-white/95 backdrop-blur-md" data-testid="collab-presence-dock">
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div>
        <p class="text-xs font-semibold text-slate-800">
          在线成员（{{ presenceCount }}）
        </p>
        <p class="mt-0.5 text-[11px] text-slate-500">
          当前光标位置、选区范围与文本摘要会随编辑实时同步。
        </p>
      </div>
    </div>

    <div v-if="users.length > 0" class="divide-y divide-slate-100">
      <article
        v-for="user in users"
        :key="user.userId"
        class="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between"
      >
        <div class="flex min-w-0 flex-1 items-start gap-3">
          <div
            class="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white"
            :style="{ borderColor: user.colorToken }"
          >
            <img
              v-if="user.avatarUrl"
              :src="user.avatarUrl"
              :alt="user.username"
              class="h-full w-full object-cover"
            >
            <span
              v-else
              class="flex h-full w-full items-center justify-center text-xs font-semibold"
              :style="{ backgroundColor: `${user.colorToken}1A`, color: user.colorToken }"
            >
              {{ resolveWorkspaceCollabPresenceInitial(user.username) }}
            </span>
            <span
              class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
              :style="{ backgroundColor: user.activityState === 'background' ? '#94a3b8' : user.colorToken }"
            />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="max-w-full truncate text-sm font-semibold text-slate-900">
                {{ user.username }}
              </p>
              <span
                v-if="user.isCurrentUser"
                class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
              >
                我
              </span>
              <span class="rounded-full px-2 py-0.5 text-[10px] font-medium" :class="user.activityState === 'background' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'">
                {{ activityStateLabel(user) }}
              </span>
              <span v-if="user.peerCount > 1" class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                {{ user.peerCount }} 个会话
              </span>
            </div>
            <p class="mt-1 text-[11px] text-slate-500">
              {{ roleLabel(user.role) }}
            </p>
            <p class="mt-2 text-xs font-medium text-slate-700">
              {{ selectionRangeText(user) }}
            </p>
            <p class="mt-1 text-[11px] text-slate-500">
              {{ selectionPreviewText(user) }}
            </p>
          </div>
        </div>

        <div class="shrink-0 text-[11px] text-slate-400">
          最后活跃 {{ formatDateTime(user.updatedAt) }}
        </div>
      </article>
    </div>

    <div v-else class="px-4 py-4 text-[11px] text-slate-400">
      暂无在线成员
    </div>
  </section>
</template>
