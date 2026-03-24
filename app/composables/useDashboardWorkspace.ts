import type { ApiResponse } from '~~/shared/types/domain'
import type {
  DashboardAnalystProfile,
  DashboardCompetition,
  DashboardFeedFilter,
  DashboardInsight,
  DashboardMenuItem,
  DashboardQuickAction,
  DashboardScheduleItem,
  DashboardSkillMetric,
  DashboardSummary,
  DashboardTopic,
} from '~/types/dashboard'

interface DashboardOverviewPayload {
  summary: DashboardSummary
  insights: DashboardInsight[]
  competitions: DashboardCompetition[]
  skillMetrics: DashboardSkillMetric[]
  scheduleItems: DashboardScheduleItem[]
}

function includesIgnoreCase(source: string, keyword: string): boolean {
  return source.toLowerCase().includes(keyword.toLowerCase())
}

export function useDashboardWorkspace() {
  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)

  const searchQuery = ref('')
  const feedFilter = ref<DashboardFeedFilter>('ongoing')
  const overviewLoading = ref(false)
  const overviewError = ref('')

  const analystProfile: DashboardAnalystProfile = {
    name: '分析师',
    tier: '专业版',
  }

  const menuItems: DashboardMenuItem[] = [
    { id: 'overview', label: '首页概览', icon: 'dashboard', to: '/dashboard' },
    { id: 'contests', label: '赛事总库', icon: 'trophy', to: '/contests' },
    { id: 'resources', label: '资料中心', icon: 'folder_open', to: '/resources' },
    { id: 'team', label: '项目工作台', icon: 'construction', to: '/team' },
  ]

  const hotTopics: DashboardTopic[] = [
    { id: 'topic-hot-1', label: '赛事热度榜' },
    { id: 'topic-hot-2', label: '截止提醒' },
    { id: 'topic-hot-3', label: '评审优先项' },
  ]

  const quickActions: DashboardQuickAction[] = [
    { id: 'report', label: '撰写报告', icon: 'edit_square', to: '/team?create=1' },
    { id: 'upload', label: '材料上传', icon: 'cloud_upload', to: '/resources' },
    { id: 'rules', label: '规则查阅', icon: 'help', to: '/contests' },
  ]

  const summary = ref<DashboardSummary>({
    greeting: '你好',
    subtitle: '正在加载实时竞赛分析概览...',
    ongoingCount: 0,
    upcomingCount: 0,
    insightCount: 0,
  })

  const insights = ref<DashboardInsight[]>([])
  const competitions = ref<DashboardCompetition[]>([])
  const skillMetrics = ref<DashboardSkillMetric[]>([])
  const scheduleItems = ref<DashboardScheduleItem[]>([])

  const visibleInsights = computed(() => {
    const keyword = searchQuery.value.trim()
    if (!keyword)
      return insights.value

    return insights.value.filter((item) => {
      return includesIgnoreCase(`${item.title} ${item.description} ${item.metricText}`, keyword)
    })
  })

  const visibleCompetitions = computed(() => {
    const keyword = searchQuery.value.trim()

    return competitions.value.filter((item) => {
      if (feedFilter.value !== 'all' && item.status !== feedFilter.value)
        return false

      if (!keyword)
        return true

      return includesIgnoreCase(`${item.title} ${item.level} ${item.stage} ${item.deadline}`, keyword)
    })
  })

  async function loadOverview() {
    overviewLoading.value = true
    overviewError.value = ''
    try {
      const response = await $fetch<ApiResponse<DashboardOverviewPayload>>(endpoint('/dashboard/overview'))
      summary.value = response.data.summary
      insights.value = response.data.insights
      competitions.value = response.data.competitions
      skillMetrics.value = response.data.skillMetrics
      scheduleItems.value = response.data.scheduleItems
    }
    catch (error: any) {
      overviewError.value = String(error?.data?.message || 'Dashboard 概览加载失败。')
      summary.value = {
        greeting: '你好',
        subtitle: '概览加载失败，请稍后重试。',
        ongoingCount: 0,
        upcomingCount: 0,
        insightCount: 0,
      }
      insights.value = []
      competitions.value = []
      skillMetrics.value = []
      scheduleItems.value = []
    }
    finally {
      overviewLoading.value = false
    }
  }

  return {
    analystProfile,
    searchQuery,
    feedFilter,
    summary,
    menuItems,
    hotTopics,
    quickActions,
    insights,
    competitions,
    visibleInsights,
    visibleCompetitions,
    skillMetrics,
    scheduleItems,
    overviewLoading,
    overviewError,
    loadOverview,
  }
}
