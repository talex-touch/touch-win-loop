<script setup lang="ts">
import type {
  AiChatSession,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefenseScorecard,
  AiDefenseSessionState,
  AiDefenseSummary,
  AiDefenseTurn,
  Contest,
  ContestTimeline,
  DefenseRealtimeMediaMode,
  DefenseRealtimeProvider,
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
  scorecard?: AiDefenseScorecard | null
  summary?: AiDefenseSummary | null
  rounds?: AiDefenseJudgeRound[]
  linkedMeeting?: ProjectMeeting | ProjectMeetingDetail | null
  meetingRuntimeHealth?: ProjectMeetingRuntimeHealth | null
  selectedResourceCount?: number
  realtimeState?: DefenseRealtimeSessionMeta | null
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
  scorecard: null,
  summary: null,
  rounds: () => [],
  linkedMeeting: null,
  meetingRuntimeHealth: null,
  selectedResourceCount: 0,
  realtimeState: null,
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

const workbenchNow = ref(Date.now())
let workbenchClockTimer: number | null = null

onMounted(() => {
  workbenchClockTimer = window.setInterval(() => {
    workbenchNow.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (workbenchClockTimer) {
    window.clearInterval(workbenchClockTimer)
    workbenchClockTimer = null
  }
})

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

function parseTimestamp(value?: string | null): number | null {
  const normalized = normalizeString(value)
  if (!normalized)
    return null
  const timestamp = new Date(normalized).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatDurationClock(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0)
    return `${days}天 ${hours}小时`
  if (hours > 0)
    return `${hours}小时 ${minutes}分钟`
  if (minutes > 0)
    return `${minutes}分 ${seconds}秒`
  return `${seconds}秒`
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

function realtimeConnectionLabel(state?: DefenseRealtimeSessionMeta['connectionState']): string {
  if (state === 'bootstrapping')
    return '握手中'
  if (state === 'connecting')
    return '连接中'
  if (state === 'connected')
    return '已连接'
  if (state === 'interrupted')
    return '已中断'
  if (state === 'error')
    return '异常'
  if (state === 'closed')
    return '已关闭'
  return '待机'
}

function realtimeProviderLabel(provider?: DefenseRealtimeProvider): string {
  return provider === 'coze' ? 'Coze' : '千问'
}

function contestTimelineNodeLabel(nodeType?: ContestTimeline['nodeType']): string {
  if (nodeType === 'registration')
    return '报名'
  if (nodeType === 'submission')
    return '提交'
  if (nodeType === 'preliminary')
    return '初赛'
  if (nodeType === 'final')
    return '决赛'
  return '赛程'
}

function judgeTypeLabel(judgeType?: AiDefensePersona['judgeType']): string {
  if (judgeType === 'technical')
    return '技术评委'
  if (judgeType === 'business')
    return '业务评委'
  if (judgeType === 'expression')
    return '表达评委'
  return '自定义评委'
}

function handleRealtimeProviderChange(event: Event): void {
  const value = String((event.target as HTMLSelectElement | null)?.value || 'qwen').trim()
  emit('updateRealtimeProvider', value === 'coze' ? 'coze' : 'qwen')
}

function handleRealtimeMediaModeChange(event: Event): void {
  const value = String((event.target as HTMLSelectElement | null)?.value || 'audio_video').trim()
  emit('updateRealtimeMediaMode', value === 'audio' ? 'audio' : 'audio_video')
}

const meetingSummary = computed(() => {
  if (!props.sessionState?.linkedMeetingId)
    return '当前为文本答辩，可随时切到语音答辩。'

  if (!props.linkedMeeting)
    return '语音会议已关联，详情载入中。'

  if (props.linkedMeeting.status === 'active') {
    return props.meetingRuntimeHealth?.ready === false
      ? (props.meetingRuntimeHealth.issues[0] || 'RTC / ASR 当前存在异常。')
      : `${props.linkedMeeting.mode === 'audio' ? '音频会话' : '视频会话'}进行中，可同步观察轮次变化。`
  }

  if (props.linkedMeeting.status === 'scheduled')
    return '语音会话已创建，等待开始。'
  if (props.linkedMeeting.status === 'ended')
    return '语音会话已结束，可继续整理总结与证据缺口。'
  return '语音会话异常结束，建议在 AgentDef 中继续排查。'
})

const sortedContestTimelines = computed(() => {
  return [...props.contestTimelines]
    .filter(item => parseTimestamp(item.startAt || item.endAt || '') !== null)
    .sort((left, right) => {
      const leftTime = parseTimestamp(left.startAt || left.endAt || '') || 0
      const rightTime = parseTimestamp(right.startAt || right.endAt || '') || 0
      return leftTime - rightTime
    })
})

const contestClockSnapshot = computed(() => {
  const now = workbenchNow.value
  const activeEntry = sortedContestTimelines.value.find((item) => {
    const startAt = parseTimestamp(item.startAt)
    const endAt = parseTimestamp(item.endAt)
    if (startAt === null || endAt === null)
      return false
    return startAt <= now && now <= endAt
  })
  if (activeEntry) {
    const endAt = parseTimestamp(activeEntry.endAt)
    return {
      headline: `${contestTimelineNodeLabel(activeEntry.nodeType)}进行中`,
      detail: normalizeString(activeEntry.note) || '当前比赛节点已进入进行态。',
      countdownLabel: '距离节点结束',
      countdownValue: endAt === null ? '进行中' : formatDurationClock(Math.max(0, endAt - now)),
      timeText: endAt === null ? '时间待确认' : formatDateTime(activeEntry.endAt),
      tone: 'live',
    }
  }

  const nextEntry = sortedContestTimelines.value.find((item) => {
    const startAt = parseTimestamp(item.startAt || item.endAt)
    return startAt !== null && startAt > now
  })
  if (nextEntry) {
    const startAt = parseTimestamp(nextEntry.startAt || nextEntry.endAt)
    return {
      headline: `待进入 ${contestTimelineNodeLabel(nextEntry.nodeType)}`,
      detail: normalizeString(nextEntry.note) || '下一比赛节点已确定，可据此安排答辩节奏。',
      countdownLabel: '距离开始',
      countdownValue: startAt === null ? '待同步' : formatDurationClock(Math.max(0, startAt - now)),
      timeText: formatDateTime(nextEntry.startAt || nextEntry.endAt),
      tone: 'queued',
    }
  }

  const submissionDeadlineAt = parseTimestamp(props.contest?.submissionDeadline || '')
  if (submissionDeadlineAt !== null && submissionDeadlineAt > now) {
    return {
      headline: '赛程待进入',
      detail: props.contest?.registrationWindow || '当前没有结构化 timeline，先按比赛提交截止时间管理节奏。',
      countdownLabel: '距离提交截止',
      countdownValue: formatDurationClock(Math.max(0, submissionDeadlineAt - now)),
      timeText: formatDateTime(props.contest?.submissionDeadline),
      tone: 'queued',
    }
  }

  const lastEntry = [...sortedContestTimelines.value].reverse().find((item) => {
    const endAt = parseTimestamp(item.endAt || item.startAt)
    return endAt !== null && endAt <= now
  })
  if (lastEntry) {
    return {
      headline: `${contestTimelineNodeLabel(lastEntry.nodeType)}已结束`,
      detail: normalizeString(lastEntry.note) || '当前比赛节点已完成，建议核对后续赛程或终审安排。',
      countdownLabel: '最近节点',
      countdownValue: formatDateTime(lastEntry.endAt || lastEntry.startAt),
      timeText: props.contest?.currentSeason || '当前赛季',
      tone: 'ended',
    }
  }

  return {
    headline: '赛程待同步',
    detail: props.contest?.registrationWindow || '当前比赛还没有结构化 timeline，建议先补齐比赛时间节点。',
    countdownLabel: '比赛窗口',
    countdownValue: props.contest?.submissionDeadline || '待确认',
    timeText: props.contest?.currentSeason || '未配置赛季',
    tone: 'idle',
  }
})

const contestTimelineEntries = computed(() => {
  const now = workbenchNow.value
  return sortedContestTimelines.value.slice(0, 5).map((item) => {
    const startAt = parseTimestamp(item.startAt)
    const endAt = parseTimestamp(item.endAt)
    const state = startAt !== null && endAt !== null && startAt <= now && now <= endAt
      ? 'active'
      : endAt !== null && endAt < now
        ? 'completed'
        : 'upcoming'
    return {
      id: item.id,
      label: contestTimelineNodeLabel(item.nodeType),
      timeText: [formatDateTime(item.startAt), formatDateTime(item.endAt)].filter(text => text !== '暂无').join(' - ') || '时间待同步',
      note: normalizeString(item.note) || '暂无赛程说明',
      state,
    }
  })
})

const activeTurnIndex = computed(() => {
  if (props.turns.length > 0)
    return props.turns[props.turns.length - 1]?.turnIndex || props.sessionState?.turnCount || 0
  if (props.rounds.length > 0)
    return props.rounds[0]?.turnIndex || props.sessionState?.turnCount || 0
  return props.sessionState?.turnCount || 0
})

const activePersonaIdSet = computed(() => {
  const matchedTurnIds = props.turns
    .filter(item => item.turnIndex === activeTurnIndex.value)
    .map(item => normalizeString(item.personaId))
    .filter(Boolean)
  const matchedRoundIds = props.rounds
    .filter(item => (item.turnIndex || activeTurnIndex.value) === activeTurnIndex.value)
    .map(item => normalizeString(item.personaId))
    .filter(Boolean)
  return new Set([...matchedTurnIds, ...matchedRoundIds])
})

const personaStageItems = computed(() => {
  return [...props.personas]
    .sort((left, right) => {
      if (left.enabled !== right.enabled)
        return left.enabled ? -1 : 1
      return Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
    })
    .map((persona) => {
      const normalizedPersonaId = normalizeString(persona.id)
      const isActive = activePersonaIdSet.value.has(normalizedPersonaId)
        || normalizeString(props.realtimeState?.latestSpeakerLabel) === normalizeString(persona.name)
      const status = isActive ? 'active' : (persona.enabled ? 'ready' : 'muted')
      return {
        ...persona,
        judgeTypeLabel: judgeTypeLabel(persona.judgeType),
        status,
        statusLabel: isActive ? '当前轮次' : (persona.enabled ? '已启用' : '停用'),
      }
    })
})

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

  return props.rounds.map((round, index) => ({
    key: `${round.judge}-${index}`,
    turnIndex: round.turnIndex || props.sessionState?.turnCount || 1,
    stageLabel: defenseStageLabel(round.stage || props.sessionState?.currentStage),
    judge: round.judge,
    judgeTypeLabel: judgeTypeLabel(round.judgeType),
    score: round.score,
    createdAt: formatDateTime(round.createdAt || props.sessionState?.updatedAt || props.sessionMeta?.updatedAt),
    question: round.question,
    comment: normalizeString(round.comment) || '当前轮次尚未沉淀评语。',
    followUp: normalizeString(round.followUp) || '暂无追问',
  }))
})

const personaSummaryText = computed(() => {
  if (props.personas.length === 0)
    return '当前项目还没有评委 persona，建议先在 AgentDef 导入比赛预设。'

  const enabledCount = props.personas.filter(item => item.enabled).length
  if (enabledCount === 0)
    return '评委 persona 已创建，但当前没有启用席位。'
  return `当前已启用 ${enabledCount} 位评委，可直接映射到最新轮次和实时答辩 sidecar。`
})

const heroStats = computed(() => {
  return [
    {
      id: 'stage',
      label: '当前阶段',
      value: defenseStageLabel(props.sessionState?.currentStage),
      note: props.sessionState ? `第 ${Math.max(props.sessionState.turnCount, 1)} 轮状态` : '等待开始',
    },
    {
      id: 'turns',
      label: '轮次',
      value: `${props.sessionState?.turnCount || 0}`,
      note: sessionTimelineEntries.value.length > 0 ? `时间轴已记录 ${sessionTimelineEntries.value.length} 条评委发言` : '暂无答辩时间轴',
    },
    {
      id: 'materials',
      label: '材料数',
      value: `${props.selectedResourceCount}`,
      note: props.selectedResourceCount > 0 ? '已挂到当前答辩项目' : '仍需补齐答辩材料',
    },
    {
      id: 'updated',
      label: '最近更新',
      value: formatDateTime(props.sessionState?.updatedAt || props.sessionMeta?.updatedAt || props.sessionMeta?.lastMessageAt),
      note: props.sessionMeta?.createdAt
        ? `答辩已持续 ${formatDurationClock(Math.max(0, workbenchNow.value - (parseTimestamp(props.sessionMeta.createdAt) || workbenchNow.value)))}`
        : meetingSummary.value,
    },
  ]
})

const realtimeStatusCards = computed(() => {
  return [
    {
      id: 'provider',
      label: 'Provider',
      value: realtimeProviderLabel(props.realtimeState?.provider),
      note: props.realtimeState?.transport === 'rtc_sidecar' ? '并行 sidecar 链路' : 'WebSocket sidecar 链路',
    },
    {
      id: 'connection',
      label: '连接态',
      value: realtimeConnectionLabel(props.realtimeState?.connectionState),
      note: props.realtimeState?.bootstrapState === 'bootstrapping' ? 'WinLoop 正在握手' : '可在右侧 AgentDef 继续诊断',
    },
    {
      id: 'speaker',
      label: '当前评委',
      value: props.realtimeState?.latestSpeakerLabel || '等待首句',
      note: props.realtimeState?.lastProviderEventAt ? `最近事件 ${formatDateTime(props.realtimeState.lastProviderEventAt)}` : '尚未收到 provider 事件',
    },
    {
      id: 'latency',
      label: '延迟',
      value: props.realtimeState?.latestLatencyMs ? `${Math.round(props.realtimeState.latestLatencyMs)} ms` : '暂无',
      note: props.realtimeState?.mediaMode === 'audio' ? '当前为纯音频模式' : '当前为音视频理解模式',
    },
  ]
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
    class="workspace-defense-workbench"
  >
    <section class="workspace-defense-workbench__hero">
      <div class="workspace-defense-workbench__hero-copy">
        <p class="workspace-defense-workbench__eyebrow">
          比赛状态驾驶舱
        </p>
        <h1 class="workspace-defense-workbench__title">
          {{ contestName || '未绑定比赛' }}
          <span class="workspace-defense-workbench__title-separator">/</span>
          {{ trackName || '未绑定赛道' }}
        </h1>
        <p class="workspace-defense-workbench__summary">
          中间主面板直接接比赛时钟、答辩时间轴和当前答辩席。评委编辑与追问继续收敛到右侧 AgentDef。
        </p>

        <div class="workspace-defense-workbench__meta-row">
          <span class="workspace-defense-workbench__meta-pill">
            阶段：{{ defenseStageLabel(sessionState?.currentStage) }}
          </span>
          <span class="workspace-defense-workbench__meta-pill">
            开始：{{ formatDateTime(sessionMeta?.createdAt) }}
          </span>
          <span class="workspace-defense-workbench__meta-pill">
            更新：{{ formatDateTime(sessionState?.updatedAt || sessionMeta?.updatedAt || sessionMeta?.lastMessageAt) }}
          </span>
        </div>
      </div>

      <div class="workspace-defense-workbench__hero-stats">
        <article
          v-for="item in heroStats"
          :key="item.id"
          class="workspace-defense-workbench__stat"
        >
          <p class="workspace-defense-workbench__stat-label">
            {{ item.label }}
          </p>
          <strong class="workspace-defense-workbench__stat-value">{{ item.value }}</strong>
          <p class="workspace-defense-workbench__stat-note">
            {{ item.note }}
          </p>
        </article>
      </div>
    </section>

    <section
      data-testid="workspace-defense-actions"
      class="workspace-defense-workbench__actions"
    >
      <button
        class="workspace-defense-workbench__action workspace-defense-workbench__action--primary"
        type="button"
        @click="emit('openAgentDef')"
      >
        打开 AgentDef
      </button>
      <button
        class="workspace-defense-workbench__action"
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
    </section>

    <section class="workspace-defense-workbench__dashboard-grid">
      <article
        data-testid="workspace-defense-status-panel"
        class="workspace-defense-workbench__panel"
      >
        <header class="workspace-defense-workbench__panel-header">
          <div>
            <p class="workspace-defense-workbench__panel-eyebrow">
              比赛状态
            </p>
            <h2 class="workspace-defense-workbench__panel-title">
              比赛时钟
            </h2>
          </div>
        </header>

        <div class="workspace-defense-workbench__clock-hero" :data-tone="contestClockSnapshot.tone">
          <p class="workspace-defense-workbench__clock-label">
            {{ contestClockSnapshot.countdownLabel }}
          </p>
          <strong class="workspace-defense-workbench__clock-value">
            {{ contestClockSnapshot.countdownValue }}
          </strong>
          <p class="workspace-defense-workbench__clock-title">
            {{ contestClockSnapshot.headline }}
          </p>
          <p class="workspace-defense-workbench__clock-text">
            {{ contestClockSnapshot.detail }}
          </p>
          <div class="workspace-defense-workbench__clock-meta">
            <span>节点时间 {{ contestClockSnapshot.timeText }}</span>
            <span v-if="contest?.currentSeason">赛季 {{ contest.currentSeason }}</span>
          </div>
        </div>

        <div v-if="contestTimelineEntries.length > 0" class="workspace-defense-workbench__schedule-list">
          <article
            v-for="item in contestTimelineEntries"
            :key="item.id"
            class="workspace-defense-workbench__schedule-item"
            :data-state="item.state"
          >
            <div>
              <p class="workspace-defense-workbench__schedule-label">
                {{ item.label }}
              </p>
              <strong class="workspace-defense-workbench__schedule-time">{{ item.timeText }}</strong>
            </div>
            <p class="workspace-defense-workbench__schedule-note">
              {{ item.note }}
            </p>
          </article>
        </div>
        <p v-else class="workspace-defense-workbench__empty">
          当前比赛还没有结构化 timeline，先按比赛窗口和答辩会话更新时间推进。
        </p>
      </article>

      <article
        data-testid="workspace-defense-persona-stage"
        class="workspace-defense-workbench__panel"
      >
        <header class="workspace-defense-workbench__panel-header">
          <div>
            <p class="workspace-defense-workbench__panel-eyebrow">
              评委阵列
            </p>
            <h2 class="workspace-defense-workbench__panel-title">
              答辩席状态
            </h2>
          </div>
        </header>

        <p class="workspace-defense-workbench__summary-text">
          {{ personaSummaryText }}
        </p>

        <div v-if="personaStageItems.length > 0" class="workspace-defense-workbench__persona-grid">
          <article
            v-for="item in personaStageItems"
            :key="item.id"
            class="workspace-defense-workbench__persona-card"
            :data-status="item.status"
          >
            <div class="workspace-defense-workbench__persona-topline">
              <strong class="workspace-defense-workbench__round-title">{{ item.name }}</strong>
              <span class="workspace-defense-workbench__persona-badge">{{ item.statusLabel }}</span>
            </div>
            <p class="workspace-defense-workbench__persona-meta">
              {{ item.judgeTypeLabel }}
            </p>
            <p class="workspace-defense-workbench__round-text workspace-defense-workbench__round-text--muted">
              {{ item.summary || '当前 persona 暂无摘要。' }}
            </p>
          </article>
        </div>
        <p v-else class="workspace-defense-workbench__empty">
          当前项目还没有答辩评委人设。可先在右侧 AgentDef 导入比赛预设。
        </p>
      </article>
    </section>

    <section
      data-testid="workspace-defense-realtime-console"
      class="workspace-defense-workbench__panel workspace-defense-workbench__panel--wide workspace-defense-workbench__realtime"
    >
      <header class="workspace-defense-workbench__panel-header">
        <div>
          <p class="workspace-defense-workbench__panel-eyebrow">
            实时答辩控制台
          </p>
          <h2 class="workspace-defense-workbench__panel-title">
            Provider / 音视频 / 诊断
          </h2>
        </div>
        <div class="workspace-defense-workbench__realtime-header-actions">
          <button
            class="workspace-defense-workbench__action"
            type="button"
            :disabled="!realtimeCanInterrupt"
            @click="emit('interruptRealtime')"
          >
            手动中断
          </button>
          <button
            class="workspace-defense-workbench__action"
            type="button"
            :disabled="props.realtimeState?.bootstrapState === 'bootstrapping'"
            @click="emit('reconnectRealtime')"
          >
            重新连接
          </button>
        </div>
      </header>

      <div class="workspace-defense-workbench__realtime-shell">
        <section class="workspace-defense-workbench__realtime-controls">
          <label class="workspace-defense-workbench__field">
            <span class="workspace-defense-workbench__field-label">Provider</span>
            <select
              class="workspace-defense-workbench__field-control"
              :value="realtimeState?.provider || 'qwen'"
              :disabled="realtimeSessionLocked"
              @change="handleRealtimeProviderChange"
            >
              <option value="qwen">
                千问
              </option>
              <option value="coze">
                Coze
              </option>
            </select>
          </label>

          <label class="workspace-defense-workbench__field">
            <span class="workspace-defense-workbench__field-label">媒体模式</span>
            <select
              class="workspace-defense-workbench__field-control"
              :value="realtimeState?.mediaMode || 'audio_video'"
              :disabled="realtimeSessionLocked"
              @change="handleRealtimeMediaModeChange"
            >
              <option value="audio_video">
                音视频理解
              </option>
              <option value="audio">
                仅音频
              </option>
            </select>
          </label>

          <div class="workspace-defense-workbench__toggle-row">
            <button
              class="workspace-defense-workbench__toggle"
              :class="{ 'workspace-defense-workbench__toggle--active': realtimeState?.audioEnabled !== false }"
              type="button"
              @click="emit('toggleRealtimeAudio', !(realtimeState?.audioEnabled !== false))"
            >
              麦克风 {{ realtimeState?.audioEnabled !== false ? '开' : '关' }}
            </button>
            <button
              class="workspace-defense-workbench__toggle"
              :class="{ 'workspace-defense-workbench__toggle--active': realtimeState?.videoEnabled === true }"
              type="button"
              :disabled="realtimeVideoToggleDisabled"
              @click="emit('toggleRealtimeVideo', !(realtimeState?.videoEnabled === true))"
            >
              摄像头 {{ realtimeState?.videoEnabled === true ? '开' : '关' }}
            </button>
          </div>

          <div class="workspace-defense-workbench__preview">
            <div id="workspace-defense-realtime-preview" class="workspace-defense-workbench__preview-surface">
              <span>本地预览</span>
              <strong>{{ realtimeState?.videoEnabled ? '视频轨已请求' : '等待开启视频' }}</strong>
            </div>
          </div>
        </section>

        <section class="workspace-defense-workbench__realtime-status">
          <article
            v-for="item in realtimeStatusCards"
            :key="item.id"
            class="workspace-defense-workbench__status-card"
          >
            <p class="workspace-defense-workbench__stat-label">
              {{ item.label }}
            </p>
            <strong class="workspace-defense-workbench__status-value">{{ item.value }}</strong>
            <p class="workspace-defense-workbench__stat-note">
              {{ item.note }}
            </p>
          </article>

          <div
            v-if="realtimeState?.lastError"
            class="workspace-defense-workbench__realtime-alert"
          >
            异常：{{ realtimeState.lastError }}
          </div>

          <div class="workspace-defense-workbench__realtime-log">
            <p class="workspace-defense-workbench__field-label">
              Provider 日志
            </p>
            <div v-if="realtimeLogs.length === 0" class="workspace-defense-workbench__empty">
              还没有 provider 日志。创建实时答辩后，这里会显示握手、连接、评委发言和异常提示。
            </div>
            <ul v-else class="workspace-defense-workbench__realtime-log-list">
              <li
                v-for="item in realtimeLogs.slice(-4)"
                :key="item.id"
                class="workspace-defense-workbench__realtime-log-item"
              >
                <span>{{ formatDateTime(item.createdAt) }}</span>
                <strong>{{ item.message }}</strong>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </section>

    <section class="workspace-defense-workbench__content-grid">
      <article
        data-testid="workspace-defense-scorecard"
        class="workspace-defense-workbench__panel"
      >
        <header class="workspace-defense-workbench__panel-header">
          <div>
            <p class="workspace-defense-workbench__panel-eyebrow">
              最新评分
            </p>
            <h2 class="workspace-defense-workbench__panel-title">
              评分卡
            </h2>
          </div>
        </header>

        <div v-if="scorecard" class="workspace-defense-workbench__score-grid">
          <article class="workspace-defense-workbench__score-item">
            <span>技术</span>
            <strong>{{ scorecard.technical }}</strong>
          </article>
          <article class="workspace-defense-workbench__score-item">
            <span>业务</span>
            <strong>{{ scorecard.business }}</strong>
          </article>
          <article class="workspace-defense-workbench__score-item">
            <span>表达</span>
            <strong>{{ scorecard.expression }}</strong>
          </article>
          <article class="workspace-defense-workbench__score-item workspace-defense-workbench__score-item--total">
            <span>总分</span>
            <strong>{{ scorecard.total }}</strong>
          </article>
          <p class="workspace-defense-workbench__score-summary">
            {{ scorecard.summary }}
          </p>
        </div>
        <p v-else class="workspace-defense-workbench__empty">
          当前还没有最新评分卡，进入一轮答辩后会在这里汇总技术、业务和表达得分。
        </p>
      </article>

      <article
        data-testid="workspace-defense-rounds"
        class="workspace-defense-workbench__panel"
      >
        <header class="workspace-defense-workbench__panel-header">
          <div>
            <p class="workspace-defense-workbench__panel-eyebrow">
              最近轮次
            </p>
            <h2 class="workspace-defense-workbench__panel-title">
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

      <article
        data-testid="workspace-defense-summary"
        class="workspace-defense-workbench__panel workspace-defense-workbench__panel--wide"
      >
        <header class="workspace-defense-workbench__panel-header">
          <div>
            <p class="workspace-defense-workbench__panel-eyebrow">
              会话总结
            </p>
            <h2 class="workspace-defense-workbench__panel-title">
              总结与动作项
            </h2>
          </div>
        </header>

        <div v-if="summary" class="workspace-defense-workbench__summary-body">
          <p class="workspace-defense-workbench__summary-text">
            {{ summary.summary }}
          </p>

          <div v-if="summary.actionItems.length > 0" class="workspace-defense-workbench__summary-group">
            <p class="workspace-defense-workbench__summary-label">
              动作项
            </p>
            <ul class="workspace-defense-workbench__summary-list">
              <li v-for="item in summary.actionItems" :key="item">
                {{ item }}
              </li>
            </ul>
          </div>

          <div v-if="summary.evidenceGaps.length > 0" class="workspace-defense-workbench__summary-group">
            <p class="workspace-defense-workbench__summary-label">
              证据缺口
            </p>
            <ul class="workspace-defense-workbench__summary-list workspace-defense-workbench__summary-list--warning">
              <li v-for="item in summary.evidenceGaps" :key="item">
                {{ item }}
              </li>
            </ul>
          </div>
        </div>
        <p v-else class="workspace-defense-workbench__empty">
          当前还没有会话总结。可以先跑完一轮答辩，再在上方动作区触发“生成会话总结”。
        </p>
      </article>
    </section>
  </section>
</template>

<style scoped>
.workspace-defense-workbench {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.workspace-defense-workbench__hero {
  border: 1px solid rgba(208, 219, 239, 0.95);
  border-radius: 32px;
  padding: 28px;
  background:
    radial-gradient(circle at top right, rgba(222, 191, 77, 0.18), transparent 32%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 255, 0.96));
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 20px;
  box-shadow: 0 22px 50px rgba(15, 23, 42, 0.08);
}

.workspace-defense-workbench__eyebrow,
.workspace-defense-workbench__panel-eyebrow,
.workspace-defense-workbench__stat-label,
.workspace-defense-workbench__summary-label {
  margin: 0;
  color: #607596;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-defense-workbench__title {
  margin: 0;
  color: #0f172a;
  font-size: 34px;
  line-height: 1.08;
  font-weight: 750;
}

.workspace-defense-workbench__title-separator {
  color: #a0afc6;
  margin: 0 6px;
}

.workspace-defense-workbench__summary,
.workspace-defense-workbench__stat-note,
.workspace-defense-workbench__empty,
.workspace-defense-workbench__round-text,
.workspace-defense-workbench__score-summary,
.workspace-defense-workbench__summary-text {
  margin: 0;
  color: #60718c;
  font-size: 13px;
  line-height: 1.8;
}

.workspace-defense-workbench__meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.workspace-defense-workbench__meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #dbe4f4;
  color: #27466f;
  font-size: 12px;
  font-weight: 600;
}

.workspace-defense-workbench__hero-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.workspace-defense-workbench__stat {
  padding: 16px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid #e0e7f5;
}

.workspace-defense-workbench__stat-value {
  display: block;
  margin-top: 6px;
  color: #0f2340;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 750;
}

.workspace-defense-workbench__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.workspace-defense-workbench__action {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid #d4ddec;
  background: rgba(255, 255, 255, 0.94);
  color: #27415f;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.workspace-defense-workbench__action:hover {
  transform: translateY(-1px);
  border-color: #b9c9e2;
  background: #ffffff;
}

.workspace-defense-workbench__action--primary {
  border-color: #2856a1;
  background: #23467b;
  color: #ffffff;
}

.workspace-defense-workbench__content-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 16px;
}

.workspace-defense-workbench__dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 16px;
}

.workspace-defense-workbench__realtime {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98));
}

.workspace-defense-workbench__realtime-shell {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
  gap: 16px;
}

.workspace-defense-workbench__realtime-controls,
.workspace-defense-workbench__realtime-status {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.workspace-defense-workbench__realtime-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.workspace-defense-workbench__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-defense-workbench__field-label {
  margin: 0;
  color: #607596;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-defense-workbench__field-control {
  min-height: 42px;
  border-radius: 14px;
  border: 1px solid #d8e2f2;
  background: #ffffff;
  color: #12304f;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
}

.workspace-defense-workbench__toggle-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.workspace-defense-workbench__toggle {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #d8e1ee;
  background: #ffffff;
  color: #4c6281;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.workspace-defense-workbench__toggle--active {
  border-color: #8cb4eb;
  background: #eef5ff;
  color: #1d4f96;
}

.workspace-defense-workbench__preview {
  border-radius: 24px;
  border: 1px solid #dce6f4;
  background: linear-gradient(135deg, #f8fbff, #eef5ff);
  padding: 12px;
}

.workspace-defense-workbench__preview-surface {
  min-height: 188px;
  border-radius: 18px;
  border: 1px dashed #bdd0eb;
  background:
    radial-gradient(circle at top left, rgba(52, 109, 182, 0.14), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(242, 247, 255, 0.95));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 6px;
  padding: 18px;
  color: #3f587d;
}

.workspace-defense-workbench__status-card {
  padding: 14px;
  border-radius: 20px;
  background: #fbfdff;
  border: 1px solid #e2eaf6;
}

.workspace-defense-workbench__status-value {
  display: block;
  margin-top: 6px;
  color: #0f2340;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 750;
}

.workspace-defense-workbench__realtime-alert {
  border-radius: 18px;
  border: 1px solid rgba(231, 146, 98, 0.32);
  background: rgba(255, 246, 239, 0.95);
  color: #9a4b17;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.7;
}

.workspace-defense-workbench__realtime-log {
  border-radius: 20px;
  border: 1px solid #dfe8f4;
  background: #ffffff;
  padding: 14px;
}

.workspace-defense-workbench__realtime-log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-defense-workbench__realtime-log-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #60718c;
  font-size: 12px;
  line-height: 1.7;
}

.workspace-defense-workbench__panel {
  border: 1px solid #dbe4f2;
  border-radius: 28px;
  padding: 22px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.05);
}

.workspace-defense-workbench__panel--wide {
  grid-column: 1 / -1;
}

.workspace-defense-workbench__panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.workspace-defense-workbench__panel-title {
  margin: 4px 0 0;
  color: #10223a;
  font-size: 20px;
  line-height: 1.25;
  font-weight: 700;
}

.workspace-defense-workbench__clock-hero {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 24px;
  border: 1px solid #dbe5f4;
  background: linear-gradient(135deg, rgba(241, 246, 255, 0.92), rgba(255, 255, 255, 0.98));
}

.workspace-defense-workbench__clock-hero[data-tone='live'] {
  border-color: rgba(41, 117, 87, 0.22);
  background: linear-gradient(135deg, rgba(234, 249, 242, 0.96), rgba(255, 255, 255, 0.98));
}

.workspace-defense-workbench__clock-hero[data-tone='queued'] {
  border-color: rgba(176, 129, 41, 0.22);
  background: linear-gradient(135deg, rgba(255, 248, 230, 0.98), rgba(255, 255, 255, 0.98));
}

.workspace-defense-workbench__clock-hero[data-tone='ended'] {
  border-color: rgba(102, 116, 138, 0.18);
  background: linear-gradient(135deg, rgba(245, 247, 251, 0.96), rgba(255, 255, 255, 0.98));
}

.workspace-defense-workbench__clock-label,
.workspace-defense-workbench__timeline-eyebrow,
.workspace-defense-workbench__schedule-label,
.workspace-defense-workbench__persona-meta {
  margin: 0;
  color: #5f7493;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-defense-workbench__clock-value {
  color: #0f2340;
  font-size: 32px;
  line-height: 1;
  font-weight: 800;
}

.workspace-defense-workbench__clock-title {
  margin: 0;
  color: #10233d;
  font-size: 18px;
  line-height: 1.35;
  font-weight: 700;
}

.workspace-defense-workbench__clock-text,
.workspace-defense-workbench__schedule-note,
.workspace-defense-workbench__timeline-meta {
  margin: 0;
  color: #60718c;
  font-size: 12px;
  line-height: 1.7;
}

.workspace-defense-workbench__clock-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #36506f;
  font-size: 12px;
  line-height: 1.6;
  font-weight: 600;
}

.workspace-defense-workbench__schedule-list,
.workspace-defense-workbench__persona-grid,
.workspace-defense-workbench__timeline-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.workspace-defense-workbench__schedule-item,
.workspace-defense-workbench__persona-card,
.workspace-defense-workbench__timeline-item {
  padding: 14px;
  border-radius: 20px;
  background: #fbfcff;
  border: 1px solid #e6edf7;
}

.workspace-defense-workbench__schedule-item[data-state='active'],
.workspace-defense-workbench__persona-card[data-status='active'] {
  border-color: rgba(43, 104, 185, 0.28);
  background: linear-gradient(135deg, rgba(240, 246, 255, 0.98), rgba(255, 255, 255, 0.98));
}

.workspace-defense-workbench__schedule-item[data-state='completed'],
.workspace-defense-workbench__persona-card[data-status='muted'] {
  background: linear-gradient(135deg, rgba(247, 249, 252, 0.98), rgba(255, 255, 255, 0.98));
}

.workspace-defense-workbench__schedule-time {
  display: block;
  margin-top: 2px;
  color: #11243d;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 700;
}

.workspace-defense-workbench__persona-topline,
.workspace-defense-workbench__timeline-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-defense-workbench__persona-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: #eef4ff;
  color: #2452a2;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
}

.workspace-defense-workbench__score-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.workspace-defense-workbench__score-item {
  padding: 14px;
  border-radius: 20px;
  background: #f8fbff;
  border: 1px solid #e4ebf7;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workspace-defense-workbench__score-item span {
  color: #6a7d99;
  font-size: 12px;
}

.workspace-defense-workbench__score-item strong {
  color: #12263f;
  font-size: 26px;
  line-height: 1.2;
  font-weight: 750;
}

.workspace-defense-workbench__score-item--total {
  background: #eef4ff;
  border-color: #cddbf6;
}

.workspace-defense-workbench__score-summary {
  grid-column: 1 / -1;
  padding: 6px 2px 0;
}

.workspace-defense-workbench__round-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-defense-workbench__round {
  padding: 14px;
  border-radius: 20px;
  background: #fbfcff;
  border: 1px solid #e6edf7;
}

.workspace-defense-workbench__round-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  border-radius: 999px;
  background: #eff4ff;
  color: #2452a2;
  font-size: 12px;
  font-weight: 700;
}

.workspace-defense-workbench__round-text {
  margin-top: 8px;
}

.workspace-defense-workbench__round-text--muted {
  color: #7c8aa0;
}

.workspace-defense-workbench__summary-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-defense-workbench__summary-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-defense-workbench__summary-list {
  margin: 0;
  padding-left: 18px;
  color: #1c6a55;
  font-size: 13px;
  line-height: 1.8;
}

.workspace-defense-workbench__summary-list--warning {
  color: #9a5a12;
}

@media (max-width: 1279px) {
  .workspace-defense-workbench__hero,
  .workspace-defense-workbench__dashboard-grid,
  .workspace-defense-workbench__realtime-shell,
  .workspace-defense-workbench__content-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .workspace-defense-workbench__hero {
    padding: 20px;
  }

  .workspace-defense-workbench__title {
    font-size: 28px;
  }

  .workspace-defense-workbench__hero-stats,
  .workspace-defense-workbench__score-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
