<script setup lang="ts">
import type {
  ProjectResourceCommentAnchor,
  ProjectResourceCommentMessage,
  ProjectResourceCommentThread,
} from '~~/shared/types/domain'
import UnifiedAvatar from '~/components/UnifiedAvatar.vue'
import { formatPreciseDateTime, formatRelativeUpdatedAt } from '~/composables/team-ui'

type WorkspaceDocumentCommentFilterKey = 'all' | 'resolved' | 'mine'

const COMMENT_FILTER_OPTIONS: Array<{ key: WorkspaceDocumentCommentFilterKey, label: string }> = [
  { key: 'all', label: '所有' },
  { key: 'resolved', label: '已解决' },
  { key: 'mine', label: '我发出的' },
]

const props = withDefaults(defineProps<{
  commentThreads?: ProjectResourceCommentThread[]
  activeCommentThreadId?: string
  commentDraftAnchor?: ProjectResourceCommentAnchor | null
  commentLoading?: boolean
  commentMutating?: boolean
  currentUserId?: string
}>(), {
  commentThreads: () => [],
  activeCommentThreadId: '',
  commentDraftAnchor: null,
  commentLoading: false,
  commentMutating: false,
  currentUserId: '',
})

const emit = defineEmits<{
  selectCommentThread: [threadId: string]
  createCommentThread: [body: string]
  replyCommentThread: [payload: { threadId: string, body: string }]
  resolveCommentThread: [threadId: string]
  reopenCommentThread: [threadId: string]
  cancelCommentDraft: []
}>()

const commentDraftText = ref('')
const commentReplyDraftMap = reactive<Record<string, string>>({})
const commentFilterMenuVisible = ref(false)
const selectedCommentFilters = ref<WorkspaceDocumentCommentFilterKey[]>(['all'])

const activeCommentThread = computed(() => {
  const threadId = String(props.activeCommentThreadId || '').trim()
  if (!threadId)
    return null
  return props.commentThreads.find(item => item.id === threadId) || null
})

const filteredCommentThreads = computed(() => {
  const activeFilters = selectedCommentFilters.value.filter(item => item !== 'all')
  if (activeFilters.length === 0)
    return props.commentThreads

  const currentUserId = normalizeString(props.currentUserId)
  return props.commentThreads.filter((thread) => {
    return activeFilters.some((filterKey) => {
      if (filterKey === 'resolved')
        return thread.status === 'resolved'
      if (filterKey === 'mine')
        return Boolean(currentUserId) && normalizeString(thread.createdByUserId) === currentUserId
      return true
    })
  })
})

const hasActiveCommentFilters = computed(() => {
  return !selectedCommentFilters.value.includes('all')
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function summarizeCommentAnchor(anchor: ProjectResourceCommentAnchor | null | undefined): string {
  if (!anchor)
    return '未指定锚点'
  if (anchor.type === 'image_node')
    return anchor.title || anchor.alt || '图片评论'
  return anchor.selectedTextPreview || anchor.headingText || `文本选区 ${anchor.anchorLine}:${anchor.anchorColumn}`
}

function resolveThreadPrimaryMessage(thread: ProjectResourceCommentThread): ProjectResourceCommentMessage | null {
  return thread.messages[thread.messages.length - 1] || null
}

function resolveAuthorName(input: {
  createdByUsername?: string | null
  createdByUserId?: string | null
}): string {
  return normalizeString(input.createdByUsername) || normalizeString(input.createdByUserId) || '协作者'
}

function resolveAuthorAvatarUrl(input: {
  createdByAvatarUrl?: string | null
}): string | null {
  const avatarUrl = normalizeString(input.createdByAvatarUrl)
  return avatarUrl || null
}

function resolveThreadActorName(thread: ProjectResourceCommentThread): string {
  const primaryMessage = resolveThreadPrimaryMessage(thread)
  if (primaryMessage)
    return resolveAuthorName(primaryMessage)
  return resolveAuthorName(thread)
}

function resolveThreadActorAvatarUrl(thread: ProjectResourceCommentThread): string | null {
  const primaryMessage = resolveThreadPrimaryMessage(thread)
  if (primaryMessage)
    return resolveAuthorAvatarUrl(primaryMessage)
  return resolveAuthorAvatarUrl(thread)
}

function resolveThreadRelativeTime(thread: ProjectResourceCommentThread): string {
  const timestamp = normalizeString(thread.updatedAt) || normalizeString(thread.createdAt)
  if (!timestamp)
    return '刚刚'
  return formatRelativeUpdatedAt(timestamp)
}

function resolvePreciseTime(value: string | null | undefined): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return '-'
  return formatPreciseDateTime(normalized)
}

function resolveMessageRelativeTime(message: ProjectResourceCommentMessage): string {
  const timestamp = normalizeString(message.updatedAt) || normalizeString(message.createdAt)
  if (!timestamp)
    return '刚刚'
  return formatRelativeUpdatedAt(timestamp)
}

function resolveThreadPreviewBody(thread: ProjectResourceCommentThread): string {
  const primaryMessage = resolveThreadPrimaryMessage(thread)
  return normalizeString(primaryMessage?.body) || '暂无评论内容'
}

function selectCommentThread(threadId: string): void {
  emit('selectCommentThread', threadId)
}

function isCommentFilterSelected(filterKey: WorkspaceDocumentCommentFilterKey): boolean {
  return selectedCommentFilters.value.includes(filterKey)
}

function toggleCommentFilter(filterKey: WorkspaceDocumentCommentFilterKey): void {
  if (filterKey === 'all') {
    selectedCommentFilters.value = ['all']
    return
  }

  const nextFilters = new Set(
    selectedCommentFilters.value.filter(item => item !== 'all'),
  )
  if (nextFilters.has(filterKey))
    nextFilters.delete(filterKey)
  else
    nextFilters.add(filterKey)

  selectedCommentFilters.value = nextFilters.size > 0
    ? Array.from(nextFilters)
    : ['all']
}

function handleThreadKeydown(event: KeyboardEvent, threadId: string): void {
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  selectCommentThread(threadId)
}

function submitCommentDraft(): void {
  const body = String(commentDraftText.value || '').trim()
  if (!body)
    return
  commentDraftText.value = ''
  emit('createCommentThread', body)
}

function submitCommentReply(threadId: string): void {
  const body = String(commentReplyDraftMap[threadId] || '').trim()
  if (!body)
    return
  commentReplyDraftMap[threadId] = ''
  emit('replyCommentThread', { threadId, body })
}
</script>

<template>
  <aside
    class="workspace-document-comments-panel border-l border-slate-200 bg-white flex h-full min-h-0 w-[336px] shrink-0 flex-col overflow-hidden"
    data-testid="workspace-document-comments-panel"
  >
    <div class="border-b border-slate-200 bg-slate-50/72 px-3.5 py-2.5 shrink-0">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-[11px] text-slate-700 font-semibold">
          <span class="material-symbols-outlined text-[15px]" aria-hidden="true">comment</span>
          <span>评论</span>
          <span class="text-slate-400 font-medium">({{ filteredCommentThreads.length }})</span>
        </div>

        <a-trigger
          trigger="click"
          position="bl"
          :popup-visible="commentFilterMenuVisible"
          @popup-visible-change="commentFilterMenuVisible = $event"
        >
          <button
            data-testid="workspace-document-comments-filter-trigger"
            class="rounded-full border flex h-7 w-7 items-center justify-center transition-colors"
            :class="hasActiveCommentFilters ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700'"
            type="button"
            title="筛选评论"
            aria-label="筛选评论"
            @click.stop
          >
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">filter_list</span>
          </button>

          <template #content>
            <div
              data-testid="workspace-document-comments-filter-menu"
              class="w-40 rounded-2xl border border-slate-200 bg-white p-2"
            >
              <label
                v-for="option in COMMENT_FILTER_OPTIONS"
                :key="option.key"
                class="rounded-xl flex cursor-pointer items-center gap-2 px-2.5 py-2 text-[11px] text-slate-700 transition-colors hover:bg-slate-50"
              >
                <input
                  class="rounded border-slate-300"
                  type="checkbox"
                  :checked="isCommentFilterSelected(option.key)"
                  @change="toggleCommentFilter(option.key)"
                >
                <span>{{ option.label }}</span>
              </label>
            </div>
          </template>
        </a-trigger>
      </div>
    </div>

    <div class="no-scrollbar flex-1 min-h-0 overflow-y-auto px-3.5 py-3">
      <div class="space-y-3">
        <div v-if="props.commentLoading && props.commentThreads.length === 0" class="space-y-2" aria-hidden="true">
          <div class="rounded bg-slate-100 h-16 animate-pulse" />
          <div class="rounded bg-slate-100 h-16 animate-pulse" />
        </div>
        <div v-else-if="filteredCommentThreads.length === 0 && !props.commentDraftAnchor" class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed">
          {{ hasActiveCommentFilters ? '当前筛选条件下没有评论线程。' : '当前文档还没有评论线程。' }}
        </div>
        <article
          v-for="thread in filteredCommentThreads"
          :key="thread.id"
          class="rounded-xl border bg-white p-3 transition-colors cursor-pointer"
          :class="thread.id === props.activeCommentThreadId ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/40'"
          data-testid="workspace-document-comment-card"
          role="button"
          tabindex="0"
          @click="selectCommentThread(thread.id)"
          @keydown="handleThreadKeydown($event, thread.id)"
        >
          <div class="flex items-start gap-3">
            <UnifiedAvatar
              :name="resolveThreadActorName(thread)"
              :src="resolveThreadActorAvatarUrl(thread)"
              :size="28"
            />

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-[11px] text-slate-800 font-semibold truncate">
                    {{ thread.summaryText || summarizeCommentAnchor(thread.anchor) }}
                  </div>
                  <div class="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span class="truncate">{{ resolveThreadActorName(thread) }}</span>
                    <span class="text-slate-300">·</span>
                    <a-trigger trigger="hover" position="bottom">
                      <button
                        class="text-[10px] text-slate-500 transition-colors hover:text-slate-700"
                        type="button"
                        @click.stop
                      >
                        {{ resolveThreadRelativeTime(thread) }}
                      </button>

                      <template #content>
                        <div class="p-3 border border-slate-200 rounded-2xl bg-white shadow-sm">
                          <div class="text-xs text-slate-900 font-semibold">
                            最后更新时间
                          </div>
                          <div class="text-[11px] text-slate-500 mt-1">
                            {{ resolvePreciseTime(thread.updatedAt || thread.createdAt) }}
                          </div>
                        </div>
                      </template>
                    </a-trigger>
                  </div>
                </div>

                <button
                  v-if="thread.status !== 'resolved'"
                  class="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 flex h-7 w-7 shrink-0 items-center justify-center transition-colors hover:bg-emerald-100 disabled:opacity-60"
                  :disabled="props.commentMutating"
                  type="button"
                  title="解决评论"
                  aria-label="解决评论"
                  @click.stop="emit('resolveCommentThread', thread.id)"
                >
                    <span class="material-symbols-outlined text-[16px]" aria-hidden="true">check_circle</span>
                </button>
                <button
                  v-else
                  class="rounded-full border border-slate-300 bg-white text-slate-600 flex h-7 w-7 shrink-0 items-center justify-center transition-colors hover:bg-slate-100 disabled:opacity-60"
                  :disabled="props.commentMutating"
                  type="button"
                  title="重新打开评论"
                  aria-label="重新打开评论"
                  @click.stop="emit('reopenCommentThread', thread.id)"
                >
                  <span class="material-symbols-outlined text-[16px]" aria-hidden="true">history</span>
                </button>
              </div>

              <div v-if="thread.id === props.activeCommentThreadId" class="mt-3 space-y-2">
                <div
                  v-for="message in thread.messages"
                  :key="message.id"
                  class="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2"
                >
                  <div class="flex items-start gap-2">
                    <UnifiedAvatar
                      :name="resolveAuthorName(message)"
                      :src="resolveAuthorAvatarUrl(message)"
                      :size="22"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        <span class="font-medium text-slate-700">{{ resolveAuthorName(message) }}</span>
                        <span class="text-slate-300">·</span>
                        <a-trigger trigger="hover" position="bottom">
                          <button
                            class="text-[10px] text-slate-500 transition-colors hover:text-slate-700"
                            type="button"
                            @click.stop
                          >
                            {{ resolveMessageRelativeTime(message) }}
                          </button>

                          <template #content>
                            <div class="p-3 border border-slate-200 rounded-2xl bg-white shadow-sm">
                              <div class="text-xs text-slate-900 font-semibold">
                                评论时间
                              </div>
                              <div class="text-[11px] text-slate-500 mt-1">
                                {{ resolvePreciseTime(message.updatedAt || message.createdAt) }}
                              </div>
                            </div>
                          </template>
                        </a-trigger>
                      </div>
                      <div class="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">
                        {{ message.body }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="mt-3 line-clamp-2 text-[11px] leading-5 text-slate-600">
                {{ resolveThreadPreviewBody(thread) }}
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <div class="border-t border-slate-200 bg-white px-3.5 py-3 shrink-0">
      <div
        v-if="props.commentDraftAnchor"
        class="space-y-3"
      >
        <div class="text-[11px] text-slate-600">
          新线程将锚定到：{{ summarizeCommentAnchor(props.commentDraftAnchor) }}
        </div>
        <textarea
          v-model="commentDraftText"
          class="h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          placeholder="输入评论内容"
        />
        <div class="flex items-center justify-between gap-2">
          <button
            class="rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold hover:bg-slate-100"
            type="button"
            @click="emit('cancelCommentDraft')"
          >
            取消
          </button>
          <button
            class="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            :disabled="props.commentMutating || !commentDraftText.trim()"
            type="button"
            @click="submitCommentDraft"
          >
            {{ props.commentMutating ? '创建中...' : '创建评论' }}
          </button>
        </div>
      </div>

      <div
        v-else-if="activeCommentThread"
        class="space-y-3"
      >
        <textarea
          v-model="commentReplyDraftMap[activeCommentThread.id]"
          class="h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          placeholder="输入回复内容"
        />
        <button
          class="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          :disabled="props.commentMutating || !String(commentReplyDraftMap[activeCommentThread.id] || '').trim()"
          type="button"
          @click="submitCommentReply(activeCommentThread.id)"
        >
          {{ props.commentMutating ? '发送中...' : '发送回复' }}
        </button>
      </div>

      <div v-else class="text-[11px] text-slate-500">
        选择一个评论线程后，可直接在这里回复。
      </div>
    </div>
  </aside>
</template>
