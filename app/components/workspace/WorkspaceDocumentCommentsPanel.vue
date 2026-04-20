<script setup lang="ts">
import type {
  ProjectResourceCommentAnchor,
  ProjectResourceCommentMessage,
  ProjectResourceCommentThread,
} from '~~/shared/types/domain'
import UnifiedAvatar from '~/components/UnifiedAvatar.vue'
import { formatPreciseDateTime, formatRelativeUpdatedAt } from '~/composables/team-ui'

type WorkspaceDocumentCommentFilterKey = 'all' | 'resolved' | 'mine'

const props = withDefaults(defineProps<{
  commentThreads?: ProjectResourceCommentThread[]
  activeCommentThreadId?: string
  commentDraftAnchor?: ProjectResourceCommentAnchor | null
  commentLoading?: boolean
  commentMutating?: boolean
  currentUserId?: string
  currentUserName?: string
  currentUserAvatarUrl?: string
}>(), {
  commentThreads: () => [],
  activeCommentThreadId: '',
  commentDraftAnchor: null,
  commentLoading: false,
  commentMutating: false,
  currentUserId: '',
  currentUserName: '',
  currentUserAvatarUrl: '',
})

const emit = defineEmits<{
  selectCommentThread: [threadId: string]
  createCommentThread: [body: string]
  replyCommentThread: [payload: { threadId: string, body: string }]
  resolveCommentThread: [threadId: string]
  reopenCommentThread: [threadId: string]
  cancelCommentDraft: []
  toggleCollapsed: []
}>()

const COMMENT_FILTER_OPTIONS: Array<{ key: WorkspaceDocumentCommentFilterKey, label: string }> = [
  { key: 'all', label: '所有' },
  { key: 'resolved', label: '已解决' },
  { key: 'mine', label: '我发出的' },
]

const commentDraftText = ref('')
const commentReplyDraftMap = reactive<Record<string, string>>({})
const commentFilterMenuVisible = ref(false)
const selectedCommentFilters = ref<WorkspaceDocumentCommentFilterKey[]>(['all'])
const commentThreadCardRefMap = new Map<string, HTMLElement>()

const activeCommentThread = computed(() => {
  const threadId = normalizeString(props.activeCommentThreadId)
  if (!threadId)
    return null
  return props.commentThreads.find(item => item.id === threadId) || null
})

const filteredCommentThreads = computed(() => {
  const activeFilters = selectedCommentFilters.value.filter(item => item !== 'all')
  const currentUserId = normalizeString(props.currentUserId)
  const filteredThreads = activeFilters.length === 0
    ? [...props.commentThreads]
    : props.commentThreads.filter((thread) => {
        return activeFilters.some((filterKey) => {
          if (filterKey === 'resolved')
            return thread.status === 'resolved'
          if (filterKey === 'mine')
            return Boolean(currentUserId) && normalizeString(thread.createdByUserId) === currentUserId
          return true
        })
      })

  const activeThread = activeCommentThread.value
  if (activeThread && !filteredThreads.some(thread => thread.id === activeThread.id))
    filteredThreads.unshift(activeThread)

  return filteredThreads
})

const hasActiveCommentFilters = computed(() => {
  return !selectedCommentFilters.value.includes('all')
})

const currentUserDisplayName = computed(() => {
  return normalizeString(props.currentUserName) || normalizeString(props.currentUserId) || '我'
})

const currentUserDisplayAvatarUrl = computed(() => {
  const avatarUrl = normalizeString(props.currentUserAvatarUrl)
  return avatarUrl || null
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
  const body = normalizeString(commentDraftText.value)
  if (!body)
    return
  commentDraftText.value = ''
  emit('createCommentThread', body)
}

function submitCommentReply(threadId: string): void {
  const body = normalizeString(commentReplyDraftMap[threadId])
  if (!body)
    return
  commentReplyDraftMap[threadId] = ''
  emit('replyCommentThread', { threadId, body })
}

function setCommentThreadCardRef(threadId: string, element: HTMLElement | null): void {
  if (!element) {
    commentThreadCardRefMap.delete(threadId)
    return
  }
  commentThreadCardRefMap.set(threadId, element)
}

function bindCommentThreadCardRef(threadId: string) {
  return (element: unknown) => {
    setCommentThreadCardRef(threadId, element instanceof HTMLElement ? element : null)
  }
}

function scrollToCommentThread(threadId: string): void {
  const normalizedThreadId = normalizeString(threadId)
  if (!normalizedThreadId)
    return

  nextTick(() => {
    const target = commentThreadCardRefMap.get(normalizedThreadId)
    target?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  })
}

defineExpose({
  scrollToCommentThread,
})
</script>

<template>
  <aside
    class="workspace-document-comments-panel border-l border-slate-200 bg-white flex shrink-0 flex-col h-full min-h-0 w-[336px] overflow-hidden"
    data-testid="workspace-document-comments-panel"
  >
    <div class="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/72 shrink-0">
      <div class="flex gap-2 items-center justify-between">
        <div class="text-[11px] text-slate-700 font-semibold flex gap-2 items-center">
          <span class="material-symbols-outlined text-[15px]" aria-hidden="true">comment</span>
          <span>评论</span>
          <span class="text-slate-400 font-medium">({{ filteredCommentThreads.length + (props.commentDraftAnchor ? 1 : 0) }})</span>
        </div>

        <div class="flex gap-1.5 items-center">
          <a-trigger
            trigger="click"
            position="bl"
            :popup-visible="commentFilterMenuVisible"
            @popup-visible-change="commentFilterMenuVisible = $event"
          >
            <button
              data-testid="workspace-document-comments-filter-trigger"
              class="border rounded-full flex h-7 w-7 transition-colors items-center justify-center"
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
                class="p-2 border border-slate-200 rounded-2xl bg-white w-40"
              >
                <label
                  v-for="option in COMMENT_FILTER_OPTIONS"
                  :key="option.key"
                  class="text-[11px] text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 cursor-pointer transition-colors items-center hover:bg-slate-50"
                >
                  <input
                    class="border-slate-300 rounded"
                    type="checkbox"
                    :checked="isCommentFilterSelected(option.key)"
                    @change="toggleCommentFilter(option.key)"
                  >
                  <span>{{ option.label }}</span>
                </label>
              </div>
            </template>
          </a-trigger>

          <button
            class="text-slate-500 border border-slate-200 rounded-full bg-white flex h-7 w-7 transition-colors items-center justify-center hover:text-slate-700 hover:bg-slate-100"
            type="button"
            title="收起评论"
            aria-label="收起评论"
            @click="emit('toggleCollapsed')"
          >
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">right_panel_close</span>
          </button>
        </div>
      </div>
    </div>

    <div class="no-scrollbar px-3.5 py-3 flex-1 min-h-0 overflow-y-auto">
      <div class="space-y-3">
        <div v-if="props.commentLoading && props.commentThreads.length === 0" class="space-y-2" aria-hidden="true">
          <div class="rounded bg-slate-100 h-16 animate-pulse" />
          <div class="rounded bg-slate-100 h-16 animate-pulse" />
        </div>

        <article
          v-if="props.commentDraftAnchor"
          data-testid="workspace-document-comment-draft-card"
          class="p-3 border border-blue-200 rounded-2xl bg-blue-50/40"
        >
          <div class="flex gap-3 items-start">
            <UnifiedAvatar
              :name="currentUserDisplayName"
              :src="currentUserDisplayAvatarUrl"
              :size="28"
            />

            <div class="flex-1 min-w-0 space-y-3">
              <div class="flex gap-2 items-start justify-between">
                <div class="min-w-0">
                  <div class="text-[11px] text-slate-800 font-semibold truncate">
                    新评论
                  </div>
                  <div class="text-[10px] text-slate-500 mt-1 flex gap-1.5 items-center">
                    <span class="truncate">{{ currentUserDisplayName }}</span>
                    <span class="text-slate-300">·</span>
                    <span>待发送</span>
                  </div>
                </div>
                <span class="text-[10px] text-blue-600 font-medium px-2 py-0.5 border border-blue-200 rounded-full bg-white">
                  草稿
                </span>
              </div>

              <div class="text-[11px] text-slate-600 leading-5 px-2.5 py-2 border border-blue-100 rounded-xl bg-white">
                将锚定到：{{ summarizeCommentAnchor(props.commentDraftAnchor) }}
              </div>

              <textarea
                v-model="commentDraftText"
                class="text-xs leading-5 p-2.5 border border-slate-200 rounded-xl bg-white h-24 w-full resize-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                placeholder="输入评论内容"
              />

              <div class="flex gap-2 items-center justify-between">
                <button
                  class="text-[11px] text-slate-600 font-semibold px-3 py-1.5 border border-slate-300 rounded-full bg-white hover:bg-slate-100"
                  type="button"
                  @click="emit('cancelCommentDraft')"
                >
                  取消
                </button>
                <button
                  class="text-[11px] text-white font-semibold px-3 py-1.5 border border-blue-600 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                  :disabled="props.commentMutating || !commentDraftText.trim()"
                  type="button"
                  @click="submitCommentDraft"
                >
                  {{ props.commentMutating ? '创建中...' : '发送评论' }}
                </button>
              </div>
            </div>
          </div>
        </article>

        <div
          v-if="filteredCommentThreads.length === 0 && !props.commentDraftAnchor && !props.commentLoading"
          class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed"
        >
          {{ hasActiveCommentFilters ? '当前筛选条件下没有评论线程。' : '当前文档还没有评论线程。' }}
        </div>

        <article
          v-for="thread in filteredCommentThreads"
          :key="thread.id"
          :ref="bindCommentThreadCardRef(thread.id)"
          class="p-3 border rounded-2xl bg-white cursor-pointer transition-colors"
          :class="thread.id === props.activeCommentThreadId ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/40'"
          data-testid="workspace-document-comment-card"
          role="button"
          tabindex="0"
          @click="selectCommentThread(thread.id)"
          @keydown="handleThreadKeydown($event, thread.id)"
        >
          <div class="flex gap-3 items-start">
            <UnifiedAvatar
              :name="resolveThreadActorName(thread)"
              :src="resolveThreadActorAvatarUrl(thread)"
              :size="28"
            />

            <div class="flex-1 min-w-0">
              <div class="flex gap-2 items-start justify-between">
                <div class="min-w-0">
                  <div class="text-[11px] text-slate-800 font-semibold truncate">
                    {{ thread.summaryText || summarizeCommentAnchor(thread.anchor) }}
                  </div>
                  <div class="text-[10px] text-slate-500 mt-1 flex gap-1.5 items-center">
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

                <div class="flex shrink-0 gap-1.5 items-center">
                  <span
                    v-if="thread.status === 'resolved'"
                    class="text-[10px] text-emerald-700 font-medium px-2 py-0.5 border border-emerald-200 rounded-full bg-emerald-50"
                  >
                    已解决
                  </span>

                  <button
                    v-if="thread.status !== 'resolved'"
                    class="text-emerald-700 border border-emerald-200 rounded-full bg-emerald-50 flex h-7 w-7 transition-colors items-center justify-center hover:bg-emerald-100 disabled:opacity-60"
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
                    class="text-slate-600 border border-slate-300 rounded-full bg-white flex h-7 w-7 transition-colors items-center justify-center hover:bg-slate-100 disabled:opacity-60"
                    :disabled="props.commentMutating"
                    type="button"
                    title="重新打开评论"
                    aria-label="重新打开评论"
                    @click.stop="emit('reopenCommentThread', thread.id)"
                  >
                    <span class="material-symbols-outlined text-[16px]" aria-hidden="true">history</span>
                  </button>
                </div>
              </div>

              <div v-if="thread.id === props.activeCommentThreadId" class="mt-3 space-y-2.5">
                <div
                  v-for="message in thread.messages"
                  :key="message.id"
                  class="px-2.5 py-2 border border-slate-200 rounded-xl bg-slate-50"
                >
                  <div class="flex gap-2 items-start">
                    <UnifiedAvatar
                      :name="resolveAuthorName(message)"
                      :src="resolveAuthorAvatarUrl(message)"
                      :size="22"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-[10px] text-slate-500 flex flex-wrap gap-1.5 items-center">
                        <span class="text-slate-700 font-medium">{{ resolveAuthorName(message) }}</span>
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
                      <div class="text-[11px] text-slate-700 leading-5 mt-1 whitespace-pre-wrap break-words">
                        {{ message.body }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="px-2.5 py-2.5 border border-slate-200 rounded-xl bg-white">
                  <div class="flex gap-2 items-start">
                    <UnifiedAvatar
                      :name="currentUserDisplayName"
                      :src="currentUserDisplayAvatarUrl"
                      :size="22"
                    />
                    <div class="flex-1 min-w-0 space-y-2">
                      <div class="text-[10px] text-slate-500">
                        {{ thread.status === 'resolved' ? '回复后会重新打开线程' : '回复此线程' }}
                      </div>
                      <textarea
                        v-model="commentReplyDraftMap[thread.id]"
                        class="text-xs leading-5 p-2.5 border border-slate-200 rounded-lg bg-slate-50 h-20 w-full resize-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                        placeholder="输入回复内容"
                        @click.stop
                      />
                      <div class="flex gap-2 items-center justify-end">
                        <button
                          class="text-[11px] text-white font-semibold px-3 py-1.5 border border-blue-600 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                          :disabled="props.commentMutating || !String(commentReplyDraftMap[thread.id] || '').trim()"
                          type="button"
                          @click.stop="submitCommentReply(thread.id)"
                        >
                          {{ props.commentMutating ? '发送中...' : '发送回复' }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="text-[11px] text-slate-600 leading-5 mt-3 line-clamp-2">
                {{ resolveThreadPreviewBody(thread) }}
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </aside>
</template>
