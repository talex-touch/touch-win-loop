<script setup lang="ts">
import type { ApiResponse, AuthMeResult, WorkspaceWithQuota } from '~~/shared/types/domain'
import { resolveWorkspaceOptions } from '~/composables/team-ui'
import { readActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: 'Loopy',
})

const authApiFetch = useAuthApiFetch()

const loading = ref(true)
const errorText = ref('')
const workspaceOptions = ref<WorkspaceWithQuota[]>([])
const messageScrollRef = ref<HTMLDivElement | null>(null)

const suggestionPrompts = [
  '帮我梳理当前工作空间里最值得优先关注的事项。',
  '如果我要推进一个新项目，应该先看哪些资料和赛事？',
  '请把这个工作空间当前可见的信息总结成一段简报。',
  '从工作空间视角看，哪些问题最需要先补齐？',
]

const loopyState = useLoopyDialog({
  getGreeting: () => {
    if (!loopySelectedWorkspaceId.value)
      return '我是 Loopy。当前没有可用工作区，暂时无法开始对话。'
    return '我是 Loopy。当前工作空间已配备 AI 能力，你可以随时问我项目、赛事、资料和协作问题。'
  },
  getSessionTitle: () => 'Loopy 对话',
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

const activeSession = computed(() => {
  return loopySessions.value.find(item => item.id === loopyActiveSessionId.value) || null
})

const chatPanelTitle = computed(() => {
  return activeSession.value?.title || 'Loopy'
})

const chatPanelSubtitle = computed(() => {
  if (!loopySelectedWorkspaceId.value)
    return '当前没有可用工作区，暂时无法开始对话。'
  if (loopyMessages.value.some(item => item.role === 'user'))
    return 'Loopy 会持续记录当前工作空间的对话历史。'
  return '当前工作空间已配备 Loopy，可随时提问各种问题。'
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
    workspaceOptions.value = []
    errorText.value = String(error?.data?.message || 'Loopy 初始化失败，请稍后重试。')
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
  <section
    class="mx-auto flex h-full min-h-0 max-w-7xl overflow-y-auto lg:overflow-hidden"
    data-testid="dashboard-loopy-home"
  >
    <div class="grid h-full min-h-0 w-full gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside
        data-testid="dashboard-loopy-sidebar"
        class="flex min-h-0 flex-col overflow-hidden border border-slate-200 rounded-3xl bg-white lg:h-full"
      >
        <div class="flex shrink-0 items-center justify-between border-b border-slate-100 p-5">
          <div>
            <p class="text-[11px] text-blue-700 font-semibold tracking-[0.18em] uppercase">
              Loopy
            </p>
            <h1 class="mt-2 text-lg text-slate-950 font-semibold">
              消息记录
            </h1>
          </div>

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
          class="flex-1 min-h-0 overflow-y-auto p-4"
        >
          <div v-if="loading" class="space-y-2">
            <div
              v-for="index in 6"
              :key="`dashboard-loopy-session-skeleton-${index}`"
              class="h-14 rounded-2xl bg-slate-100 animate-pulse"
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
              <span class="line-clamp-2">{{ session.title }}</span>
            </button>

            <p v-if="loopySessions.length === 0" class="px-2 py-3 text-xs text-slate-400 leading-5">
              还没有历史会话，发起第一轮提问即可。
            </p>
          </div>
        </div>
      </aside>

      <section class="flex min-h-0 flex-col overflow-hidden border border-slate-200 rounded-3xl bg-white lg:h-full">
        <header class="shrink-0 border-b border-slate-100 p-6">
          <p class="text-[11px] text-blue-700 font-semibold tracking-[0.18em] uppercase">
            Loopy
          </p>
          <h2 class="mt-3 text-2xl text-slate-950 font-semibold">
            {{ chatPanelTitle }}
          </h2>
          <p class="mt-2 text-sm text-slate-500 leading-6">
            {{ chatPanelSubtitle }}
          </p>
        </header>

        <div v-if="loading" class="flex-1 p-6 space-y-3">
          <div class="rounded-2xl bg-slate-100 h-16 animate-pulse" />
          <div class="rounded-2xl bg-slate-100 h-16 animate-pulse w-10/12" />
          <div class="rounded-2xl bg-slate-100 h-16 animate-pulse w-8/12" />
        </div>

        <div v-else class="flex flex-1 min-h-0 flex-col overflow-hidden">
          <p v-if="loopyStatusText" class="text-xs text-blue-700 px-6 py-3 border-b border-blue-50 bg-blue-50/70">
            {{ loopyStatusText }}
          </p>
          <p v-if="errorText || loopyErrorText" class="text-xs text-rose-600 px-6 py-3 border-b border-rose-100 bg-rose-50/80">
            {{ errorText || loopyErrorText }}
          </p>

          <div
            ref="messageScrollRef"
            data-testid="dashboard-loopy-messages"
            class="flex-1 min-h-0 overflow-y-auto px-6 py-6"
          >
            <div class="space-y-4">
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
                  {{ message.content }}
                </article>
              </div>

              <section v-if="loopyShowSuggestions && loopySelectedWorkspaceId" class="space-y-3">
                <div class="text-[11px] text-slate-400 font-semibold tracking-[0.18em] uppercase">
                  推荐起手问题
                </div>
                <div class="grid gap-3 xl:grid-cols-2">
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

          <footer class="shrink-0 border-t border-slate-100 p-6">
            <div class="relative">
              <textarea
                :value="loopyChatInput"
                data-testid="dashboard-loopy-composer"
                class="loopy-page-textarea"
                :placeholder="loopySelectedWorkspaceId ? '直接问 Loopy，开始一轮新的 AI 对话' : '当前没有可用工作区，暂时无法发起对话'"
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
</template>

<style scoped>
.loopy-page-ghost-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #dbe2f1;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font-size: 11px;
  font-weight: 600;
}

.loopy-page-session {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}

.loopy-page-session--active {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.loopy-page-bubble {
  max-width: min(720px, 86%);
  padding: 14px 16px;
  border-radius: 22px;
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.loopy-page-bubble--assistant {
  background: #f8fafc;
  color: #334155;
  border-top-left-radius: 8px;
}

.loopy-page-bubble--user {
  background: #eff6ff;
  color: #1e3a8a;
  border: 1px solid #bfdbfe;
  border-top-right-radius: 8px;
}

.loopy-page-suggestion {
  padding: 16px 18px;
  border: 1px solid #dbeafe;
  border-radius: 20px;
  background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
  color: #1e3a8a;
  font-size: 13px;
  line-height: 1.7;
  text-align: left;
}

.loopy-page-textarea {
  width: 100%;
  min-height: 128px;
  resize: none;
  border: 1px solid #dbe2f1;
  border-radius: 20px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 14px;
  line-height: 1.75;
  padding: 16px 60px 16px 18px;
  outline: none;
}

.loopy-page-textarea:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 1px #60a5fa;
}

.loopy-page-send {
  position: absolute;
  right: 18px;
  bottom: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
}

.loopy-page-send:disabled {
  opacity: 0.45;
}
</style>
