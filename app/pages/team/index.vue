<script setup lang="ts">
import type { ApiResponse, AuthMeResult, Contest, Project, WorkspaceWithQuota } from '~~/shared/types/domain'

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

function normalizeQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function teamDetailPath(teamId: string): string {
  return `/team/${teamId}`
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

function resolveDefaultTeamId(auth: AuthMeResult): string {
  const options = resolveWorkspaceOptions(auth)
  const personal = options.find(item => item.workspace.type === 'personal' && item.workspace.ownerUserId === auth.user.id)
  return personal?.workspace.id || options[0]?.workspace.id || ''
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
  if (!me.value)
    return []
  return resolveWorkspaceOptions(me.value)
})

const teamMetaMap = computed(() => {
  const map = new Map<string, WorkspaceWithQuota>()
  for (const item of teamOptions.value)
    map.set(item.workspace.id, item)
  return map
})

const contestNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const item of contests.value)
    map.set(item.id, item.name)
  return map
})

const enrichedProjects = computed(() => {
  return projects.value
    .filter(item => teamMetaMap.value.has(item.teamId))
    .map((item) => {
      const workspace = teamMetaMap.value.get(item.teamId)
      const contestIds = Array.isArray(item.contestIds) && item.contestIds.length > 0
        ? item.contestIds
        : item.contestId
          ? [item.contestId]
          : []
      const contestNames = contestIds.map(contestId => contestNameMap.value.get(contestId) || contestId)

      return {
        ...item,
        teamName: workspace?.workspace.name || item.teamId,
        teamType: workspace?.workspace.type || 'team',
        contestNames,
      }
    })
})

const summaryText = computed(() => `共 ${enrichedProjects.value.length} 个可见项目`)

function pickPreferredTeamId(): string {
  if (!me.value)
    return ''

  return resolveDefaultTeamId(me.value)
}

function openTeamProject(project: Project) {
  const teamId = String(project.teamId || project.workspaceId || '').trim()
  const projectId = String(project.id || '').trim()
  if (!teamId || !projectId)
    return
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
    if (!createForm.teamId)
      createForm.teamId = pickPreferredTeamId()
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
</script>

<template>
  <div class="space-y-6">
    <section class="p-6 border border-slate-200 rounded-2xl bg-white">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 class="text-2xl text-slate-900 font-bold">
            项目工作台
          </h2>
          <p class="text-sm text-slate-500 mt-1">
            先查看项目列表，再进入对应 Team 项目工作区继续分析与协作。
          </p>
        </div>

        <button
          class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!teamOptions.length"
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
        :key="`workspace-project-skeleton-${index}`"
        class="p-5 border border-slate-200 rounded-xl bg-white animate-pulse"
      >
        <div class="rounded bg-slate-200 h-5 w-1/2" />
        <div class="mt-3 rounded bg-slate-100 h-4 w-2/3" />
        <div class="mt-2 rounded bg-slate-100 h-4 w-1/3" />
      </div>
    </section>

    <section v-else-if="errorText" class="p-5 border border-rose-200 rounded-xl bg-rose-50">
      <p class="text-sm text-rose-700">
        {{ errorText }}
      </p>
      <button class="text-sm text-rose-700 font-semibold mt-3 px-3 py-1.5 border border-rose-300 rounded hover:bg-rose-100" @click="loadTeamList">
        重新加载
      </button>
    </section>

    <section v-else-if="enrichedProjects.length === 0" class="p-8 text-center border border-slate-300 rounded-2xl border-dashed bg-white">
      <h3 class="text-lg text-slate-900 font-semibold">
        暂无可见项目
      </h3>
      <p class="text-sm text-slate-500 mt-2">
        点击下方按钮创建你的第一个项目。
      </p>
      <button
        class="text-sm text-white font-semibold mt-4 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!teamOptions.length"
        @click="openCreateDialog"
      >
        新建项目
      </button>
    </section>

    <section v-else class="gap-4 grid grid-cols-1 xl:grid-cols-2">
      <button
        v-for="project in enrichedProjects"
        :key="project.id"
        class="p-5 text-left border border-slate-200 rounded-xl bg-white transition-all hover:border-blue-200 hover:shadow-sm"
        type="button"
        @click="openTeamProject(project)"
      >
        <div class="flex gap-2 items-center justify-between">
          <h3 class="text-base text-slate-900 font-semibold pr-3 truncate">
            {{ project.title }}
          </h3>
          <span class="text-[10px] text-slate-600 font-semibold px-2 py-1 rounded-full bg-slate-100 shrink-0">
            {{ project.status }}
          </span>
        </div>

        <p class="text-xs text-slate-600 mt-3 flex flex-wrap gap-2 items-center">
          <span class="text-blue-700 font-semibold px-2 py-1 rounded bg-blue-50">
            {{ project.teamName }}
          </span>
          <span class="text-slate-400">{{ project.teamType }}</span>
          <span class="text-slate-400">source={{ project.source }}</span>
          <span v-if="project.contestNames.length > 0" class="text-slate-400">
            关联竞赛 {{ project.contestNames.length }} 个
          </span>
        </p>

        <p class="text-xs text-slate-500 mt-3 truncate">
          简介：{{ project.summary || project.problemStatement || '待补充' }}
        </p>

        <p v-if="project.contestNames.length > 0" class="text-xs text-slate-500 mt-2 truncate">
          竞赛：{{ project.contestNames.join(' / ') }}
        </p>

        <p class="text-xs text-slate-500 mt-2">
          最近更新：{{ formatDateTime(project.updatedAt) }}
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
              新建项目
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
              <span class="text-xs text-slate-600 font-medium">所属 Team</span>
              <select
                v-model="createForm.teamId"
                class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
              >
                <option value="" disabled>
                  请选择 Team
                </option>
                <option v-for="item in teamOptions" :key="item.workspace.id" :value="item.workspace.id">
                  {{ item.workspace.name }}（{{ item.workspace.type }}）
                </option>
              </select>
            </label>

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
              {{ creatingProject ? '创建中...' : '创建并进入工作台' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
