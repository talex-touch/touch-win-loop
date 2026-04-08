<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  Contest,
  Project,
  ProjectTopicBoardCreateSeed,
  WorkspaceBillingEstimate,
  WorkspaceMemberRole,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import type { TeamProjectCardItem } from '~/composables/team-ui'
import {
  buildContestNameMap,
  buildTeamProjectCard,
  calculateRemainingProjectSlots,
  formatPlanLabel,
  formatWorkspaceTypeLabel,
  normalizeQueryValue,
  normalizeRouteParam,
  projectWorkspacePath,
  resolveProjectTeamId,
  resolveWorkspaceOptions,
  shouldOpenCreateDialog,
  teamDashboardPath,
  teamDetailPath,
} from '~/composables/team-ui'
import { writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: 'Team 项目台',
})

const WORKSPACE_CREATE_PROJECT_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

const routeWorkspaceId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  return normalizeRouteParam(params.workspaceId || params.teamId)
})

const loading = ref(false)
const errorText = ref('')
const noticeText = ref('')
const joinedNoticeText = ref('')
const me = ref<AuthMeResult | null>(null)
const projects = ref<Project[]>([])
const contests = ref<Contest[]>([])
const workspaceBillingEstimate = ref<WorkspaceBillingEstimate | null>(null)

const createDialogVisible = ref(false)
const creatingProject = ref(false)
const createErrorText = ref('')
const TOPIC_BOARD_CREATE_SEED_STORAGE_PREFIX = 'workspace.topicBoardSeed.'

function createEmptyTopicBoardSeed(): ProjectTopicBoardCreateSeed {
  return {
    keywords: [],
    teamSkillTags: [],
    candidateCount: 3,
    source: 'project_create',
    autoGenerate: true,
  }
}

const createForm = reactive({
  title: '',
  summary: '',
  contestIds: [] as string[],
  topicBoardSeed: createEmptyTopicBoardSeed(),
})

const workspaceOptions = computed<WorkspaceWithQuota[]>(() => {
  return resolveWorkspaceOptions(me.value)
})

const activeWorkspace = computed(() => {
  const workspaceId = routeWorkspaceId.value
  if (!workspaceId)
    return null
  return workspaceOptions.value.find(item => item.workspace.id === workspaceId) || null
})

const activeWorkspaceId = computed(() => String(activeWorkspace.value?.workspace.id || '').trim())
const activeWorkspaceRoles = computed(() => activeWorkspace.value?.workspace.roles || [])
const workspaceCanCreateProject = computed(() => {
  if (me.value?.user.isPlatformAdmin)
    return true
  return activeWorkspaceRoles.value.some(role => WORKSPACE_CREATE_PROJECT_ROLES.includes(role))
})

const contestNameMap = computed(() => buildContestNameMap(contests.value))

const projectCards = computed<TeamProjectCardItem[]>(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return []

  return projects.value
    .filter(item => resolveProjectTeamId(item) === workspaceId)
    .map(item => buildTeamProjectCard(item, contestNameMap.value, activeWorkspace.value || undefined))
})

const visibleProjectSummaryText = computed(() => `当前项目台可见项目 ${projectCards.value.length} 个`)
const currentPlanLabel = computed(() => {
  const workspaceType = activeWorkspace.value?.workspace.type
  const fallbackPlanTier = workspaceType === 'personal' ? 'personal_team' : 'business_team'
  return formatPlanLabel(workspaceBillingEstimate.value?.planCode, workspaceBillingEstimate.value?.planTier || fallbackPlanTier)
})
const remainingProjectSlots = computed(() => {
  return calculateRemainingProjectSlots({
    projectsUnlimited: workspaceBillingEstimate.value?.projectsUnlimited,
    includedProjects: workspaceBillingEstimate.value?.includedProjects,
    extraProjectSlots: workspaceBillingEstimate.value?.extraProjectSlots,
    projectCount: workspaceBillingEstimate.value?.projectCount,
  })
})
const createDisabledReason = computed(() => {
  if (!activeWorkspaceId.value)
    return '当前 Team 项目台不可用。'
  if (!workspaceCanCreateProject.value)
    return '当前为只读成员，不能新建项目。'
  if (workspaceBillingEstimate.value && remainingProjectSlots.value === 0)
    return '当前项目台项目数量已达上限，请先扩容项目配额。'
  return ''
})
const activeNoticeText = computed(() => {
  return joinedNoticeText.value || noticeText.value
})
const activeNoticeTone = computed<'success' | 'warning'>(() => {
  if (joinedNoticeText.value)
    return 'success'
  return 'warning'
})
const summaryStats = computed<Array<{
  label: string
  value: string
  tone?: 'neutral' | 'warning' | 'success'
}>>(() => {
  const workspace = activeWorkspace.value?.workspace
  const estimate = workspaceBillingEstimate.value
  const quota = activeWorkspace.value?.quota
  const seatRemaining = quota ? Math.max(0, quota.seatLimit - quota.seatUsed) : null
  const aiRemaining = quota ? Math.max(0, quota.aiQuotaTotal - quota.aiQuotaUsed) : null

  return [
    {
      label: '项目台类型',
      value: formatWorkspaceTypeLabel(workspace?.type),
    },
    {
      label: '当前 Plan',
      value: currentPlanLabel.value,
    },
    {
      label: '项目配额',
      value: estimate
        ? estimate.projectsUnlimited
          ? `不限，当前 ${estimate.projectCount} 个项目`
          : `剩余 ${remainingProjectSlots.value} 个（已用 ${estimate.projectCount}/${estimate.includedProjects + estimate.extraProjectSlots}）`
        : '加载中...',
      tone: remainingProjectSlots.value === 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Team 席位',
      value: quota
        ? `${quota.seatUsed}/${quota.seatLimit}，剩余 ${seatRemaining}`
        : workspace?.type === 'personal'
          ? '个人项目台默认独立管理'
          : '未配置',
    },
    {
      label: 'AI 配额',
      value: quota
        ? `${quota.aiQuotaUsed}/${quota.aiQuotaTotal}，剩余 ${aiRemaining}`
        : workspace?.type === 'personal'
          ? '个人项目台不参与 Team AI 配额'
          : '未配置',
      tone: quota && aiRemaining === 0 ? 'warning' : 'neutral',
    },
  ]
})

function openCreateDialog() {
  if (createDisabledReason.value) {
    noticeText.value = createDisabledReason.value
    return
  }

  createErrorText.value = ''
  createDialogVisible.value = true
}

function closeCreateDialog() {
  if (creatingProject.value)
    return
  createDialogVisible.value = false
}

function openProject(project: TeamProjectCardItem) {
  const workspaceId = activeWorkspaceId.value
  const projectId = String(project.id || '').trim()
  if (!workspaceId || !projectId)
    return
  writeActiveWorkspacePreference(workspaceId)
  navigateTo(projectWorkspacePath(workspaceId, projectId))
}

async function submitQuickCreate() {
  const workspaceId = activeWorkspaceId.value
  const title = createForm.title.trim()
  const summary = createForm.summary.trim()
  const contestIds = createForm.contestIds

  if (!workspaceId || !title) {
    createErrorText.value = '请填写项目名称。'
    return
  }

  if (createDisabledReason.value) {
    createErrorText.value = createDisabledReason.value
    return
  }

  creatingProject.value = true
  createErrorText.value = ''

  try {
    const response = await $fetch<ApiResponse<Project>>(endpoint('/projects/quick'), {
      method: 'POST',
      body: {
        teamId: workspaceId,
        workspaceId,
        title,
        summary,
        contestIds,
      },
    })

    const created = response.data
    const createdWorkspaceId = String(created.teamId || created.workspaceId || '').trim() || workspaceId

    if (process.client && createForm.topicBoardSeed.autoGenerate !== false) {
      window.sessionStorage.setItem(
        `${TOPIC_BOARD_CREATE_SEED_STORAGE_PREFIX}${created.id}`,
        JSON.stringify({
          ...createForm.topicBoardSeed,
          contestId: createForm.contestIds[0] || '',
        } satisfies ProjectTopicBoardCreateSeed),
      )
    }

    createForm.title = ''
    createForm.summary = ''
    createForm.contestIds = []
    createForm.topicBoardSeed = createEmptyTopicBoardSeed()
    createDialogVisible.value = false
    writeActiveWorkspacePreference(createdWorkspaceId)

    await navigateTo(projectWorkspacePath(createdWorkspaceId, created.id))
  }
  catch (error: any) {
    createErrorText.value = String(error?.data?.message || '创建项目失败，请稍后重试。')
  }
  finally {
    creatingProject.value = false
  }
}

async function loadWorkspaceBillingEstimate(workspaceId: string) {
  try {
    const response = await $fetch<ApiResponse<WorkspaceBillingEstimate>>(endpoint(`/teams/${workspaceId}/billing/estimate`))
    if (activeWorkspaceId.value !== workspaceId)
      return
    workspaceBillingEstimate.value = response.data
  }
  catch {
    if (activeWorkspaceId.value === workspaceId)
      workspaceBillingEstimate.value = null
  }
}

async function loadWorkspaceDashboard() {
  const workspaceId = routeWorkspaceId.value
  if (!workspaceId) {
    await navigateTo(teamDashboardPath(), { replace: true })
    return
  }

  loading.value = true
  errorText.value = ''

  try {
    const meResponse = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    me.value = meResponse.data

    const canAccess = resolveWorkspaceOptions(meResponse.data).some(item => item.workspace.id === workspaceId)
    if (!canAccess) {
      await navigateTo({
        path: teamDashboardPath(),
        query: { deniedWorkspaceId: workspaceId },
      }, { replace: true })
      return
    }

    writeActiveWorkspacePreference(workspaceId)

    const [projectsResponse, contestsResponse] = await Promise.all([
      $fetch<ApiResponse<Project[]>>(endpoint('/projects'), {
        query: {
          teamId: workspaceId,
          workspaceId,
        },
      }),
      $fetch<ApiResponse<Contest[]>>(endpoint('/contests')),
    ])

    projects.value = projectsResponse.data
    contests.value = contestsResponse.data

    await loadWorkspaceBillingEstimate(workspaceId)

    const legacyProjectId = normalizeQueryValue(route.query.projectId)
    if (legacyProjectId) {
      await navigateTo(projectWorkspacePath(workspaceId, legacyProjectId), { replace: true })
    }
  }
  catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status)
    if (statusCode === 401) {
      await navigateTo({
        path: '/login',
        query: { redirect: route.fullPath || teamDashboardPath() },
      })
      return
    }

    errorText.value = String(error?.data?.message || '项目台加载失败，请稍后重试。')
    projects.value = []
    contests.value = []
    workspaceBillingEstimate.value = null
  }
  finally {
    loading.value = false
  }
}

async function consumeJoinedNotice() {
  if (!shouldOpenCreateDialog(route.query.joined))
    return

  joinedNoticeText.value = '你已加入当前 Team，可直接查看项目。'

  const nextQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'joined')
      continue

    const normalized = normalizeQueryValue(value)
    if (normalized)
      nextQuery[key] = normalized
  }

  await navigateTo({
    path: teamDetailPath(routeWorkspaceId.value),
    query: Object.keys(nextQuery).length > 0 ? nextQuery : undefined,
  }, { replace: true })
}

onMounted(async () => {
  const deniedWorkspaceId = normalizeQueryValue(route.query.deniedWorkspaceId || route.query.deniedTeamId)
  if (deniedWorkspaceId)
    noticeText.value = `无权访问 Team ${deniedWorkspaceId}。`

  await loadWorkspaceDashboard()
  await consumeJoinedNotice()

  if (shouldOpenCreateDialog(route.query.create))
    openCreateDialog()
})
</script>

<template>
  <div class="space-y-6">
    <TeamProjectOverview
      :title="activeWorkspace?.workspace.name || 'Team 项目台'"
      description="当前 Team 项目台总览：先看配额与项目列表，再进入具体项目工作区继续分析与协作。"
      :summary-text="visibleProjectSummaryText"
      :summary-stats="summaryStats"
      :action-disabled="Boolean(createDisabledReason)"
      :action-hint-text="createDisabledReason"
      :notice-text="activeNoticeText"
      :notice-tone="activeNoticeTone"
      :loading="loading"
      :error-text="errorText"
      empty-title="当前项目台暂无你可见的项目"
      :empty-description="workspaceCanCreateProject ? '点击下方按钮创建当前 Team 的第一个项目。' : '如需加入项目，请联系 Team 管理者分配。'"
      :projects="projectCards"
      loading-key-prefix="workspace-project-skeleton"
      @action="openCreateDialog"
      @retry="loadWorkspaceDashboard"
      @open-project="openProject"
    />

    <TeamCreateProjectDialog
      :visible="createDialogVisible"
      dialog-title="在当前 Team 创建项目"
      :project-title="createForm.title"
      :summary="createForm.summary"
      :contest-ids="createForm.contestIds"
      :topic-board-seed="createForm.topicBoardSeed"
      :contests="contests"
      :error-text="createErrorText"
      :submitting="creatingProject"
      submit-text="创建并进入项目工作区"
      @close="closeCreateDialog"
      @submit="submitQuickCreate"
      @update:project-title="createForm.title = $event"
      @update:summary="createForm.summary = $event"
      @update:contest-ids="createForm.contestIds = $event"
      @update:topic-board-seed="createForm.topicBoardSeed = $event"
    />
  </div>
</template>
