<script setup lang="ts">
import type {
  AdminAgentArtifact,
  AdminAgentRunRequest,
  AdminAgentStreamEvent,
  AdminAgentStreamEventType,
  AdminAgentTaskType,
  AdminDraftModule,
  AiChatMessage,
  AiChatSession,
  ApiResponse,
  Track,
} from '~~/shared/types/domain'

interface TimelineItem {
  id: string
  type: AdminAgentStreamEventType
  text: string
  createdAt: string
}

const props = withDefaults(defineProps<{
  workspaceId: string
  contestId: string
  tracks?: Track[]
}>(), {
  tracks: () => [],
})

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const draftBridge = useAdminAgentDraft()

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

function formatTime(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text)
    return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return '-'
  return date.toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

function toJsonPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

const taskTypeOptions: Array<{ value: AdminAgentTaskType, label: string }> = [
  { value: 'publish_assistant', label: '发布助手' },
  { value: 'import_sync_analysis', label: '导入/同步分析' },
  { value: 'general', label: '通用咨询' },
]

const loadingSessions = ref(false)
const loadingMessages = ref(false)
const sending = ref(false)
const streamError = ref('')

const sessions = ref<AiChatSession[]>([])
const activeSessionId = ref('')
const chatMessages = ref<AiChatMessage[]>([])

const taskType = ref<AdminAgentTaskType>('publish_assistant')
const message = ref('')
const trackId = ref('')
const major = ref('')
const csvText = ref('')
const sourceId = ref('')
const sourceUrl = ref('')

const timeline = ref<TimelineItem[]>([])
const artifacts = ref<AdminAgentArtifact[]>([])
const assistantReply = ref('')
const runMeta = ref<{
  attempts: number
  fallbackUsed: boolean
  latencyMs: number
} | null>(null)

const contestDraftCount = computed(() => draftBridge.listDrafts(props.contestId).length)

const showImportOptions = computed(() => taskType.value === 'import_sync_analysis')

const modulePathMap: Record<AdminDraftModule, string> = {
  overview: '/overview/edit',
  tracks: '/tracks',
  timelines: '/timelines',
  rubrics: '/rubrics',
  resources: '/resources',
}

function pushTimeline(type: AdminAgentStreamEventType, text: string) {
  timeline.value = [
    ...timeline.value,
    {
      id: `${Date.now()}-${timeline.value.length + 1}`,
      type,
      text,
      createdAt: new Date().toISOString(),
    },
  ].slice(-120)
}

function resetRunState() {
  streamError.value = ''
  timeline.value = []
  artifacts.value = []
  assistantReply.value = ''
  runMeta.value = null
}

function applyArtifactDraft(artifact: AdminAgentArtifact) {
  if (artifact.type !== 'draft' || !artifact.module)
    return

  draftBridge.setDraft(
    props.contestId,
    artifact.module,
    toJsonPayload(artifact.payload),
    {
      title: artifact.title,
      summary: artifact.summary,
    },
  )
}

function mergeArtifact(artifact: AdminAgentArtifact) {
  const next = [...artifacts.value]
  const index = next.findIndex(item => item.id === artifact.id)
  if (index >= 0)
    next[index] = artifact
  else
    next.push(artifact)
  artifacts.value = next
  applyArtifactDraft(artifact)
}

async function loadSessions(preferredSessionId = '') {
  if (!props.workspaceId) {
    sessions.value = []
    activeSessionId.value = ''
    chatMessages.value = []
    return
  }

  loadingSessions.value = true
  try {
    const response = await $fetch<ApiResponse<AiChatSession[]>>(
      endpoint(`/workspaces/${props.workspaceId}/chat/sessions`),
      { query: { limit: 30 } },
    )

    sessions.value = response.data
    const preferred = response.data.find(item => item.id === preferredSessionId)
      || response.data.find(item => item.id === activeSessionId.value)
      || response.data[0]

    activeSessionId.value = preferred?.id || ''
    if (preferred?.id)
      await loadMessages(preferred.id)
    else
      chatMessages.value = []
  }
  catch {
    sessions.value = []
    activeSessionId.value = ''
    chatMessages.value = []
  }
  finally {
    loadingSessions.value = false
  }
}

async function loadMessages(sessionId: string) {
  if (!props.workspaceId || !sessionId) {
    chatMessages.value = []
    return
  }

  loadingMessages.value = true
  try {
    const response = await $fetch<ApiResponse<{ session: AiChatSession, messages: AiChatMessage[] }>>(
      endpoint(`/workspaces/${props.workspaceId}/chat/sessions/${sessionId}/messages`),
      { query: { limit: 120 } },
    )
    chatMessages.value = response.data.messages
  }
  catch {
    chatMessages.value = []
  }
  finally {
    loadingMessages.value = false
  }
}

function openModule(module: AdminDraftModule | undefined) {
  if (!module)
    return
  const path = modulePathMap[module]
  navigateTo(`/admin/contests/${props.contestId}${path}?embed=1`)
}

async function copyReply() {
  const text = assistantReply.value.trim()
  if (!text)
    return
  await navigator.clipboard.writeText(text)
  pushTimeline('progress', '已复制 AI 回复。')
}

async function copyArtifact(artifact: AdminAgentArtifact) {
  await navigator.clipboard.writeText(JSON.stringify(artifact.payload || {}, null, 2))
  pushTimeline('progress', `已复制产物：${artifact.title}`)
}

function buildRequestBody(): AdminAgentRunRequest {
  const context: NonNullable<AdminAgentRunRequest['context']> = {}

  if (trackId.value)
    context.trackId = trackId.value
  if (major.value)
    context.major = major.value
  if (showImportOptions.value) {
    if (csvText.value.trim())
      context.csvText = csvText.value.trim()
    if (sourceId.value.trim())
      context.sourceId = sourceId.value.trim()
    if (sourceUrl.value.trim())
      context.sourceUrl = sourceUrl.value.trim()
  }

  return {
    workspaceId: props.workspaceId,
    contestId: props.contestId,
    sessionId: activeSessionId.value || undefined,
    taskType: taskType.value,
    message: message.value.trim(),
    context,
  }
}

function parseSseBlock(rawBlock: string): { eventType: string, dataText: string } | null {
  const block = rawBlock.trim()
  if (!block)
    return null

  const lines = block.split('\n').map(line => line.replace(/\r$/, ''))
  let eventType = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:'))
      eventType = line.slice(6).trim()
    else if (line.startsWith('data:'))
      dataLines.push(line.slice(5).trimStart())
  }

  return {
    eventType,
    dataText: dataLines.join('\n'),
  }
}

async function handleStreamEvent(eventType: string, dataText: string) {
  let payload: AdminAgentStreamEvent | null = null
  if (dataText) {
    try {
      payload = JSON.parse(dataText) as AdminAgentStreamEvent
    }
    catch {
      payload = null
    }
  }

  const resolvedType = (payload?.event || eventType) as AdminAgentStreamEventType
  const data = toJsonPayload(payload?.data)

  if (resolvedType === 'progress') {
    pushTimeline('progress', String(data.message || '处理中...'))
    if (data.sessionId)
      activeSessionId.value = String(data.sessionId)
    return
  }

  if (resolvedType === 'tool') {
    pushTimeline('tool', `工具调用：${String(data.name || 'unknown')}`)
    return
  }

  if (resolvedType === 'delta') {
    assistantReply.value += String(data.text || '')
    return
  }

  if (resolvedType === 'artifact') {
    const artifact = data.artifact as AdminAgentArtifact | undefined
    if (artifact) {
      mergeArtifact(artifact)
      pushTimeline('artifact', `产物生成：${artifact.title}`)
    }
    return
  }

  if (resolvedType === 'done') {
    const result = toJsonPayload(data.result)
    const finalReply = String(result.assistantReply || assistantReply.value)
    assistantReply.value = finalReply

    const sessionId = String(result.sessionId || activeSessionId.value).trim()
    if (sessionId)
      activeSessionId.value = sessionId

    const artifactList = Array.isArray(result.artifacts) ? result.artifacts as AdminAgentArtifact[] : []
    for (const artifact of artifactList)
      mergeArtifact(artifact)

    const meta = toJsonPayload(data.meta)
    runMeta.value = {
      attempts: Number(meta.attempts || 1),
      fallbackUsed: Boolean(meta.fallbackUsed),
      latencyMs: Number(meta.latencyMs || 0),
    }
    pushTimeline('done', '任务执行完成。')
    return
  }

  if (resolvedType === 'error') {
    const messageText = String(data.message || 'SSE 任务执行失败。')
    streamError.value = messageText
    pushTimeline('error', messageText)
  }
}

async function consumeSse(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })
    while (true) {
      const separatorIndex = buffer.indexOf('\n\n')
      if (separatorIndex < 0)
        break

      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      const parsed = parseSseBlock(block)
      if (!parsed)
        continue
      await handleStreamEvent(parsed.eventType, parsed.dataText)
    }
  }

  buffer += decoder.decode()
  const tail = parseSseBlock(buffer)
  if (tail)
    await handleStreamEvent(tail.eventType, tail.dataText)
}

async function runStream() {
  if (sending.value)
    return

  if (!props.workspaceId) {
    streamError.value = '未检测到 workspaceId，无法调用管理助手。'
    return
  }

  if (!message.value.trim()) {
    streamError.value = '请输入任务描述后再执行。'
    return
  }

  resetRunState()
  sending.value = true

  try {
    const response = await fetch(endpoint('/admin/ai/stream'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody()),
    })

    if (!response.ok) {
      const fallbackMessage = `请求失败：HTTP ${response.status}`
      const data = await response.json().catch(() => null) as ApiResponse<null> | null
      streamError.value = String(data?.message || fallbackMessage)
      pushTimeline('error', streamError.value)
      return
    }

    if (!response.body) {
      streamError.value = '未收到可读取的流式响应。'
      pushTimeline('error', streamError.value)
      return
    }

    await consumeSse(response.body)
  }
  catch (error) {
    streamError.value = error instanceof Error ? error.message : '流式请求失败。'
    pushTimeline('error', streamError.value)
  }
  finally {
    sending.value = false
    await loadSessions(activeSessionId.value)
  }
}

watch(() => props.workspaceId, async () => {
  await loadSessions()
}, { immediate: true })

watch(() => props.tracks, (items) => {
  if (!trackId.value && items.length > 0)
    trackId.value = items[0]!.id
}, { immediate: true })

watch(activeSessionId, async (value, previous) => {
  if (!value || value === previous)
    return
  await loadMessages(value)
})
</script>

<template>
  <aside class="p-4 border border-slate-200 rounded-lg bg-white">
    <div class="flex gap-2 items-center justify-between">
      <div>
        <h2 class="text-sm text-slate-900 font-semibold">
          DeepAgent 助手
        </h2>
        <p class="text-xs text-slate-500 mt-1">
          草稿缓存 {{ contestDraftCount }} 份（应用后仍需手动保存）
        </p>
      </div>
      <a-button size="mini" :loading="loadingSessions" @click="loadSessions(activeSessionId)">
        刷新会话
      </a-button>
    </div>

    <div class="mt-3 space-y-2">
      <a-select v-model="activeSessionId" allow-clear size="small" placeholder="选择会话（可为空）">
        <a-option v-for="item in sessions" :key="item.id" :value="item.id">
          {{ item.title }} ｜ {{ formatTime(item.lastMessageAt || item.updatedAt) }}
        </a-option>
      </a-select>

      <a-select v-model="taskType" size="small" placeholder="任务模式">
        <a-option v-for="item in taskTypeOptions" :key="item.value" :value="item.value">
          {{ item.label }}
        </a-option>
      </a-select>

      <a-select v-model="trackId" allow-clear size="small" placeholder="赛道（可选）">
        <a-option v-for="item in tracks" :key="item.id" :value="item.id">
          {{ item.name }}
        </a-option>
      </a-select>

      <a-input v-model="major" size="small" placeholder="专业（可选）" />

      <template v-if="showImportOptions">
        <a-input v-model="sourceId" size="small" placeholder="同步源 ID（可选）" />
        <a-input v-model="sourceUrl" size="small" placeholder="同步源 URL（可选）" />
        <a-textarea
          v-model="csvText"
          :auto-size="{ minRows: 2, maxRows: 5 }"
          placeholder="CSV 文本（可选）"
        />
      </template>

      <a-textarea
        v-model="message"
        :auto-size="{ minRows: 3, maxRows: 6 }"
        placeholder="输入管理任务目标，例如：补齐发布阻断项并给出各模块修复清单。"
      />
      <a-button type="primary" size="small" :loading="sending" @click="runStream">
        {{ sending ? '执行中...' : '开始执行（流式）' }}
      </a-button>
    </div>

    <section v-if="streamError" class="text-xs text-rose-600 mt-3 p-3 border border-rose-200 rounded bg-rose-50">
      {{ streamError }}
    </section>

    <section v-if="assistantReply" class="mt-3 p-3 border border-slate-200 rounded">
      <div class="mb-2 flex items-center justify-between">
        <p class="text-xs text-slate-700 font-semibold">
          AI 结果
        </p>
        <a-button size="mini" @click="copyReply">
          复制
        </a-button>
      </div>
      <pre class="text-xs text-slate-700 max-h-52 whitespace-pre-wrap overflow-auto">{{ assistantReply }}</pre>
      <p v-if="runMeta" class="text-[11px] text-slate-500 mt-2">
        attempts={{ runMeta.attempts }} ｜ fallback={{ runMeta.fallbackUsed ? 'yes' : 'no' }} ｜ latency={{ runMeta.latencyMs }}ms
      </p>
    </section>

    <section v-if="artifacts.length > 0" class="mt-3 space-y-2">
      <p class="text-xs text-slate-700 font-semibold">
        结构化产物
      </p>
      <div
        v-for="item in artifacts"
        :key="item.id"
        class="p-3 border border-slate-200 rounded bg-slate-50"
      >
        <p class="text-xs text-slate-800 font-semibold">
          {{ item.title }}
        </p>
        <p class="text-xs text-slate-600 mt-1">
          {{ item.summary }}
        </p>
        <p class="text-[11px] text-slate-500 mt-1">
          type={{ item.type }}<span v-if="item.module"> ｜ module={{ item.module }}</span>
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <a-button size="mini" @click="copyArtifact(item)">
            复制 JSON
          </a-button>
          <a-button v-if="item.module" size="mini" type="outline" @click="openModule(item.module)">
            打开模块
          </a-button>
        </div>
      </div>
    </section>

    <section class="mt-3 p-3 border border-slate-200 rounded">
      <p class="text-xs text-slate-700 font-semibold">
        流式时间线
      </p>
      <div class="text-xs mt-2 max-h-44 overflow-auto space-y-1">
        <p v-for="item in timeline" :key="item.id" class="text-slate-600">
          [{{ formatTime(item.createdAt) }}] {{ item.type }} · {{ item.text }}
        </p>
        <p v-if="timeline.length === 0" class="text-slate-400">
          暂无流式事件
        </p>
      </div>
    </section>

    <section class="mt-3 p-3 border border-slate-200 rounded">
      <p class="text-xs text-slate-700 font-semibold">
        会话消息
      </p>
      <div class="text-xs mt-2 max-h-56 overflow-auto space-y-1">
        <p v-if="loadingMessages" class="text-slate-400">
          加载中...
        </p>
        <p v-else-if="chatMessages.length === 0" class="text-slate-400">
          暂无消息
        </p>
        <p v-for="item in chatMessages" :key="item.id" class="text-slate-600 px-2 py-1 border border-slate-100 rounded bg-slate-50">
          <span class="font-semibold">{{ item.role }}</span>：{{ item.content }}
        </p>
      </div>
    </section>
  </aside>
</template>
