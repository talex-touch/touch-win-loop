<script setup lang="ts">
import type {
  AiChatSession,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefenseSessionState,
  AiDefenseTurn,
  Contest,
  ContestTimeline,
  DefenseRealtimeMediaMode,
  DefenseRealtimeProvider,
  DefenseRealtimeRuntimeOptions,
  DefenseRealtimeSessionMeta,
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingRuntimeHealth,
} from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  contestName?: string
  trackName?: string
  contest?: Contest | null
  contestTimelines?: ContestTimeline[]
  sessionMeta?: AiChatSession | null
  sessionState?: AiDefenseSessionState | null
  personas?: AiDefensePersona[]
  turns?: AiDefenseTurn[]
  rounds?: AiDefenseJudgeRound[]
  linkedMeeting?: ProjectMeeting | ProjectMeetingDetail | null
  meetingRuntimeHealth?: ProjectMeetingRuntimeHealth | null
  selectedResourceCount?: number
  realtimeState?: DefenseRealtimeSessionMeta | null
  realtimeOptions?: DefenseRealtimeRuntimeOptions | null
  realtimeLogs?: Array<{
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    createdAt: string
  }>
}>(), {
  contestName: '',
  trackName: '',
  contest: null,
  contestTimelines: () => [],
  sessionMeta: null,
  sessionState: null,
  personas: () => [],
  turns: () => [],
  rounds: () => [],
  linkedMeeting: null,
  meetingRuntimeHealth: null,
  selectedResourceCount: 0,
  realtimeState: null,
  realtimeOptions: null,
  realtimeLogs: () => [],
})

const emit = defineEmits<{
  openAgentDef: []
  generateSummary: []
  startRealtime: []
  updateRealtimeProvider: [provider: DefenseRealtimeProvider]
  updateRealtimeMediaMode: [mode: DefenseRealtimeMediaMode]
  toggleRealtimeAudio: [enabled: boolean]
  toggleRealtimeVideo: [enabled: boolean]
  interruptRealtime: []
  reconnectRealtime: []
}>()

const realtimeSettingsOpen = ref(false)

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function formatDateTime(value?: string | null): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '暂无'

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime()))
    return normalized

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function defenseStageLabel(stage?: AiDefenseSessionState['currentStage']): string {
  if (stage === 'opening')
    return '开场'
  if (stage === 'qa')
    return '问答'
  if (stage === 'rebuttal')
    return '反驳'
  if (stage === 'closing')
    return '收束'
  return '未开始'
}

const realtimeProviderOptions = computed(() => {
  return [
    { value: 'qwen' as const, label: '千问', disabled: props.realtimeOptions?.qwen?.configured === false },
    { value: 'coze' as const, label: 'Coze', disabled: props.realtimeOptions?.coze?.configured === false },
  ]
})

const realtimeMediaModeOptions = [
  { value: 'audio_video', label: '音视频理解' },
  { value: 'audio', label: '仅音频' },
] as const

interface RealtimeMediaTelemetryView {
  audioInputLabel: string
  videoInputLabel: string
  audioLevel: number
  audioSampleRate: number | null
  videoWidth: number | null
  videoHeight: number | null
  audioLastCapturedAt: string | null
  videoLastCapturedAt: string | null
}

function normalizeNumber(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeRealtimeMediaTelemetry(value: unknown): RealtimeMediaTelemetryView {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return {
    audioInputLabel: normalizeString(source.audioInputLabel),
    videoInputLabel: normalizeString(source.videoInputLabel),
    audioLevel: Math.max(0, Math.min(1, normalizeNumber(source.audioLevel) || 0)),
    audioSampleRate: normalizeNumber(source.audioSampleRate),
    videoWidth: normalizeNumber(source.videoWidth),
    videoHeight: normalizeNumber(source.videoHeight),
    audioLastCapturedAt: normalizeString(source.audioLastCapturedAt) || null,
    videoLastCapturedAt: normalizeString(source.videoLastCapturedAt) || null,
  }
}

const realtimeMediaTelemetry = computed(() => normalizeRealtimeMediaTelemetry(props.realtimeState?.metadata?.media))
const realtimeAudioLevelPercent = computed(() => Math.round(realtimeMediaTelemetry.value.audioLevel * 100))
const realtimeAudioMeterStyle = computed(() => ({
  '--workspace-defense-audio-level': `${realtimeAudioLevelPercent.value}%`,
}))
const realtimeVideoResolutionLabel = computed(() => {
  const width = realtimeMediaTelemetry.value.videoWidth
  const height = realtimeMediaTelemetry.value.videoHeight
  if (!width || !height)
    return '等待画面'
  return `${Math.round(width)} x ${Math.round(height)}`
})
const realtimeAudioCaptureLabel = computed(() => {
  const capturedAt = realtimeMediaTelemetry.value.audioLastCapturedAt
  return capturedAt ? `最近采样 ${formatDateTime(capturedAt)}` : '等待音频采样'
})
const realtimeVideoCaptureLabel = computed(() => {
  const capturedAt = realtimeMediaTelemetry.value.videoLastCapturedAt
  return capturedAt ? `最近帧 ${formatDateTime(capturedAt)}` : '等待视频帧'
})

function judgeTypeLabel(judgeType?: AiDefensePersona['judgeType']): string {
  if (judgeType === 'technical')
    return '技术评委'
  if (judgeType === 'business')
    return '业务评委'
  if (judgeType === 'expression')
    return '表达评委'
  return '自定义评委'
}

function handleRealtimeProviderChange(rawValue: unknown): void {
  const value = String(rawValue || 'qwen').trim()
  if (value === 'qwen' && props.realtimeOptions?.qwen?.configured === false)
    return
  if (value === 'coze' && props.realtimeOptions?.coze?.configured === false)
    return
  emit('updateRealtimeProvider', value === 'coze' ? 'coze' : 'qwen')
}

function handleRealtimeMediaModeChange(rawValue: unknown): void {
  const value = String(rawValue || 'audio_video').trim()
  emit('updateRealtimeMediaMode', value === 'audio' ? 'audio' : 'audio_video')
}

const showcaseDefenseSessionState: AiDefenseSessionState = {
  sessionId: 'showcase-defense-session',
  projectId: 'showcase-project',
  workspaceId: 'showcase-workspace',
  currentStage: 'qa',
  turnCount: 8,
  selectedPersonaIds: [
    'showcase-technical',
    'showcase-business',
    'showcase-expression',
    'showcase-data',
  ],
  summaryStatus: 'completed',
  summaryResourceId: null,
  linkedMeetingId: null,
  lastInputMode: 'mixed',
  lastContextPack: {},
  lastScorecard: null,
  realtime: null,
  createdAt: '2026-05-06T09:08:00.000+08:00',
  updatedAt: '2026-05-06T09:42:00.000+08:00',
}

const showcaseDefenseTurns: AiDefenseTurn[] = [
  {
    id: 'showcase-defense-turn-8',
    sessionId: 'showcase-defense-session',
    projectId: 'showcase-project',
    stage: 'closing',
    turnIndex: 8,
    personaId: 'showcase-expression',
    judgeType: 'expression',
    judgeName: '表达评委 · 陆晨',
    question: '如果只剩 45 秒收束，你会如何把项目价值、技术可信度和落地路径压成一个闭环？',
    comment: '回答结构已经形成“痛点、方案、证据、结果”的顺序，收束句需要更明确地回到评审指标。',
    followUp: '请准备一句能直接放在结束页的总结，避免继续扩展新概念。',
    score: 87,
    evidenceRefs: [],
    attachments: [],
    createdAt: '2026-05-06T09:42:00.000+08:00',
  },
  {
    id: 'showcase-defense-turn-7',
    sessionId: 'showcase-defense-session',
    projectId: 'showcase-project',
    stage: 'qa',
    turnIndex: 7,
    personaId: 'showcase-data',
    judgeType: 'custom',
    judgeName: '数据评委 · 孟也',
    question: '知识索引返回的证据如何保证和当前项目资料一致？更新资料后会不会出现旧引用？',
    comment: '已说明索引重建、资源快照和引用路径，但还可以补充失败时的提示与重试入口。',
    followUp: '请补一个“资料更新后重新索引”的现场演示路径。',
    score: 85,
    evidenceRefs: [],
    attachments: [],
    createdAt: '2026-05-06T09:38:00.000+08:00',
  },
  {
    id: 'showcase-defense-turn-6',
    sessionId: 'showcase-defense-session',
    projectId: 'showcase-project',
    stage: 'qa',
    turnIndex: 6,
    personaId: 'showcase-technical',
    judgeType: 'technical',
    judgeName: '技术评委 · 周启',
    question: '实时答辩链路依赖外部 provider，断连或鉴权失败时产品如何降级？',
    comment: '边界讲清楚了：连接状态、媒体授权、provider 配置和重连入口都独立呈现，降级后仍保留资料与历史问答。',
    followUp: '请把“不会静默给出结果”的安全边界放到技术答辩页。',
    score: 89,
    evidenceRefs: [],
    attachments: [],
    createdAt: '2026-05-06T09:33:00.000+08:00',
  },
  {
    id: 'showcase-defense-turn-5',
    sessionId: 'showcase-defense-session',
    projectId: 'showcase-project',
    stage: 'qa',
    turnIndex: 5,
    personaId: 'showcase-business',
    judgeType: 'business',
    judgeName: '业务评委 · 何砚',
    question: '和普通协作文档相比，WinLoop 的竞赛全过程闭环体现在哪里？',
    comment: '回答覆盖项目资料、流程画布、知识引用、AI 草案、答辩追问和终审导出，业务链路完整。',
    followUp: '请把效率提升指标和实际团队角色分工补到同一页。',
    score: 90,
    evidenceRefs: [],
    attachments: [],
    createdAt: '2026-05-06T09:29:00.000+08:00',
  },
  {
    id: 'showcase-defense-turn-4',
    sessionId: 'showcase-defense-session',
    projectId: 'showcase-project',
    stage: 'rebuttal',
    turnIndex: 4,
    personaId: 'showcase-technical',
    judgeType: 'technical',
    judgeName: '技术评委 · 周启',
    question: '右侧 AI 是通用问答入口，还是能读取当前工作台上下文？',
    comment: '已说明会话、资源、画布、终审和答辩状态会进入上下文包，建议补一张上下文装配示意。',
    followUp: '请现场点开一条资源引用，证明回答能追溯到项目材料。',
    score: 88,
    evidenceRefs: [],
    attachments: [],
    createdAt: '2026-05-06T09:24:00.000+08:00',
  },
  {
    id: 'showcase-defense-turn-3',
    sessionId: 'showcase-defense-session',
    projectId: 'showcase-project',
    stage: 'qa',
    turnIndex: 3,
    personaId: 'showcase-expression',
    judgeType: 'expression',
    judgeName: '表达评委 · 陆晨',
    question: '目前介绍里技术点比较密，如何让非技术评委先理解价值？',
    comment: '建议先讲参赛团队的资料割裂问题，再用一条主流程解释 AI 如何参与准备和答辩。',
    followUp: '请将开场 90 秒改成“问题、闭环、证据、收益”四段。',
    score: 84,
    evidenceRefs: [],
    attachments: [],
    createdAt: '2026-05-06T09:19:00.000+08:00',
  },
  {
    id: 'showcase-defense-turn-2',
    sessionId: 'showcase-defense-session',
    projectId: 'showcase-project',
    stage: 'qa',
    turnIndex: 2,
    personaId: 'showcase-business',
    judgeType: 'business',
    judgeName: '业务评委 · 何砚',
    question: '这个系统对参赛团队最直接的价值是节省时间，还是提升最终材料质量？',
    comment: '回答已经把资料沉淀效率和终审质量连接起来，但量化收益还需要给出采集口径。',
    followUp: '请补充资料查找耗时、答辩材料整理轮次和引用可追溯率三个指标。',
    score: 86,
    evidenceRefs: [],
    attachments: [],
    createdAt: '2026-05-06T09:14:00.000+08:00',
  },
  {
    id: 'showcase-defense-turn-1',
    sessionId: 'showcase-defense-session',
    projectId: 'showcase-project',
    stage: 'opening',
    turnIndex: 1,
    personaId: 'showcase-technical',
    judgeType: 'technical',
    judgeName: '技术评委 · 周启',
    question: '请先说明 AgentDef、知识索引和项目资源之间的职责边界。',
    comment: '开场回答能区分前端工作台、服务端编排和索引召回，适合作为技术路线入口。',
    followUp: '下一轮请展开说明权限边界和失败提示。',
    score: 86,
    evidenceRefs: [],
    attachments: [],
    createdAt: '2026-05-06T09:10:00.000+08:00',
  },
]

const displaySessionState = computed(() => props.sessionState || showcaseDefenseSessionState)

const sessionTimelineEntries = computed(() => {
  if (props.turns.length > 0) {
    return [...props.turns]
      .sort((left, right) => {
        if (left.turnIndex !== right.turnIndex)
          return right.turnIndex - left.turnIndex
        return new Date(String(right.createdAt || '')).getTime() - new Date(String(left.createdAt || '')).getTime()
      })
      .slice(0, 8)
      .map(turn => ({
        key: turn.id,
        turnIndex: turn.turnIndex,
        stageLabel: defenseStageLabel(turn.stage),
        judge: turn.judgeName,
        judgeTypeLabel: judgeTypeLabel(turn.judgeType),
        score: turn.score,
        createdAt: formatDateTime(turn.createdAt),
        question: turn.question,
        comment: normalizeString(turn.comment) || '当前轮次尚未沉淀评语。',
        followUp: normalizeString(turn.followUp) || '暂无追问',
      }))
  }

  if (props.rounds.length === 0) {
    return [...showcaseDefenseTurns]
      .sort((left, right) => {
        if (left.turnIndex !== right.turnIndex)
          return right.turnIndex - left.turnIndex
        return new Date(String(right.createdAt || '')).getTime() - new Date(String(left.createdAt || '')).getTime()
      })
      .slice(0, 8)
      .map(turn => ({
        key: turn.id,
        turnIndex: turn.turnIndex,
        stageLabel: defenseStageLabel(turn.stage),
        judge: turn.judgeName,
        judgeTypeLabel: judgeTypeLabel(turn.judgeType),
        score: turn.score,
        createdAt: formatDateTime(turn.createdAt),
        question: turn.question,
        comment: normalizeString(turn.comment) || '当前轮次尚未沉淀评语。',
        followUp: normalizeString(turn.followUp) || '暂无追问',
      }))
  }

  return props.rounds.map((round, index) => ({
    key: `${round.judge}-${index}`,
    turnIndex: round.turnIndex || displaySessionState.value.turnCount || 1,
    stageLabel: defenseStageLabel(round.stage || displaySessionState.value.currentStage),
    judge: round.judge,
    judgeTypeLabel: judgeTypeLabel(round.judgeType),
    score: round.score,
    createdAt: formatDateTime(round.createdAt || displaySessionState.value.updatedAt || props.sessionMeta?.updatedAt),
    question: round.question,
    comment: normalizeString(round.comment) || '当前轮次尚未沉淀评语。',
    followUp: normalizeString(round.followUp) || '暂无追问',
  }))
})

const activeSpeakerLabel = computed(() => {
  return props.realtimeState?.latestSpeakerLabel
    || sessionTimelineEntries.value[0]?.judge
    || '等待首句'
})

const agentDefStatus = computed(() => {
  return {
    stageLabel: defenseStageLabel(displaySessionState.value.currentStage),
    turnCount: displaySessionState.value.turnCount || sessionTimelineEntries.value.length,
    startedAt: formatDateTime(props.sessionMeta?.createdAt || displaySessionState.value.createdAt),
    updatedAt: formatDateTime(displaySessionState.value.updatedAt || props.sessionMeta?.updatedAt || props.sessionMeta?.lastMessageAt),
  }
})

const realtimeSessionLocked = computed(() => {
  const connectionState = props.realtimeState?.connectionState
  return props.realtimeState?.bootstrapState === 'bootstrapping'
    || connectionState === 'bootstrapping'
    || connectionState === 'connecting'
    || connectionState === 'connected'
})

const realtimeCanInterrupt = computed(() => {
  const connectionState = props.realtimeState?.connectionState
  return connectionState === 'connecting' || connectionState === 'connected'
})

const realtimeVideoToggleDisabled = computed(() => props.realtimeState?.mediaMode === 'audio')
</script>

<template>
  <section
    data-testid="workspace-defense-workbench"
    class="workspace-defense-workbench wl-workbench"
  >
    <article
      data-testid="workspace-defense-agentdef-status"
      class="workspace-defense-workbench__panel workspace-defense-workbench__agentdef-status wl-workbench-surface wl-workbench-surface--panel"
    >
      <div>
        <p class="workspace-defense-workbench__panel-eyebrow wl-workbench-eyebrow">
          AgentDef 状态
        </p>
        <h2 class="workspace-defense-workbench__panel-title wl-workbench-title-panel">
          {{ agentDefStatus.stageLabel }} · 已完成 {{ agentDefStatus.turnCount }} 轮
        </h2>
        <p class="workspace-defense-workbench__status-meta">
          开始：{{ agentDefStatus.startedAt }} · 更新：{{ agentDefStatus.updatedAt }}
        </p>
      </div>
      <div class="workspace-defense-workbench__agentdef-actions">
        <button
          class="workspace-defense-workbench__action"
          type="button"
          @click="emit('generateSummary')"
        >
          生成总结
        </button>
        <button
          class="workspace-defense-workbench__action"
          type="button"
          @click="emit('startRealtime')"
        >
          实时答辩
        </button>
      </div>
    </article>

    <section class="workspace-defense-workbench__content-grid">
      <article
        class="workspace-defense-workbench__panel workspace-defense-workbench__flow-panel wl-workbench-surface wl-workbench-surface--panel"
      >
        <header class="workspace-defense-workbench__panel-header">
          <div>
            <p class="workspace-defense-workbench__panel-eyebrow wl-workbench-eyebrow">
              AI 消息流程
            </p>
            <h2 class="workspace-defense-workbench__panel-title wl-workbench-title-panel">
              实时答辩流
            </h2>
          </div>
        </header>

        <div class="workspace-defense-workbench__flow-body">
          <div class="workspace-defense-workbench__flow-rail" aria-hidden="true">
            <span />
          </div>
          <div v-if="sessionTimelineEntries.length === 0" class="workspace-defense-workbench__flow-empty">
            <strong>{{ activeSpeakerLabel }}</strong>
            <p>当前还没有轮次记录。开始实时答辩后，评委提问、追问、评分和 provider 事件会按时间进入这里。</p>
          </div>
          <div v-else class="workspace-defense-workbench__flow-list">
            <article
              v-for="item in sessionTimelineEntries.slice(0, 5)"
              :key="item.key"
              class="workspace-defense-workbench__flow-item"
            >
              <p class="workspace-defense-workbench__timeline-eyebrow">
                第 {{ item.turnIndex }} 轮 · {{ item.stageLabel }} · {{ item.createdAt }}
              </p>
              <div class="workspace-defense-workbench__flow-item-main">
                <strong>{{ item.judge }}</strong>
                <span>{{ item.score }}</span>
              </div>
              <p class="workspace-defense-workbench__round-text">
                {{ item.question }}
              </p>
              <p class="workspace-defense-workbench__round-text workspace-defense-workbench__round-text--muted">
                {{ item.comment }}
              </p>
            </article>
          </div>
        </div>
      </article>

      <article
        data-testid="workspace-defense-rounds"
        class="workspace-defense-workbench__panel workspace-defense-workbench__timeline-panel wl-workbench-surface wl-workbench-surface--panel"
      >
        <header class="workspace-defense-workbench__panel-header">
          <div>
            <p class="workspace-defense-workbench__panel-eyebrow wl-workbench-eyebrow">
              最近轮次
            </p>
            <h2 class="workspace-defense-workbench__panel-title wl-workbench-title-panel">
              答辩时间线
            </h2>
          </div>
        </header>

        <div v-if="sessionTimelineEntries.length === 0" class="workspace-defense-workbench__empty">
          当前还没有轮次记录。开始答辩后，这里会按轮次展开评委提问、评语和追问。
        </div>
        <div v-else class="workspace-defense-workbench__timeline-list">
          <article
            v-for="item in sessionTimelineEntries"
            :key="item.key"
            class="workspace-defense-workbench__timeline-item"
          >
            <div class="workspace-defense-workbench__timeline-topline">
              <div class="space-y-1">
                <p class="workspace-defense-workbench__timeline-eyebrow">
                  第 {{ item.turnIndex }} 轮 · {{ item.stageLabel }}
                </p>
                <strong class="workspace-defense-workbench__round-title">{{ item.judge }}</strong>
                <p class="workspace-defense-workbench__timeline-meta">
                  {{ item.judgeTypeLabel }} · {{ item.createdAt }}
                </p>
              </div>
              <span class="workspace-defense-workbench__round-score">{{ item.score }}</span>
            </div>
            <p class="workspace-defense-workbench__round-text">
              问题：{{ item.question }}
            </p>
            <p class="workspace-defense-workbench__round-text workspace-defense-workbench__round-text--muted">
              评语：{{ item.comment }}
            </p>
            <p class="workspace-defense-workbench__round-text workspace-defense-workbench__round-text--muted">
              追问：{{ item.followUp }}
            </p>
          </article>
        </div>
      </article>
    </section>

    <div
      v-show="realtimeState?.videoEnabled === true"
      class="workspace-defense-workbench__corner-preview"
      :aria-hidden="realtimeState?.videoEnabled === true ? undefined : 'true'"
      aria-label="本地摄像头预览"
    >
      <div id="workspace-defense-realtime-preview" class="workspace-defense-workbench__corner-preview-surface">
        <div class="workspace-defense-workbench__preview-overlay">
          <span>本地预览</span>
          <strong>{{ realtimeVideoResolutionLabel }}</strong>
          <small>{{ realtimeVideoCaptureLabel }}</small>
        </div>
      </div>
      <div
        class="workspace-defense-workbench__corner-audio-meter"
        :style="realtimeAudioMeterStyle"
        aria-label="麦克风实时音量"
      >
        <span />
      </div>
    </div>

    <article
      data-testid="workspace-defense-realtime-console"
      class="workspace-defense-workbench__panel workspace-defense-workbench__realtime-settings workspace-defense-workbench__floating-controller wl-workbench-surface wl-workbench-surface--panel"
    >
      <section
        data-testid="workspace-defense-actions"
        class="workspace-defense-workbench__actions workspace-defense-workbench__actions--floating"
      >
        <button
          class="workspace-defense-workbench__action workspace-defense-workbench__action--primary"
          type="button"
          @click="emit('startRealtime')"
        >
          发起实时答辩
        </button>
        <button
          class="workspace-defense-workbench__action"
          type="button"
          @click="emit('generateSummary')"
        >
          生成会话总结
        </button>
        <button
          class="workspace-defense-workbench__action"
          type="button"
          :aria-expanded="realtimeSettingsOpen"
          aria-controls="workspace-defense-realtime-settings-popover"
          title="实时答辩设置"
          @click="realtimeSettingsOpen = !realtimeSettingsOpen"
        >
          设置
        </button>
        <button
          class="workspace-defense-workbench__action"
          type="button"
          :disabled="!realtimeCanInterrupt"
          @click="emit('interruptRealtime')"
        >
          中断
        </button>
        <button
          class="workspace-defense-workbench__action"
          type="button"
          :disabled="props.realtimeState?.bootstrapState === 'bootstrapping'"
          @click="emit('reconnectRealtime')"
        >
          重连
        </button>
      </section>

      <div class="workspace-defense-workbench__toggle-row">
        <button
          class="workspace-defense-workbench__toggle"
          :class="{ 'workspace-defense-workbench__toggle--active': realtimeState?.audioEnabled !== false }"
          type="button"
          :aria-label="realtimeState?.audioEnabled !== false ? '关闭麦克风' : '开启麦克风'"
          :aria-pressed="realtimeState?.audioEnabled !== false"
          :title="realtimeState?.audioEnabled !== false ? '关闭麦克风' : '开启麦克风'"
          @click="emit('toggleRealtimeAudio', !(realtimeState?.audioEnabled !== false))"
        >
          <span class="material-symbols-outlined workspace-defense-workbench__toggle-icon" aria-hidden="true">
            {{ realtimeState?.audioEnabled !== false ? 'mic' : 'mic_off' }}
          </span>
        </button>
        <button
          class="workspace-defense-workbench__toggle"
          :class="{ 'workspace-defense-workbench__toggle--active': realtimeState?.videoEnabled === true }"
          type="button"
          :disabled="realtimeVideoToggleDisabled"
          :aria-label="realtimeState?.videoEnabled === true ? '关闭摄像头' : '开启摄像头'"
          :aria-pressed="realtimeState?.videoEnabled === true"
          :title="realtimeVideoToggleDisabled ? '当前媒体模式不支持摄像头' : (realtimeState?.videoEnabled === true ? '关闭摄像头' : '开启摄像头')"
          @click="emit('toggleRealtimeVideo', !(realtimeState?.videoEnabled === true))"
        >
          <span class="material-symbols-outlined workspace-defense-workbench__toggle-icon" aria-hidden="true">
            {{ realtimeState?.videoEnabled === true ? 'videocam' : 'videocam_off' }}
          </span>
        </button>
      </div>

      <div
        v-if="realtimeSettingsOpen"
        id="workspace-defense-realtime-settings-popover"
        class="workspace-defense-workbench__settings-popover"
        role="dialog"
        aria-label="实时答辩设置"
      >
        <div class="workspace-defense-workbench__settings-header">
          <strong>实时答辩设置</strong>
          <button
            class="workspace-defense-workbench__settings-link"
            type="button"
            @click="emit('openAgentDef')"
          >
            高级设置
          </button>
        </div>
        <div class="workspace-defense-workbench__realtime-control-grid">
          <label class="workspace-defense-workbench__field">
            <span class="workspace-defense-workbench__field-label">实时链路</span>
            <UiSelect
              :model-value="realtimeState?.provider || 'qwen'"
              :options="realtimeProviderOptions"
              :disabled="realtimeSessionLocked"
              size="sm"
              aria-label="实时链路"
              class="w-full"
              @change="handleRealtimeProviderChange"
            />
          </label>

          <label class="workspace-defense-workbench__field">
            <span class="workspace-defense-workbench__field-label">媒体模式</span>
            <UiSelect
              :model-value="realtimeState?.mediaMode || 'audio_video'"
              :options="realtimeMediaModeOptions"
              :disabled="realtimeSessionLocked"
              size="sm"
              aria-label="媒体模式"
              class="w-full"
              @change="handleRealtimeMediaModeChange"
            />
          </label>
        </div>
        <div class="workspace-defense-workbench__realtime-live">
          <div class="workspace-defense-workbench__device-panel">
            <div class="workspace-defense-workbench__device-row">
              <span>麦克风</span>
              <strong>{{ realtimeMediaTelemetry.audioInputLabel || '等待授权' }}</strong>
            </div>
            <div
              class="workspace-defense-workbench__audio-meter"
              :style="realtimeAudioMeterStyle"
              aria-label="麦克风实时音量"
            >
              <span />
            </div>
            <p class="workspace-defense-workbench__device-note">
              {{ realtimeAudioCaptureLabel }} · {{ realtimeAudioLevelPercent }}%
            </p>
            <div class="workspace-defense-workbench__device-row">
              <span>摄像头</span>
              <strong>{{ realtimeMediaTelemetry.videoInputLabel || '等待授权' }}</strong>
            </div>
          </div>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped>
.workspace-defense-workbench {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  gap: var(--wl-workbench-gap-md);
  padding-bottom: 10px;
}

.workspace-defense-workbench__panel-eyebrow,
.workspace-defense-workbench__panel-header {
  margin: 0;
}

.workspace-defense-workbench__empty,
.workspace-defense-workbench__round-text {
  margin: 0;
  color: var(--wl-workbench-text-muted);
  font-size: var(--wl-workbench-body-size);
  line-height: 1.8;
}

.workspace-defense-workbench__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: var(--wl-workbench-gap-xs);
  align-items: center;
}

.workspace-defense-workbench__actions--floating {
  justify-content: flex-start;
}

.workspace-defense-workbench__action {
  min-height: 34px;
  padding: 0 12px;
  border-radius: var(--wl-workbench-radius-control);
  border: 1px solid var(--wl-workbench-border);
  background: var(--wl-workbench-surface);
  color: var(--wl-workbench-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.workspace-defense-workbench__action:hover {
  border-color: var(--wl-workbench-border-strong);
  background: var(--wl-workbench-surface-muted);
}

.workspace-defense-workbench__action--primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.workspace-defense-workbench__content-grid {
  display: grid;
  flex: 1 1 auto;
  min-height: 0;
  grid-template-columns: minmax(300px, 0.42fr) minmax(0, 0.58fr);
  grid-template-areas:
    'flow timeline'
    'flow timeline';
  gap: var(--wl-workbench-gap-md);
  align-items: start;
}

.workspace-defense-workbench__agentdef-status {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.workspace-defense-workbench__realtime-settings {
  grid-area: auto;
}

.workspace-defense-workbench__flow-panel {
  grid-area: flow;
}

.workspace-defense-workbench__timeline-panel {
  grid-area: timeline;
}

.workspace-defense-workbench__floating-controller {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  position: sticky;
  z-index: 8;
  right: 0;
  bottom: 10px;
  left: 0;
  width: fit-content;
  max-width: calc(100% - 24px);
  margin: auto auto 0;
  padding: 10px 12px;
  border-color: rgba(191, 219, 254, 0.72);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(14px);
}

.workspace-defense-workbench__settings-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  width: min(620px, calc(100vw - 48px));
  padding: 14px;
  border: 1px solid rgba(191, 219, 254, 0.78);
  border-radius: var(--wl-workbench-radius-panel);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 22px 54px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(18px);
}

.workspace-defense-workbench__settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.workspace-defense-workbench__settings-header strong {
  color: #10243d;
  font-size: 13px;
  line-height: 1.4;
}

.workspace-defense-workbench__settings-link {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--wl-workbench-border);
  border-radius: var(--wl-workbench-radius-control);
  background: #ffffff;
  color: #35537f;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.workspace-defense-workbench__realtime-settings,
.workspace-defense-workbench__flow-panel {
  background: var(--wl-workbench-surface);
}

.workspace-defense-workbench__realtime-control-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(148px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.workspace-defense-workbench__agentdef-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: var(--wl-workbench-gap-xs);
  justify-content: flex-end;
}

.workspace-defense-workbench__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workspace-defense-workbench__field-label {
  margin: 0;
  color: var(--wl-workbench-text-eyebrow);
  font-size: var(--wl-workbench-eyebrow-size);
  line-height: 1.4;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-defense-workbench__toggle-row {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: var(--wl-workbench-gap-xs);
}

.workspace-defense-workbench__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: var(--wl-workbench-radius-control);
  border: 1px solid var(--wl-workbench-border);
  background: var(--wl-workbench-surface);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.workspace-defense-workbench__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.workspace-defense-workbench__toggle--active {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4f96;
}

.workspace-defense-workbench__toggle-icon {
  font-size: 18px;
  line-height: 1;
}

.workspace-defense-workbench__realtime-live {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.workspace-defense-workbench__corner-preview {
  position: sticky;
  right: auto;
  bottom: 78px;
  left: 50%;
  align-self: center;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  align-items: stretch;
  gap: 7px;
  width: max-content;
  height: 0;
  margin: -1px auto 0;
  pointer-events: none;
}

.workspace-defense-workbench__corner-preview-surface {
  width: 168px;
  aspect-ratio: 16 / 10;
  border-radius: var(--wl-workbench-radius-control);
  border: 1px solid rgba(148, 163, 184, 0.72);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.12)), var(--wl-workbench-surface);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px;
  color: #3f587d;
  overflow: hidden;
  position: relative;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
}

.workspace-defense-workbench__preview-video {
  position: absolute;
  inset: 0;
}

.workspace-defense-workbench__preview-overlay {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
  padding: 6px 8px;
  border-radius: var(--wl-workbench-radius-control);
  background: rgba(15, 23, 42, 0.58);
  color: #ffffff;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.18);
}

.workspace-defense-workbench__preview-overlay span,
.workspace-defense-workbench__preview-overlay small {
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  line-height: 1.4;
}

.workspace-defense-workbench__preview-overlay strong {
  font-size: 14px;
  line-height: 1.4;
}

.workspace-defense-workbench__corner-audio-meter {
  position: relative;
  width: 8px;
  min-height: 100%;
  border-radius: 999px;
  background: #dbe4f0;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.42);
}

.workspace-defense-workbench__corner-audio-meter span {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: var(--workspace-defense-audio-level, 0%);
  border-radius: inherit;
  background: linear-gradient(180deg, #2563eb, #22c55e);
  transition: height 0.14s ease;
}

.workspace-defense-workbench__device-panel {
  display: flex;
  flex: 1 1 100%;
  flex-direction: column;
  gap: 7px;
  justify-content: center;
  padding: 10px 12px;
  border: 1px solid var(--wl-workbench-border-soft);
  border-radius: var(--wl-workbench-radius-panel);
  background: var(--wl-workbench-surface-muted);
}

.workspace-defense-workbench__device-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.workspace-defense-workbench__device-row strong {
  min-width: 0;
  color: #12304f;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-defense-workbench__audio-meter {
  height: 8px;
  border-radius: 999px;
  background: #dbe4f0;
  overflow: hidden;
}

.workspace-defense-workbench__audio-meter span {
  display: block;
  width: var(--workspace-defense-audio-level, 0%);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e, #2563eb);
  transition: width 0.14s ease;
}

.workspace-defense-workbench__device-note {
  margin: 0;
  color: var(--wl-workbench-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.workspace-defense-workbench__flow-body {
  position: relative;
  min-height: 330px;
  border: 1px solid var(--wl-workbench-border-soft);
  border-radius: var(--wl-workbench-radius-panel);
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  overflow: hidden;
}

.workspace-defense-workbench__flow-rail {
  position: absolute;
  top: 18px;
  bottom: 18px;
  left: 18px;
  width: 2px;
  border-radius: 999px;
  background: #dbeafe;
}

.workspace-defense-workbench__flow-rail span {
  display: block;
  width: 8px;
  height: 8px;
  margin-left: -3px;
  border-radius: 999px;
  background: #2563eb;
  box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.12);
}

.workspace-defense-workbench__flow-empty {
  display: flex;
  min-height: 330px;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 30px 28px 30px 44px;
}

.workspace-defense-workbench__flow-empty strong {
  color: #10243d;
  font-size: 24px;
  line-height: 1.25;
  font-weight: 760;
}

.workspace-defense-workbench__flow-empty p {
  margin: 0;
  color: var(--wl-workbench-text-muted);
  font-size: 13px;
  line-height: 1.8;
}

.workspace-defense-workbench__flow-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 16px 44px;
}

.workspace-defense-workbench__flow-item {
  position: relative;
  padding: 12px;
  border: 1px solid var(--wl-workbench-border-soft);
  border-radius: var(--wl-workbench-radius-panel);
  background: #ffffff;
}

.workspace-defense-workbench__flow-item::before {
  position: absolute;
  top: 18px;
  left: -30px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #2563eb;
  content: '';
}

.workspace-defense-workbench__flow-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}

.workspace-defense-workbench__flow-item-main strong {
  min-width: 0;
  color: #10243d;
  font-size: 15px;
  line-height: 1.4;
  font-weight: 740;
}

.workspace-defense-workbench__flow-item-main span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 26px;
  padding: 0 9px;
  border-radius: var(--wl-workbench-radius-control);
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.workspace-defense-workbench__panel {
  min-width: 0;
}

.workspace-defense-workbench__panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--wl-workbench-gap-sm);
  margin-bottom: 12px;
}

.workspace-defense-workbench__panel-title {
  margin: 4px 0 0;
}

.workspace-defense-workbench__timeline-eyebrow {
  margin: 0;
  color: var(--wl-workbench-text-eyebrow);
  font-size: var(--wl-workbench-eyebrow-size);
  line-height: 1.5;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-defense-workbench__timeline-meta {
  margin: 0;
  color: var(--wl-workbench-text-muted);
  font-size: var(--wl-workbench-meta-size);
  line-height: 1.7;
}

.workspace-defense-workbench__timeline-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.workspace-defense-workbench__timeline-item {
  padding: 12px;
  border-radius: var(--wl-workbench-radius-panel);
  background: var(--wl-workbench-surface);
  border: 1px solid var(--wl-workbench-border-soft);
}

.workspace-defense-workbench__timeline-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-defense-workbench__status-meta {
  margin: 6px 0 0;
  color: var(--wl-workbench-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.workspace-defense-workbench__round-title {
  color: #10243d;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 700;
}

.workspace-defense-workbench__round-score {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--wl-workbench-radius-control);
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.workspace-defense-workbench__round-text {
  margin-top: 8px;
}

.workspace-defense-workbench__round-text--muted {
  color: #7c8aa0;
}

@media (max-width: 1279px) {
  .workspace-defense-workbench__content-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'flow'
      'timeline';
  }

  .workspace-defense-workbench__floating-controller,
  .workspace-defense-workbench__actions,
  .workspace-defense-workbench__toggle-row {
    flex-wrap: wrap;
  }

  .workspace-defense-workbench__floating-controller {
    width: min(100%, calc(100% - 16px));
    max-width: calc(100% - 16px);
  }

  .workspace-defense-workbench__realtime-live {
    flex: 1 1 100%;
  }
}

@media (max-width: 767px) {
  .workspace-defense-workbench__realtime-control-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
