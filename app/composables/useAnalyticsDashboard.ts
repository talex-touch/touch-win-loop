import type {
  AnalyticsAwardFeatureAnalysisPayload,
  AnalyticsCapabilityProfilePayload,
  AnalyticsDetailView,
  AnalyticsDifficultyCompletionPayload,
  AnalyticsEventInput,
  AnalyticsFilterInput,
  AnalyticsOverviewPayload,
  AnalyticsPreparationCadencePayload,
  AnalyticsRangePreset,
  AnalyticsResolvedFilters,
  AnalyticsTrackedEvent,
  AnalyticsTrendAnalysisPayload,
} from '~~/shared/types/analytics'
import type { ApiResponse, AuthMeResult, Contest, Project } from '~~/shared/types/domain'

interface AnalyticsOption<T extends string> {
  value: T
  label: string
  hint: string
}

interface AnalyticsFilterOption {
  value: string
  label: string
  meta?: string
}

const CONTEST_PAGE_SIZE = 100

const rangeOptions: AnalyticsOption<AnalyticsRangePreset>[] = [
  { value: '30d', label: '近 30 天', hint: '关注近期备赛和行为波动' },
  { value: '90d', label: '近 90 天', hint: '默认窗口，平衡趋势与样本量' },
  { value: '180d', label: '近 180 天', hint: '适合回看半年的题目与作品变化' },
  { value: '365d', label: '近 1 年', hint: '适合做年度复盘和长期趋势判断' },
  { value: 'all', label: '全部', hint: '拉通历史数据，优先看长期沉淀' },
]

const viewOptions: AnalyticsOption<AnalyticsDetailView>[] = [
  { value: 'overview', label: '总览', hint: '查看全局指标与关键信号' },
  { value: 'trends', label: '趋势分析', hint: '识别热点方向与竞赛热度变化' },
  { value: 'awards', label: '获奖特征', hint: '提炼高频特征与样本案例' },
  { value: 'profile', label: '能力画像', hint: '判断团队优势、短板与匹配度' },
  { value: 'difficulty', label: '难度/完成率', hint: '评估赛题挑战度与历史完成情况' },
  { value: 'preparation', label: '备赛节奏', hint: '安排时间节点与冲刺顺序' },
]

function createEmptyFilters(): AnalyticsResolvedFilters {
  return {
    workspaceId: '',
    projectId: '',
    contestId: '',
    rangePreset: '90d',
  }
}

function createEmptyOverview(): AnalyticsOverviewPayload {
  return {
    filters: createEmptyFilters(),
    scopeSummary: '正在汇总竞赛、项目与行为数据样本。',
    metricCards: [],
    trendSeries: {
      title: '竞赛热度与趋势',
      summary: '',
      points: [],
    },
    awardFeatureTags: [],
    capabilityRadar: [],
    preparationTimeline: [],
    dataGaps: [],
    lastUpdatedAt: '',
  }
}

function createEmptyTrendAnalysis(): AnalyticsTrendAnalysisPayload {
  return {
    filters: createEmptyFilters(),
    summary: '',
    keywordSeries: {
      title: '竞赛热度与趋势',
      summary: '',
      points: [],
    },
    contests: [],
    dataGaps: [],
    lastUpdatedAt: '',
  }
}

function createEmptyAwardAnalysis(): AnalyticsAwardFeatureAnalysisPayload {
  return {
    filters: createEmptyFilters(),
    summary: '',
    featureTags: [],
    samples: [],
    dataGaps: [],
    lastUpdatedAt: '',
  }
}

function createEmptyProfileAnalysis(): AnalyticsCapabilityProfilePayload {
  return {
    filters: createEmptyFilters(),
    summary: '',
    radar: [],
    gapNotes: [],
    projects: [],
    dataGaps: [],
    lastUpdatedAt: '',
  }
}

function createEmptyDifficultyAnalysis(): AnalyticsDifficultyCompletionPayload {
  return {
    filters: createEmptyFilters(),
    summary: '',
    tracks: [],
    statusStats: [],
    bottlenecks: [],
    dataGaps: [],
    lastUpdatedAt: '',
  }
}

function createEmptyPreparationAnalysis(): AnalyticsPreparationCadencePayload {
  return {
    filters: createEmptyFilters(),
    summary: '',
    timeline: [],
    stageStats: [],
    upcomingContests: [],
    dataGaps: [],
    lastUpdatedAt: '',
  }
}

function readQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function resolveRangePreset(value: unknown): AnalyticsRangePreset {
  const normalized = readQueryValue(value)
  if (rangeOptions.some(item => item.value === normalized))
    return normalized as AnalyticsRangePreset
  return '90d'
}

function resolveDetailView(value: unknown): AnalyticsDetailView {
  const normalized = readQueryValue(value)
  if (viewOptions.some(item => item.value === normalized))
    return normalized as AnalyticsDetailView
  return 'overview'
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function resolveProjectContestIds(project: Project | undefined): string[] {
  if (!project)
    return []
  return uniqueStrings([project.contestId, ...(project.contestIds || [])])
}

function sortByLabel<T extends AnalyticsFilterOption>(items: T[]): T[] {
  return [...items].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
}

function formatLastUpdatedAt(value: string): string {
  if (!value)
    return '暂未更新'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return '暂未更新'

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(parsed)
}

export function useAnalyticsDashboard() {
  const route = useRoute()
  const router = useRouter()
  const authApiFetch = useAuthApiFetch()

  const filters = reactive<AnalyticsResolvedFilters>(createEmptyFilters())
  const activeView = ref<AnalyticsDetailView>('overview')

  const overview = ref<AnalyticsOverviewPayload>(createEmptyOverview())
  const trendAnalysis = ref<AnalyticsTrendAnalysisPayload>(createEmptyTrendAnalysis())
  const awardAnalysis = ref<AnalyticsAwardFeatureAnalysisPayload>(createEmptyAwardAnalysis())
  const profileAnalysis = ref<AnalyticsCapabilityProfilePayload>(createEmptyProfileAnalysis())
  const difficultyAnalysis = ref<AnalyticsDifficultyCompletionPayload>(createEmptyDifficultyAnalysis())
  const preparationAnalysis = ref<AnalyticsPreparationCadencePayload>(createEmptyPreparationAnalysis())

  const workspaceCatalog = ref<AnalyticsFilterOption[]>([])
  const projectCatalog = ref<Project[]>([])
  const contestCatalog = ref<Contest[]>([])
  const optionsLoading = ref(false)
  const optionsError = ref('')
  const optionsLoaded = ref(false)

  const overviewLoading = ref(false)
  const detailLoading = ref(false)
  const overviewError = ref('')
  const detailError = ref('')

  let overviewRequestId = 0
  let detailRequestId = 0

  async function loadContestCatalog(): Promise<Contest[]> {
    const contests: Contest[] = []
    const seen = new Set<string>()

    for (let page = 1; page <= 50; page += 1) {
      const response = await authApiFetch<ApiResponse<Contest[]>>('/contests', {
        query: {
          page,
          pageSize: CONTEST_PAGE_SIZE,
          sort: 'deadline',
        },
      })
      const items = Array.isArray(response.data) ? response.data : []
      for (const item of items) {
        if (!item?.id || seen.has(item.id))
          continue
        seen.add(item.id)
        contests.push(item)
      }
      if (items.length < CONTEST_PAGE_SIZE)
        break
    }

    return contests
  }

  const selectedProject = computed(() => {
    return projectCatalog.value.find(item => item.id === filters.projectId) || null
  })

  const workspaceOptions = computed(() => {
    return workspaceCatalog.value
  })

  const contestOptions = computed(() => {
    const projectContestIds = resolveProjectContestIds(selectedProject.value || undefined)
    const contests = projectContestIds.length > 0
      ? contestCatalog.value.filter(item => projectContestIds.includes(item.id))
      : contestCatalog.value

    return sortByLabel(contests.map(item => ({
      value: item.id,
      label: item.name,
      meta: item.level,
    })))
  })

  const projectOptions = computed(() => {
    const items = projectCatalog.value
      .filter(item => !filters.workspaceId || item.workspaceId === filters.workspaceId)
      .filter((item) => {
        if (!filters.contestId)
          return true
        return resolveProjectContestIds(item).includes(filters.contestId)
      })
      .map(item => ({
        value: item.id,
        label: item.title,
        meta: item.workspaceId || '',
      }))

    return sortByLabel(items)
  })

  const detailPayload = computed(() => {
    if (activeView.value === 'trends')
      return trendAnalysis.value
    if (activeView.value === 'awards')
      return awardAnalysis.value
    if (activeView.value === 'profile')
      return profileAnalysis.value
    if (activeView.value === 'difficulty')
      return difficultyAnalysis.value
    if (activeView.value === 'preparation')
      return preparationAnalysis.value
    return overview.value
  })

  const lastUpdatedText = computed(() => {
    return formatLastUpdatedAt(detailPayload.value.lastUpdatedAt || overview.value.lastUpdatedAt)
  })

  function buildRequestQuery(): AnalyticsFilterInput {
    return {
      workspaceId: filters.workspaceId || undefined,
      projectId: filters.projectId || undefined,
      contestId: filters.contestId || undefined,
      rangePreset: filters.rangePreset,
    }
  }

  function syncFromRoute() {
    filters.workspaceId = readQueryValue(route.query.workspaceId)
    filters.projectId = readQueryValue(route.query.projectId)
    filters.contestId = readQueryValue(route.query.contestId)
    filters.rangePreset = resolveRangePreset(route.query.rangePreset)
    activeView.value = resolveDetailView(route.query.view)
  }

  async function updateQuery(partial: Partial<Record<'workspaceId' | 'projectId' | 'contestId' | 'rangePreset' | 'view', string>>) {
    const trackedKeys: Array<'workspaceId' | 'projectId' | 'contestId' | 'rangePreset' | 'view'> = [
      'workspaceId',
      'projectId',
      'contestId',
      'rangePreset',
      'view',
    ]

    const nextQuery: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      const normalized = readQueryValue(value)
      if (normalized)
        nextQuery[key] = normalized
    }

    for (const key of trackedKeys) {
      const nextValue = partial[key]
      if (typeof nextValue === 'string' && nextValue.trim())
        nextQuery[key] = nextValue.trim()
      else if (key in partial)
        delete nextQuery[key]
    }

    const isSame = trackedKeys.every((key) => {
      const currentValue = readQueryValue(route.query[key])
      const nextValue = readQueryValue(nextQuery[key])
      return currentValue === nextValue
    })

    if (isSame)
      return

    await router.replace({ query: nextQuery })
  }

  async function normalizeFilterSelection() {
    let nextWorkspaceId = filters.workspaceId
    let nextProjectId = filters.projectId
    let nextContestId = filters.contestId
    let changed = false

    const workspaceIdSet = new Set(workspaceCatalog.value.map(item => item.value))
    const contestIdSet = new Set(contestCatalog.value.map(item => item.id))
    const projectMap = new Map(projectCatalog.value.map(item => [item.id, item]))

    if (nextWorkspaceId && !workspaceIdSet.has(nextWorkspaceId)) {
      nextWorkspaceId = ''
      changed = true
    }

    if (nextContestId && !contestIdSet.has(nextContestId)) {
      nextContestId = ''
      changed = true
    }

    if (nextProjectId) {
      const project = projectMap.get(nextProjectId)
      if (!project) {
        nextProjectId = ''
        changed = true
      }
      else {
        const projectWorkspaceId = String(project.workspaceId || '').trim()
        if (nextWorkspaceId && projectWorkspaceId && projectWorkspaceId !== nextWorkspaceId) {
          nextWorkspaceId = projectWorkspaceId
          changed = true
        }

        const projectContestIds = resolveProjectContestIds(project)
        if (nextContestId && projectContestIds.length > 0 && !projectContestIds.includes(nextContestId)) {
          nextContestId = ''
          changed = true
        }
      }
    }

    if (!changed)
      return

    await updateQuery({
      workspaceId: nextWorkspaceId,
      projectId: nextProjectId,
      contestId: nextContestId,
      rangePreset: filters.rangePreset,
      view: activeView.value,
    })
  }

  async function loadFilterOptions(force = false) {
    if (optionsLoading.value)
      return
    if (optionsLoaded.value && !force)
      return

    optionsLoading.value = true
    optionsError.value = ''

    try {
      const [authResponse, projectResponse, contestResponse] = await Promise.all([
        authApiFetch<ApiResponse<AuthMeResult>>('/auth/me'),
        authApiFetch<ApiResponse<Project[]>>('/projects'),
        loadContestCatalog(),
      ])

      const workspaces = Array.isArray(authResponse.data.workspaces) && authResponse.data.workspaces.length > 0
        ? authResponse.data.workspaces.map(item => ({
            value: item.workspace.id,
            label: item.workspace.name,
          }))
        : authResponse.data.teams.map(item => ({
            value: item.team.id,
            label: item.team.name,
          }))

      workspaceCatalog.value = sortByLabel(workspaces)
      projectCatalog.value = [...projectResponse.data].sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
      contestCatalog.value = [...contestResponse].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
      optionsLoaded.value = true

      await normalizeFilterSelection()
    }
    catch (error: any) {
      workspaceCatalog.value = []
      projectCatalog.value = []
      contestCatalog.value = []
      optionsError.value = String(error?.data?.message || '分析筛选项加载失败，请稍后重试。')
    }
    finally {
      optionsLoading.value = false
    }
  }

  async function loadOverview() {
    const requestId = ++overviewRequestId
    overviewLoading.value = true
    overviewError.value = ''

    try {
      const response = await authApiFetch<ApiResponse<AnalyticsOverviewPayload>>('/analytics/overview', {
        query: buildRequestQuery(),
      })

      if (requestId !== overviewRequestId)
        return

      overview.value = response.data
    }
    catch (error: any) {
      if (requestId !== overviewRequestId)
        return

      overview.value = createEmptyOverview()
      overviewError.value = String(error?.data?.message || '综合分析总览加载失败，请稍后重试。')
    }
    finally {
      if (requestId === overviewRequestId)
        overviewLoading.value = false
    }
  }

  async function loadDetail(view = activeView.value) {
    const requestId = ++detailRequestId
    detailLoading.value = view !== 'overview'
    detailError.value = ''

    if (view === 'overview') {
      detailLoading.value = false
      return
    }

    const endpointMap: Record<Exclude<AnalyticsDetailView, 'overview'>, string> = {
      trends: '/analytics/trends',
      awards: '/analytics/awards',
      profile: '/analytics/profile',
      difficulty: '/analytics/difficulty',
      preparation: '/analytics/preparation',
    }

    try {
      if (view === 'trends') {
        const response = await authApiFetch<ApiResponse<AnalyticsTrendAnalysisPayload>>(endpointMap.trends, {
          query: buildRequestQuery(),
        })
        if (requestId === detailRequestId)
          trendAnalysis.value = response.data
      }

      if (view === 'awards') {
        const response = await authApiFetch<ApiResponse<AnalyticsAwardFeatureAnalysisPayload>>(endpointMap.awards, {
          query: buildRequestQuery(),
        })
        if (requestId === detailRequestId)
          awardAnalysis.value = response.data
      }

      if (view === 'profile') {
        const response = await authApiFetch<ApiResponse<AnalyticsCapabilityProfilePayload>>(endpointMap.profile, {
          query: buildRequestQuery(),
        })
        if (requestId === detailRequestId)
          profileAnalysis.value = response.data
      }

      if (view === 'difficulty') {
        const response = await authApiFetch<ApiResponse<AnalyticsDifficultyCompletionPayload>>(endpointMap.difficulty, {
          query: buildRequestQuery(),
        })
        if (requestId === detailRequestId)
          difficultyAnalysis.value = response.data
      }

      if (view === 'preparation') {
        const response = await authApiFetch<ApiResponse<AnalyticsPreparationCadencePayload>>(endpointMap.preparation, {
          query: buildRequestQuery(),
        })
        if (requestId === detailRequestId)
          preparationAnalysis.value = response.data
      }
    }
    catch (error: any) {
      if (requestId !== detailRequestId)
        return

      detailError.value = String(error?.data?.message || '详细分析加载失败，请稍后重试。')
      if (view === 'trends')
        trendAnalysis.value = createEmptyTrendAnalysis()
      if (view === 'awards')
        awardAnalysis.value = createEmptyAwardAnalysis()
      if (view === 'profile')
        profileAnalysis.value = createEmptyProfileAnalysis()
      if (view === 'difficulty')
        difficultyAnalysis.value = createEmptyDifficultyAnalysis()
      if (view === 'preparation')
        preparationAnalysis.value = createEmptyPreparationAnalysis()
    }
    finally {
      if (requestId === detailRequestId)
        detailLoading.value = false
    }
  }

  async function setRangePreset(rangePreset: AnalyticsRangePreset) {
    await updateQuery({
      workspaceId: filters.workspaceId,
      projectId: filters.projectId,
      contestId: filters.contestId,
      rangePreset,
      view: activeView.value,
    })
  }

  async function setWorkspaceId(workspaceId: string) {
    const nextWorkspaceId = String(workspaceId || '').trim()
    let nextProjectId = filters.projectId

    if (nextProjectId) {
      const project = projectCatalog.value.find(item => item.id === nextProjectId)
      if (!project || (nextWorkspaceId && String(project.workspaceId || '').trim() !== nextWorkspaceId))
        nextProjectId = ''
    }

    await updateQuery({
      workspaceId: nextWorkspaceId,
      projectId: nextProjectId,
      contestId: filters.contestId,
      rangePreset: filters.rangePreset,
      view: activeView.value,
    })
  }

  async function setProjectId(projectId: string) {
    const nextProjectId = String(projectId || '').trim()
    let nextWorkspaceId = filters.workspaceId
    let nextContestId = filters.contestId

    if (nextProjectId) {
      const project = projectCatalog.value.find(item => item.id === nextProjectId)
      if (project) {
        nextWorkspaceId = String(project.workspaceId || '').trim() || nextWorkspaceId
        const projectContestIds = resolveProjectContestIds(project)
        if (nextContestId && projectContestIds.length > 0 && !projectContestIds.includes(nextContestId))
          nextContestId = ''
      }
    }

    await updateQuery({
      workspaceId: nextWorkspaceId,
      projectId: nextProjectId,
      contestId: nextContestId,
      rangePreset: filters.rangePreset,
      view: activeView.value,
    })
  }

  async function setContestId(contestId: string) {
    const nextContestId = String(contestId || '').trim()
    let nextProjectId = filters.projectId

    if (nextProjectId && nextContestId) {
      const project = projectCatalog.value.find(item => item.id === nextProjectId)
      if (!resolveProjectContestIds(project).includes(nextContestId))
        nextProjectId = ''
    }

    await updateQuery({
      workspaceId: filters.workspaceId,
      projectId: nextProjectId,
      contestId: nextContestId,
      rangePreset: filters.rangePreset,
      view: activeView.value,
    })
  }

  async function setDetailView(view: AnalyticsDetailView) {
    await updateQuery({
      workspaceId: filters.workspaceId,
      projectId: filters.projectId,
      contestId: filters.contestId,
      rangePreset: filters.rangePreset,
      view,
    })
  }

  async function trackEvent(
    eventName: string,
    payload: Record<string, unknown> = {},
    eventType: AnalyticsEventInput['eventType'] = 'drilldown',
  ) {
    try {
      await authApiFetch<ApiResponse<AnalyticsTrackedEvent>>('/analytics/events', {
        method: 'POST',
        body: {
          workspaceId: filters.workspaceId || undefined,
          projectId: filters.projectId || undefined,
          eventType,
          eventName,
          pageKey: 'dashboard/analytics',
          entityType: 'dashboard',
          entityId: activeView.value,
          payload: {
            ...payload,
            workspaceId: filters.workspaceId || undefined,
            projectId: filters.projectId || undefined,
            contestId: filters.contestId || undefined,
            rangePreset: filters.rangePreset,
            view: activeView.value,
          },
        } satisfies AnalyticsEventInput,
      })
    }
    catch {
      // 埋点失败不阻塞主流程。
    }
  }

  watch(
    () => route.fullPath,
    async () => {
      syncFromRoute()
      await Promise.all([
        loadFilterOptions(),
        loadOverview(),
        loadDetail(activeView.value),
      ])
    },
    { immediate: true },
  )

  return {
    filters,
    activeView,
    overview,
    trendAnalysis,
    awardAnalysis,
    profileAnalysis,
    difficultyAnalysis,
    preparationAnalysis,
    workspaceOptions,
    projectOptions,
    contestOptions,
    optionsLoading,
    optionsError,
    overviewLoading,
    detailLoading,
    overviewError,
    detailError,
    detailPayload,
    rangeOptions,
    viewOptions,
    lastUpdatedText,
    loadFilterOptions,
    loadOverview,
    loadDetail,
    setRangePreset,
    setWorkspaceId,
    setProjectId,
    setContestId,
    setDetailView,
    trackEvent,
  }
}
