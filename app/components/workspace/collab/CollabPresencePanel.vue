<script setup lang="ts">
interface WorkspaceCollabPresenceMember {
  peerId: string
  userId: string
  username: string
  cursorX?: number
  cursorY?: number
  updatedAt?: string
}

const props = withDefaults(defineProps<{
  members?: WorkspaceCollabPresenceMember[]
}>(), {
  members: () => [],
})

const presenceCount = computed(() => props.members.length)

function collabMemberLabel(member: WorkspaceCollabPresenceMember): string {
  const username = String(member.username || '').trim()
  const userId = String(member.userId || '').trim()
  return username || userId || '匿名成员'
}
</script>

<template>
  <aside class="px-3 py-3 border-t border-slate-200 bg-slate-50 md:border-l md:border-t-0">
    <div class="text-xs text-slate-700 font-semibold">
      在线成员（{{ presenceCount }}）
    </div>
    <ul class="mt-2 space-y-1.5">
      <li
        v-for="member in members"
        :key="`${member.peerId}-${member.userId}`"
        class="text-[11px] text-slate-600 px-2 py-1 border border-slate-200 rounded bg-white"
      >
        {{ collabMemberLabel(member) }}
      </li>
      <li v-if="members.length === 0" class="text-[11px] text-slate-400">
        暂无其他在线成员
      </li>
    </ul>
  </aside>
</template>
