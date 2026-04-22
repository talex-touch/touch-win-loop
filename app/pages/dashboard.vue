<script setup lang="ts">
import type { ApiResponse, AuthMeResult, WorkspaceWithQuota } from '~~/shared/types/domain'
import { resolveWorkspaceStreamSystemMessageView } from '~~/shared/utils/workspace-ai-stream'
import { resolveWorkspaceOptions } from '~/composables/team-ui'
import { readActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'
import { resolveAuthDisplayMessage, resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: '对话',
})

const authApiFetch = useAuthApiFetch()

const loading = ref(true)
const errorText = ref('')
const workspaceOptions = ref<WorkspaceWithQuota[]>([])
const messageScrollRef = ref<HTMLDivElement | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const hasAvailableWorkspace = computed(() => workspaceOptions.value.length > 0)

const suggestionPrompts = [
  {
    prompt: '帮我梳理当前工作空间里最值得优先关注的事项。',
    icon: 'edit_square',
  },
  {
    prompt: '如果我要推进一个新项目，应该先看哪些资料和赛事？',
    icon: 'open_in_new',
  },
  {
    prompt: '请把这个工作空间当前可见的信息总结成一段简报。',
    icon: 'ink_pen',
  },
  {
    prompt: '从工作空间视角看，哪些问题最需要先补齐？',
    icon: 'frame_inspect',
  },
]

function formatSessionTitle(title: string | null | undefined): string {
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle)
    return '新对话'

  const trimmedTitle = normalizedTitle.replace(/^Loopy[\s\-_:：·]*/i, '').trim()
  if (!trimmedTitle || trimmedTitle === '对话')
    return '新对话'
  return trimmedTitle
}

function buildDialogTitlePreview(content: string | null | undefined): string {
  const compact = String(content || '').replace(/\s+/g, ' ').trim()
  if (!compact)
    return ''
  if (compact.length <= 16)
    return compact
  return `${compact.slice(0, 16)}…`
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function formatSessionClock(value: string | null | undefined): string {
  if (!value)
    return '--'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '--'

  if (isSameDay(date, new Date())) {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function formatSessionDate(value: string | null | undefined): string {
  if (!value)
    return '刚刚'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '刚刚'

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function formatSessionMeta(session: { messageCount: number, lastMessageAt: string | null, updatedAt: string }): string {
  return `${session.messageCount} 条消息 · ${formatSessionDate(session.lastMessageAt || session.updatedAt)}`
}

function formatMessageContent(message: { role: string, content: string }): string {
  const normalizedContent = String(message.content || '')
  if (message.role !== 'assistant')
    return normalizedContent

  if (normalizedContent === '我是 Loopy。当前没有可用工作区，暂时无法开始对话。')
    return '当前没有可用工作区，暂时无法开始对话。'
  if (normalizedContent === '我是 Loopy。当前工作空间已配备 AI 能力，你可以随时问我项目、赛事、资料和协作问题。')
    return '当前工作空间已接入 AI 能力，你可以随时询问项目、赛事、资料和协作问题。'
  return normalizedContent
}

function buildRenderedMessage(message: { role: 'system' | 'assistant' | 'user', content: string, metadata?: Record<string, unknown> }) {
  return {
    ...message,
    content: formatMessageContent(message),
  }
}

function resolveLoopySystemMessageIcon(message: { role: 'system' | 'assistant' | 'user', content: string, metadata?: Record<string, unknown> }): string {
  const view = resolveWorkspaceStreamSystemMessageView(message)
  if (!view)
    return 'info'
  return view.eventType === 'tool' ? 'terminal' : 'progress_activity'
}

const loopyState = useLoopyDialog({
  getGreeting: () => {
    if (!hasAvailableWorkspace.value)
      return '当前没有可用工作区，暂时无法开始对话。'
    return '当前工作空间已接入 AI 能力，你可以随时询问项目、赛事、资料和协作问题。'
  },
  getSessionTitle: () => '新对话',
})

const {
  selectedWorkspaceId: loopySelectedWorkspaceId,
  sessions: loopySessions,
  activeSessionId: loopyActiveSessionId,
  messages: loopyMessages,
  chatInput: loopyChatInput,
  chatLoading: loopyChatLoading,
  statusText: loopyStatusText,
  errorText: loopyErrorText,
  canSend: loopyCanSend,
  showSuggestions: loopyShowSuggestions,
  syncWorkspace: syncLoopyWorkspace,
  switchSession: switchLoopySession,
  startNewSession: startNewLoopySession,
  sendMessage: sendLoopyMessage,
  useSuggestion: useLoopySuggestion,
} = loopyState

const route = useRoute()
const normalizedPath = computed(() => route.path.replace(/\/+$/, '') || '/')
const isDashboardIndex = computed(() => normalizedPath.value === '/dashboard')

const activeSession = computed(() => {
  return loopySessions.value.find(item => item.id === loopyActiveSessionId.value) || null
})

const firstUserMessageTitle = computed(() => {
  const firstUserMessage = loopyMessages.value.find(item => item.role === 'user')
  return buildDialogTitlePreview(firstUserMessage?.content)
})

function resolveVisibleSessionTitle(session: { id: string, title: string } | null | undefined): string {
  const normalizedTitle = formatSessionTitle(session?.title)
  if (normalizedTitle !== '新对话')
    return normalizedTitle
  if (session?.id && session.id === loopyActiveSessionId.value && firstUserMessageTitle.value)
    return firstUserMessageTitle.value
  return normalizedTitle
}

const chatPanelTitle = computed(() => {
  return resolveVisibleSessionTitle(activeSession.value) || '新对话'
})

const chatPanelSubtitle = computed(() => {
  if (!loopySelectedWorkspaceId.value)
    return '当前没有可用工作区，暂时无法开始对话。'
  return ''
})

const shouldHideGreetingMessage = computed(() => {
  return loopyShowSuggestions.value
    && loopyMessages.value.length > 0
    && loopyMessages.value[0]?.role === 'assistant'
})

const visibleMessages = computed(() => {
  if (!shouldHideGreetingMessage.value)
    return loopyMessages.value
  return loopyMessages.value.slice(1)
})

const showSuggestionCards = computed(() => {
  return Boolean(loopySelectedWorkspaceId.value) && loopyShowSuggestions.value
})

const composerQuickActions = [
  {
    id: 'attachment',
    label: '附件',
    icon: 'attach_file',
    prefix: '请结合附件内容回答：',
  },
  {
    id: 'knowledge',
    label: '@ 资料',
    icon: 'alternate_email',
    prefix: '@资料 ',
  },
  {
    id: 'command',
    label: '/ 命令',
    icon: 'terminal',
    prefix: '/ ',
  },
] as const

function focusComposer() {
  requestAnimationFrame(() => {
    composerRef.value?.focus()
  })
}

function applyComposerAction(prefix: string) {
  if (!loopySelectedWorkspaceId.value)
    return

  const normalizedPrefix = String(prefix || '')
  if (!normalizedPrefix.trim()) {
    focusComposer()
    return
  }

  const current = String(loopyChatInput.value || '')
  const nextValue = current.trim()
    ? `${current.trimEnd()} ${normalizedPrefix}`
    : normalizedPrefix

  loopyChatInput.value = nextValue
  focusComposer()
}

async function loadAuthContext() {
  loading.value = true
  errorText.value = ''

  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    workspaceOptions.value = resolveWorkspaceOptions(response.data)

    const storedWorkspaceId = readActiveWorkspacePreference()
    const nextWorkspaceId = [
      storedWorkspaceId,
      workspaceOptions.value.find(item => item.workspace.type === 'team')?.workspace.id,
      workspaceOptions.value[0]?.workspace.id,
    ].find(workspaceId => workspaceId && workspaceOptions.value.some(item => item.workspace.id === workspaceId)) || ''

    await syncLoopyWorkspace(nextWorkspaceId)
  }
  catch (error: any) {
    const info = resolveAuthRequestErrorInfo(error)
    workspaceOptions.value = []
    if (info.isUnauthorized) {
      await navigateTo({
        path: '/login',
        query: { redirect: resolveLoginRedirectTarget(route, '/dashboard') },
      }, { replace: true })
      return
    }
    errorText.value = resolveAuthDisplayMessage(error, '对话初始化失败，请稍后重试。')
    await syncLoopyWorkspace('')
  }
  finally {
    loading.value = false
  }
}

watch(
  () => [
    loopyMessages.value.length,
    loopyMessages.value[loopyMessages.value.length - 1]?.content || '',
    loopyChatLoading.value,
  ],
  async () => {
    await nextTick()
    if (messageScrollRef.value)
      messageScrollRef.value.scrollTop = messageScrollRef.value.scrollHeight
  },
)

onMounted(() => {
  void loadAuthContext()
})
</script>

<template>
  <div class="contents">
    <NuxtPage v-if="!isDashboardIndex" />
    <section
      v-else
      class="bg-[linear-gradient(180deg,#f6f8fd_0%,#f4f7fb_100%)] flex h-full min-h-0 min-w-0 w-full overflow-hidden"
      data-testid="dashboard-loopy-home"
    >
      <div class="loopy-page-shell grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[308px_minmax(0,1fr)]">
        <aside
          data-testid="dashboard-loopy-sidebar"
          class="loopy-page-sidebar flex flex-col min-h-0 overflow-hidden lg:h-full"
        >
          <div class="px-3 py-3 border-b border-slate-200/80 flex shrink-0 gap-2 items-center justify-between">
            <p class="text-[12px] text-slate-500 font-semibold tabular-nums">
              {{ loopySessions.length }} 条会话
            </p>
            <button
              class="loopy-page-ghost-btn"
              type="button"
              @click="startNewLoopySession"
            >
              <span class="material-symbols-outlined text-[18px]">add</span>
              新建
            </button>
          </div>

          <div
            data-testid="dashboard-loopy-session-list"
            class="loopy-page-sidebar__body p-2 flex-1 min-h-0 overflow-y-auto"
          >
            <div v-if="loading" class="space-y-2">
              <div
                v-for="index in 6"
                :key="`dashboard-loopy-session-skeleton-${index}`"
                class="rounded-lg bg-slate-100/90 h-[68px] animate-pulse"
              />
            </div>

            <div v-else class="space-y-2">
              <button
                v-for="session in loopySessions"
                :key="session.id"
                class="loopy-page-session"
                :class="session.id === loopyActiveSessionId ? 'loopy-page-session--active' : ''"
                type="button"
                @click="switchLoopySession(session.id)"
              >
                <span class="loopy-page-session__icon" :class="session.id === loopyActiveSessionId ? 'loopy-page-session__icon--active' : ''">
                  <span class="material-symbols-outlined text-[18px]">chat_bubble</span>
                </span>
                <span class="loopy-page-session__content">
                  <span class="loopy-page-session__row">
                    <span class="loopy-page-session__title line-clamp-1">{{ resolveVisibleSessionTitle(session) }}</span>
                    <span class="loopy-page-session__time">{{ formatSessionClock(session.lastMessageAt || session.updatedAt) }}</span>
                  </span>
                  <span class="loopy-page-session__meta line-clamp-1">{{ formatSessionMeta(session) }}</span>
                </span>
              </button>

              <p v-if="loopySessions.length === 0" class="text-xs text-slate-400 leading-6 px-3 py-4">
                还没有历史会话，发起第一轮提问即可。
              </p>
            </div>
          </div>
        </aside>

        <section class="loopy-page-main flex flex-col min-h-0 overflow-hidden lg:h-full">
          <header class="loopy-page-header">
            <div class="loopy-page-titlebox">
              <span class="loopy-page-titlebox__icon">
                <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
              </span>
              <div class="min-w-0">
                <h2 class="loopy-page-title truncate">
                  {{ chatPanelTitle }}
                </h2>
                <p v-if="chatPanelSubtitle" class="text-sm text-slate-400 leading-6 mt-1 truncate">
                  {{ chatPanelSubtitle }}
                </p>
              </div>
            </div>
          </header>

          <div v-if="loading" class="p-4 flex-1 space-y-3">
            <div class="rounded-xl bg-slate-100 h-24 animate-pulse" />
            <div class="gap-3 grid xl:grid-cols-2">
              <div class="rounded-xl bg-slate-100 h-28 animate-pulse" />
              <div class="rounded-xl bg-slate-100 h-28 animate-pulse" />
            </div>
            <div class="rounded-xl bg-slate-100 h-40 animate-pulse" />
          </div>

          <div v-else class="loopy-page-stage flex flex-1 flex-col min-h-0 overflow-hidden">
            <p v-if="loopyStatusText" class="loopy-page-banner loopy-page-banner--info">
              {{ loopyStatusText }}
            </p>
            <p v-if="errorText || loopyErrorText" class="loopy-page-banner loopy-page-banner--error">
              {{ errorText || loopyErrorText }}
            </p>

            <div
              ref="messageScrollRef"
              data-testid="dashboard-loopy-messages"
              class="loopy-page-scroll flex-1 min-h-0 overflow-y-auto"
            >
              <div class="loopy-page-scroll__inner">
                <section v-if="showSuggestionCards" class="loopy-page-suggestions">
                  <div class="loopy-page-section-label">
                    <span class="material-symbols-outlined text-[18px]">tips_and_updates</span>
                    <span>推荐提问</span>
                  </div>
                  <div class="loopy-page-suggestions__grid">
                    <button
                      v-for="item in suggestionPrompts"
                      :key="item.prompt"
                      data-testid="dashboard-loopy-suggestion"
                      class="loopy-page-suggestion"
                      type="button"
                      @click="useLoopySuggestion(item.prompt)"
                    >
                      <span class="loopy-page-suggestion__icon">
                        <span class="material-symbols-outlined text-[18px]">{{ item.icon }}</span>
                      </span>
                      <span class="loopy-page-suggestion__text">{{ item.prompt }}</span>
                      <span class="loopy-page-suggestion__arrow">
                        <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </span>
                    </button>
                  </div>
                </section>

                <div v-if="visibleMessages.length > 0" class="space-y-4">
                  <div
                    v-for="(message, index) in visibleMessages"
                    :key="`${message.role}-${index}`"
                    class="flex"
                    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                  >
                    <div
                      v-if="message.role === 'system' && resolveWorkspaceStreamSystemMessageView(message)"
                      class="loopy-page-system-message"
                      :class="`loopy-page-system-message--${resolveWorkspaceStreamSystemMessageView(message)?.eventType || 'progress'}`"
                    >
                      <span class="loopy-page-system-message__icon">
                        <span class="material-symbols-outlined text-[15px]">
                          {{ resolveLoopySystemMessageIcon(message) }}
                        </span>
                      </span>
                      <div class="loopy-page-system-message__body">
                        <div class="loopy-page-system-message__title-row">
                          <span class="loopy-page-system-message__badge">
                            {{ resolveWorkspaceStreamSystemMessageView(message)?.eventType === 'tool' ? '工具' : '进度' }}
                          </span>
                          <span class="loopy-page-system-message__title">
                            {{ resolveWorkspaceStreamSystemMessageView(message)?.title }}
                          </span>
                        </div>
                        <code
                          v-if="resolveWorkspaceStreamSystemMessageView(message)?.payloadSummary"
                          class="loopy-page-system-message__payload"
                        >
                          {{ resolveWorkspaceStreamSystemMessageView(message)?.payloadSummary }}
                        </code>
                      </div>
                    </div>

                    <article
                      v-else
                      class="loopy-page-bubble"
                      :class="message.role === 'user' ? 'loopy-page-bubble--user' : 'loopy-page-bubble--assistant'"
                    >
                      <template v-if="message.role === 'assistant'">
                        <WorkspaceAssistantMessageContent
                          class="loopy-page-bubble__assistant-content"
                          :message="buildRenderedMessage(message)"
                        />
                      </template>
                      <div v-else class="loopy-page-bubble__plain">
                        {{ formatMessageContent(message) }}
                      </div>
                    </article>
                  </div>
                </div>

                <p
                  v-else-if="!showSuggestionCards"
                  class="text-sm text-slate-400 leading-6 py-10"
                >
                  还没有消息，直接在底部输入问题即可开始。
                </p>
              </div>
            </div>

            <footer class="loopy-page-footer shrink-0">
              <div class="loopy-page-composer">
                <textarea
                  ref="composerRef"
                  :value="loopyChatInput"
                  data-testid="dashboard-loopy-composer"
                  class="loopy-page-textarea"
                  :placeholder="loopySelectedWorkspaceId ? '直接输入内容，开始一轮新的对话' : '当前没有可用工作区，暂时无法发起对话'"
                  :disabled="!loopySelectedWorkspaceId"
                  @input="loopyChatInput = ($event.target as HTMLTextAreaElement).value"
                />
                <div class="loopy-page-composer__footer">
                  <div class="loopy-page-composer__tools">
                    <button
                      v-for="action in composerQuickActions"
                      :key="action.id"
                      class="loopy-page-composer__tool"
                      type="button"
                      :disabled="!loopySelectedWorkspaceId"
                      @click="applyComposerAction(action.prefix)"
                    >
                      <span class="material-symbols-outlined text-[18px]">{{ action.icon }}</span>
                      <span>{{ action.label }}</span>
                    </button>
                  </div>

                  <div class="loopy-page-composer__controls">
                    <button
                      class="loopy-page-ai-selector"
                      type="button"
                      :disabled="!loopySelectedWorkspaceId"
                    >
                      <span class="material-symbols-outlined text-[16px]">auto_awesome</span>
                      <span>AI 回答速度</span>
                      <span class="loopy-page-ai-selector__value">快速</span>
                      <span class="material-symbols-outlined text-[16px]">expand_more</span>
                    </button>

                    <button
                      class="loopy-page-send"
                      type="button"
                      :disabled="!loopyCanSend || !loopyChatInput.trim()"
                      @click="sendLoopyMessage()"
                    >
                      <span class="material-symbols-outlined text-[18px]">{{ loopyChatLoading ? 'hourglass_top' : 'send' }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.loopy-page-shell {
  position: relative;
  border: none;
  border-radius: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%);
  box-shadow: none;
}

.loopy-page-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.68) 0%, rgba(239, 246, 255, 0.16) 100%);
  pointer-events: none;
}

.loopy-page-sidebar,
.loopy-page-main {
  position: relative;
  z-index: 1;
}

.loopy-page-sidebar {
  border-right: 1px solid #dbe4f2;
  background: linear-gradient(180deg, #fbfcff 0%, #f7faff 100%);
}

.loopy-page-sidebar__body {
  scrollbar-width: thin;
  scrollbar-color: #d9e1ef transparent;
}

.loopy-page-ghost-btn {
  height: 38px;
  padding: 0 12px;
  border: 1px solid #dbe4f2;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  color: #334155;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.loopy-page-ghost-btn:hover {
  border-color: #bfd2f8;
  color: #0f172a;
  background: #fff;
}

.loopy-page-session {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: #334155;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  text-align: left;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.loopy-page-session:hover {
  background: linear-gradient(180deg, #eff5ff 0%, #e7f0ff 100%);
  box-shadow: none;
}

.loopy-page-session--active {
  background: linear-gradient(180deg, #eff5ff 0%, #e7f0ff 100%);
  color: #0f172a;
  box-shadow: none;
}

.loopy-page-session__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: #edf3ff;
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.loopy-page-session__icon--active {
  background: #2f6af2;
  color: #fff;
}

.loopy-page-session:hover .loopy-page-session__icon {
  background: #2f6af2;
  color: #fff;
}

.loopy-page-session__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.loopy-page-session__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.loopy-page-session__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.loopy-page-session__time {
  font-size: 12px;
  line-height: 1.2;
  color: #94a3b8;
  flex-shrink: 0;
}

.loopy-page-session__meta {
  font-size: 12px;
  line-height: 1.45;
  color: #94a3b8;
}

.loopy-page-main {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 251, 255, 0.98) 100%);
  font-size: 1rem;
}

.loopy-page-header {
  padding: 0.75rem 1rem;
  border-bottom: none;
}

.loopy-page-titlebox {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.loopy-page-titlebox__icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.625rem;
  background: #edf4ff;
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.loopy-page-title {
  margin: 0;
  color: #0f172a;
  font-size: 1.5rem;
  line-height: 1.15;
  font-weight: 600;
}

.loopy-page-stage {
  position: relative;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(250, 252, 255, 0.98) 100%);
}

.loopy-page-stage::after {
  content: '';
  position: absolute;
  right: -96px;
  bottom: -20px;
  width: min(52vw, 760px);
  height: 360px;
  background:
    repeating-radial-gradient(circle at 68% 72%, rgba(148, 163, 184, 0.22) 0 1px, transparent 1px 18px),
    radial-gradient(circle at 48% 55%, rgba(191, 219, 254, 0.34), transparent 42%),
    radial-gradient(circle at 70% 82%, rgba(96, 165, 250, 0.22), transparent 28%);
  opacity: 0.58;
  transform: rotate(-10deg);
  pointer-events: none;
}

.loopy-page-stage > * {
  position: relative;
  z-index: 1;
}

.loopy-page-banner {
  margin: 0;
  padding: 0.625rem 1rem;
  font-size: 0.75rem;
  line-height: 1.5;
  border-radius: 0;
}

.loopy-page-banner--info {
  color: #1d4ed8;
  background: rgba(239, 246, 255, 0.9);
  border: 1px solid rgba(191, 219, 254, 0.9);
  border-left: none;
  border-right: none;
}

.loopy-page-banner--error {
  color: #be123c;
  background: rgba(255, 241, 242, 0.94);
  border: 1px solid rgba(254, 205, 211, 0.96);
  border-left: none;
  border-right: none;
}

.loopy-page-scroll {
  scrollbar-width: thin;
  scrollbar-color: #d9e1ef transparent;
}

.loopy-page-scroll__inner {
  width: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 100%;
  padding: 0.75rem 1rem 1rem;
}

.loopy-page-suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.loopy-page-section-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #607596;
  font-size: 0.8125rem;
  font-weight: 600;
}

.loopy-page-suggestions__grid {
  display: grid;
  gap: 0.625rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.loopy-page-bubble {
  max-width: min(52rem, 80%);
  border-radius: 0.875rem;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.03);
}

.loopy-page-bubble--assistant {
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.loopy-page-bubble--user {
  background: linear-gradient(180deg, #eff5ff 0%, #e6efff 100%);
  color: #1e3a8a;
  border: 1px solid #c7dafc;
  padding: 0.75rem 0.875rem;
}

.loopy-page-bubble__plain {
  font-size: 0.875rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.loopy-page-bubble__assistant-content {
  --wl-ws-font-xs: 14px;
  --wl-ws-font-sm: 14px;
  --wl-ws-font-md: 14px;
  --wl-ws-font-lg: 14px;
  --wl-ws-font-xl: 15px;
  --wl-ws-font-2xl: 16px;
  width: 100%;
  padding: 0.875rem 1rem;
}

.loopy-page-bubble__assistant-content :deep(.workspace-chat-markdown) {
  line-height: 1.65;
}

.loopy-page-bubble__assistant-content :deep(.workspace-chat-markdown__paragraph) {
  color: #334155;
}

.loopy-page-bubble__assistant-content :deep(.workspace-chat-markdown__code-block) {
  margin-top: 0.625rem;
}

.loopy-page-bubble__assistant-content :deep(.workspace-assistant-message-content) {
  gap: 0.625rem;
}

.loopy-page-system-message {
  max-width: min(36rem, 78%);
  padding: 0.625rem 0.75rem;
  border: 1px solid rgba(214, 223, 238, 0.96);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: #475569;
  display: inline-flex;
  align-items: flex-start;
  gap: 0.625rem;
}

.loopy-page-system-message--progress {
  border-color: rgba(191, 219, 254, 0.96);
  background: rgba(248, 251, 255, 0.82);
}

.loopy-page-system-message--tool {
  border-color: rgba(226, 232, 240, 0.96);
  background: rgba(255, 255, 255, 0.8);
}

.loopy-page-system-message__icon {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.96);
  color: #2563eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.loopy-page-system-message--tool .loopy-page-system-message__icon {
  background: rgba(241, 245, 249, 0.96);
  color: #475569;
}

.loopy-page-system-message__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.loopy-page-system-message__title-row {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.loopy-page-system-message__badge {
  padding: 0.125rem 0.375rem;
  border-radius: 8px;
  background: rgba(37, 99, 235, 0.08);
  color: #2563eb;
  font-size: 0.6875rem;
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.loopy-page-system-message--tool .loopy-page-system-message__badge {
  background: rgba(15, 23, 42, 0.06);
  color: #475569;
}

.loopy-page-system-message__title {
  min-width: 0;
  color: #334155;
  font-size: 0.8125rem;
  line-height: 1.5;
  font-weight: 600;
}

.loopy-page-system-message__payload {
  margin: 0;
  padding: 0.125rem 0;
  color: #64748b;
  font-size: 0.75rem;
  line-height: 1.45;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.loopy-page-suggestion {
  padding: 0.875rem 1rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.875rem;
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: left;
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) 1rem;
  gap: 0.75rem;
  align-items: center;
  min-height: 4.75rem;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.loopy-page-suggestion:hover {
  border-color: #c6d8fb;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.04);
  transform: translateY(-1px);
}

.loopy-page-suggestion__icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.75rem;
  background: #edf4ff;
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.loopy-page-suggestion__text {
  min-width: 0;
  font-weight: 600;
}

.loopy-page-suggestion__arrow {
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.loopy-page-footer {
  padding: 0;
  border-top: none;
  background: transparent;
}

.loopy-page-composer {
  position: relative;
  border: none;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  box-shadow: none;
  overflow: visible;
}

.loopy-page-textarea {
  width: 100%;
  min-height: 8.5rem;
  resize: none;
  border: none;
  background: transparent;
  color: #0f172a;
  font-size: 0.875rem;
  line-height: 1.55;
  padding: 0.875rem 1rem 4rem;
  outline: none;
}

.loopy-page-textarea:focus {
  box-shadow: inset 0 0 0 1px #60a5fa;
}

.loopy-page-composer__footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.625rem;
  padding: 0.5rem 1rem 0.75rem;
}

.loopy-page-composer__tools {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.loopy-page-composer__controls {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.loopy-page-composer__tool {
  height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.96);
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.loopy-page-composer__tool:hover:not(:disabled) {
  border-color: #bfd2f8;
  color: #1d4ed8;
  background: #fff;
}

.loopy-page-composer__tool:disabled {
  opacity: 0.5;
}

.loopy-page-ai-selector {
  height: 2.375rem;
  padding: 0 0.75rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.96);
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.loopy-page-ai-selector:hover:not(:disabled) {
  border-color: #bfd2f8;
  color: #1d4ed8;
  background: #fff;
}

.loopy-page-ai-selector:disabled {
  opacity: 0.5;
}

.loopy-page-ai-selector__value {
  color: #2f6af2;
}

.loopy-page-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  border-radius: 0.75rem;
  background: linear-gradient(180deg, #8bb0ff 0%, #6e97f6 100%);
  color: #fff;
  box-shadow: 0 14px 26px rgba(79, 121, 227, 0.28);
}

.loopy-page-send:disabled {
  opacity: 0.45;
  box-shadow: none;
}

@media (max-width: 1279px) {
  .loopy-page-suggestions__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1023px) {
  .loopy-page-stage::after {
    width: 88vw;
    right: -120px;
    bottom: 30px;
  }

  .loopy-page-header {
    padding-left: 0.875rem;
    padding-right: 0.875rem;
  }
}

@media (max-width: 767px) {
  .loopy-page-header {
    padding: 0.75rem 0.75rem 0.625rem;
  }

  .loopy-page-titlebox__icon {
    width: 1.625rem;
    height: 1.625rem;
    border-radius: 0.625rem;
  }

  .loopy-page-title {
    font-size: 1.25rem;
  }

  .loopy-page-scroll__inner {
    gap: 0.625rem;
    padding: 0.5rem 0.75rem 0.875rem;
  }

  .loopy-page-suggestion {
    min-height: 4.25rem;
    padding: 0.75rem 0.875rem;
    grid-template-columns: 2rem minmax(0, 1fr) 1rem;
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  .loopy-page-system-message {
    max-width: 100%;
    padding: 0.5rem 0.625rem;
    border-radius: 14px;
  }

  .loopy-page-textarea {
    min-height: 8rem;
    padding: 0.75rem 0.75rem 5.5rem;
    font-size: 0.875rem;
  }

  .loopy-page-composer__footer {
    align-items: stretch;
    flex-direction: column;
    padding: 0.5rem 0.75rem 0.75rem;
  }

  .loopy-page-composer__tools {
    gap: 0.5rem;
  }

  .loopy-page-composer__controls {
    justify-content: flex-end;
  }

  .loopy-page-composer__tool {
    height: 2.25rem;
    padding: 0 0.75rem;
    font-size: 0.75rem;
  }

  .loopy-page-send {
    width: 2.625rem;
    height: 2.625rem;
  }
}
</style>
