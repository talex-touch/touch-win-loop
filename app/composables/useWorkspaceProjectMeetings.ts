import type { ComputedRef, Ref } from 'vue'
import type {
  ApiResponse,
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingGuestShare,
  ProjectMeetingListPayload,
  ProjectMeetingMode,
  ProjectMeetingRuntimeHealth,
  ProjectMeetingUtterance,
  WorkspaceMeetingCreateTabId,
  WorkspaceOpenTabState,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'
import { onBeforeUnmount, ref } from 'vue'
import { useApiEndpoint } from '~/composables/useApiEndpoint'
import { parseTimestamp, resolveApiErrorMessage } from '~/utils/workspace-project-helpers'

export interface WorkspaceMeetingCaptionItem {
  id: string
  text: string
  speakerName: string
  speakerLabel: string
  startedAtMs: number
  endedAtMs: number
  final: boolean
}

interface ProjectMeetingJoinSessionPayload {
  meeting: ProjectMeetingDetail
  rtcJoinToken?: string
  rtcJoinExpiresAt?: string
  rtcServerUrl?: string
  rtcJoinUrl?: string
  joinToken?: string
  joinExpiresAt?: string
  joinUrl?: string
}

export interface ProjectMeetingCreatePayload {
  mode: ProjectMeetingMode
  title?: string
  invitedUserIds: string[]
  scheduledStartAt: string
  scheduledEndAt: string
}

interface UseWorkspaceProjectMeetingsOptions {
  activeProjectId: Ref<string> | ComputedRef<string>
  currentUserId: Ref<string> | ComputedRef<string>
  openMainTabs: Ref<WorkspaceOpenTabState[]>
  ensureMeetingDetailTabOpen: (meetingId: string, options?: { activate?: boolean }) => string
  ensureMeetingCreateTabOpen: (mode: ProjectMeetingMode, options?: { activate?: boolean }) => WorkspaceMeetingCreateTabId
  createMeetingCreateTabId: (mode: ProjectMeetingMode) => WorkspaceMeetingCreateTabId
  subscribeMeeting: (meetingId: string) => void
  onStatusLine: (message: string) => void
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function readString(source: Ref<string> | ComputedRef<string>): string {
  return normalizeString(source.value)
}

function normalizeOpenTabs(tabIds: WorkspaceOpenTabState[]): WorkspaceOpenTabState[] {
  return [...new Set(tabIds.filter(Boolean))]
}

export function useWorkspaceProjectMeetings(options: UseWorkspaceProjectMeetingsOptions) {
  const { endpoint } = useApiEndpoint()

  const projectMeetings = ref<ProjectMeeting[]>([])
  const meetingRuntimeHealth = ref<ProjectMeetingRuntimeHealth | null>(null)
  const activeMeetingId = ref('')
  const activeMeetingDetail = ref<ProjectMeetingDetail | null>(null)
  const activeMeetingUtterances = ref<ProjectMeetingUtterance[]>([])
  const meetingLiveCaptions = ref<WorkspaceMeetingCaptionItem[]>([])
  const projectMeetingsLoading = ref(false)
  const meetingDetailLoading = ref(false)
  const meetingGuestShareLoading = ref(false)
  const meetingMutating = ref(false)
  const meetingJoinUrl = ref('')
  const meetingJoinToken = ref('')
  const meetingJoinExpiresAt = ref('')
  const meetingRtcServerUrl = ref('')
  const activeMeetingGuestShare = ref<ProjectMeetingGuestShare | null>(null)

  let meetingRealtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null

  function clearMeetingRealtimeRefreshTimer(): void {
    if (!meetingRealtimeRefreshTimer)
      return
    clearTimeout(meetingRealtimeRefreshTimer)
    meetingRealtimeRefreshTimer = null
  }

  function clearMeetingJoinSession(): void {
    meetingJoinUrl.value = ''
    meetingJoinToken.value = ''
    meetingJoinExpiresAt.value = ''
    meetingRtcServerUrl.value = ''
  }

  function resetProjectMeetingState(): void {
    clearMeetingRealtimeRefreshTimer()
    projectMeetings.value = []
    meetingRuntimeHealth.value = null
    activeMeetingId.value = ''
    activeMeetingDetail.value = null
    activeMeetingUtterances.value = []
    meetingLiveCaptions.value = []
    activeMeetingGuestShare.value = null
    clearMeetingJoinSession()
  }

  function buildMeetingCaptionKey(item: Pick<WorkspaceMeetingCaptionItem, 'speakerLabel' | 'startedAtMs'>): string {
    return `${String(item.speakerLabel || '').trim()}::${Math.max(0, Math.trunc(Number(item.startedAtMs || 0)))}`
  }

  function trimMeetingLiveCaptions(items: WorkspaceMeetingCaptionItem[]): WorkspaceMeetingCaptionItem[] {
    return [...items]
      .sort((left, right) => left.startedAtMs - right.startedAtMs)
      .slice(-20)
  }

  function buildMeetingCaptionItem(
    payload: Record<string, unknown>,
    final: boolean,
  ): WorkspaceMeetingCaptionItem | null {
    const rawText = normalizeString(payload.text)
    if (!rawText)
      return null

    const startedAtMs = Math.max(0, Math.trunc(Number(payload.startedAtMs || 0)))
    const endedAtMs = Math.max(startedAtMs, Math.trunc(Number(payload.endedAtMs || payload.startedAtMs || 0)))
    const speakerName = normalizeString(payload.speakerName) || normalizeString(payload.speakerLabel) || 'Speaker'
    const speakerLabel = normalizeString(payload.speakerLabel) || speakerName
    const participantIdentity = normalizeString(payload.participantIdentity)
    const utteranceId = normalizeString(payload.utteranceId)
    const id = utteranceId
      || (final
        ? `final:${speakerLabel}:${startedAtMs}:${endedAtMs}`
        : `partial:${participantIdentity || speakerLabel}:${startedAtMs}`)

    return {
      id,
      text: rawText,
      speakerName,
      speakerLabel,
      startedAtMs,
      endedAtMs,
      final,
    }
  }

  function upsertMeetingLiveCaption(item: WorkspaceMeetingCaptionItem): void {
    if (item.final) {
      const targetKey = buildMeetingCaptionKey(item)
      meetingLiveCaptions.value = trimMeetingLiveCaptions(
        meetingLiveCaptions.value.filter(existing => buildMeetingCaptionKey(existing) !== targetKey),
      )
      return
    }

    const targetKey = buildMeetingCaptionKey(item)
    const nextItems = meetingLiveCaptions.value.filter(existing => buildMeetingCaptionKey(existing) !== targetKey)
    nextItems.push(item)
    meetingLiveCaptions.value = trimMeetingLiveCaptions(nextItems)
  }

  function upsertProjectMeetingInList(meeting: ProjectMeeting): void {
    const normalizedMeetingId = normalizeString(meeting.id)
    if (!normalizedMeetingId)
      return

    const nextItems = [...projectMeetings.value]
    const existingIndex = nextItems.findIndex(item => item.id === normalizedMeetingId)
    if (existingIndex >= 0)
      nextItems.splice(existingIndex, 1, meeting)
    else
      nextItems.unshift(meeting)

    projectMeetings.value = nextItems
      .sort((left, right) => {
        const startedDiff = parseTimestamp(right.startedAt) - parseTimestamp(left.startedAt)
        if (startedDiff !== 0)
          return startedDiff
        return parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt)
      })
      .slice(0, 12)
  }

  function applyProjectMeetingSession(
    meeting: ProjectMeetingDetail | null,
    payload: {
      joinUrl?: string
      joinToken?: string
      joinExpiresAt?: string
      rtcServerUrl?: string
      resetCaptions?: boolean
      preserveJoinSession?: boolean
    } = {},
  ): void {
    if (!meeting) {
      activeMeetingId.value = ''
      activeMeetingDetail.value = null
      activeMeetingUtterances.value = []
      if (payload.resetCaptions !== false)
        meetingLiveCaptions.value = []
      activeMeetingGuestShare.value = null
      clearMeetingJoinSession()
      return
    }

    activeMeetingId.value = meeting.id
    activeMeetingDetail.value = meeting
    upsertProjectMeetingInList(meeting)
    if (!payload.preserveJoinSession) {
      meetingJoinUrl.value = normalizeString(payload.joinUrl)
      meetingJoinToken.value = normalizeString(payload.joinToken)
      meetingJoinExpiresAt.value = normalizeString(payload.joinExpiresAt)
      meetingRtcServerUrl.value = normalizeString(payload.rtcServerUrl)
    }
    if (payload.resetCaptions)
      meetingLiveCaptions.value = []
    syncMeetingGuestShareState(meeting)
  }

  function canManageMeetingGuestShare(meeting: ProjectMeetingDetail | null): boolean {
    const currentUserId = readString(options.currentUserId)
    if (!currentUserId || !meeting)
      return false
    return normalizeString(meeting.startedByUserId) === currentUserId
  }

  async function loadProjectMeetingGuestShare(meetingId: string): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId || !canManageMeetingGuestShare(activeMeetingDetail.value)) {
      activeMeetingGuestShare.value = null
      return
    }

    meetingGuestShareLoading.value = true
    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingGuestShare | null>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/guest-share`),
      )
      if (readString(options.activeProjectId) === projectId && activeMeetingId.value === targetMeetingId)
        activeMeetingGuestShare.value = response.data || null
    }
    catch {
      if (readString(options.activeProjectId) === projectId && activeMeetingId.value === targetMeetingId)
        activeMeetingGuestShare.value = null
    }
    finally {
      meetingGuestShareLoading.value = false
    }
  }

  function syncMeetingGuestShareState(meeting: ProjectMeetingDetail | null): void {
    if (!meeting || !canManageMeetingGuestShare(meeting) || meeting.status === 'ended' || meeting.status === 'failed') {
      activeMeetingGuestShare.value = null
      return
    }
    void loadProjectMeetingGuestShare(meeting.id)
  }

  async function loadProjectMeetingUtterances(meetingId: string): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId) {
      activeMeetingUtterances.value = []
      return
    }

    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingUtterance[]>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/utterances`),
      )
      if (readString(options.activeProjectId) !== projectId || activeMeetingId.value !== targetMeetingId)
        return
      activeMeetingUtterances.value = Array.isArray(response.data) ? response.data : []
    }
    catch {
      if (readString(options.activeProjectId) === projectId && activeMeetingId.value === targetMeetingId)
        activeMeetingUtterances.value = []
    }
  }

  async function loadProjectMeetingDetail(
    meetingId: string,
    payload: {
      resetCaptions?: boolean
      preserveJoinSession?: boolean
    } = {},
  ): Promise<ProjectMeetingDetail | null> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId) {
      applyProjectMeetingSession(null)
      return null
    }

    meetingDetailLoading.value = true
    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingDetail>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}`),
      )
      if (readString(options.activeProjectId) !== projectId || activeMeetingId.value !== targetMeetingId)
        return response.data || null

      applyProjectMeetingSession(response.data, {
        resetCaptions: payload.resetCaptions,
        preserveJoinSession: payload.preserveJoinSession !== false,
      })
      return response.data
    }
    catch (error) {
      if (readString(options.activeProjectId) === projectId && activeMeetingId.value === targetMeetingId) {
        activeMeetingDetail.value = null
        activeMeetingUtterances.value = []
        activeMeetingGuestShare.value = null
        clearMeetingJoinSession()
      }
      options.onStatusLine(resolveApiErrorMessage(error, '加载会议详情失败，请稍后重试。'))
      return null
    }
    finally {
      if (readString(options.activeProjectId) === projectId || !readString(options.activeProjectId))
        meetingDetailLoading.value = false
    }
  }

  async function selectProjectMeeting(meetingId: string): Promise<void> {
    const targetMeetingId = normalizeString(meetingId)
    if (!targetMeetingId)
      return

    options.ensureMeetingDetailTabOpen(targetMeetingId)
    options.subscribeMeeting(targetMeetingId)
    const isSwitchingMeeting = activeMeetingId.value !== targetMeetingId
    activeMeetingId.value = targetMeetingId
    if (isSwitchingMeeting) {
      activeMeetingDetail.value = null
      activeMeetingUtterances.value = []
      meetingLiveCaptions.value = []
      clearMeetingJoinSession()
    }

    await Promise.all([
      loadProjectMeetingDetail(targetMeetingId, { resetCaptions: isSwitchingMeeting, preserveJoinSession: false }),
      loadProjectMeetingUtterances(targetMeetingId),
    ])
  }

  async function loadProjectMeetings(
    payload: {
      fallbackToFirst?: boolean
      preferredMeetingId?: string
      hydrateSelectedDetail?: boolean
    } = {},
  ): Promise<void> {
    const projectId = readString(options.activeProjectId)
    if (!projectId) {
      resetProjectMeetingState()
      return
    }

    projectMeetingsLoading.value = true
    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingListPayload>>(
        endpoint(`/projects/${projectId}/meetings`),
      )
      if (readString(options.activeProjectId) !== projectId)
        return

      const items = Array.isArray(response.data?.items) ? response.data.items : []
      projectMeetings.value = items
      meetingRuntimeHealth.value = response.data?.runtimeHealth || null

      const preferredMeetingId = normalizeString(payload.preferredMeetingId || activeMeetingId.value)
      const preferredMeeting = preferredMeetingId
        ? items.find(item => item.id === preferredMeetingId) || null
        : null
      if (preferredMeeting) {
        options.subscribeMeeting(preferredMeeting.id)
        const isSwitchingMeeting = activeMeetingId.value !== preferredMeeting.id
        activeMeetingId.value = preferredMeeting.id
        if (isSwitchingMeeting) {
          activeMeetingDetail.value = null
          activeMeetingUtterances.value = []
          meetingLiveCaptions.value = []
          clearMeetingJoinSession()
        }

        if (payload.hydrateSelectedDetail === false)
          return

        await Promise.all([
          loadProjectMeetingDetail(preferredMeeting.id, { resetCaptions: isSwitchingMeeting, preserveJoinSession: false }),
          loadProjectMeetingUtterances(preferredMeeting.id),
        ])
        return
      }

      const selectedMeetingStillExists = Boolean(
        activeMeetingId.value && items.some(item => item.id === activeMeetingId.value),
      )
      if (selectedMeetingStillExists)
        return

      if (payload.fallbackToFirst !== false && items[0]?.id) {
        await selectProjectMeeting(items[0].id)
        return
      }

      applyProjectMeetingSession(null)
    }
    catch {
      if (readString(options.activeProjectId) === projectId) {
        projectMeetings.value = []
        meetingRuntimeHealth.value = null
      }
    }
    finally {
      if (readString(options.activeProjectId) === projectId || !readString(options.activeProjectId))
        projectMeetingsLoading.value = false
    }
  }

  function scheduleMeetingRealtimeRefresh(payload: {
    meetingId?: string
    refreshUtterances?: boolean
  } = {}): void {
    const targetMeetingId = normalizeString(payload.meetingId || activeMeetingId.value)
    clearMeetingRealtimeRefreshTimer()
    meetingRealtimeRefreshTimer = setTimeout(() => {
      meetingRealtimeRefreshTimer = null
      void loadProjectMeetings({ fallbackToFirst: false })
      if (targetMeetingId && targetMeetingId === activeMeetingId.value) {
        void loadProjectMeetingDetail(targetMeetingId)
        if (payload.refreshUtterances)
          void loadProjectMeetingUtterances(targetMeetingId)
      }
    }, 250)
  }

  async function createProjectMeeting(payload: { mode: ProjectMeetingMode }): Promise<void> {
    options.ensureMeetingCreateTabOpen(payload.mode)
    options.onStatusLine(`${payload.mode === 'audio' ? '语音' : '视频'}会议创建页已打开。`)
  }

  async function submitProjectMeetingCreate(payload: ProjectMeetingCreatePayload): Promise<void> {
    const projectId = readString(options.activeProjectId)
    if (!projectId || meetingMutating.value)
      return

    meetingMutating.value = true
    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingJoinSessionPayload>>(
        endpoint(`/projects/${projectId}/meetings`),
        {
          method: 'POST',
          body: payload,
        },
      )

      const targetMeeting = response.data.meeting
      activeMeetingUtterances.value = []
      applyProjectMeetingSession(targetMeeting, {
        joinUrl: response.data.rtcJoinUrl || response.data.joinUrl,
        joinToken: response.data.rtcJoinToken || response.data.joinToken,
        joinExpiresAt: response.data.rtcJoinExpiresAt || response.data.joinExpiresAt,
        rtcServerUrl: response.data.rtcServerUrl,
        resetCaptions: true,
      })
      options.ensureMeetingDetailTabOpen(targetMeeting.id)
      options.subscribeMeeting(targetMeeting.id)
      options.openMainTabs.value = normalizeOpenTabs(
        options.openMainTabs.value.filter(tabId => tabId !== options.createMeetingCreateTabId(payload.mode)),
      )
      if (targetMeeting.status !== 'scheduled')
        await loadProjectMeetingUtterances(targetMeeting.id)
      options.onStatusLine(`${payload.mode === 'audio' ? '语音' : '视频'}会议已创建。`)
      Message.success('会议已创建。')
    }
    catch (error) {
      const message = resolveApiErrorMessage(error, '创建会议失败，请稍后重试。')
      options.onStatusLine(message)
      Message.error(message)
    }
    finally {
      meetingMutating.value = false
    }
  }

  async function joinProjectMeeting(meetingId: string): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId || meetingMutating.value)
      return

    meetingMutating.value = true
    try {
      options.ensureMeetingDetailTabOpen(targetMeetingId)
      options.subscribeMeeting(targetMeetingId)
      activeMeetingId.value = targetMeetingId
      const response = await unsafeFetch<ApiResponse<ProjectMeetingJoinSessionPayload>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/join`),
        {
          method: 'POST',
        },
      )
      applyProjectMeetingSession(response.data.meeting, {
        joinUrl: response.data.rtcJoinUrl || response.data.joinUrl,
        joinToken: response.data.rtcJoinToken || response.data.joinToken,
        joinExpiresAt: response.data.rtcJoinExpiresAt || response.data.joinExpiresAt,
        rtcServerUrl: response.data.rtcServerUrl,
        resetCaptions: false,
      })
      if (response.data.meeting)
        await loadProjectMeetingUtterances(targetMeetingId)
    }
    catch (error) {
      const message = resolveApiErrorMessage(error, '加入会议失败，请稍后重试。')
      options.onStatusLine(message)
      Message.error(message)
    }
    finally {
      meetingMutating.value = false
    }
  }

  async function startProjectMeeting(meetingId: string): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId || meetingMutating.value)
      return

    meetingMutating.value = true
    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingJoinSessionPayload>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/start`),
        {
          method: 'POST',
        },
      )
      applyProjectMeetingSession(response.data.meeting, {
        joinUrl: response.data.rtcJoinUrl || response.data.joinUrl,
        joinToken: response.data.rtcJoinToken || response.data.joinToken,
        joinExpiresAt: response.data.rtcJoinExpiresAt || response.data.joinExpiresAt,
        rtcServerUrl: response.data.rtcServerUrl,
        resetCaptions: true,
      })
      options.ensureMeetingDetailTabOpen(targetMeetingId)
      options.subscribeMeeting(targetMeetingId)
      await loadProjectMeetingUtterances(targetMeetingId)
      options.onStatusLine('会议已启动。')
      Message.success('会议已启动。')
    }
    catch (error) {
      const message = resolveApiErrorMessage(error, '启动会议失败，请稍后重试。')
      options.onStatusLine(message)
      Message.error(message)
    }
    finally {
      meetingMutating.value = false
    }
  }

  async function endProjectMeeting(meetingId: string): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId || meetingMutating.value)
      return

    meetingMutating.value = true
    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingDetail>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/end`),
        {
          method: 'POST',
        },
      )

      upsertProjectMeetingInList(response.data)
      if (activeMeetingId.value === targetMeetingId) {
        applyProjectMeetingSession(response.data, {
          resetCaptions: false,
        })
        clearMeetingJoinSession()
        activeMeetingGuestShare.value = null
        await loadProjectMeetingUtterances(targetMeetingId)
      }

      options.onStatusLine('会议已结束，系统正在整理录制与纪要。')
      Message.success('会议已结束。')
    }
    catch (error) {
      const message = resolveApiErrorMessage(error, '结束会议失败，请稍后重试。')
      options.onStatusLine(message)
      Message.error(message)
    }
    finally {
      meetingMutating.value = false
    }
  }

  async function createProjectMeetingGuestShare(meetingId: string): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId || meetingGuestShareLoading.value)
      return

    meetingGuestShareLoading.value = true
    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingGuestShare>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/guest-share`),
        {
          method: 'POST',
        },
      )
      if (activeMeetingId.value === targetMeetingId)
        activeMeetingGuestShare.value = response.data
      options.onStatusLine('外部分享链接已生成。')
      Message.success('外部分享链接已生成。')
    }
    catch (error) {
      const message = resolveApiErrorMessage(error, '生成外部分享链接失败，请稍后重试。')
      options.onStatusLine(message)
      Message.error(message)
    }
    finally {
      meetingGuestShareLoading.value = false
    }
  }

  async function regenerateProjectMeetingGuestShare(meetingId: string): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId || meetingGuestShareLoading.value)
      return

    meetingGuestShareLoading.value = true
    try {
      const response = await unsafeFetch<ApiResponse<ProjectMeetingGuestShare>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/guest-share`),
        {
          method: 'POST',
          body: {
            regenerate: true,
          },
        },
      )
      if (activeMeetingId.value === targetMeetingId)
        activeMeetingGuestShare.value = response.data
      options.onStatusLine('外部分享链接已重新生成，旧链接已失效。')
      Message.success('外部分享链接已重新生成。')
    }
    catch (error) {
      const message = resolveApiErrorMessage(error, '重新生成外部分享链接失败，请稍后重试。')
      options.onStatusLine(message)
      Message.error(message)
    }
    finally {
      meetingGuestShareLoading.value = false
    }
  }

  async function revokeProjectMeetingGuestShare(meetingId: string): Promise<void> {
    const projectId = readString(options.activeProjectId)
    const targetMeetingId = normalizeString(meetingId)
    if (!projectId || !targetMeetingId || meetingGuestShareLoading.value)
      return

    meetingGuestShareLoading.value = true
    try {
      await unsafeFetch<ApiResponse<ProjectMeetingGuestShare | null>>(
        endpoint(`/projects/${projectId}/meetings/${targetMeetingId}/guest-share`),
        {
          method: 'DELETE',
        },
      )
      if (activeMeetingId.value === targetMeetingId)
        activeMeetingGuestShare.value = null
      options.onStatusLine('外部分享链接已撤销。')
      Message.success('外部分享链接已撤销。')
    }
    catch (error) {
      const message = resolveApiErrorMessage(error, '撤销外部分享链接失败，请稍后重试。')
      options.onStatusLine(message)
      Message.error(message)
    }
    finally {
      meetingGuestShareLoading.value = false
    }
  }

  function handleMeetingRealtimeEnvelope(messageType: string, payload: Record<string, unknown>): void {
    const meetingId = normalizeString(payload.meetingId)

    if (messageType === 'meeting.caption.partial' || messageType === 'meeting.caption.final') {
      if (meetingId && activeMeetingId.value && meetingId !== activeMeetingId.value)
        return

      const caption = buildMeetingCaptionItem(payload, messageType === 'meeting.caption.final')
      if (!caption)
        return

      upsertMeetingLiveCaption(caption)
      if (messageType === 'meeting.caption.final' && meetingId)
        scheduleMeetingRealtimeRefresh({ meetingId, refreshUtterances: true })
      return
    }

    if (messageType === 'meeting.summary.ready') {
      options.onStatusLine('会议纪要已就绪，资源区会自动补齐录制与纪要。')
      scheduleMeetingRealtimeRefresh({
        meetingId: meetingId || activeMeetingId.value,
      })
      return
    }

    scheduleMeetingRealtimeRefresh({
      meetingId: meetingId || activeMeetingId.value,
    })
  }

  onBeforeUnmount(() => {
    clearMeetingRealtimeRefreshTimer()
  })

  return {
    projectMeetings,
    meetingRuntimeHealth,
    activeMeetingId,
    activeMeetingDetail,
    activeMeetingUtterances,
    meetingLiveCaptions,
    projectMeetingsLoading,
    meetingDetailLoading,
    meetingGuestShareLoading,
    meetingMutating,
    meetingJoinUrl,
    meetingJoinToken,
    meetingJoinExpiresAt,
    meetingRtcServerUrl,
    activeMeetingGuestShare,
    clearMeetingRealtimeRefreshTimer,
    clearMeetingJoinSession,
    resetProjectMeetingState,
    buildMeetingCaptionItem,
    upsertMeetingLiveCaption,
    applyProjectMeetingSession,
    loadProjectMeetingGuestShare,
    syncMeetingGuestShareState,
    loadProjectMeetingUtterances,
    loadProjectMeetingDetail,
    selectProjectMeeting,
    loadProjectMeetings,
    scheduleMeetingRealtimeRefresh,
    createProjectMeeting,
    submitProjectMeetingCreate,
    joinProjectMeeting,
    startProjectMeeting,
    endProjectMeeting,
    createProjectMeetingGuestShare,
    regenerateProjectMeetingGuestShare,
    revokeProjectMeetingGuestShare,
    handleMeetingRealtimeEnvelope,
  }
}
