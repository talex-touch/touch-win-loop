<script setup lang="ts">
import type { Awareness } from 'y-protocols/awareness'
import type { Doc as YDoc } from 'yjs'
import type {
  AiWorkspaceDocumentAction,
  AiWorkspaceDocumentDraft,
  AiWorkspaceInlineCompletionAcceptResult,
  AiWorkspaceInlineCompletionResult,
  ApiResponse,
  ProjectResourceCommentAnchor,
  ProjectResourceCommentImageNodeAnchor,
  ProjectResourceCommentTextSelectionAnchor,
  ProjectResourceCommentThread,
  ProjectResourceReviewJob,
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
  projectId?: string
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
  projectId: '',
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
const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const markdownCommentsCollapsed = ref(false)
const reviewJob = ref<ProjectResourceReviewJob | null>(null)
const reviewLoading = ref(false)
const reviewError = ref('')
const reviewPrompt = ref('')
const reviewPanelVisible = ref(false)
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
const canReviewBinaryDocument = computed(() => {
  return props.activePreviewMode === 'binary'
    && props.previewStatus?.status === 'succeeded'
    && Boolean(String(props.projectId || '').trim() && String(props.previewResourceId || '').trim())
})
const reviewFindingsByPage = computed(() => {
  const groups = new Map<number, NonNullable<ProjectResourceReviewJob['findings']>>()
  for (const finding of reviewJob.value?.findings || []) {
    const page = Math.max(1, Number(finding.pageNumber || 1))
    groups.set(page, [...(groups.get(page) || []), finding])
  }
  return [...groups.entries()].sort((left, right) => left[0] - right[0])
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

watch(
  () => [props.projectId, props.previewResourceId, props.activePreviewMode, props.previewStatus?.status] as const,
  () => {
    reviewJob.value = null
    reviewError.value = ''
    if (canReviewBinaryDocument.value)
      void loadLatestReviewJob()
  },
  { immediate: true },
)

async function requestReviewApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(path), {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })
  const result = (await response.json().catch(() => null)) as ApiResponse<T> | null
  if (!response.ok || !result || result.code !== 0)
    throw new Error(String(result?.message || '请求失败。'))
  return result.data
}

async function loadLatestReviewJob(): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  const resourceId = String(props.previewResourceId || '').trim()
  if (!projectId || !resourceId)
    return
  try {
    const payload = await requestReviewApi<{ latest: ProjectResourceReviewJob | null }>(
      `/projects/${projectId}/resources/${resourceId}/review-jobs`,
    )
    reviewJob.value = payload.latest
  }
  catch {
    reviewJob.value = null
  }
}

async function createReviewJob(): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  const resourceId = String(props.previewResourceId || '').trim()
  if (!projectId || !resourceId)
    return
  reviewLoading.value = true
  reviewError.value = ''
  reviewPanelVisible.value = true
  try {
    reviewJob.value = await requestReviewApi<ProjectResourceReviewJob>(
      `/projects/${projectId}/resources/${resourceId}/review-jobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          prompt: reviewPrompt.value,
        }),
      },
    )
  }
  catch (error) {
    reviewError.value = error instanceof Error ? error.message : '页级审稿失败。'
  }
  finally {
    reviewLoading.value = false
  }
}

function focusReviewPage(pageNumber: number): void {
  const page = Math.max(1, Number(pageNumber || 1))
  if (!import.meta.client)
    return
  const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="资料预览"]')
  if (!iframe)
    return
  const currentSrc = String(iframe.getAttribute('src') || props.previewPdfUrl || '')
  const base = currentSrc.split('#')[0]
  iframe.setAttribute('src', `${base}#page=${page}`)
}

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
            <div class="workspace-resource-preview-tab__binary">
              <div class="workspace-resource-preview-tab__review-toolbar">
                <div>
                  <strong>资料预览</strong>
                  <span v-if="reviewJob">已生成 {{ reviewJob.findings.length }} 条页级意见</span>
                  <span v-else>可针对 PDF/PPT 预览生成逐页意见</span>
                </div>
                <div class="workspace-resource-preview-tab__review-actions">
                  <button type="button" @click="reviewPanelVisible = !reviewPanelVisible">
                    {{ reviewPanelVisible ? '收起意见' : '查看意见' }}
                  </button>
                  <button
                    type="button"
                    data-testid="workspace-resource-page-review-create"
                    :disabled="!canReviewBinaryDocument || reviewLoading"
                    @click="createReviewJob"
                  >
                    {{ reviewLoading ? '审稿中...' : 'AI 页审稿' }}
                  </button>
                </div>
              </div>

              <div class="workspace-resource-preview-tab__binary-body">
                <iframe
                  class="border-0 bg-white h-full w-full"
                  :src="props.previewPdfUrl"
                  title="资料预览"
                />

                <aside
                  v-if="reviewPanelVisible"
                  class="workspace-resource-preview-tab__review-panel"
                  data-testid="workspace-resource-page-review-panel"
                >
                  <label class="workspace-resource-preview-tab__review-prompt">
                    <span>审稿要求</span>
                    <textarea
                      v-model="reviewPrompt"
                      rows="3"
                      placeholder="例如：重点检查每页表达、证据链、视觉层级与结论是否清晰。"
                    />
                  </label>
                  <p v-if="reviewError" class="workspace-resource-preview-tab__review-error">
                    {{ reviewError }}
                  </p>
                  <p v-if="reviewJob?.resultSummary" class="workspace-resource-preview-tab__review-summary">
                    {{ reviewJob.resultSummary }}
                  </p>
                  <p v-if="reviewJob?.fallbackUsed" class="workspace-resource-preview-tab__review-warning">
                    当前意见为规则回退结果：文档审稿 AI 未配置或调用失败，请先检查 document_analysis 通道后再用于最终审阅。
                  </p>
                  <div v-if="reviewFindingsByPage.length" class="workspace-resource-preview-tab__review-pages">
                    <section v-for="[pageNumber, findings] in reviewFindingsByPage" :key="pageNumber">
                      <button type="button" @click="focusReviewPage(pageNumber)">
                        第 {{ pageNumber }} 页
                      </button>
                      <article v-for="finding in findings" :key="finding.id">
                        <div>
                          <strong>{{ finding.title }}</strong>
                          <span>{{ finding.severity }} · {{ finding.category }}</span>
                        </div>
                        <p>{{ finding.comment }}</p>
                        <blockquote v-if="finding.quote">
                          {{ finding.quote }}
                        </blockquote>
                      </article>
                    </section>
                  </div>
                  <div v-else class="workspace-resource-preview-tab__review-empty">
                    暂无页级意见，点击“AI 页审稿”生成。
                  </div>
                </aside>
              </div>
            </div>
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

.workspace-resource-preview-tab__binary {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.workspace-resource-preview-tab__review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid rgb(226 232 240 / 0.92);
  background: #fff;
}

.workspace-resource-preview-tab__review-toolbar div:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.workspace-resource-preview-tab__review-toolbar strong {
  color: #0f172a;
  font-size: 13px;
}

.workspace-resource-preview-tab__review-toolbar span {
  color: #64748b;
  font-size: 11px;
}

.workspace-resource-preview-tab__review-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.workspace-resource-preview-tab__review-actions button {
  padding: 5px 10px;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.workspace-resource-preview-tab__review-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.workspace-resource-preview-tab__binary-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.workspace-resource-preview-tab__review-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 340px;
  min-height: 0;
  padding: 12px;
  border-left: 1px solid #e2e8f0;
  background: #f8fafc;
  overflow-y: auto;
}

.workspace-resource-preview-tab__review-prompt {
  display: grid;
  gap: 6px;
}

.workspace-resource-preview-tab__review-prompt span {
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.workspace-resource-preview-tab__review-prompt textarea {
  resize: vertical;
  min-height: 72px;
  padding: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.6;
}

.workspace-resource-preview-tab__review-error,
.workspace-resource-preview-tab__review-summary,
.workspace-resource-preview-tab__review-warning,
.workspace-resource-preview-tab__review-empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.workspace-resource-preview-tab__review-error {
  color: #dc2626;
}

.workspace-resource-preview-tab__review-summary,
.workspace-resource-preview-tab__review-empty {
  color: #64748b;
}

.workspace-resource-preview-tab__review-warning {
  color: #b45309;
}

.workspace-resource-preview-tab__review-pages {
  display: grid;
  gap: 12px;
}

.workspace-resource-preview-tab__review-pages section {
  display: grid;
  gap: 8px;
}

.workspace-resource-preview-tab__review-pages section > button {
  justify-self: start;
  padding: 4px 8px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.workspace-resource-preview-tab__review-pages article {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.workspace-resource-preview-tab__review-pages article div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workspace-resource-preview-tab__review-pages article strong {
  color: #0f172a;
  font-size: 12px;
}

.workspace-resource-preview-tab__review-pages article span {
  color: #64748b;
  font-size: 11px;
}

.workspace-resource-preview-tab__review-pages article p,
.workspace-resource-preview-tab__review-pages article blockquote {
  margin: 0;
  color: #334155;
  font-size: 12px;
  line-height: 1.6;
}

.workspace-resource-preview-tab__review-pages article blockquote {
  padding-left: 8px;
  border-left: 2px solid #bfdbfe;
  color: #64748b;
}
</style>
