<script setup lang="ts">
import type { WorkspaceCollabCursorUser, WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'

const props = withDefaults(defineProps<{
  hasFlowResource?: boolean
  flowPanelTitle?: string
  flowResourceId?: string
  collabRevision?: number
  collabConnected?: boolean
  collabConnectionText?: string
  collabPresenceUsers?: WorkspaceCollabPresenceUser[]
  collabPresenceCursors?: WorkspaceCollabCursorUser[]
  collabDrawValue?: string
  collabDrawError?: string
}>(), {
  hasFlowResource: false,
  flowPanelTitle: '流程画布',
  flowResourceId: '',
  collabRevision: 0,
  collabConnected: false,
  collabConnectionText: '',
  collabPresenceUsers: () => [],
  collabPresenceCursors: () => [],
  collabDrawValue: '{}',
  collabDrawError: '',
})

const emit = defineEmits<{
  updateCollabDrawValue: [value: string]
  updateCollabCursor: [value: { cursorX?: number, cursorY?: number }]
}>()
</script>

<template>
  <div class="h-full min-h-0 w-full">
    <div class="bg-white flex flex-col h-full min-h-0 overflow-hidden">
      <div class="p-4 border-b border-slate-200 bg-white flex flex-wrap gap-3 items-start justify-between">
        <div class="text-xs text-slate-600">
          {{ props.flowPanelTitle }}
          <span class="text-slate-400 ml-2">rev {{ props.hasFlowResource ? Math.max(0, Number(props.collabRevision || 0)) : 0 }}</span>
        </div>
        <div class="flex flex-wrap gap-3 items-center justify-end">
          <div
            class="text-[11px]"
            :class="props.hasFlowResource ? (props.collabConnected ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-400'"
          >
            {{ props.hasFlowResource ? props.collabConnectionText : '待初始化' }}
          </div>
          <CollabPresenceAvatarStack :users="props.collabPresenceUsers" />
        </div>
      </div>

      <div v-if="props.hasFlowResource" class="h-full">
        <div class="flex flex-col h-full">
          <WorkspaceTldrawCanvas
            :key="props.flowResourceId || 'flow-canvas'"
            class="h-full min-h-0 w-full"
            :model-value="props.collabDrawValue"
            :remote-cursors="props.collabPresenceCursors"
            :persistence-key="`workspace-flow-${props.flowResourceId || 'default'}`"
            :readonly="false"
            @update:model-value="emit('updateCollabDrawValue', $event)"
            @update-collab-cursor="emit('updateCollabCursor', $event)"
          />
          <p v-if="props.collabDrawError" class="text-[11px] text-rose-600 px-4 py-2 border-t border-rose-100 bg-rose-50">
            {{ props.collabDrawError }}
          </p>
        </div>
      </div>

      <div v-else class="px-6 bg-slate-50 flex flex-1 items-center justify-center">
        <div class="px-6 py-8 text-center border border-slate-300 rounded-xl border-dashed bg-white max-w-md">
          <span class="material-symbols-outlined text-3xl text-blue-600">flowsheet</span>
          <h3 class="text-sm text-slate-800 font-semibold mt-3">
            暂未初始化流程画布
          </h3>
          <p class="text-[12px] text-slate-500 leading-6 mt-2">
            从左侧“流程”入口进入时，系统会自动为当前项目创建并打开唯一的主流程画布。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
