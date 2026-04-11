<script setup lang="ts">
import type { Awareness } from 'y-protocols/awareness'
import type { Doc as YDoc } from 'yjs'
import type {
  AiWorkspaceDocumentAction,
  ProjectResourceCommentImageNodeAnchor,
  ProjectResourceCommentAnchor,
  ProjectResourceCommentTextSelectionAnchor,
  ProjectResourceCommentThread,
  ResourcePreviewStatus,
} from '~~/shared/types/domain'
import type { WorkspaceCollabCursorUser, WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import RichTextEditor from '~/components/editor/RichTextEditor.vue'
import WorkspaceDocumentCommentsPanel from '~/components/workspace/WorkspaceDocumentCommentsPanel.vue'
import WorkspaceTldrawCanvas from '~/components/workspace/collab/WorkspaceTldrawCanvas.client.vue'

type WorkspacePreviewMode = 'binary' | 'markdown' | 'draw'

interface WorkspacePreviewTabItem {
  id: string
  title: string
}

interface WorkspacePreviewStatusPayload {
  status: ResourcePreviewStatus
  etaSeconds: number
  queuePosition: number
  progressPercent: number
  error: string
}

const props = withDefaults(defineProps<{
  activeResourceTab?: WorkspacePreviewTabItem | null
  activePreviewMode?: WorkspacePreviewMode
  previewResourceId?: string
  previewStatus?: WorkspacePreviewStatusPayload | null
  previewStatusLoading?: boolean
  previewPdfUrl?: string
  collabRevision?: number
  collabConnected?: boolean
  collabConnectionText?: string
  collabMarkdownDoc?: YDoc | null
  collabMarkdownAwareness?: Awareness | null
  collabCurrentUser?: any
  collabPresenceUsers?: WorkspaceCollabPresenceUser[]
  collabPresenceCursors?: WorkspaceCollabCursorUser[]
  imageUploadHandler?: ((file: File) => Promise<{ src: string, alt?: string, title?: string, resourceId?: string }>) | null
  commentThreads?: ProjectResourceCommentThread[]
  activeCommentThreadId?: string
  commentDraftAnchor?: ProjectResourceCommentAnchor | null
  commentLoading?: boolean
  commentMutating?: boolean
  collabDrawValue?: string
  collabDrawError?: string
  previewStatusLabel: (status: ResourcePreviewStatus | '') => string
  formatEtaSeconds: (seconds: number) => string
  previewErrorMessage: (message: string) => string
}>(), {
  activeResourceTab: null,
  activePreviewMode: 'binary',
  previewResourceId: '',
  previewStatus: null,
  previewStatusLoading: false,
  previewPdfUrl: '',
  collabRevision: 0,
  collabConnected: false,
  collabConnectionText: '',
  collabMarkdownDoc: null,
  collabMarkdownAwareness: null,
  collabCurrentUser: null,
  collabPresenceUsers: () => [],
  collabPresenceCursors: () => [],
  imageUploadHandler: null,
  commentThreads: () => [],
  activeCommentThreadId: '',
  commentDraftAnchor: null,
  commentLoading: false,
  commentMutating: false,
  collabDrawValue: '{}',
  collabDrawError: '',
})

const emit = defineEmits<{
  reconvertPreview: []
  updateCollabDrawValue: [value: string]
  updateCollabCursor: [value: { cursorX?: number, cursorY?: number }]
  markdownSelectionChange: [value: {
    line: number
    column: number
    selectionLength: number
    anchorLine: number
    anchorColumn: number
    headLine: number
    headColumn: number
    isCollapsed: boolean
    selectedTextPreview: string
  }]
  markdownRemotePresenceChange: [value: any[]]
  markdownPrimaryHeadingChange: [value: string]
  markdownCreateCommentFromSelection: [value: ProjectResourceCommentTextSelectionAnchor]
  markdownCreateCommentFromImage: [value: ProjectResourceCommentImageNodeAnchor]
  markdownOpenCommentThread: [threadId: string]
  markdownTriggerDocumentAssist: [value: {
    action: AiWorkspaceDocumentAction
    trigger: 'selection_toolbar' | 'slash_menu' | 'right_sidebar'
    selectionText: string
    selectionRange: {
      anchorLine: number
      anchorColumn: number
      headLine: number
      headColumn: number
      isCollapsed: boolean
      selectionLength: number
    } | null
  }]
  markdownRequestImageAction: [value: {
    resourceId?: string | null
    src: string
    mode: 'open_resource' | 'delete_node' | 'delete_and_recycle'
  }]
  markdownCancelCommentDraft: []
  markdownReplyCommentThread: [value: { threadId: string, body: string }]
  markdownResolveCommentThread: [threadId: string]
  markdownReopenCommentThread: [threadId: string]
  markdownCreateCommentThread: [body: string]
}>()

const richTextEditorRef = ref<{
  applyDocumentAssistResult: (payload: { action: AiWorkspaceDocumentAction, text: string }) => boolean
  scrollToCommentThread: (threadId: string) => void
  scrollToHeadingAnchor: (anchorId: string) => boolean
} | null>(null)

defineExpose({
  applyDocumentAssistResult(payload: { action: AiWorkspaceDocumentAction, text: string }) {
    return richTextEditorRef.value?.applyDocumentAssistResult(payload) || false
  },
  scrollToCommentThread(threadId: string) {
    richTextEditorRef.value?.scrollToCommentThread(threadId)
  },
  scrollToHeadingAnchor(anchorId: string) {
    return richTextEditorRef.value?.scrollToHeadingAnchor(anchorId) || false
  },
})
</script>

<template>
  <div v-if="props.activeResourceTab" class="h-full min-h-0 w-full">
    <div class="bg-white flex flex-col h-full min-h-0 overflow-hidden">
      <div class="bg-slate-50 flex-1 min-h-0">
        <template v-if="props.activePreviewMode === 'markdown'">
          <div class="workspace-resource-preview-tab__markdown bg-white flex h-full min-h-0 w-full">
            <div class="flex min-w-0 flex-1 min-h-0">
              <RichTextEditor
                ref="richTextEditorRef"
                :doc="props.collabMarkdownDoc"
                :awareness="props.collabMarkdownAwareness"
                :current-user="props.collabCurrentUser"
                :editable="true"
                class="h-full min-h-0 w-full"
                placeholder="输入正文或标题，协作文档会实时同步"
                :resource-id="props.previewResourceId"
                :heading-levels="[1, 2, 3, 4, 5, 6]"
                :show-toolbar="false"
                :enable-slash-menu="true"
                :enable-comments="true"
                :comment-threads="props.commentThreads"
                :active-comment-thread-id="props.activeCommentThreadId"
                :enable-document-assist="true"
                :image-upload-handler="props.imageUploadHandler"
                @selection-change="emit('markdownSelectionChange', $event)"
                @remote-presence-change="emit('markdownRemotePresenceChange', $event)"
                @primary-heading-change="emit('markdownPrimaryHeadingChange', $event)"
                @create-comment-from-selection="emit('markdownCreateCommentFromSelection', $event)"
                @create-comment-from-image="emit('markdownCreateCommentFromImage', $event)"
                @open-comment-thread="emit('markdownOpenCommentThread', $event)"
                @trigger-document-assist="emit('markdownTriggerDocumentAssist', $event)"
                @request-image-action="emit('markdownRequestImageAction', $event)"
              />
            </div>

            <WorkspaceDocumentCommentsPanel
              :comment-threads="props.commentThreads"
              :active-comment-thread-id="props.activeCommentThreadId"
              :comment-draft-anchor="props.commentDraftAnchor"
              :comment-loading="props.commentLoading"
              :comment-mutating="props.commentMutating"
              @select-comment-thread="emit('markdownOpenCommentThread', $event)"
              @create-comment-thread="emit('markdownCreateCommentThread', $event)"
              @reply-comment-thread="emit('markdownReplyCommentThread', $event)"
              @resolve-comment-thread="emit('markdownResolveCommentThread', $event)"
              @reopen-comment-thread="emit('markdownReopenCommentThread', $event)"
              @cancel-comment-draft="emit('markdownCancelCommentDraft')"
            />
          </div>
        </template>

        <template v-else-if="props.activePreviewMode === 'draw'">
          <div class="px-4 py-2 border-b border-slate-200 bg-white text-xs" :class="props.collabConnected ? 'text-emerald-600' : 'text-amber-600'">
            {{ props.collabConnectionText }}
          </div>
          <div class="h-full">
            <div class="flex flex-col h-full">
              <WorkspaceTldrawCanvas
                :key="props.previewResourceId || props.activeResourceTab.id"
                class="h-full min-h-0 w-full"
                :model-value="props.collabDrawValue"
                :remote-cursors="props.collabPresenceCursors"
                :persistence-key="`workspace-collab-${props.previewResourceId || props.activeResourceTab.id}`"
                :readonly="false"
                @update:model-value="emit('updateCollabDrawValue', $event)"
                @update-collab-cursor="emit('updateCollabCursor', $event)"
              />
              <p v-if="props.collabDrawError" class="text-xs text-rose-600 px-4 py-2 border-t border-rose-100 bg-rose-50">
                {{ props.collabDrawError }}
              </p>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="props.previewStatusLoading && !props.previewStatus" class="text-sm text-slate-500 flex h-full items-center justify-center">
            正在获取预览状态...
          </div>

          <template v-else-if="props.previewStatus?.status === 'succeeded'">
            <iframe
              class="border-0 bg-white h-full w-full"
              :src="props.previewPdfUrl"
              title="资料预览"
            />
          </template>

          <div v-else class="px-6 flex flex-col h-full items-center justify-center">
            <p class="text-base text-slate-700 font-semibold">
              {{ props.previewStatus ? props.previewStatusLabel(props.previewStatus.status) : '等待预览状态' }}
            </p>
            <p v-if="props.previewStatus && props.previewStatus.status !== 'failed'" class="text-sm text-slate-500 mt-2">
              预计剩余：{{ props.formatEtaSeconds(props.previewStatus.etaSeconds) }}
              <template v-if="props.previewStatus.queuePosition > 0">
                （当前队列位置：{{ props.previewStatus.queuePosition }}）
              </template>
            </p>
            <p v-if="props.previewStatus?.error" class="text-xs text-rose-600 mt-2 text-center max-w-2xl">
              {{ props.previewErrorMessage(props.previewStatus.error) }}
            </p>
            <button
              v-if="props.previewStatus?.status === 'failed'"
              class="text-xs text-rose-700 font-semibold mt-4 px-3 py-1.5 border border-rose-200 rounded bg-rose-50 transition-colors hover:bg-rose-100"
              type="button"
              @click="emit('reconvertPreview')"
            >
              重新转换
            </button>

            <div class="mt-5 rounded-full bg-slate-200 h-2 max-w-xl w-full overflow-hidden">
              <div
                class="rounded-full h-full transition-all duration-300 ease-out from-blue-600 to-cyan-500 bg-gradient-to-r"
                :style="{ width: `${Math.max(0, Math.min(100, Number(props.previewStatus?.progressPercent || 0)))}%` }"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-resource-preview-tab__markdown {
  --workspace-markdown-comments-width: 320px;
}
</style>
