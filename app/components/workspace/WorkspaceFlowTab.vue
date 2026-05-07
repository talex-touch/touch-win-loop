<script setup lang="ts">
import type { WorkspaceFontSizePreset, WorkspaceTabSpacingPreset } from '~~/shared/types/domain'
import type { WorkspaceCollabCursorUser, WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import type { WorkspaceOutlineNode } from '~/utils/workspace-outline'
import WorkspaceDrawioCanvas from '~/components/workspace/collab/WorkspaceDrawioCanvas.client.vue'

const props = withDefaults(defineProps<{
  projectId?: string
  hasFlowResource?: boolean
  flowPanelTitle?: string
  flowResourceId?: string
  fontSizePreset?: WorkspaceFontSizePreset | ''
  tabSpacingPreset?: WorkspaceTabSpacingPreset | ''
  collabRevision?: number
  collabConnected?: boolean
  collabConnectionText?: string
  collabPresenceUsers?: WorkspaceCollabPresenceUser[]
  collabPresenceCursors?: WorkspaceCollabCursorUser[]
  collabDrawValue?: string
  collabDrawError?: string
}>(), {
  projectId: '',
  hasFlowResource: false,
  flowPanelTitle: '流程画布',
  flowResourceId: '',
  fontSizePreset: '',
  tabSpacingPreset: '',
  collabRevision: 0,
  collabConnected: false,
  collabConnectionText: '',
  collabPresenceUsers: () => [],
  collabPresenceCursors: () => [],
  collabDrawValue: '',
  collabDrawError: '',
})

const emit = defineEmits<{
  updateCollabDrawValue: [value: string]
  updateCollabCursor: [value: { cursorX?: number, cursorY?: number }]
  requestWorkflowCanvasRebuild: []
}>()

const drawioCanvasRef = ref<{
  locateOutlineItem: (node: WorkspaceOutlineNode) => boolean
} | null>(null)

function locateOutlineItem(node: WorkspaceOutlineNode): boolean {
  return drawioCanvasRef.value?.locateOutlineItem(node) || false
}

defineExpose({
  locateOutlineItem,
})
</script>

<template>
  <div class="bg-white h-full min-h-0 w-full relative overflow-hidden">
    <template v-if="props.hasFlowResource">
      <WorkspaceDrawioCanvas
        ref="drawioCanvasRef"
        :key="props.flowResourceId || 'flow-canvas'"
        class="h-full min-h-0 w-full"
        :model-value="props.collabDrawValue"
        :diagram-title="props.flowPanelTitle"
        @update:model-value="emit('updateCollabDrawValue', $event)"
        @request-rebuild="emit('requestWorkflowCanvasRebuild')"
      />

      <p v-if="props.collabDrawError" class="text-[11px] text-rose-600 leading-5 px-3 py-2 border border-rose-100 rounded-xl bg-white/96 shadow-sm bottom-3 left-3 absolute z-10">
        {{ props.collabDrawError }}
      </p>
    </template>

    <div v-else class="bg-slate-50 flex h-full items-center justify-center">
      <div class="px-6 py-8 text-center border border-slate-300 rounded-2xl border-dashed bg-white max-w-md">
        <span class="material-symbols-outlined text-3xl text-slate-700">flowsheet</span>
        <h3 class="text-sm text-slate-800 font-semibold mt-3">
          暂未初始化流程画布
        </h3>
        <p class="text-[12px] text-slate-500 leading-6 mt-2">
          从左侧“流程”入口进入时，系统会自动创建或打开主流程画布；在资源管理器里也可以单独新建流程画布。
        </p>
      </div>
    </div>
  </div>
</template>
