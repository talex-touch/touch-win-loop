<script setup lang="ts">
import type {
  AiChatSession,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefenseSessionState,
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingRuntimeHealth,
} from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  contestName?: string
  trackName?: string
  sessionMeta?: AiChatSession | null
  sessionState?: AiDefenseSessionState | null
  personas?: AiDefensePersona[]
  rounds?: AiDefenseJudgeRound[]
  linkedMeeting?: ProjectMeeting | ProjectMeetingDetail | null
  meetingRuntimeHealth?: ProjectMeetingRuntimeHealth | null
}>(), {
  contestName: '',
  trackName: '',
  sessionMeta: null,
  sessionState: null,
  personas: () => [],
  rounds: () => [],
  linkedMeeting: null,
  meetingRuntimeHealth: null,
})

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

const currentPersonaIdSet = computed(() => {
  return new Set(
    props.rounds
      .map(item => String(item.personaId || '').trim())
      .filter(Boolean),
  )
})

const sortedPersonas = computed(() => {
  return [...props.personas].sort((left, right) => {
    if (left.enabled !== right.enabled)
      return left.enabled ? -1 : 1
    return Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
  })
})

const overviewItems = computed(() => {
  const sessionState = props.sessionState
  return [
    {
      id: 'stage',
      label: '当前阶段',
      value: defenseStageLabel(sessionState?.currentStage),
      detail: sessionState ? `已完成 ${sessionState.turnCount} 轮` : '等待答辩开始',
    },
    {
      id: 'created',
      label: '开始时间',
      value: formatDateTime(props.sessionMeta?.createdAt),
      detail: props.sessionMeta?.title || '尚未生成答辩会话',
    },
    {
      id: 'updated',
      label: '最近更新',
      value: formatDateTime(sessionState?.updatedAt || props.sessionMeta?.updatedAt || props.sessionMeta?.lastMessageAt),
      detail: sessionState?.summaryStatus === 'completed' ? '总结已产出' : '会话仍可继续追问',
    },
  ]
})

const meetingStatus = computed(() => {
  if (!props.sessionState?.linkedMeetingId)
    return {
      label: '未发起语音答辩',
      detail: '当前仍是文本答辩回合。',
      tone: 'idle',
    }

  if (!props.linkedMeeting) {
    return {
      label: '已关联语音会议',
      detail: '会议详情载入中。',
      tone: 'default',
    }
  }

  if (props.linkedMeeting.status === 'active') {
    return {
      label: props.meetingRuntimeHealth?.ready === false ? '语音会议待检查' : '语音会议进行中',
      detail: props.meetingRuntimeHealth?.ready === false
        ? (props.meetingRuntimeHealth.issues[0] || 'RTC / ASR 状态异常。')
        : `${props.linkedMeeting.mode === 'audio' ? '音频会话' : '视频会话'} · ${props.linkedMeeting.provider}`,
      tone: props.meetingRuntimeHealth?.ready === false ? 'warning' : 'live',
    }
  }

  if (props.linkedMeeting.status === 'scheduled') {
    return {
      label: '语音会议待开始',
      detail: props.linkedMeeting.title || '会议已创建，等待进入。',
      tone: 'default',
    }
  }

  if (props.linkedMeeting.status === 'ended') {
    return {
      label: '语音会议已结束',
      detail: props.linkedMeeting.title || '可继续查看会话总结与轮次记录。',
      tone: 'idle',
    }
  }

  return {
    label: '语音会议异常结束',
    detail: props.meetingRuntimeHealth?.issues[0] || props.linkedMeeting.title || '请在 AgentDef 中继续排查。',
    tone: 'warning',
  }
})

function resolvePersonaBadge(persona: AiDefensePersona): { label: string, className: string } {
  if (currentPersonaIdSet.value.has(String(persona.id || '').trim())) {
    return {
      label: '当前轮次',
      className: 'workspace-defense-sidebar__persona-badge workspace-defense-sidebar__persona-badge--active',
    }
  }
  if (persona.enabled) {
    return {
      label: '待命',
      className: 'workspace-defense-sidebar__persona-badge workspace-defense-sidebar__persona-badge--ready',
    }
  }
  return {
    label: '停用',
    className: 'workspace-defense-sidebar__persona-badge workspace-defense-sidebar__persona-badge--muted',
  }
}
</script>

<template>
  <aside
    data-testid="workspace-defense-sidebar"
    class="workspace-defense-sidebar"
  >
    <section
      data-testid="workspace-defense-sidebar-overview"
      class="workspace-defense-sidebar__overview"
    >
      <div class="space-y-3">
        <div class="space-y-1">
          <p class="workspace-defense-sidebar__eyebrow">
            答辩概述
          </p>
          <h2 class="workspace-defense-sidebar__title">
            {{ contestName || '未绑定比赛' }}
          </h2>
          <p class="workspace-defense-sidebar__subtitle">
            {{ trackName || '未绑定赛道' }}
          </p>
        </div>

        <div class="workspace-defense-sidebar__meeting" :data-tone="meetingStatus.tone">
          <p class="workspace-defense-sidebar__section-label">
            语音答辩
          </p>
          <strong class="workspace-defense-sidebar__meeting-title">{{ meetingStatus.label }}</strong>
          <p class="workspace-defense-sidebar__meeting-text">
            {{ meetingStatus.detail }}
          </p>
        </div>

        <div class="workspace-defense-sidebar__overview-grid">
          <article
            v-for="item in overviewItems"
            :key="item.id"
            class="workspace-defense-sidebar__overview-item"
          >
            <p class="workspace-defense-sidebar__section-label">
              {{ item.label }}
            </p>
            <strong class="workspace-defense-sidebar__overview-value">{{ item.value }}</strong>
            <p class="workspace-defense-sidebar__overview-text">
              {{ item.detail }}
            </p>
          </article>
        </div>
      </div>
    </section>

    <section
      data-testid="workspace-defense-persona-list"
      class="workspace-defense-sidebar__personas"
    >
      <header class="workspace-defense-sidebar__personas-header">
        <div>
          <p class="workspace-defense-sidebar__eyebrow">
            评委列表
          </p>
          <h3 class="workspace-defense-sidebar__personas-title">
            当前答辩席
          </h3>
        </div>
        <span class="workspace-defense-sidebar__personas-count">
          {{ personas.length }} 位
        </span>
      </header>

      <div v-if="sortedPersonas.length === 0" class="workspace-defense-sidebar__empty">
        当前项目还没有答辩评委人设。可在右侧 AgentDef 导入比赛预设或新建评委。
      </div>

      <div v-else class="workspace-defense-sidebar__persona-list">
        <article
          v-for="persona in sortedPersonas"
          :key="persona.id"
          class="workspace-defense-sidebar__persona"
          :data-active="currentPersonaIdSet.has(String(persona.id || '').trim()) ? 'true' : 'false'"
        >
          <div class="workspace-defense-sidebar__persona-topline">
            <div>
              <strong class="workspace-defense-sidebar__persona-name">{{ persona.name }}</strong>
              <p class="workspace-defense-sidebar__persona-meta">
                {{ persona.judgeType }} · {{ persona.focusAreas.slice(0, 2).join('、') || '未设置关注点' }}
              </p>
            </div>
            <span :class="resolvePersonaBadge(persona).className">
              {{ resolvePersonaBadge(persona).label }}
            </span>
          </div>

          <p class="workspace-defense-sidebar__persona-summary">
            {{ persona.summary || '当前评委暂无摘要描述。' }}
          </p>
        </article>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.workspace-defense-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  padding: 18px 16px;
  background:
    linear-gradient(180deg, rgba(248, 250, 255, 0.98) 0%, rgba(241, 245, 255, 0.98) 100%);
}

.workspace-defense-sidebar__overview,
.workspace-defense-sidebar__personas {
  border: 1px solid rgba(216, 224, 239, 0.95);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.workspace-defense-sidebar__overview {
  padding: 18px;
}

.workspace-defense-sidebar__personas {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.workspace-defense-sidebar__eyebrow,
.workspace-defense-sidebar__section-label {
  margin: 0;
  color: #5f7598;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-defense-sidebar__title {
  margin: 0;
  color: #0f172a;
  font-size: 26px;
  line-height: 1.15;
  font-weight: 700;
}

.workspace-defense-sidebar__subtitle {
  margin: 0;
  color: #52637f;
  font-size: 13px;
  line-height: 1.6;
}

.workspace-defense-sidebar__meeting {
  padding: 14px;
  border-radius: 18px;
  background: #f7f9fe;
  border: 1px solid #dde6f4;
}

.workspace-defense-sidebar__meeting[data-tone='live'] {
  background: #eef8f0;
  border-color: #cde7d2;
}

.workspace-defense-sidebar__meeting[data-tone='warning'] {
  background: #fff7eb;
  border-color: #f1d7b0;
}

.workspace-defense-sidebar__meeting-title,
.workspace-defense-sidebar__overview-value {
  display: block;
  margin-top: 6px;
  color: #163150;
  font-size: 16px;
  line-height: 1.35;
  font-weight: 700;
}

.workspace-defense-sidebar__meeting-text,
.workspace-defense-sidebar__overview-text,
.workspace-defense-sidebar__persona-meta,
.workspace-defense-sidebar__persona-summary,
.workspace-defense-sidebar__empty {
  margin: 0;
  color: #617591;
  font-size: 12px;
  line-height: 1.7;
}

.workspace-defense-sidebar__overview-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 10px;
}

.workspace-defense-sidebar__overview-item {
  padding: 14px;
  border-radius: 18px;
  background: #fbfcff;
  border: 1px solid #e8edf7;
}

.workspace-defense-sidebar__personas-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid #edf2fb;
}

.workspace-defense-sidebar__personas-title {
  margin: 4px 0 0;
  color: #14233a;
  font-size: 18px;
  line-height: 1.3;
  font-weight: 700;
}

.workspace-defense-sidebar__personas-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #eff4ff;
  color: #35537f;
  font-size: 11px;
  font-weight: 700;
}

.workspace-defense-sidebar__persona-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-defense-sidebar__persona {
  padding: 14px;
  border-radius: 18px;
  background: #f8fbff;
  border: 1px solid #e2ebf7;
}

.workspace-defense-sidebar__persona[data-active='true'] {
  background: #eef4ff;
  border-color: #bfd3f6;
  box-shadow: inset 0 0 0 1px rgba(102, 146, 234, 0.15);
}

.workspace-defense-sidebar__persona-topline {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.workspace-defense-sidebar__persona-name {
  color: #102138;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 700;
}

.workspace-defense-sidebar__persona-summary {
  margin-top: 8px;
}

.workspace-defense-sidebar__persona-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
}

.workspace-defense-sidebar__persona-badge--active {
  background: #dbeafe;
  color: #1d4ed8;
}

.workspace-defense-sidebar__persona-badge--ready {
  background: #ecfdf3;
  color: #047857;
}

.workspace-defense-sidebar__persona-badge--muted {
  background: #f1f5f9;
  color: #64748b;
}

.workspace-defense-sidebar__empty {
  margin: 0 18px 18px;
  padding: 14px;
  border: 1px dashed #d3ddea;
  border-radius: 18px;
  background: #fbfcff;
}

@media (max-width: 1279px) {
  .workspace-defense-sidebar {
    padding: 16px;
  }
}
</style>
