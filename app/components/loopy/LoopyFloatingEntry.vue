<script setup lang="ts">
import type { WorkspaceWithQuota } from '~~/shared/types/domain'
import { readActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

const props = withDefaults(defineProps<{
  workspaceOptions?: WorkspaceWithQuota[]
}>(), {
  workspaceOptions: () => [],
})

const route = useRoute()

const panelVisible = ref(false)

const suggestionPrompts = [
  '帮我总结当前工作空间里最值得关注的问题。',
  '基于现有资料，给我一个本周推进建议清单。',
  '这个工作空间最近适合优先跟进哪些竞赛方向？',
  '请帮我梳理我应该先看的资料和项目线索。',
]

const preferredWorkspaceId = computed(() => {
  const normalizedPath = route.path.replace(/\/+$/, '')
  const matchedTeamRoute = normalizedPath.match(/^\/team\/([^/]+)$/)
  if (matchedTeamRoute?.[1])
    return matchedTeamRoute[1]

  const storedWorkspaceId = readActiveWorkspacePreference()
  if (storedWorkspaceId && props.workspaceOptions.some(item => item.workspace.id === storedWorkspaceId))
    return storedWorkspaceId

  return props.workspaceOptions[0]?.workspace.id || ''
})

const selectedWorkspace = computed(() => {
  return props.workspaceOptions.find(item => item.workspace.id === preferredWorkspaceId.value) || null
})

const loopyState = useLoopyDialog({
  getGreeting: () => {
    if (!selectedWorkspace.value)
      return '我是 Loopy。当前没有可用工作空间，暂时无法开始对话。'
    return `我是 Loopy。当前工作空间「${selectedWorkspace.value.workspace.name}」已配备 AI 能力，你可以随时问我项目、赛事、资料和协作问题。`
  },
  getSessionTitle: () => '新对话',
})

const {
  selectedWorkspaceId: loopySelectedWorkspaceId,
  sessions: loopySessions,
  activeSessionId: loopyActiveSessionId,
  messages: loopyMessages,
  chatInput: loopyChatInput,
  loadingSessions: loopyLoadingSessions,
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
  resetConversation: resetLoopyConversation,
} = loopyState

const loopySessionOptions = computed(() => [
  { label: loopyLoadingSessions.value ? '加载中...' : '新会话', value: '' },
  ...loopySessions.value.map(session => ({ label: session.title, value: session.id })),
])

watch(
  () => [preferredWorkspaceId.value, props.workspaceOptions.map(item => item.workspace.id).join('|')],
  async () => {
    const nextWorkspaceId = preferredWorkspaceId.value
    if (!nextWorkspaceId) {
      await syncLoopyWorkspace('')
      return
    }
    await syncLoopyWorkspace(nextWorkspaceId)
  },
  { immediate: true },
)

watch(
  () => [
    route.fullPath,
    loopySelectedWorkspaceId.value,
  ],
  () => {
    if (loopySessions.value.length === 0)
      resetLoopyConversation()
  },
)

function togglePanel() {
  panelVisible.value = !panelVisible.value
}
</script>

<template>
  <div class="loopy-floating-root">
    <transition name="loopy-panel">
      <section
        v-if="panelVisible"
        class="loopy-floating-panel"
        data-testid="loopy-floating-panel"
      >
        <header class="loopy-floating-panel__header">
          <div>
            <h3 class="text-base text-slate-950 font-semibold">
              Loopy
            </h3>
            <p class="text-[11px] text-slate-500 mt-1">
              {{ selectedWorkspace?.workspace.name || '未连接工作空间' }}
            </p>
          </div>

          <button
            class="text-slate-400 rounded-lg flex h-8 w-8 transition-colors items-center justify-center hover:text-slate-700 hover:bg-slate-100"
            type="button"
            aria-label="关闭 Loopy"
            @click="panelVisible = false"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>

        <div class="loopy-floating-panel__toolbar">
          <div class="loopy-floating-panel__field loopy-floating-panel__field--sessions">
            <span class="loopy-floating-panel__label">会话</span>
            <div class="flex gap-2 items-center">
              <UiSelect
                :model-value="loopyActiveSessionId"
                :options="loopySessionOptions"
                size="sm"
                aria-label="Loopy 会话"
                @change="value => switchLoopySession(String(value || ''))"
              />
              <button
                class="loopy-floating-panel__ghost-btn"
                type="button"
                @click="startNewLoopySession"
              >
                新建
              </button>
            </div>
          </div>
        </div>

        <p
          v-if="loopyStatusText"
          class="text-[11px] text-blue-700 px-4 pt-3"
        >
          {{ loopyStatusText }}
        </p>
        <p
          v-if="loopyErrorText"
          class="text-[11px] text-rose-600 px-4 pt-2"
        >
          {{ loopyErrorText }}
        </p>

        <div class="loopy-floating-panel__messages">
          <div
            v-for="(message, index) in loopyMessages"
            :key="`${message.role}-${index}`"
            class="flex"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="loopy-floating-panel__bubble"
              :class="message.role === 'user' ? 'loopy-floating-panel__bubble--user' : 'loopy-floating-panel__bubble--assistant'"
            >
              {{ message.content }}
            </div>
          </div>

          <div
            v-if="loopyShowSuggestions"
            class="loopy-floating-panel__suggestions"
          >
            <button
              v-for="question in suggestionPrompts"
              :key="question"
              class="loopy-floating-panel__suggestion"
              type="button"
              @click="useLoopySuggestion(question)"
            >
              {{ question }}
            </button>
          </div>
        </div>

        <footer class="loopy-floating-panel__composer">
          <textarea
            :value="loopyChatInput"
            class="loopy-floating-panel__textarea"
            :placeholder="loopySelectedWorkspaceId ? '问 Loopy 任何与项目、赛事、资料、协作相关的问题' : '当前没有可用工作空间，暂时无法发起对话'"
            :disabled="!loopySelectedWorkspaceId"
            @input="loopyChatInput = ($event.target as HTMLTextAreaElement).value"
          />
          <button
            class="loopy-floating-panel__send"
            data-testid="loopy-floating-send"
            type="button"
            :disabled="!loopyCanSend || !loopyChatInput.trim()"
            @click="sendLoopyMessage()"
          >
            <span class="material-symbols-outlined text-[18px]">{{ loopyChatLoading ? 'hourglass_top' : 'send' }}</span>
          </button>
        </footer>
      </section>
    </transition>

    <button
      class="loopy-floating-trigger"
      data-testid="loopy-floating-trigger"
      type="button"
      :aria-expanded="panelVisible"
      @click="togglePanel"
    >
      <span class="material-symbols-outlined text-[20px]">smart_toy</span>
      <span>Loopy</span>
    </button>
  </div>
</template>

<style scoped>
.loopy-floating-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}

.loopy-floating-trigger {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 18px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 18px 44px rgba(37, 99, 235, 0.24);
}

.loopy-floating-panel {
  width: min(420px, calc(100vw - 24px));
  max-height: min(78vh, 720px);
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
  overflow: hidden;
  border: 1px solid #dbe6ff;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(18px);
}

.loopy-floating-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid #eef2ff;
}

.loopy-floating-panel__toolbar {
  display: grid;
  gap: 10px;
  padding: 14px 18px 0;
}

.loopy-floating-panel__field {
  display: grid;
  gap: 6px;
}

.loopy-floating-panel__field--sessions {
  padding-bottom: 4px;
}

.loopy-floating-panel__label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}

.loopy-floating-panel__select {
  width: 100%;
  height: 36px;
  border: 1px solid #dbe2f1;
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  padding: 0 12px;
  outline: none;
}

.loopy-floating-panel__select:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 1px #60a5fa;
}

.loopy-floating-panel__ghost-btn {
  flex-shrink: 0;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #dbe2f1;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
}

.loopy-floating-panel__messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px;
}

.loopy-floating-panel__bubble {
  max-width: 86%;
  padding: 10px 12px;
  border-radius: 16px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.loopy-floating-panel__bubble--assistant {
  background: #f8fafc;
  color: #334155;
  border-top-left-radius: 6px;
}

.loopy-floating-panel__bubble--user {
  background: #eff6ff;
  color: #1e3a8a;
  border: 1px solid #bfdbfe;
  border-top-right-radius: 6px;
}

.loopy-floating-panel__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.loopy-floating-panel__suggestion {
  padding: 8px 10px;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  line-height: 1.4;
  text-align: left;
}

.loopy-floating-panel__composer {
  position: relative;
  padding: 0 18px 18px;
}

.loopy-floating-panel__textarea {
  width: 100%;
  min-height: 108px;
  resize: none;
  border: 1px solid #dbe2f1;
  border-radius: 16px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.6;
  padding: 12px 52px 12px 14px;
  outline: none;
}

.loopy-floating-panel__textarea:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 1px #60a5fa;
}

.loopy-floating-panel__send {
  position: absolute;
  right: 30px;
  bottom: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
}

.loopy-floating-panel__send:disabled {
  opacity: 0.45;
}

.loopy-panel-enter-active,
.loopy-panel-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.loopy-panel-enter-from,
.loopy-panel-leave-to {
  opacity: 0;
  transform: translate3d(0, 12px, 0) scale(0.98);
}

@media (max-width: 768px) {
  .loopy-floating-root {
    right: 14px;
    bottom: 14px;
    left: 14px;
    align-items: stretch;
  }

  .loopy-floating-panel {
    width: 100%;
  }

  .loopy-floating-trigger {
    justify-content: center;
    width: 100%;
  }
}
</style>
