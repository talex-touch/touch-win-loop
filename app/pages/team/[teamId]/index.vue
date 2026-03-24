<script setup lang="ts">
import type { ApiResponse, AuthMeResult, Contest, Project, WorkspaceWithQuota } from '~~/shared/types/domain'

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

function normalizeQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function normalizeRouteParam(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function teamProjectPath(teamId: string, projectId: string): string {
  return `/team/${teamId}/project/${projectId}`
}

function resolveWorkspaceOptions(auth: AuthMeResult): WorkspaceWithQuota[] {
  if (Array.isArray(auth.teams) && auth.teams.length > 0) {
    return auth.teams.map(item => ({
      workspace: item.team,
      quota: item.quota,
    }))
  }
  return auth.workspaces
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value || '-'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function shouldOpenCreateDialog(value: unknown): boolean {
  const text = normalizeQueryValue(value).toLowerCase()
  return text === '1' || text === 'true' || text === 'yes'
}

const routeTeamId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  return normalizeRouteParam(params.teamId)
})

const loading = ref(false)
const errorText = ref('')
const noticeText = ref('')
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
  if (!me.value)
    return []
  return resolveWorkspaceOptions(me.value)
})

const activeTeam = computed(() => {
  const teamId = routeTeamId.value
  if (!teamId)
    return null
  return teamOptions.value.find(item => item.workspace.id === teamId) || null
})

const activeTeamId = computed(() => String(activeTeam.value?.workspace.id || '').trim())

const contestNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const item of contests.value)
    map.set(item.id, item.name)
  return map
})

const filteredProjects = computed(() => {
  const teamId = activeTeamId.value
  if (!teamId)
    return []

  return projects.value
    .filter((item) => {
      const projectTeamId = String(item.teamId || item.workspaceId || '').trim()
      return projectTeamId === teamId
    })
    .map((item) => {
      const contestIds = Array.isArray(item.contestIds) && item.contestIds.length > 0
        ? item.contestIds
        : item.contestId
          ? [item.contestId]
          : []
      const contestNames = contestIds.map(contestId => contestNameMap.value.get(contestId) || contestId)

      return {
        ...item,
        contestNames,
      }
    })
})

const summaryText = computed(() => `当前 Team 可见项目 ${filteredProjects.value.length} 个`)

function openCreateDialog() {
  createErrorText.value = ''
  createDialogVisible.value = true
}

function closeCreateDialog() {
  if (creatingProject.value)
    return
  createDialogVisible.value = false
}

function openProject(project: Project) {
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
      return
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

onMounted(async () => {
  const deniedTeamId = normalizeQueryValue(route.query.deniedTeamId || route.query.deniedWorkspaceId)
  if (deniedTeamId)
    noticeText.value = `无权访问 Team ${deniedTeamId}。`

  await loadTeamDashboard()

  if (shouldOpenCreateDialog(route.query.create))
    openCreateDialog()
})
</script>

<template>
  <div class="space-y-6">
    <section class="p-6 border border-slate-200 rounded-2xl bg-white">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 class="text-2xl text-slate-900 font-bold">
            {{ activeTeam?.workspace.name || 'Team Dashboard' }}
          </h2>
          <p class="text-sm text-slate-500 mt-1">
            Team 根目录：先看项目列表，再进入项目工作区。
          </p>
        </div>

        <button
          class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!activeTeamId"
          @click="openCreateDialog"
        >
          新建项目
        </button>
      </div>

      <p class="text-xs text-slate-500 mt-4">
        {{ summaryText }}
      </p>
    </section>

    <section v-if="noticeText" class="text-sm text-amber-700 p-4 border border-amber-200 rounded-xl bg-amber-50">
      {{ noticeText }}
    </section>

    <section v-if="loading" class="gap-4 grid grid-cols-1 xl:grid-cols-2">
      <div
        v-for="index in 6"
        :key="`team-project-skeleton-${index}`"
        class="p-5 border border-slate-200 rounded-xl bg-white animate-pulse"
      >
        <div class="rounded bg-slate-200 h-5 w-1/2" />
        <div class="mt-3 rounded bg-slate-100 h-4 w-2/3" />
      </div>
    </section>

    <section v-else-if="errorText" class="p-5 border border-rose-200 rounded-xl bg-rose-50">
      <p class="text-sm text-rose-700">
        {{ errorText }}
      </p>
      <button class="text-sm text-rose-700 font-semibold mt-3 px-3 py-1.5 border border-rose-300 rounded hover:bg-rose-100" @click="loadTeamDashboard">
        重新加载
      </button>
    </section>

    <section v-else-if="filteredProjects.length === 0" class="p-8 text-center border border-slate-300 rounded-2xl border-dashed bg-white">
      <h3 class="text-lg text-slate-900 font-semibold">
        这个 Team 还没有项目
      </h3>
      <button
        class="text-sm text-white font-semibold mt-4 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!activeTeamId"
        @click="openCreateDialog"
      >
        新建项目
      </button>
    </section>

    <section v-else class="gap-4 grid grid-cols-1 xl:grid-cols-2">
      <button
        v-for="project in filteredProjects"
        :key="project.id"
        class="p-5 text-left border border-slate-200 rounded-xl bg-white transition-all hover:border-blue-200 hover:shadow-sm"
        type="button"
        @click="openProject(project)"
      >
        <div class="flex gap-2 items-center justify-between">
          <h3 class="text-base text-slate-900 font-semibold pr-3 truncate">
            {{ project.title }}
          </h3>
          <span class="text-[10px] text-slate-600 font-semibold px-2 py-1 rounded-full bg-slate-100 shrink-0">
            {{ project.status }}
          </span>
        </div>

        <p class="text-xs text-slate-500 mt-2">
          最近更新：{{ formatDateTime(project.updatedAt) }}
        </p>

        <p v-if="project.contestNames.length > 0" class="text-xs text-slate-500 mt-2 truncate">
          竞赛：{{ project.contestNames.join(' / ') }}
        </p>
      </button>
    </section>

    <Teleport to="body">
      <div
        v-if="createDialogVisible"
        class="p-4 bg-black/30 flex items-center inset-0 justify-center fixed z-50"
        @click.self="closeCreateDialog"
      >
        <div class="p-5 border border-slate-200 rounded-2xl bg-white max-w-lg w-full shadow-xl">
          <div class="flex items-center justify-between">
            <h3 class="text-base text-slate-900 font-semibold">
              在当前 Team 创建项目
            </h3>
            <button
              class="text-slate-500 rounded flex h-7 w-7 items-center justify-center hover:bg-slate-100"
              :disabled="creatingProject"
              @click="closeCreateDialog"
            >
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div class="mt-4 space-y-4">
            <label class="block">
              <span class="text-xs text-slate-600 font-medium">项目名称</span>
              <input
                v-model="createForm.title"
                class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
                placeholder="例如：AI 校园服务助手"
                maxlength="120"
                type="text"
              >
            </label>

            <label class="block">
              <span class="text-xs text-slate-600 font-medium">项目简介</span>
              <textarea
                v-model="createForm.summary"
                class="text-sm mt-1 p-3 border border-slate-300 rounded-lg bg-white min-h-28 w-full resize-y focus:outline-none focus:border-blue-500"
                placeholder="简要描述项目目标、核心价值与预期成果。"
                maxlength="600"
              />
            </label>

            <label class="block">
              <span class="text-xs text-slate-600 font-medium">关联竞赛（可多选）</span>
              <select
                v-model="createForm.contestIds"
                class="text-sm mt-1 p-2 border border-slate-300 rounded-lg bg-white min-h-28 w-full focus:outline-none focus:border-blue-500"
                multiple
              >
                <option v-for="item in contests" :key="item.id" :value="item.id">
                  {{ item.name }}
                </option>
              </select>
            </label>

            <p v-if="createErrorText" class="text-xs text-rose-600">
              {{ createErrorText }}
            </p>
          </div>

          <div class="mt-5 flex gap-2 items-center justify-end">
            <button
              class="text-sm text-slate-600 font-medium px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              :disabled="creatingProject"
              @click="closeCreateDialog"
            >
              取消
            </button>
            <button
              class="text-sm text-white font-medium px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="creatingProject"
              @click="submitQuickCreate"
            >
              {{ creatingProject ? '创建中...' : '创建并进入工作区' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
