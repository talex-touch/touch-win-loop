<script setup lang="ts">
import type { WorkspaceCollabCursorUser, WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import WorkspaceDrawioCanvas from '~/components/workspace/collab/WorkspaceDrawioCanvas.client.vue'

const props = withDefaults(defineProps<{
  projectId?: string
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
  projectId: '',
  hasFlowResource: false,
  flowPanelTitle: '流程画布',
  flowResourceId: '',
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
}>()

const connectionToneClass = computed(() => {
  return props.collabConnected
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700'
})

const connectionLabel = computed(() => {
  if (!props.hasFlowResource)
    return '待初始化'
  return String(props.collabConnectionText || '').trim() || '实时连接中'
})
</script>

<template>
  <div class="bg-white h-full min-h-0 w-full overflow-hidden relative">
    <template v-if="props.hasFlowResource">
      <div class="flex gap-2 pointer-events-none absolute right-3 top-3 z-10 items-center">
        <span class="text-[10px] font-semibold px-2 py-1 border rounded-full shadow-sm backdrop-blur bg-white/92" :class="connectionToneClass">
          {{ connectionLabel }}
        </span>
        <span class="text-[10px] text-slate-600 font-semibold px-2 py-1 border border-slate-200 rounded-full shadow-sm backdrop-blur bg-white/92">
          draw.io
        </span>
        <span class="text-[10px] text-blue-700 font-semibold px-2 py-1 border border-blue-200 rounded-full shadow-sm backdrop-blur bg-white/92">
          AgentProto
        </span>
      </div>

      <WorkspaceDrawioCanvas
        :key="props.flowResourceId || 'flow-canvas'"
        class="h-full min-h-0 w-full"
        :model-value="props.collabDrawValue"
        :diagram-title="props.flowPanelTitle"
        @update:model-value="emit('updateCollabDrawValue', $event)"
      />

      <p v-if="props.collabDrawError" class="text-[11px] text-rose-600 leading-5 px-3 py-2 border border-rose-100 rounded-xl bg-white/96 shadow-sm left-3 bottom-3 z-10 absolute">
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
