<script setup lang="ts">
import type { ApiResponse, AuthMeResult, WorkspaceWithQuota } from '~~/shared/types/domain'
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
const hasAvailableWorkspace = computed(() => workspaceOptions.value.length > 0)

const suggestionPrompts = [
  '帮我梳理当前工作空间里最值得优先关注的事项。',
  '如果我要推进一个新项目，应该先看哪些资料和赛事？',
  '请把这个工作空间当前可见的信息总结成一段简报。',
  '从工作空间视角看，哪些问题最需要先补齐？',
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

function formatSessionTime(value: string | null | undefined): string {
  if (!value)
    return '刚刚'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '刚刚'

  const diff = Date.now() - date.getTime()
  if (diff < 60 * 1000)
    return '刚刚'
  if (diff < 60 * 60 * 1000)
    return `${Math.max(1, Math.floor(diff / (60 * 1000)))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000)
    return `${Math.max(1, Math.floor(diff / (60 * 60 * 1000)))} 小时前`

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function formatSessionMeta(session: { messageCount: number, lastMessageAt: string | null, updatedAt: string }): string {
  const parts: string[] = []
  parts.push(`${session.messageCount} 条`)
  parts.push(formatSessionTime(session.lastMessageAt || session.updatedAt))
  return parts.join(' · ')
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
      class="flex h-full min-h-0 w-full min-w-0 overflow-hidden"
      data-testid="dashboard-loopy-home"
    >
      <div class="grid h-full min-h-0 w-full overflow-hidden border border-slate-200 rounded-lg bg-white lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          data-testid="dashboard-loopy-sidebar"
          class="border-r border-slate-200 bg-slate-50/55 flex flex-col min-h-0 overflow-hidden lg:h-full"
        >
          <div class="px-2.5 py-2.5 border-b border-slate-200/80 flex shrink-0 items-center justify-between gap-2.5">
            <p class="text-[11px] text-slate-400 tabular-nums font-medium">
              {{ loopySessions.length }} 条会话
            </p>
            <button
              class="loopy-page-ghost-btn"
              type="button"
              @click="startNewLoopySession"
            >
              新建
            </button>
          </div>

          <div
            data-testid="dashboard-loopy-session-list"
            class="p-2.5 flex-1 min-h-0 overflow-y-auto"
          >
            <div v-if="loading" class="space-y-2">
              <div
                v-for="index in 6"
                :key="`dashboard-loopy-session-skeleton-${index}`"
                class="rounded-md bg-slate-100 h-14 animate-pulse"
              />
            </div>

            <div v-else class="space-y-2.5">
              <button
                v-for="session in loopySessions"
                :key="session.id"
                class="loopy-page-session"
                :class="session.id === loopyActiveSessionId ? 'loopy-page-session--active' : ''"
                type="button"
                @click="switchLoopySession(session.id)"
              >
                <span class="loopy-page-session__title line-clamp-1">{{ resolveVisibleSessionTitle(session) }}</span>
                <span class="loopy-page-session__meta line-clamp-1">{{ formatSessionMeta(session) }}</span>
              </button>

              <p v-if="loopySessions.length === 0" class="text-xs text-slate-400 leading-5 px-2 py-3">
                还没有历史会话，发起第一轮提问即可。
              </p>
            </div>
          </div>
        </aside>

        <section class="bg-white flex flex-col min-h-0 overflow-hidden lg:h-full">
          <header class="px-3 py-2.5 border-b border-slate-100 shrink-0 flex items-center justify-between gap-3">
            <h2 class="text-sm text-slate-950 font-semibold truncate">
              {{ chatPanelTitle }}
            </h2>
            <p v-if="chatPanelSubtitle" class="text-xs text-slate-400 leading-5 shrink-0 truncate">
              {{ chatPanelSubtitle }}
            </p>
          </header>

          <div v-if="loading" class="p-3 flex-1 space-y-3">
            <div class="rounded-md bg-slate-100 h-16 animate-pulse" />
            <div class="rounded-md bg-slate-100 h-16 w-10/12 animate-pulse" />
            <div class="rounded-md bg-slate-100 h-16 w-8/12 animate-pulse" />
          </div>

          <div v-else class="flex flex-1 flex-col min-h-0 overflow-hidden">
            <p v-if="loopyStatusText" class="text-xs text-blue-700 px-3 py-2 border-b border-blue-100 bg-blue-50/70">
              {{ loopyStatusText }}
            </p>
            <p v-if="errorText || loopyErrorText" class="text-xs text-rose-600 px-3 py-2 border-b border-rose-100 bg-rose-50/80">
              {{ errorText || loopyErrorText }}
            </p>

            <div
              ref="messageScrollRef"
              data-testid="dashboard-loopy-messages"
              class="px-3 py-3 flex-1 min-h-0 overflow-y-auto"
            >
              <div class="space-y-3">
                <div
                  v-for="(message, index) in loopyMessages"
                  :key="`${message.role}-${index}`"
                  class="flex"
                  :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                  <article
                    class="loopy-page-bubble"
                    :class="message.role === 'user' ? 'loopy-page-bubble--user' : 'loopy-page-bubble--assistant'"
                  >
                    {{ formatMessageContent(message) }}
                  </article>
                </div>

                <section v-if="loopyShowSuggestions && loopySelectedWorkspaceId" class="space-y-2.5">
                  <div class="text-[11px] text-slate-400 tracking-[0.12em] font-medium uppercase">
                    推荐起手问题
                  </div>
                  <div class="gap-2 grid xl:grid-cols-2">
                    <button
                      v-for="question in suggestionPrompts"
                      :key="question"
                      data-testid="dashboard-loopy-suggestion"
                      class="loopy-page-suggestion"
                      type="button"
                      @click="useLoopySuggestion(question)"
                    >
                      {{ question }}
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <footer class="p-3 border-t border-slate-100 shrink-0">
              <div class="relative">
                <textarea
                  :value="loopyChatInput"
                  data-testid="dashboard-loopy-composer"
                  class="loopy-page-textarea"
                  :placeholder="loopySelectedWorkspaceId ? '直接输入内容，开始一轮新的对话' : '当前没有可用工作区，暂时无法发起对话'"
                  :disabled="!loopySelectedWorkspaceId"
                  @input="loopyChatInput = ($event.target as HTMLTextAreaElement).value"
                />
                <button
                  class="loopy-page-send"
                  type="button"
                  :disabled="!loopyCanSend || !loopyChatInput.trim()"
                  @click="sendLoopyMessage()"
                >
                  <span class="material-symbols-outlined text-[18px]">{{ loopyChatLoading ? 'hourglass_top' : 'send' }}</span>
                </button>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.loopy-page-ghost-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #dbe2f1;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 11px;
  font-weight: 600;
}

.loopy-page-session {
  width: 100%;
  padding: 10px 11px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-align: left;
}

.loopy-page-session--active {
  border-color: #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
  box-shadow: inset 2px 0 0 #2563eb;
}

.loopy-page-session__title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.loopy-page-session__meta {
  font-size: 11px;
  line-height: 1.4;
  color: #94a3b8;
}

.loopy-page-bubble {
  max-width: min(840px, 92%);
  padding: 11px 13px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.loopy-page-bubble--assistant {
  background: #f8fafc;
  color: #334155;
  border: 1px solid #e2e8f0;
}

.loopy-page-bubble--user {
  background: #eff6ff;
  color: #1e3a8a;
  border: 1px solid #bfdbfe;
}

.loopy-page-suggestion {
  padding: 12px 13px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #fff;
  color: #1e3a8a;
  font-size: 12px;
  line-height: 1.65;
  text-align: left;
}

.loopy-page-textarea {
  width: 100%;
  min-height: 104px;
  resize: none;
  border: 1px solid #dbe2f1;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.7;
  padding: 14px 56px 14px 16px;
  outline: none;
}

.loopy-page-textarea:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 1px #60a5fa;
}

.loopy-page-send {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
}

.loopy-page-send:disabled {
  opacity: 0.45;
}
</style>
