<script setup lang="ts">
import type { ApiResponse, AuthMeResult, Contest, Project, WorkspaceWithQuota } from '~~/shared/types/domain'
import type { TeamProjectCardItem } from '~/composables/team-ui'
import {
  buildContestNameMap,
  buildTeamProjectCard,
  normalizeQueryValue,
  resolveDefaultTeamId,
  resolveProjectTeamId,
  resolveWorkspaceOptions,
  shouldOpenCreateDialog,
  teamDetailPath,
  teamProjectPath,
} from '~/composables/team-ui'
import { readActiveWorkspacePreference, writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: '项目工作台',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

const loading = ref(false)
const errorText = ref('')
const noticeText = ref('')
const projects = ref<Project[]>([])
const contests = ref<Contest[]>([])
const me = ref<AuthMeResult | null>(null)

const createDialogVisible = ref(false)
const creatingProject = ref(false)
const createErrorText = ref('')
const createForm = reactive({
  teamId: '',
  title: '',
  summary: '',
  contestIds: [] as string[],
})

const teamOptions = computed<WorkspaceWithQuota[]>(() => {
  return resolveWorkspaceOptions(me.value)
})

const teamMetaMap = computed(() => {
  const map = new Map<string, WorkspaceWithQuota>()
  for (const item of teamOptions.value)
    map.set(item.workspace.id, item)
  return map
})

const contestNameMap = computed(() => buildContestNameMap(contests.value))

const projectCards = computed<TeamProjectCardItem[]>(() => {
  return projects.value
    .filter(item => teamMetaMap.value.has(resolveProjectTeamId(item)))
    .map(item => buildTeamProjectCard(item, contestNameMap.value, teamMetaMap.value.get(resolveProjectTeamId(item))))
})

const summaryText = computed(() => `共 ${projectCards.value.length} 个可见项目`)

function pickPreferredTeamId(): string {
  const routePreferredTeamId = normalizeQueryValue(route.query.teamId || route.query.workspaceId)
  const storedPreferredTeamId = readActiveWorkspacePreference()
  return resolveDefaultTeamId(me.value, routePreferredTeamId || storedPreferredTeamId)
}

function openTeamProject(project: TeamProjectCardItem) {
  const teamId = project.teamId
  const projectId = String(project.id || '').trim()
  if (!teamId || !projectId)
    return
  writeActiveWorkspacePreference(teamId)
  navigateTo(teamProjectPath(teamId, projectId))
}

function openCreateDialog() {
  createErrorText.value = ''
  if (!createForm.teamId || !teamMetaMap.value.has(createForm.teamId))
    createForm.teamId = pickPreferredTeamId()
  createDialogVisible.value = true
}

function closeCreateDialog() {
  if (creatingProject.value)
    return
  createDialogVisible.value = false
}

async function submitQuickCreate() {
  const teamId = createForm.teamId.trim()
  const title = createForm.title.trim()
  const summary = createForm.summary.trim()
  const contestIds = createForm.contestIds

  if (!teamId || !title) {
    createErrorText.value = '请先选择所属 Team 并填写项目名称。'
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
    projects.value = [created, ...projects.value.filter(item => item.id !== created.id)]
    createForm.title = ''
    createForm.summary = ''
    createForm.contestIds = []
    createDialogVisible.value = false

    const createdTeamId = String(created.teamId || created.workspaceId || '').trim()
    if (!createdTeamId)
      throw new Error('TEAM_ID_MISSING')
    writeActiveWorkspacePreference(createdTeamId)
    await navigateTo(teamProjectPath(createdTeamId, created.id))
  }
  catch (error: any) {
    if (error instanceof Error && error.message === 'TEAM_ID_MISSING')
      createErrorText.value = '创建成功但未解析到 Team，请刷新后重试。'
    else
      createErrorText.value = String(error?.data?.message || '创建项目失败，请稍后重试。')
  }
  finally {
    creatingProject.value = false
  }
}

async function maybeRedirectLegacyTeamQuery(): Promise<boolean> {
  const legacyTeamId = normalizeQueryValue(route.query.teamId || route.query.workspaceId)
  if (!legacyTeamId)
    return false

  const legacyProjectId = normalizeQueryValue(route.query.projectId)
  const targetPath = legacyProjectId
    ? teamProjectPath(legacyTeamId, legacyProjectId)
    : teamDetailPath(legacyTeamId)
  await navigateTo(targetPath, { replace: true })
  return true
}

async function loadTeamList() {
  loading.value = true
  errorText.value = ''

  try {
    const [meResponse, projectsResponse, contestsResponse] = await Promise.all([
      authApiFetch<ApiResponse<AuthMeResult>>('/auth/me'),
      $fetch<ApiResponse<Project[]>>(endpoint('/projects')),
      $fetch<ApiResponse<Contest[]>>(endpoint('/contests')),
    ])

    me.value = meResponse.data
    projects.value = projectsResponse.data
    contests.value = contestsResponse.data
    if (!createForm.teamId || !teamMetaMap.value.has(createForm.teamId))
      createForm.teamId = pickPreferredTeamId()
    if (createForm.teamId)
      writeActiveWorkspacePreference(createForm.teamId)
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

    errorText.value = String(error?.data?.message || '项目列表加载失败，请稍后重试。')
    projects.value = []
    contests.value = []
  }
  finally {
    loading.value = false
  }
}

onMounted(async () => {
  const redirected = await maybeRedirectLegacyTeamQuery()
  if (redirected)
    return

  const deniedTeamId = normalizeQueryValue(route.query.deniedTeamId || route.query.deniedWorkspaceId)
  if (deniedTeamId)
    noticeText.value = `无权访问 Team ${deniedTeamId}，已返回项目列表。`

  await loadTeamList()

  if (shouldOpenCreateDialog(route.query.create))
    openCreateDialog()
})

watch(() => createForm.teamId, (value) => {
  const normalized = String(value || '').trim()
  if (!normalized || !teamMetaMap.value.has(normalized))
    return
  writeActiveWorkspacePreference(normalized)
})
</script>

<template>
  <div class="space-y-6">
    <TeamProjectOverview
      title="项目工作台"
      description="先查看项目列表，再进入对应 Team 项目工作区继续分析与协作。"
      :summary-text="summaryText"
      :action-disabled="!teamOptions.length"
      :notice-text="noticeText"
      :loading="loading"
      :error-text="errorText"
      empty-title="暂无可见项目"
      empty-description="点击下方按钮创建你的第一个项目。"
      :projects="projectCards"
      show-team-meta
      loading-key-prefix="workspace-project-skeleton"
      @action="openCreateDialog"
      @retry="loadTeamList"
      @open-project="openTeamProject"
    />

    <TeamCreateProjectDialog
      :visible="createDialogVisible"
      dialog-title="新建项目"
      show-team-select
      :team-options="teamOptions"
      :team-id="createForm.teamId"
      :project-title="createForm.title"
      :summary="createForm.summary"
      :contest-ids="createForm.contestIds"
      :contests="contests"
      :error-text="createErrorText"
      :submitting="creatingProject"
      submit-text="创建并进入工作台"
      @close="closeCreateDialog"
      @submit="submitQuickCreate"
      @update:team-id="createForm.teamId = $event"
      @update:project-title="createForm.title = $event"
      @update:summary="createForm.summary = $event"
      @update:contest-ids="createForm.contestIds = $event"
    />
  </div>
</template>
