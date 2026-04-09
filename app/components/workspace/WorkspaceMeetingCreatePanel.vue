<script setup lang="ts">
import type {
  ProjectMeetingMode,
  ProjectMemberSummary,
  WorkspaceType,
} from '~~/shared/types/domain'

interface MeetingCreatePayload {
  mode: ProjectMeetingMode
  title?: string
  invitedUserIds: string[]
  scheduledStartAt: string
  scheduledEndAt: string
}

const props = withDefaults(defineProps<{
  mode: ProjectMeetingMode
  projectMembers?: ProjectMemberSummary[]
  currentUserId?: string
  workspaceType?: WorkspaceType | ''
  meetingPlanTier?: 'personal_team' | 'business_team' | null
  mutating?: boolean
}>(), {
  projectMembers: () => [],
  currentUserId: '',
  workspaceType: '',
  meetingPlanTier: null,
  mutating: false,
})

const emit = defineEmits<{
  quickCreate: [payload: MeetingCreatePayload]
  submitCreate: [payload: MeetingCreatePayload]
  openMeetingOverview: []
}>()

function resolvePlanTier(): 'personal_team' | 'business_team' {
  if (props.meetingPlanTier === 'personal_team')
    return 'personal_team'
  if (props.meetingPlanTier === 'business_team')
    return 'business_team'
  return props.workspaceType === 'personal' ? 'personal_team' : 'business_team'
}

function resolveDefaultDurationMinutes(): number {
  return resolvePlanTier() === 'personal_team' ? 15 : 60
}

function resolveDurationLimitMinutes(): number {
  return resolvePlanTier() === 'personal_team' ? 15 : 24 * 60
}

function toLocalDatetimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function parseLocalDatetime(value: string): Date | null {
  const normalized = String(value || '').trim()
  if (!normalized)
    return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()))
    return null
  return parsed
}

function createDefaultRange(): { start: string, end: string } {
  const now = new Date()
  const end = new Date(now.getTime() + resolveDefaultDurationMinutes() * 60 * 1000)
  return {
    start: toLocalDatetimeValue(now),
    end: toLocalDatetimeValue(end),
  }
}

const formTitle = ref('')
const invitedUserIds = ref<string[]>([])
const scheduleRange = reactive(createDefaultRange())
const localError = ref('')

const panelTitle = computed(() => {
  return props.mode === 'audio' ? '新建语音会议' : '新建视频会议'
})

const panelDescription = computed(() => {
  return props.mode === 'audio'
    ? '适合快速语音讨论与答辩排练，系统会自动接入实时字幕与会后纪要。'
    : '适合项目评审、周会和协同演示，视频体验与录制沉淀会一起保留。'
})

const currentUserId = computed(() => String(props.currentUserId || '').trim())

const currentUser = computed(() => {
  const userId = currentUserId.value
  return props.projectMembers.find(item => item.userId === userId) || null
})

const selectableMembers = computed(() => {
  return props.projectMembers
})

const durationLimitText = computed(() => {
  return resolvePlanTier() === 'personal_team' ? '15 分钟' : '24 小时'
})

const defaultDurationText = computed(() => {
  return `${resolveDefaultDurationMinutes()} 分钟`
})

function resetForm(): void {
  const nextRange = createDefaultRange()
  formTitle.value = ''
  invitedUserIds.value = currentUser.value ? [currentUser.value.userId] : []
  scheduleRange.start = nextRange.start
  scheduleRange.end = nextRange.end
  localError.value = ''
}

function ensureCurrentUserSelected(): void {
  const normalizedCurrentUserId = currentUserId.value
  if (!normalizedCurrentUserId)
    return
  if (!invitedUserIds.value.includes(normalizedCurrentUserId))
    invitedUserIds.value = [normalizedCurrentUserId, ...invitedUserIds.value]
}

function toggleInvitee(userId: string): void {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId || normalizedUserId === currentUserId.value)
    return

  if (invitedUserIds.value.includes(normalizedUserId)) {
    invitedUserIds.value = invitedUserIds.value.filter(item => item !== normalizedUserId)
    ensureCurrentUserSelected()
    return
  }

  invitedUserIds.value = [...invitedUserIds.value, normalizedUserId]
  ensureCurrentUserSelected()
}

function buildPayload(options: { quickCreate?: boolean } = {}): MeetingCreatePayload | null {
  const startDate = options.quickCreate ? new Date() : parseLocalDatetime(scheduleRange.start)
  if (!startDate) {
    localError.value = '请选择开始时间。'
    return null
  }

  const endDate = options.quickCreate
    ? new Date(startDate.getTime() + resolveDefaultDurationMinutes() * 60 * 1000)
    : parseLocalDatetime(scheduleRange.end)
  if (!endDate) {
    localError.value = '请选择结束时间。'
    return null
  }
  if (endDate.getTime() <= startDate.getTime()) {
    localError.value = '结束时间必须晚于开始时间。'
    return null
  }

  const durationMinutes = Math.ceil((endDate.getTime() - startDate.getTime()) / 60000)
  if (durationMinutes > resolveDurationLimitMinutes()) {
    localError.value = `当前工作区会议最长仅支持 ${durationLimitText.value}。`
    return null
  }

  const normalizedCurrentUserId = currentUserId.value
  const normalizedInvitees = options.quickCreate
    ? (normalizedCurrentUserId ? [normalizedCurrentUserId] : [])
    : Array.from(new Set(invitedUserIds.value.map(item => String(item || '').trim()).filter(Boolean)))

  if (!options.quickCreate && normalizedCurrentUserId && !normalizedInvitees.includes(normalizedCurrentUserId))
    normalizedInvitees.unshift(normalizedCurrentUserId)

  localError.value = ''
  return {
    mode: props.mode,
    title: String(formTitle.value || '').trim(),
    invitedUserIds: normalizedInvitees,
    scheduledStartAt: startDate.toISOString(),
    scheduledEndAt: endDate.toISOString(),
  }
}

function submitQuickCreate(): void {
  const payload = buildPayload({ quickCreate: true })
  if (!payload)
    return
  emit('quickCreate', payload)
}

function submitForm(): void {
  const payload = buildPayload()
  if (!payload)
    return
  emit('submitCreate', payload)
}

watch(
  () => [props.currentUserId, props.mode, props.meetingPlanTier, props.workspaceType],
  () => {
    resetForm()
  },
  { immediate: true },
)

watch(currentUser, (next, previous) => {
  if (previous || !next || invitedUserIds.value.length > 0)
    return
  invitedUserIds.value = [next.userId]
})
</script>

<template>
  <div class="meeting-create-panel mx-auto max-w-5xl space-y-4">
    <section class="meeting-create-hero">
      <div class="space-y-2">
        <div class="meeting-create-hero__badge">
          <span class="material-symbols-outlined text-sm">{{ mode === 'audio' ? 'headset_mic' : 'video_call' }}</span>
          {{ panelTitle }}
        </div>
        <h2 class="text-2xl text-slate-900 font-semibold">
          {{ panelTitle }}
        </h2>
        <p class="text-sm text-slate-600">
          {{ panelDescription }}
        </p>
        <p class="text-xs text-slate-500">
          当前默认时长 {{ defaultDurationText }}，最长支持 {{ durationLimitText }}。参会人仅可选择当前项目成员。
        </p>
      </div>
      <button class="meeting-create-btn meeting-create-btn--ghost" type="button" @click="emit('openMeetingOverview')">
        返回会议总览
      </button>
    </section>

    <section class="meeting-create-card">
      <div class="meeting-create-card__header">
        <div>
          <h3>快速创建</h3>
          <p>使用默认标题、默认时长与当前发起人，立即进入会议详情页。</p>
        </div>
        <button
          class="meeting-create-btn"
          type="button"
          :disabled="mutating"
          @click="submitQuickCreate"
        >
          {{ mutating ? '创建中...' : mode === 'audio' ? '立即发起语音会议' : '立即发起视频会议' }}
        </button>
      </div>
    </section>

    <section class="meeting-create-card">
      <div class="meeting-create-card__header">
        <div>
          <h3>完整配置</h3>
          <p>可配置标题、邀请成员与预约时间。若开始时间早于当前时间，则按立即会议创建。</p>
        </div>
      </div>

      <form class="meeting-create-form" @submit.prevent="submitForm">
        <label class="meeting-create-field">
          <span>会议标题</span>
          <input
            v-model="formTitle"
            type="text"
            maxlength="120"
            placeholder="留空则按系统规则自动命名"
          >
        </label>

        <div class="meeting-create-field">
          <span>参会人</span>
          <div class="meeting-create-members">
            <button
              v-for="member in selectableMembers"
              :key="member.userId"
              class="meeting-member-chip"
              :class="{ 'meeting-member-chip--active': invitedUserIds.includes(member.userId) }"
              :disabled="member.userId === currentUserId"
              type="button"
              @click="toggleInvitee(member.userId)"
            >
              <span class="meeting-member-chip__name">{{ member.username }}</span>
              <span class="meeting-member-chip__role">{{ member.role }}</span>
              <span v-if="member.userId === currentUserId" class="meeting-member-chip__tag">发起人</span>
            </button>
          </div>
        </div>

        <div class="meeting-create-grid">
          <label class="meeting-create-field">
            <span>开始时间</span>
            <input
              v-model="scheduleRange.start"
              type="datetime-local"
            >
          </label>

          <label class="meeting-create-field">
            <span>结束时间</span>
            <input
              v-model="scheduleRange.end"
              type="datetime-local"
            >
          </label>
        </div>

        <p v-if="localError" class="meeting-create-error">
          {{ localError }}
        </p>

        <div class="meeting-create-actions">
          <button class="meeting-create-btn" type="submit" :disabled="mutating">
            {{ mutating ? '提交中...' : '创建会议' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.meeting-create-panel {
  min-width: 0;
}

.meeting-create-hero,
.meeting-create-card {
  border: 1px solid #e2e8f0;
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #fff, #f8fafc);
  padding: 1.25rem;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
}

.meeting-create-hero {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.meeting-create-hero__badge {
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

.meeting-create-card__header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.meeting-create-card__header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
}

.meeting-create-card__header p {
  margin: 0.35rem 0 0;
  font-size: 0.875rem;
  color: #64748b;
}

.meeting-create-form {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.meeting-create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.meeting-create-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.meeting-create-field span {
  font-size: 0.875rem;
  font-weight: 600;
  color: #334155;
}

.meeting-create-field input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.95rem;
  background: #fff;
  padding: 0.8rem 0.9rem;
  font-size: 0.9rem;
  color: #0f172a;
}

.meeting-create-field input:focus {
  outline: none;
  border-color: #0f172a;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
}

.meeting-create-members {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.meeting-member-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  padding: 0.7rem 0.9rem;
  cursor: pointer;
}

.meeting-member-chip:disabled {
  cursor: default;
  opacity: 1;
}

.meeting-member-chip--active {
  border-color: #0f172a;
  background: #e2e8f0;
  color: #0f172a;
}

.meeting-member-chip__name {
  font-size: 0.875rem;
  font-weight: 600;
}

.meeting-member-chip__role,
.meeting-member-chip__tag {
  font-size: 0.75rem;
  color: #64748b;
}

.meeting-create-actions {
  display: flex;
  justify-content: flex-end;
}

.meeting-create-btn {
  border: 1px solid #0f172a;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  padding: 0.7rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.meeting-create-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.meeting-create-btn--ghost {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}

.meeting-create-error {
  margin: 0;
  color: #dc2626;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .meeting-create-hero,
  .meeting-create-card__header {
    flex-direction: column;
  }

  .meeting-create-grid {
    grid-template-columns: 1fr;
  }
}
</style>
