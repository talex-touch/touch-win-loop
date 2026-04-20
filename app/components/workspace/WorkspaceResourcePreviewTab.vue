<script setup lang="ts">
import type { Awareness } from 'y-protocols/awareness'
import type { Doc as YDoc } from 'yjs'
import type {
  AiWorkspaceDocumentAction,
  AiWorkspaceDocumentDraft,
  AiWorkspaceInlineCompletionAcceptResult,
  AiWorkspaceInlineCompletionResult,
  ProjectResourceCommentAnchor,
  ProjectResourceCommentImageNodeAnchor,
  ProjectResourceCommentTextSelectionAnchor,
  ProjectResourceCommentThread,
  ResourcePreviewStatus,
  WorkspaceFontSizePreset,
  WorkspaceTabSpacingPreset,
} from '~~/shared/types/domain'
import type { WorkspaceCollabCursorUser, WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import type { CollabMarkdownHeadingAnchorItem } from '~/utils/collab-markdown-navigation'
import { COLLAB_NOTES_RESOURCE_LABEL } from '~~/shared/utils/collab-resource'
import RichTextEditor from '~/components/editor/RichTextEditor.vue'
import WorkspaceTldrawCanvas from '~/components/workspace/collab/WorkspaceTldrawCanvas.client.vue'
import WorkspaceDocumentCommentsPanel from '~/components/workspace/WorkspaceDocumentCommentsPanel.vue'

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
  fontSizePreset?: WorkspaceFontSizePreset | ''
  tabSpacingPreset?: WorkspaceTabSpacingPreset | ''
  previewResourceId?: string
  previewStatus?: WorkspacePreviewStatusPayload | null
  previewStatusLoading?: boolean
  previewPdfUrl?: string
  collabPreviewLoading?: boolean
  collabPreviewError?: string
  currentUserId?: string
  currentUserName?: string
  currentUserAvatarUrl?: string
  collabRevision?: number
  collabConnected?: boolean
  collabConnectionText?: string
  collabMarkdownDoc?: YDoc | null
  collabMarkdownAwareness?: Awareness | null
  collabCurrentUser?: any
  collabPresenceUsers?: WorkspaceCollabPresenceUser[]
  collabPresenceCursors?: WorkspaceCollabCursorUser[]
  inlineCompletionEnabled?: boolean
  inlineCompletionRequestHandler?: ((payload: {
    requestKey: string
    selectionRange: {
      anchorLine: number
      anchorColumn: number
      headLine: number
      headColumn: number
      isCollapsed: boolean
      selectionLength: number
    }
    signal?: AbortSignal
  }) => Promise<AiWorkspaceInlineCompletionResult | null>) | null
  inlineCompletionAcceptHandler?: ((payload: {
    requestKey: string
    suggestion: string
    selectionRange: {
      anchorLine: number
      anchorColumn: number
      headLine: number
      headColumn: number
      isCollapsed: boolean
      selectionLength: number
    }
  }) => Promise<AiWorkspaceInlineCompletionAcceptResult | null>) | null
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
  fontSizePreset: '',
  tabSpacingPreset: '',
  previewResourceId: '',
  previewStatus: null,
  previewStatusLoading: false,
  previewPdfUrl: '',
  collabPreviewLoading: false,
  collabPreviewError: '',
  currentUserId: '',
  currentUserName: '',
  currentUserAvatarUrl: '',
  collabRevision: 0,
  collabConnected: false,
  collabConnectionText: '',
  collabMarkdownDoc: null,
  collabMarkdownAwareness: null,
  collabCurrentUser: null,
  collabPresenceUsers: () => [],
  collabPresenceCursors: () => [],
  inlineCompletionEnabled: false,
  inlineCompletionRequestHandler: null,
  inlineCompletionAcceptHandler: null,
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
    selectedText?: string
    selectedTextPreview: string
  }]
  markdownRemotePresenceChange: [value: any[]]
  markdownPrimaryHeadingChange: [value: string]
  markdownOutlineChange: [value: CollabMarkdownHeadingAnchorItem[]]
  markdownCreateCommentFromSelection: [value: ProjectResourceCommentTextSelectionAnchor]
  markdownCreateCommentFromImage: [value: ProjectResourceCommentImageNodeAnchor]
  markdownOpenCommentThread: [threadId: string]
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
  applyDocumentDraft: (payload: AiWorkspaceDocumentDraft) => boolean
  applyDocumentAssistResult: (payload: { action: AiWorkspaceDocumentAction, text: string }) => boolean
  openInlineSearch: () => boolean
  scrollToCommentThread: (threadId: string) => void
  scrollToHeadingAnchor: (anchorId: string) => boolean
} | null>(null)
const commentsPanelRef = ref<{
  scrollToCommentThread: (threadId: string) => void
} | null>(null)
const markdownCommentsCollapsed = ref(false)
const markdownPlaceholder = `输入正文或标题，${COLLAB_NOTES_RESOURCE_LABEL}会实时同步`
const isMarkdownCollabReady = computed(() => {
  if (props.activePreviewMode !== 'markdown')
    return false
  return Boolean(props.collabMarkdownDoc)
})
const isDrawCollabReady = computed(() => {
  if (props.activePreviewMode !== 'draw')
    return false
  return Boolean(String(props.previewResourceId || '').trim() && !props.collabPreviewLoading && !props.collabPreviewError)
})

function expandMarkdownCommentsPanel(): void {
  markdownCommentsCollapsed.value = false
}

function collapseMarkdownCommentsPanel(): void {
  markdownCommentsCollapsed.value = true
}

function syncMarkdownCommentThreadFocus(threadId: string): void {
  const normalizedThreadId = String(threadId || '').trim()
  if (!normalizedThreadId)
    return

  expandMarkdownCommentsPanel()
  nextTick(() => {
    richTextEditorRef.value?.scrollToCommentThread(normalizedThreadId)
    commentsPanelRef.value?.scrollToCommentThread(normalizedThreadId)
  })
}

watch(() => props.activeCommentThreadId, (threadId) => {
  if (!String(threadId || '').trim())
    return
  syncMarkdownCommentThreadFocus(threadId)
})

watch(() => props.commentDraftAnchor, (draftAnchor) => {
  if (!draftAnchor)
    return
  expandMarkdownCommentsPanel()
})

watch(() => [props.activePreviewMode, props.previewResourceId], ([previewMode]) => {
  if (previewMode !== 'markdown')
    emit('markdownOutlineChange', [])
}, { immediate: true })

function handleMarkdownSelectionChange(value: {
  line: number
  column: number
  selectionLength: number
  anchorLine: number
  anchorColumn: number
  headLine: number
  headColumn: number
  isCollapsed: boolean
  selectedText?: string
  selectedTextPreview: string
}): void {
  emit('markdownSelectionChange', value)
}

defineExpose({
  applyDocumentDraft(payload: AiWorkspaceDocumentDraft) {
    return richTextEditorRef.value?.applyDocumentDraft(payload) || false
  },
  applyDocumentAssistResult(payload: { action: AiWorkspaceDocumentAction, text: string }) {
    return richTextEditorRef.value?.applyDocumentAssistResult(payload) || false
  },
  openSearch() {
    if (props.activePreviewMode !== 'markdown')
      return false
    return richTextEditorRef.value?.openInlineSearch() || false
  },
  scrollToCommentThread(threadId: string) {
    syncMarkdownCommentThreadFocus(threadId)
  },
  scrollToHeadingAnchor(anchorId: string) {
    return richTextEditorRef.value?.scrollToHeadingAnchor(anchorId) || false
  },
})
</script>

<template>
  <div v-if="props.activeResourceTab" class="h-full min-h-0 w-full">
    <div class="bg-white flex flex-col h-full min-h-0 overflow-hidden">
      <div class="bg-slate-50 flex flex-1 flex-col min-h-0">
        <template v-if="props.activePreviewMode === 'markdown'">
          <div v-if="props.collabPreviewLoading || !isMarkdownCollabReady" class="workspace-resource-preview-tab__loading">
            <p class="workspace-resource-preview-tab__loading-title">
              WinLoop 正在加载
            </p>
            <p class="workspace-resource-preview-tab__loading-text">
              正在准备协作文档内容，请稍候...
            </p>
            <p v-if="props.collabPreviewError" class="workspace-resource-preview-tab__loading-error">
              {{ props.collabPreviewError }}
            </p>
          </div>

          <div v-else class="workspace-resource-preview-tab__markdown bg-white flex h-full min-h-0 w-full">
            <div class="workspace-resource-preview-tab__markdown-editor flex flex-1 min-h-0 min-w-0">
              <RichTextEditor
                ref="richTextEditorRef"
                :doc="props.collabMarkdownDoc"
                :awareness="props.collabMarkdownAwareness"
                :current-user="props.collabCurrentUser"
                :editable="true"
                class="h-full min-h-0 w-full"
                content-max-width="none"
                :placeholder="markdownPlaceholder"
                :resource-id="props.previewResourceId"
                :heading-levels="[1, 2, 3, 4, 5, 6]"
                :ui-font-size-preset="props.fontSizePreset || 'md'"
                :show-toolbar="false"
                :enable-slash-menu="true"
                :enable-comments="true"
                :enable-inline-completion="props.inlineCompletionEnabled"
                :inline-completion-request-handler="props.inlineCompletionRequestHandler"
                :inline-completion-accept-handler="props.inlineCompletionAcceptHandler"
                :comment-threads="props.commentThreads"
                :active-comment-thread-id="props.activeCommentThreadId"
                :image-upload-handler="props.imageUploadHandler"
                @selection-change="handleMarkdownSelectionChange"
                @remote-presence-change="emit('markdownRemotePresenceChange', $event)"
                @primary-heading-change="emit('markdownPrimaryHeadingChange', $event)"
                @outline-change="emit('markdownOutlineChange', $event)"
                @create-comment-from-selection="emit('markdownCreateCommentFromSelection', $event)"
                @create-comment-from-image="emit('markdownCreateCommentFromImage', $event)"
                @open-comment-thread="emit('markdownOpenCommentThread', $event)"
                @request-image-action="emit('markdownRequestImageAction', $event)"
              />

              <button
                v-if="markdownCommentsCollapsed"
                class="workspace-resource-preview-tab__comments-expand"
                type="button"
                title="展开评论"
                aria-label="展开评论"
                @click="expandMarkdownCommentsPanel()"
              >
                <span class="material-symbols-outlined text-[16px]" aria-hidden="true">comment</span>
              </button>
            </div>

            <WorkspaceDocumentCommentsPanel
              v-if="!markdownCommentsCollapsed"
              ref="commentsPanelRef"
              :comment-threads="props.commentThreads"
              :active-comment-thread-id="props.activeCommentThreadId"
              :comment-draft-anchor="props.commentDraftAnchor"
              :comment-loading="props.commentLoading"
              :comment-mutating="props.commentMutating"
              :current-user-id="props.currentUserId"
              :current-user-name="props.currentUserName"
              :current-user-avatar-url="props.currentUserAvatarUrl"
              @select-comment-thread="emit('markdownOpenCommentThread', $event)"
              @create-comment-thread="emit('markdownCreateCommentThread', $event)"
              @reply-comment-thread="emit('markdownReplyCommentThread', $event)"
              @resolve-comment-thread="emit('markdownResolveCommentThread', $event)"
              @reopen-comment-thread="emit('markdownReopenCommentThread', $event)"
              @cancel-comment-draft="emit('markdownCancelCommentDraft')"
              @toggle-collapsed="collapseMarkdownCommentsPanel()"
            />
          </div>
        </template>

        <template v-else-if="props.activePreviewMode === 'draw'">
          <div v-if="props.collabPreviewLoading || !isDrawCollabReady" class="workspace-resource-preview-tab__loading">
            <p class="workspace-resource-preview-tab__loading-title">
              WinLoop 正在加载
            </p>
            <p class="workspace-resource-preview-tab__loading-text">
              正在准备协作画布，请稍候...
            </p>
            <p v-if="props.collabPreviewError" class="workspace-resource-preview-tab__loading-error">
              {{ props.collabPreviewError }}
            </p>
          </div>

          <template v-else>
            <div class="text-xs px-4 py-2 border-b border-slate-200 bg-white shrink-0" :class="props.collabConnected ? 'text-emerald-600' : 'text-amber-600'">
              {{ props.collabConnectionText }}
            </div>
            <div class="flex flex-1 flex-col min-h-0">
              <WorkspaceTldrawCanvas
                :key="props.previewResourceId || props.activeResourceTab.id"
                class="flex-1 h-full min-h-0 w-full"
                :model-value="props.collabDrawValue"
                :remote-cursors="props.collabPresenceCursors"
                :persistence-key="`workspace-collab-${props.previewResourceId || props.activeResourceTab.id}`"
                :readonly="false"
                @update:model-value="emit('updateCollabDrawValue', $event)"
                @update-collab-cursor="emit('updateCollabCursor', $event)"
              />
              <p v-if="props.collabDrawError" class="text-xs text-rose-600 px-4 py-2 border-t border-rose-100 bg-rose-50 shrink-0">
                {{ props.collabDrawError }}
              </p>
            </div>
          </template>
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
.workspace-resource-preview-tab__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.98) 100%);
  color: var(--wl-text-secondary);
  text-align: center;
}

.workspace-resource-preview-tab__loading-title {
  margin: 0;
  color: var(--wl-text-primary);
  font-size: 16px;
  font-weight: 600;
}

.workspace-resource-preview-tab__loading-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.workspace-resource-preview-tab__loading-error {
  margin: 4px 0 0;
  color: var(--wl-danger-700);
  font-size: 12px;
  line-height: 1.6;
}

.workspace-resource-preview-tab__markdown {
  --workspace-markdown-comments-width: 320px;
  --workspace-preview-comments-border: var(--wl-border);
  --workspace-preview-comments-bg: rgba(255, 255, 255, 0.88);
  --workspace-preview-comments-bg-hover: rgba(248, 250, 252, 0.96);
  --workspace-preview-comments-text: var(--wl-text-secondary);
  --workspace-preview-comments-text-hover: var(--wl-text-primary);
  position: relative;
}

.workspace-resource-preview-tab__markdown-editor {
  position: relative;
}

.workspace-resource-preview-tab__comments-expand {
  position: absolute;
  top: 18px;
  right: 14px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--workspace-preview-comments-border);
  border-radius: 999px;
  background: var(--workspace-preview-comments-bg);
  color: var(--workspace-preview-comments-text);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.workspace-resource-preview-tab__comments-expand:hover {
  background: var(--workspace-preview-comments-bg-hover);
  color: var(--workspace-preview-comments-text-hover);
}
</style>
