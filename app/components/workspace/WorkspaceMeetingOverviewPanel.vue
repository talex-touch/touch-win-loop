<script setup lang="ts">
import type { ProjectMeeting } from '~~/shared/types/domain'

withDefaults(defineProps<{
  meetings?: ProjectMeeting[]
  loading?: boolean
}>(), {
  meetings: () => [],
  loading: false,
})

const emit = defineEmits<{
  refreshMeetings: []
  openMeeting: [meetingId: string]
  openResource: [resourceId: string]
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
</script>

<template>
  <div class="meeting-overview mx-auto max-w-6xl space-y-4">
    <section class="meeting-overview__hero">
      <div>
        <div class="meeting-overview__badge">
          <span class="material-symbols-outlined text-sm">video_call</span>
          项目会议
        </div>
        <h2 class="text-2xl text-slate-900 font-semibold mt-3">
          会议总览
        </h2>
        <p class="text-sm text-slate-600 mt-2">
          这里仅负责查看最近会议、当前状态，以及录制和纪要资源入口。具体会议会在独立 tab 中展开。
        </p>
      </div>
      <button class="meeting-overview__button meeting-overview__button--ghost" type="button" @click="emit('refreshMeetings')">
        刷新列表
      </button>
    </section>

    <section class="meeting-overview__grid">
      <article
        v-for="meeting in meetings"
        :key="meeting.id"
        class="meeting-overview__card"
      >
        <div class="meeting-overview__card-top">
          <div>
            <p class="meeting-overview__meta">
              {{ meeting.mode === 'audio' ? '语音会议' : '视频会议' }} · {{ resolveStatusLabel(meeting.status) }}
            </p>
            <h3 class="meeting-overview__title">
              {{ meeting.title }}
            </h3>
          </div>
          <span class="meeting-overview__status">{{ resolveStatusLabel(meeting.status) }}</span>
        </div>

        <div class="meeting-overview__facts">
          <span>开始：{{ formatDateTime(meeting.scheduledStartAt || meeting.startedAt) }}</span>
          <span v-if="meeting.durationMinutes">时长：{{ meeting.durationMinutes }} 分钟</span>
          <span v-if="meeting.invitedCount">邀请：{{ meeting.invitedCount }} 人</span>
        </div>

        <div class="meeting-overview__actions">
          <button class="meeting-overview__button" type="button" @click="emit('openMeeting', meeting.id)">
            打开详情
          </button>
          <button
            v-if="meeting.notesResourceId"
            class="meeting-overview__button meeting-overview__button--ghost"
            type="button"
            @click="emit('openResource', meeting.notesResourceId)"
          >
            纪要
          </button>
          <button
            v-if="meeting.recordingResourceId"
            class="meeting-overview__button meeting-overview__button--ghost"
            type="button"
            @click="emit('openResource', meeting.recordingResourceId)"
          >
            录制
          </button>
        </div>
      </article>

      <div v-if="loading" class="meeting-overview__empty">
        正在加载会议列表...
      </div>
      <div v-else-if="meetings.length === 0" class="meeting-overview__empty">
        暂无会议记录。请从左侧发起视频会议或语音会议。
      </div>
    </section>
  </div>
</template>

<style scoped>
.meeting-overview {
  min-width: 0;
}

.meeting-overview__hero,
.meeting-overview__card {
  border: 1px solid #e2e8f0;
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #fff, #f8fafc);
  padding: 1.25rem;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
}

.meeting-overview__hero {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.meeting-overview__badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #0f172a;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.meeting-overview__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.meeting-overview__card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.meeting-overview__card-top {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.meeting-overview__meta {
  margin: 0;
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-overview__title {
  margin: 0.35rem 0 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-overview__status {
  border-radius: 999px;
  background: #e2e8f0;
  color: #0f172a;
  padding: 0.3rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.meeting-overview__facts {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.875rem;
  color: #475569;
}

.meeting-overview__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.meeting-overview__button {
  border: 1px solid #0f172a;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  padding: 0.7rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.meeting-overview__button--ghost {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}

.meeting-overview__empty {
  border: 1px dashed #cbd5e1;
  border-radius: 1.5rem;
  background: #fff;
  padding: 2rem 1.25rem;
  text-align: center;
  color: #64748b;
  font-size: 0.95rem;
}

@media (max-width: 768px) {
  .meeting-overview__hero {
    flex-direction: column;
  }
}
</style>
