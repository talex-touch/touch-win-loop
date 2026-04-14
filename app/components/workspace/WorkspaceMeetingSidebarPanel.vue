<script setup lang="ts">
import type {
  ProjectMeeting,
  ProjectMeetingMode,
  ProjectMeetingRuntimeHealth,
} from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  meetings?: ProjectMeeting[]
  activeMeetingId?: string
  loading?: boolean
  mutating?: boolean
  runtimeHealth?: ProjectMeetingRuntimeHealth | null
}>(), {
  meetings: () => [],
  activeMeetingId: '',
  loading: false,
  mutating: false,
  runtimeHealth: null,
})

const emit = defineEmits<{
  openMeetingOverview: []
  createMeeting: [payload: { mode: ProjectMeetingMode }]
  selectMeeting: [meetingId: string]
}>()

function formatDateTime(value: string | null | undefined): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '未设置'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()))
    return normalized

  return parsed.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveStatusLabel(status: ProjectMeeting['status']): string {
  if (status === 'scheduled')
    return '待开始'
  if (status === 'active')
    return '进行中'
  if (status === 'ended')
    return '已结束'
  return '失败'
}

function resolveStatusClass(status: ProjectMeeting['status']): string {
  if (status === 'active')
    return 'workspace-meeting-sidebar__status workspace-meeting-sidebar__status--active'
  if (status === 'scheduled')
    return 'workspace-meeting-sidebar__status workspace-meeting-sidebar__status--scheduled'
  if (status === 'ended')
    return 'workspace-meeting-sidebar__status workspace-meeting-sidebar__status--ended'
  return 'workspace-meeting-sidebar__status workspace-meeting-sidebar__status--failed'
}

const recentMeetings = computed(() => {
  return props.meetings.slice(0, 6)
})

const meetingRuntimeLoading = computed(() => !props.runtimeHealth)
const meetingRuntimeReady = computed(() => props.runtimeHealth?.ready === true)
const meetingRuntimeIssues = computed(() => props.runtimeHealth?.issues || [])
const meetingRuntimeWarningText = computed(() => {
  if (meetingRuntimeReady.value)
    return ''
  if (meetingRuntimeLoading.value)
    return '正在检查会议服务配置。'
  return meetingRuntimeIssues.value.join('；') || '会议服务尚未完成配置。'
})
const createDisabled = computed(() => {
  return props.mutating || meetingRuntimeLoading.value || !meetingRuntimeReady.value
})

function createMeeting(mode: ProjectMeetingMode): void {
  emit('createMeeting', { mode })
}
</script>

<template>
  <section class="workspace-meeting-sidebar">
    <div class="workspace-meeting-sidebar__hero">
      <div class="workspace-meeting-sidebar__badge">
        <span class="material-symbols-outlined">video_call</span>
        项目会议
      </div>
      <h3 class="workspace-meeting-sidebar__title">
        项目会议
      </h3>
      <p class="workspace-meeting-sidebar__desc">
        左侧只保留两种发起入口。具体会议会在右侧打开独立详情页 tab。
      </p>
    </div>

    <div v-if="meetingRuntimeLoading || !meetingRuntimeReady" class="workspace-meeting-sidebar__runtime">
      <span class="material-symbols-outlined">warning</span>
      <div class="workspace-meeting-sidebar__runtime-body">
        <strong>{{ meetingRuntimeLoading ? '会议服务检查中' : '会议服务未就绪' }}</strong>
        <p>{{ meetingRuntimeWarningText }}</p>
      </div>
    </div>

    <div class="workspace-meeting-sidebar__actions">
      <button
        class="workspace-meeting-sidebar__action"
        type="button"
        :disabled="createDisabled"
        @click="createMeeting('video')"
      >
        发起视频会议
      </button>
      <button
        class="workspace-meeting-sidebar__action workspace-meeting-sidebar__action--ghost"
        type="button"
        :disabled="createDisabled"
        @click="createMeeting('audio')"
      >
        发起语音会议
      </button>
    </div>

    <div class="workspace-meeting-sidebar__section-head">
      <span>最近会议</span>
      <button class="workspace-meeting-sidebar__link" type="button" @click="emit('openMeetingOverview')">
        查看总览
      </button>
    </div>

    <div v-if="loading" class="workspace-meeting-sidebar__empty">
      正在加载会议列表...
    </div>
    <div v-else-if="recentMeetings.length === 0" class="workspace-meeting-sidebar__empty">
      暂无会议记录。发起后会在这里显示最近会议、录制与纪要入口。
    </div>
    <div v-else class="workspace-meeting-sidebar__list">
      <button
        v-for="meeting in recentMeetings"
        :key="meeting.id"
        class="workspace-meeting-sidebar__item"
        :class="{ 'workspace-meeting-sidebar__item--active': meeting.id === props.activeMeetingId }"
        type="button"
        @click="emit('selectMeeting', meeting.id)"
      >
        <div class="workspace-meeting-sidebar__item-top">
          <span class="workspace-meeting-sidebar__item-mode">
            {{ meeting.mode === 'audio' ? '语音会议' : '视频会议' }}
          </span>
          <span :class="resolveStatusClass(meeting.status)">
            {{ resolveStatusLabel(meeting.status) }}
          </span>
        </div>
        <strong class="workspace-meeting-sidebar__item-title">{{ meeting.title }}</strong>
        <div class="workspace-meeting-sidebar__item-meta">
          <span>{{ formatDateTime(meeting.scheduledStartAt || meeting.startedAt) }}</span>
          <span v-if="meeting.durationMinutes">{{ meeting.durationMinutes }} 分钟</span>
          <span v-if="meeting.invitedCount">{{ meeting.invitedCount }} 人</span>
        </div>
      </button>
    </div>
  </section>
</template>

<style scoped>
.workspace-meeting-sidebar {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  background:
    radial-gradient(circle at top, rgba(191, 219, 254, 0.35), transparent 36%),
    linear-gradient(180deg, #ffffff, #f8fafc);
}

.workspace-meeting-sidebar__hero {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-meeting-sidebar__badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.workspace-meeting-sidebar__badge .material-symbols-outlined {
  font-size: 16px;
}

.workspace-meeting-sidebar__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.workspace-meeting-sidebar__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.workspace-meeting-sidebar__runtime {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  border: 1px solid #fed7aa;
  border-radius: 14px;
  background: #fff7ed;
  padding: 12px;
  color: #9a3412;
}

.workspace-meeting-sidebar__runtime .material-symbols-outlined {
  font-size: 18px;
}

.workspace-meeting-sidebar__runtime-body {
  min-width: 0;
}

.workspace-meeting-sidebar__runtime-body strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
}

.workspace-meeting-sidebar__runtime-body p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.workspace-meeting-sidebar__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workspace-meeting-sidebar__action,
.workspace-meeting-sidebar__link,
.workspace-meeting-sidebar__item {
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workspace-meeting-sidebar__action {
  border-radius: 14px;
  background: #0f172a;
  color: #ffffff;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 700;
}

.workspace-meeting-sidebar__action:hover:not(:disabled) {
  background: #1e293b;
}

.workspace-meeting-sidebar__action--ghost {
  background: #e2e8f0;
  color: #0f172a;
}

.workspace-meeting-sidebar__action--ghost:hover:not(:disabled) {
  background: #cbd5e1;
}

.workspace-meeting-sidebar__action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.workspace-meeting-sidebar__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.workspace-meeting-sidebar__link {
  background: transparent;
  color: #2563eb;
  padding: 0;
  font-size: 12px;
  font-weight: 700;
}

.workspace-meeting-sidebar__link:hover {
  color: #1d4ed8;
}

.workspace-meeting-sidebar__list {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.workspace-meeting-sidebar__item {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  background: #ffffff;
  padding: 12px;
  text-align: left;
}

.workspace-meeting-sidebar__item:hover {
  border-color: #bfdbfe;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.08);
}

.workspace-meeting-sidebar__item--active {
  border-color: #93c5fd;
  background: #eff6ff;
}

.workspace-meeting-sidebar__item-top,
.workspace-meeting-sidebar__item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-meeting-sidebar__item-mode,
.workspace-meeting-sidebar__item-meta {
  font-size: 12px;
  color: #64748b;
}

.workspace-meeting-sidebar__item-title {
  display: block;
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.workspace-meeting-sidebar__status {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
}

.workspace-meeting-sidebar__status--active {
  background: #dcfce7;
  color: #166534;
}

.workspace-meeting-sidebar__status--scheduled {
  background: #dbeafe;
  color: #1d4ed8;
}

.workspace-meeting-sidebar__status--ended {
  background: #e2e8f0;
  color: #475569;
}

.workspace-meeting-sidebar__status--failed {
  background: #fee2e2;
  color: #b91c1c;
}

.workspace-meeting-sidebar__empty {
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.8);
  padding: 18px 14px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}
</style>
