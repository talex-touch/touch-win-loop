<script setup lang="ts">
import type { ApiResponse, AuthMeResult, Contest, Project, WorkspaceWithQuota } from '~~/shared/types/domain'
import type { TeamProjectCardItem } from '~/composables/team-ui'
import {
  buildContestNameMap,
  buildTeamProjectCard,
  normalizeQueryValue,
  normalizeRouteParam,
  resolveProjectTeamId,
  resolveWorkspaceOptions,
  shouldOpenCreateDialog,
  teamDetailPath,
  teamProjectPath,
} from '~/composables/team-ui'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: 'Team Dashboard',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

const routeTeamId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  return normalizeRouteParam(params.teamId)
})

const loading = ref(false)
const errorText = ref('')
const noticeText = ref('')
const joinedNoticeText = ref('')
const me = ref<AuthMeResult | null>(null)
const projects = ref<Project[]>([])
const contests = ref<Contest[]>([])

const createDialogVisible = ref(false)
const creatingProject = ref(false)
const createErrorText = ref('')
const createForm = reactive({
  title: '',
  summary: '',
  contestIds: [] as string[],
})

const teamOptions = computed<WorkspaceWithQuota[]>(() => {
  return resolveWorkspaceOptions(me.value)
})

const activeTeam = computed(() => {
  const teamId = routeTeamId.value
  if (!teamId)
    return null
  return teamOptions.value.find(item => item.workspace.id === teamId) || null
})

const activeTeamId = computed(() => String(activeTeam.value?.workspace.id || '').trim())

const contestNameMap = computed(() => buildContestNameMap(contests.value))

const projectCards = computed<TeamProjectCardItem[]>(() => {
  const teamId = activeTeamId.value
  if (!teamId)
    return []

  return projects.value
    .filter(item => resolveProjectTeamId(item) === teamId)
    .map(item => buildTeamProjectCard(item, contestNameMap.value))
})

const summaryText = computed(() => `当前 Team 可见项目 ${projectCards.value.length} 个`)
const activeNoticeText = computed(() => {
  return joinedNoticeText.value || noticeText.value
})
const activeNoticeTone = computed<'success' | 'warning'>(() => {
  if (joinedNoticeText.value)
    return 'success'
  return 'warning'
})

function openCreateDialog() {
  createErrorText.value = ''
  createDialogVisible.value = true
}

function closeCreateDialog() {
  if (creatingProject.value)
    return
  createDialogVisible.value = false
}

function openProject(project: TeamProjectCardItem) {
  const teamId = activeTeamId.value
  const projectId = String(project.id || '').trim()
  if (!teamId || !projectId)
    return
  navigateTo(teamProjectPath(teamId, projectId))
}

async function submitQuickCreate() {
  const teamId = activeTeamId.value
  const title = createForm.title.trim()
  const summary = createForm.summary.trim()
  const contestIds = createForm.contestIds

  if (!teamId || !title) {
    createErrorText.value = '请填写项目名称。'
    return
  }

  creatingProject.value = true
  createErrorText.value = ''

  try {
    const response = await $fetch<ApiResponse<Project>>(endpoint('/projects/quick'), {
      method: 'POST',
      body: {
        teamId,
        workspaceId: teamId,
        title,
        summary,
        contestIds,
      },
    })

    const created = response.data
    const createdTeamId = String(created.teamId || created.workspaceId || '').trim() || teamId

    createForm.title = ''
    createForm.summary = ''
    createForm.contestIds = []
    createDialogVisible.value = false

    await navigateTo(teamProjectPath(createdTeamId, created.id))
  }
  catch (error: any) {
    createErrorText.value = String(error?.data?.message || '创建项目失败，请稍后重试。')
  }
  finally {
    creatingProject.value = false
  }
}

async function loadTeamDashboard() {
  const teamId = routeTeamId.value
  if (!teamId) {
    await navigateTo('/team', { replace: true })
    return
  }

  loading.value = true
  errorText.value = ''

  try {
    const [meResponse, projectsResponse, contestsResponse] = await Promise.all([
      authApiFetch<ApiResponse<AuthMeResult>>('/auth/me'),
      $fetch<ApiResponse<Project[]>>(endpoint('/projects'), {
        query: {
          teamId,
          workspaceId: teamId,
        },
      }),
      $fetch<ApiResponse<Contest[]>>(endpoint('/contests')),
    ])

    me.value = meResponse.data
    const canAccess = resolveWorkspaceOptions(meResponse.data).some(item => item.workspace.id === teamId)
    if (!canAccess) {
      await navigateTo({
        path: '/team',
        query: { deniedTeamId: teamId },
      }, { replace: true })
      return
    }

    projects.value = projectsResponse.data
    contests.value = contestsResponse.data

    const legacyProjectId = normalizeQueryValue(route.query.projectId)
    if (legacyProjectId) {
      await navigateTo(teamProjectPath(teamId, legacyProjectId), { replace: true })
    }
  }
  catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status)
    if (statusCode === 401) {
      await navigateTo({
        path: '/login',
        query: { redirect: route.fullPath || '/team' },
      })
      return
    }

    errorText.value = String(error?.data?.message || 'Team 项目加载失败，请稍后重试。')
    projects.value = []
    contests.value = []
  }
  finally {
    loading.value = false
  }
}

async function consumeJoinedNotice() {
  if (!shouldOpenCreateDialog(route.query.joined))
    return

  joinedNoticeText.value = '你已加入当前 Team，可直接查看项目或新建项目。'

  const nextQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'joined')
      continue

    const normalized = normalizeQueryValue(value)
    if (normalized)
      nextQuery[key] = normalized
  }

  await navigateTo({
    path: teamDetailPath(routeTeamId.value),
    query: Object.keys(nextQuery).length > 0 ? nextQuery : undefined,
  }, { replace: true })
}

onMounted(async () => {
  const deniedTeamId = normalizeQueryValue(route.query.deniedTeamId || route.query.deniedWorkspaceId)
  if (deniedTeamId)
    noticeText.value = `无权访问 Team ${deniedTeamId}。`

  await loadTeamDashboard()
  await consumeJoinedNotice()

  if (shouldOpenCreateDialog(route.query.create))
    openCreateDialog()
})
</script>

<template>
  <div class="space-y-6">
    <TeamProjectOverview
      :title="activeTeam?.workspace.name || 'Team Dashboard'"
      description="Team 根目录：先看项目列表，再进入项目工作区。"
      :summary-text="summaryText"
      :action-disabled="!activeTeamId"
      :notice-text="activeNoticeText"
      :notice-tone="activeNoticeTone"
      :loading="loading"
      :error-text="errorText"
      empty-title="这个 Team 还没有项目"
      empty-description="点击下方按钮创建当前 Team 的第一个项目。"
      :projects="projectCards"
      loading-key-prefix="team-project-skeleton"
      @action="openCreateDialog"
      @retry="loadTeamDashboard"
      @open-project="openProject"
    />

    <TeamCreateProjectDialog
      :visible="createDialogVisible"
      dialog-title="在当前 Team 创建项目"
      :project-title="createForm.title"
      :summary="createForm.summary"
      :contest-ids="createForm.contestIds"
      :contests="contests"
      :error-text="createErrorText"
      :submitting="creatingProject"
      submit-text="创建并进入工作区"
      @close="closeCreateDialog"
      @submit="submitQuickCreate"
      @update:project-title="createForm.title = $event"
      @update:summary="createForm.summary = $event"
      @update:contest-ids="createForm.contestIds = $event"
    />
  </div>
</template>
