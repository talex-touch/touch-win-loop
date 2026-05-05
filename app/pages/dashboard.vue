<script setup lang="ts">
import type { AiAssistantOptions, ApiResponse, AuthMeResult, Project, Resource, WorkspaceWithQuota } from '~~/shared/types/domain'
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
const projects = ref<Project[]>([])
const messageScrollRef = ref<HTMLDivElement | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const attachmentInputRef = ref<HTMLInputElement | null>(null)
const hasAvailableWorkspace = computed(() => workspaceOptions.value.length > 0)

type ComposerQuickActionId = 'attachment' | 'knowledge' | 'command'
type ComposerPanelId = 'knowledge' | 'command' | 'speed' | ''
type ResourceSearchScope = 'platform' | 'project'
type AiSpeedId = 'fast' | 'balanced' | 'deep'

interface LoopySelectedResourceContext {
  id: string
  title: string
  scope: ResourceSearchScope
  projectId: string
}

const activeComposerPanel = ref<ComposerPanelId>('')
const selectedLoopyProjectId = ref('')
const selectedResourceContext = ref<LoopySelectedResourceContext | null>(null)
const projectsLoading = ref(false)
const resourcesLoading = ref(false)
const resourceErrorText = ref('')
const resourceSearchScope = ref<ResourceSearchScope>('platform')
const resourceSearchQuery = ref('')
const platformResourceResults = ref<Resource[]>([])
const projectResourceResults = ref<Resource[]>([])
const selectedAiSpeed = ref<AiSpeedId>('fast')

let resourceSearchTimer: ReturnType<typeof setTimeout> | null = null
let resourceSearchSeq = 0

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

const aiSpeedOptions: Array<{
  id: AiSpeedId
  label: string
  description: string
  temperature: number
}> = [
  {
    id: 'fast',
    label: '快速',
    description: '回答更直接，适合快速确认。',
    temperature: 0.2,
  },
  {
    id: 'balanced',
    label: '均衡',
    description: '兼顾结构和发散。',
    temperature: 0.35,
  },
  {
    id: 'deep',
    label: '深入',
    description: '更偏分析和方案展开。',
    temperature: 0.5,
  },
]

const commandItems = [
  {
    id: 'workspace-brief',
    label: '工作空间简报',
    description: '汇总当前空间最重要的问题和下一步。',
    prompt: '请基于当前工作空间，输出一份简洁的推进简报，包含重点事项、风险和下一步。',
  },
  {
    id: 'project-plan',
    label: '项目推进计划',
    description: '围绕选中项目生成可执行计划。',
    prompt: '请结合我选中的项目，给出一个下一阶段推进计划，按优先级列出行动项。',
  },
  {
    id: 'resource-scan',
    label: '资料线索梳理',
    description: '围绕选中资料提炼证据和缺口。',
    prompt: '请围绕我选中的资料，提炼关键证据、可引用结论和仍缺少的信息。',
  },
  {
    id: 'question-list',
    label: '追问清单',
    description: '生成接下来该问 Loopy 的问题。',
    prompt: '请根据当前上下文生成一组高价值追问，按信息增益从高到低排序。',
  },
] as const

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
  mode: 'loopy_page',
  getAiOptions: () => {
    const option = aiSpeedOptions.find(item => item.id === selectedAiSpeed.value) || aiSpeedOptions[0]
    return {
      temperature: option.temperature,
    } satisfies Partial<AiAssistantOptions>
  },
  getContext: () => {
    const project = projects.value.find(item => item.id === selectedLoopyProjectId.value) || null
    const selectedResource = selectedResourceContext.value
    return {
      projectId: '',
      projectTitle: project?.title || '',
      resourceId: selectedResource?.id || '',
      resourceTitle: selectedResource?.title || '',
    }
  },
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

const selectedLoopyProject = computed(() => {
  return projects.value.find(item => item.id === selectedLoopyProjectId.value) || null
})

const selectedAiSpeedOption = computed(() => {
  return aiSpeedOptions.find(item => item.id === selectedAiSpeed.value) || aiSpeedOptions[0]
})

const visibleResourceResults = computed(() => {
  if (resourceSearchScope.value === 'platform')
    return platformResourceResults.value

  const keyword = resourceSearchQuery.value.trim().toLowerCase()
  const resources = projectResourceResults.value
  if (!keyword)
    return resources.slice(0, 12)

  return resources
    .filter((resource) => {
      return [
        resource.title,
        resource.summary,
        resource.type,
        resource.category,
      ].some(value => String(value || '').toLowerCase().includes(keyword))
    })
    .slice(0, 12)
})

const composerQuickActions = [
  {
    id: 'attachment',
    label: '附件',
    icon: 'attach_file',
  },
  {
    id: 'knowledge',
    label: '@ 资料',
    icon: 'alternate_email',
  },
  {
    id: 'command',
    label: '/ 命令',
    icon: 'terminal',
  },
] as const

function focusComposer() {
  requestAnimationFrame(() => {
    composerRef.value?.focus()
  })
}

function compactText(value: unknown, maxLength = 120): string {
  const compact = String(value || '').replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength)
    return compact
  return `${compact.slice(0, maxLength)}…`
}

function appendComposerText(text: string) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText)
    return
  const current = String(loopyChatInput.value || '')
  const nextValue = current.trim()
    ? `${current.trimEnd()} ${normalizedText}`
    : normalizedText

  loopyChatInput.value = nextValue
  focusComposer()
}

function closeComposerPanel() {
  activeComposerPanel.value = ''
}

function toggleComposerPanel(panel: ComposerPanelId) {
  if (!loopySelectedWorkspaceId.value)
    return

  activeComposerPanel.value = activeComposerPanel.value === panel ? '' : panel
}

function handleQuickAction(actionId: ComposerQuickActionId) {
  if (!loopySelectedWorkspaceId.value)
    return

  if (actionId === 'attachment') {
    closeComposerPanel()
    attachmentInputRef.value?.click()
    return
  }

  toggleComposerPanel(actionId)
}

function resolveResourceMeta(resource: Resource): string {
  return [
    resource.type,
    resource.year ? `${resource.year}` : '',
    resource.category,
  ].filter(Boolean).join(' · ')
}

async function loadProjectsForWorkspace(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  projects.value = []
  selectedLoopyProjectId.value = ''
  projectResourceResults.value = []
  selectedResourceContext.value = null
  if (!normalizedWorkspaceId)
    return

  projectsLoading.value = true
  try {
    const response = await authApiFetch<ApiResponse<Project[]>>(`/projects?teamId=${encodeURIComponent(normalizedWorkspaceId)}`)
    projects.value = response.data || []
  }
  catch (error: any) {
    resourceErrorText.value = resolveAuthDisplayMessage(error, '项目列表加载失败，请稍后重试。')
  }
  finally {
    projectsLoading.value = false
  }
}

function ensureSelectedProject(): Project | null {
  const current = selectedLoopyProject.value
  if (current)
    return current
  const firstProject = projects.value[0] || null
  if (firstProject)
    selectedLoopyProjectId.value = firstProject.id
  return firstProject
}

async function loadResourceResults() {
  if (activeComposerPanel.value !== 'knowledge' || !loopySelectedWorkspaceId.value)
    return

  const currentSeq = ++resourceSearchSeq
  resourcesLoading.value = true
  resourceErrorText.value = ''

  try {
    if (resourceSearchScope.value === 'platform') {
      const query = new URLSearchParams({
        sort: 'relevance',
      })
      if (resourceSearchQuery.value.trim())
        query.set('q', resourceSearchQuery.value.trim())
      const response = await authApiFetch<ApiResponse<Resource[]>>(`/resources?${query.toString()}`)
      if (currentSeq === resourceSearchSeq)
        platformResourceResults.value = (response.data || []).slice(0, 12)
      return
    }

    const project = ensureSelectedProject()
    if (!project) {
      projectResourceResults.value = []
      return
    }

    const response = await authApiFetch<ApiResponse<Resource[]>>(`/projects/${encodeURIComponent(project.id)}/resources`)
    if (currentSeq === resourceSearchSeq)
      projectResourceResults.value = response.data || []
  }
  catch (error: any) {
    if (currentSeq === resourceSearchSeq)
      resourceErrorText.value = resolveAuthDisplayMessage(error, '资料加载失败，请稍后重试。')
  }
  finally {
    if (currentSeq === resourceSearchSeq)
      resourcesLoading.value = false
  }
}

function scheduleResourceSearch() {
  if (resourceSearchTimer)
    clearTimeout(resourceSearchTimer)
  resourceSearchTimer = setTimeout(() => {
    void loadResourceResults()
  }, 220)
}

function changeResourceScope(scope: ResourceSearchScope) {
  resourceSearchScope.value = scope
  if (scope === 'project')
    ensureSelectedProject()
}

function selectProjectForResource(project: Project) {
  selectedLoopyProjectId.value = project.id
  resourceSearchScope.value = 'project'
}

function selectResourceContext(resource: Resource) {
  const scope = resourceSearchScope.value
  selectedResourceContext.value = {
    id: resource.id,
    title: resource.title,
    scope,
    projectId: scope === 'project' ? selectedLoopyProjectId.value : '',
  }
  appendComposerText(`@${scope === 'platform' ? '平台资料' : '项目资料'}「${resource.title}」（ID: ${resource.id}）${resource.summary ? `：${compactText(resource.summary)}` : ''}`)
  closeComposerPanel()
}

function applyCommandPrompt(prompt: string) {
  appendComposerText(prompt)
  closeComposerPanel()
}

function selectAiSpeed(speedId: AiSpeedId) {
  selectedAiSpeed.value = speedId
  closeComposerPanel()
  focusComposer()
}

function isTextLikeAttachment(file: File): boolean {
  const normalizedType = String(file.type || '').toLowerCase()
  const normalizedName = String(file.name || '').toLowerCase()
  return normalizedType.startsWith('text/')
    || /\.(md|markdown|txt|json|csv|tsv|yaml|yml|xml|html|css|js|ts|vue)$/i.test(normalizedName)
}

async function handleAttachmentInput(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (files.length === 0)
    return

  const blocks: string[] = []
  for (const file of files.slice(0, 4)) {
    if (!isTextLikeAttachment(file)) {
      blocks.push(`- ${file.name}（${Math.ceil(file.size / 1024)} KB，暂仅附加文件名）`)
      continue
    }

    const text = await file.slice(0, 12000).text().catch(() => '')
    blocks.push([
      `- ${file.name}`,
      '```',
      compactText(text, 1800),
      '```',
    ].join('\n'))
  }

  appendComposerText(`请结合以下附件内容回答：\n${blocks.join('\n\n')}`)
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
    await loadProjectsForWorkspace(nextWorkspaceId)
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
    await loadProjectsForWorkspace('')
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

watch(
  () => [
    activeComposerPanel.value,
    resourceSearchScope.value,
    resourceSearchQuery.value,
    selectedLoopyProjectId.value,
  ],
  () => {
    if (activeComposerPanel.value === 'knowledge')
      scheduleResourceSearch()
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
                <input
                  ref="attachmentInputRef"
                  class="sr-only"
                  type="file"
                  multiple
                  @change="handleAttachmentInput"
                >
                <textarea
                  ref="composerRef"
                  :value="loopyChatInput"
                  data-testid="dashboard-loopy-composer"
                  class="loopy-page-textarea"
                  :placeholder="loopySelectedWorkspaceId ? '直接输入内容，开始一轮新的对话' : '当前没有可用工作区，暂时无法发起对话'"
                  :disabled="!loopySelectedWorkspaceId"
                  @input="loopyChatInput = ($event.target as HTMLTextAreaElement).value"
                />
                <div
                  v-if="activeComposerPanel"
                  class="loopy-page-composer-panel"
                  :data-panel="activeComposerPanel"
                >
                  <template v-if="activeComposerPanel === 'knowledge'">
                    <div class="loopy-page-composer-panel__header">
                      <div class="loopy-page-panel-tabs" role="tablist" aria-label="资料来源">
                        <button
                          class="loopy-page-panel-tab"
                          type="button"
                          :data-active="resourceSearchScope === 'platform'"
                          @click="changeResourceScope('platform')"
                        >
                          平台资料
                        </button>
                        <button
                          class="loopy-page-panel-tab"
                          type="button"
                          :data-active="resourceSearchScope === 'project'"
                          @click="changeResourceScope('project')"
                        >
                          项目资料
                        </button>
                      </div>
                      <button class="loopy-page-panel-close" type="button" aria-label="关闭资料选择" @click="closeComposerPanel">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>

                    <div class="loopy-page-project-strip">
                      <button
                        v-for="project in projects.slice(0, 8)"
                        :key="project.id"
                        class="loopy-page-project-chip"
                        type="button"
                        :data-active="project.id === selectedLoopyProjectId"
                        @click="selectProjectForResource(project)"
                      >
                        <span class="material-symbols-outlined text-[15px]">folder_managed</span>
                        <span class="truncate">{{ project.title }}</span>
                      </button>
                      <span v-if="projectsLoading" class="loopy-page-panel-muted">项目加载中...</span>
                      <span v-else-if="projects.length === 0" class="loopy-page-panel-muted">暂无可选项目</span>
                    </div>

                    <label class="loopy-page-resource-search">
                      <span class="material-symbols-outlined text-[17px]">search</span>
                      <input
                        v-model="resourceSearchQuery"
                        type="search"
                        :placeholder="resourceSearchScope === 'platform' ? '搜索平台资料' : '搜索项目资料'"
                      >
                    </label>

                    <p v-if="resourceErrorText" class="loopy-page-panel-error">
                      {{ resourceErrorText }}
                    </p>
                    <div class="loopy-page-resource-list">
                      <button
                        v-for="resource in visibleResourceResults"
                        :key="`${resourceSearchScope}-${resource.id}`"
                        class="loopy-page-resource-row"
                        type="button"
                        @click="selectResourceContext(resource)"
                      >
                        <span class="loopy-page-resource-row__icon">
                          <span class="material-symbols-outlined text-[17px]">description</span>
                        </span>
                        <span class="loopy-page-resource-row__body">
                          <span class="loopy-page-resource-row__title">{{ resource.title }}</span>
                          <span class="loopy-page-resource-row__meta">{{ resolveResourceMeta(resource) || '资料' }}</span>
                        </span>
                      </button>
                      <p v-if="resourcesLoading" class="loopy-page-panel-empty">资料加载中...</p>
                      <p v-else-if="visibleResourceResults.length === 0" class="loopy-page-panel-empty">暂无匹配资料</p>
                    </div>
                  </template>

                  <template v-else-if="activeComposerPanel === 'command'">
                    <div class="loopy-page-composer-panel__header">
                      <span class="loopy-page-panel-title">命令</span>
                      <button class="loopy-page-panel-close" type="button" aria-label="关闭命令面板" @click="closeComposerPanel">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                    <div class="loopy-page-command-list">
                      <button
                        v-for="command in commandItems"
                        :key="command.id"
                        class="loopy-page-command-row"
                        type="button"
                        @click="applyCommandPrompt(command.prompt)"
                      >
                        <span>
                          <strong>{{ command.label }}</strong>
                          <small>{{ command.description }}</small>
                        </span>
                        <span class="material-symbols-outlined text-[17px]">arrow_forward</span>
                      </button>
                    </div>
                  </template>

                  <template v-else-if="activeComposerPanel === 'speed'">
                    <div class="loopy-page-composer-panel__header">
                      <span class="loopy-page-panel-title">回答速度</span>
                      <button class="loopy-page-panel-close" type="button" aria-label="关闭速度选择" @click="closeComposerPanel">
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                    <div class="loopy-page-speed-list">
                      <button
                        v-for="option in aiSpeedOptions"
                        :key="option.id"
                        class="loopy-page-speed-row"
                        type="button"
                        :data-active="option.id === selectedAiSpeed"
                        @click="selectAiSpeed(option.id)"
                      >
                        <span>
                          <strong>{{ option.label }}</strong>
                          <small>{{ option.description }}</small>
                        </span>
                        <span v-if="option.id === selectedAiSpeed" class="material-symbols-outlined text-[17px]">check</span>
                      </button>
                    </div>
                  </template>
                </div>
                <div class="loopy-page-composer__footer">
                  <div class="loopy-page-composer__tools">
                    <button
                      v-for="action in composerQuickActions"
                      :key="action.id"
                      class="loopy-page-composer__tool"
                      type="button"
                      :disabled="!loopySelectedWorkspaceId"
                      @click="handleQuickAction(action.id)"
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
                      @click="toggleComposerPanel('speed')"
                    >
                      <span class="material-symbols-outlined text-[16px]">auto_awesome</span>
                      <span>AI 回答速度</span>
                      <span class="loopy-page-ai-selector__value">{{ selectedAiSpeedOption.label }}</span>
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

.loopy-page-composer-panel {
  position: absolute;
  left: 1rem;
  bottom: 4.25rem;
  width: min(42rem, calc(100% - 2rem));
  max-height: min(24rem, 48vh);
  padding: 0.75rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  overflow: hidden;
  z-index: 4;
}

.loopy-page-composer-panel[data-panel='speed'] {
  left: auto;
  right: 5rem;
  width: min(22rem, calc(100% - 2rem));
}

.loopy-page-composer-panel__header {
  min-height: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.loopy-page-panel-title {
  color: #0f172a;
  font-size: 0.8125rem;
  font-weight: 700;
}

.loopy-page-panel-tabs {
  display: inline-flex;
  padding: 0.1875rem;
  border-radius: 0.625rem;
  background: #f1f5f9;
  gap: 0.125rem;
}

.loopy-page-panel-tab,
.loopy-page-panel-close {
  border: none;
  background: transparent;
}

.loopy-page-panel-tab {
  height: 1.75rem;
  padding: 0 0.625rem;
  border-radius: 0.5rem;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
}

.loopy-page-panel-tab[data-active='true'] {
  background: #fff;
  color: #1d4ed8;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}

.loopy-page-panel-close {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
  color: #94a3b8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.loopy-page-panel-close:hover {
  color: #334155;
  background: #f1f5f9;
}

.loopy-page-project-strip {
  display: flex;
  gap: 0.375rem;
  overflow-x: auto;
  scrollbar-width: thin;
}

.loopy-page-project-chip {
  max-width: 11rem;
  height: 2rem;
  padding: 0 0.625rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.625rem;
  background: #fff;
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  flex: 0 0 auto;
  font-size: 0.75rem;
  font-weight: 700;
}

.loopy-page-project-chip[data-active='true'] {
  border-color: #93b7fd;
  background: #eff5ff;
  color: #1d4ed8;
}

.loopy-page-resource-search {
  height: 2.25rem;
  padding: 0 0.625rem;
  border: 1px solid #dbe4f2;
  border-radius: 0.625rem;
  background: #fff;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.loopy-page-resource-search input {
  min-width: 0;
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: #0f172a;
  font-size: 0.8125rem;
}

.loopy-page-resource-list,
.loopy-page-command-list,
.loopy-page-speed-list {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  scrollbar-width: thin;
}

.loopy-page-resource-row,
.loopy-page-command-row,
.loopy-page-speed-row {
  width: 100%;
  border: none;
  border-radius: 0.625rem;
  background: transparent;
  color: #334155;
  text-align: left;
}

.loopy-page-resource-row {
  padding: 0.5rem;
  display: grid;
  grid-template-columns: 1.875rem minmax(0, 1fr);
  gap: 0.5rem;
  align-items: center;
}

.loopy-page-resource-row:hover,
.loopy-page-command-row:hover,
.loopy-page-speed-row:hover {
  background: #f5f8ff;
}

.loopy-page-resource-row__icon {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
  background: #edf4ff;
  color: #2f6af2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.loopy-page-resource-row__body,
.loopy-page-command-row span,
.loopy-page-speed-row span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.loopy-page-resource-row__title {
  color: #0f172a;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loopy-page-resource-row__meta,
.loopy-page-command-row small,
.loopy-page-speed-row small,
.loopy-page-panel-muted,
.loopy-page-panel-empty {
  color: #94a3b8;
  font-size: 0.75rem;
  line-height: 1.4;
}

.loopy-page-command-row,
.loopy-page-speed-row {
  padding: 0.625rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.loopy-page-command-row strong,
.loopy-page-speed-row strong {
  color: #0f172a;
  font-size: 0.8125rem;
}

.loopy-page-speed-row[data-active='true'] {
  background: #eff5ff;
  color: #1d4ed8;
}

.loopy-page-panel-error {
  margin: 0;
  color: #be123c;
  font-size: 0.75rem;
  line-height: 1.5;
}

.loopy-page-panel-empty {
  margin: 0;
  padding: 0.75rem;
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
  box-shadow: none;
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

.loopy-page-composer__tool:focus-visible,
.loopy-page-ai-selector:focus-visible,
.loopy-page-send:focus-visible,
.loopy-page-panel-tab:focus-visible,
.loopy-page-panel-close:focus-visible,
.loopy-page-project-chip:focus-visible,
.loopy-page-resource-row:focus-visible,
.loopy-page-command-row:focus-visible,
.loopy-page-speed-row:focus-visible {
  outline: 2px solid rgba(47, 106, 242, 0.28);
  outline-offset: 2px;
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

  .loopy-page-composer-panel,
  .loopy-page-composer-panel[data-panel='speed'] {
    left: 0.75rem;
    right: 0.75rem;
    bottom: 6rem;
    width: auto;
    max-height: min(24rem, 54vh);
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
