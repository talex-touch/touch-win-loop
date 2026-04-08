<script setup lang="ts">
import type { WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import {
  resolveWorkspaceCollabPresenceInitial,

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
    <div class="px-4 py-3 flex flex-wrap gap-2 items-center justify-between">
      <div>
        <p class="text-xs text-slate-800 font-semibold">
          在线成员（{{ presenceCount }}）
        </p>
        <p class="text-[11px] text-slate-500 mt-0.5">
          当前光标位置、选区范围与文本摘要会随编辑实时同步。
        </p>
      </div>
    </div>

    <div v-if="users.length > 0" class="divide-slate-100 divide-y">
      <article
        v-for="user in users"
        :key="user.userId"
        class="px-4 py-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
      >
        <div class="flex flex-1 gap-3 min-w-0 items-start">
          <div
            class="border-2 rounded-full bg-white flex shrink-0 h-10 w-10 items-center justify-center relative overflow-hidden"
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
              class="text-xs font-semibold flex h-full w-full items-center justify-center"
              :style="{ backgroundColor: `${user.colorToken}1A`, color: user.colorToken }"
            >
              {{ resolveWorkspaceCollabPresenceInitial(user.username) }}
            </span>
            <span
              class="rounded-full h-2.5 w-2.5 absolute -bottom-0.5 -right-0.5"
              :style="{ backgroundColor: user.activityState === 'background' ? '#94a3b8' : user.colorToken }"
            />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap gap-2 items-center">
              <p class="text-sm text-slate-900 font-semibold max-w-full truncate">
                {{ user.username }}
              </p>
              <span
                v-if="user.isCurrentUser"
                class="text-[10px] text-slate-500 font-medium px-2 py-0.5 rounded-full bg-slate-100"
              >
                我
              </span>
              <span class="text-[10px] font-medium px-2 py-0.5 rounded-full" :class="user.activityState === 'background' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'">
                {{ activityStateLabel(user) }}
              </span>
              <span v-if="user.peerCount > 1" class="text-[10px] text-blue-600 font-medium px-2 py-0.5 rounded-full bg-blue-50">
                {{ user.peerCount }} 个会话
              </span>
            </div>
            <p class="text-[11px] text-slate-500 mt-1">
              {{ roleLabel(user.role) }}
            </p>
            <p class="text-xs text-slate-700 font-medium mt-2">
              {{ selectionRangeText(user) }}
            </p>
            <p class="text-[11px] text-slate-500 mt-1">
              {{ selectionPreviewText(user) }}
            </p>
          </div>
        </div>

        <div class="text-[11px] text-slate-400 shrink-0">
          最后活跃 {{ formatDateTime(user.updatedAt) }}
        </div>
      </article>
    </div>

    <div v-else class="text-[11px] text-slate-400 px-4 py-4">
      暂无在线成员
    </div>
  </section>
</template>
