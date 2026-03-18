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

function includesIgnoreCase(source: string, keyword: string): boolean {
  return source.toLowerCase().includes(keyword.toLowerCase())
}

export function useDashboardWorkspace() {
  const searchQuery = ref('')
  const feedFilter = ref<DashboardFeedFilter>('ongoing')

  const analystProfile: DashboardAnalystProfile = {
    name: '分析师 张明',
    tier: '高级会员',
  }

  const menuItems: DashboardMenuItem[] = [
    { id: 'overview', label: '首页概览', icon: 'dashboard', to: '/dashboard', active: true },
    { id: 'contests', label: '赛事发现', icon: 'trophy', to: '/contests' },
    { id: 'insights', label: 'AI 深度洞察', icon: 'insights', to: '/workspace' },
    { id: 'projects', label: '我的项目', icon: 'folder_open', to: '/workspace' },
    { id: 'collaboration', label: '团队协作', icon: 'groups', to: '/reviews' },
  ]

  const hotTopics: DashboardTopic[] = [
    { id: 'mcm', label: '数学建模国赛' },
    { id: 'challenge-cup', label: '挑战杯选题' },
    { id: 'design-competition', label: '计算机设计大赛' },
  ]

  const quickActions: DashboardQuickAction[] = [
    { id: 'report', label: '撰写报告', icon: 'edit_square', to: '/workspace' },
    { id: 'history', label: '历史战绩', icon: 'history', to: '/reviews' },
    { id: 'upload', label: '材料上传', icon: 'cloud_upload', to: '/resources' },
    { id: 'rules', label: '规则查阅', icon: 'help', to: '/contests' },
  ]

  const insights: DashboardInsight[] = [
    {
      id: 'cv-heatup',
      tag: '趋势预测',
      tone: 'primary',
      publishedAt: '10分钟前',
      title: '计算机视觉赛道热度激增',
      description: '基于过去 30 天数据，AI 应用类竞赛在华东地区关注度提升 42%，建议优先关注近期启动的“互联网+”省赛。',
      metricIcon: 'trending_up',
      metricText: '匹配度 92%',
      actionText: '详细分析',
    },
    {
      id: 'teammate-reco',
      tag: '个性化推荐',
      tone: 'success',
      publishedAt: '2小时前',
      title: '适合您的数学建模队友',
      description: '匹配到 3 位拥有 Python 建模经验且有省级一等奖经历的潜在队友，可直接发起组队邀约。',
      metricIcon: 'group',
      metricText: '3位候选人',
      actionText: '立即联系',
    },
  ]

  const competitions: DashboardCompetition[] = [
    {
      id: 'icpc',
      title: '2026 全国大学生程序设计竞赛 (ICPC)',
      level: '国家级',
      stage: '报名中',
      status: 'ongoing',
      deadline: '报名截止：2026年10月15日',
      icon: 'code',
      tone: 'blue',
      actionText: '查看详情',
    },
    {
      id: 'internet-plus',
      title: '第十一届中国国际“互联网+”大学生创新创业大赛',
      level: '国家级',
      stage: '项目计划书阶段',
      status: 'ongoing',
      deadline: '当前阶段：校内初审',
      icon: 'design_services',
      tone: 'violet',
      actionText: '查看详情',
    },
    {
      id: 'gdmcm',
      title: '广东省大学生数学建模选拔赛',
      level: '省级',
      stage: '即将截止',
      status: 'upcoming',
      deadline: '剩余报名时间：48小时',
      icon: 'functions',
      tone: 'amber',
      actionText: '查看详情',
    },
  ]

  const skillMetrics: DashboardSkillMetric[] = [
    { id: 'skill-tech', label: '技术能力', score: 92 },
    { id: 'skill-team', label: '团队协作', score: 75 },
  ]

  const scheduleItems: DashboardScheduleItem[] = [
    {
      id: 'schedule-material',
      month: 'OCT',
      day: '12',
      title: '数模竞赛材料提交',
      time: '下午 17:00 截止',
    },
    {
      id: 'schedule-icpc',
      month: 'OCT',
      day: '15',
      title: 'ICPC 校园选拔赛',
      time: '上午 09:00 - 14:00',
    },
  ]

  const visibleInsights = computed(() => {
    const keyword = searchQuery.value.trim()
    if (!keyword)
      return insights

    return insights.filter((item) => {
      return includesIgnoreCase(`${item.title} ${item.description} ${item.metricText}`, keyword)
    })
  })

  const visibleCompetitions = computed(() => {
    const keyword = searchQuery.value.trim()

    return competitions.filter((item) => {
      if (feedFilter.value !== 'all' && item.status !== feedFilter.value)
        return false

      if (!keyword)
        return true

      return includesIgnoreCase(`${item.title} ${item.level} ${item.stage} ${item.deadline}`, keyword)
    })
  })

  const summary = computed<DashboardSummary>(() => {
    return {
      greeting: '你好，张明',
      subtitle: '这是为您准备的今日竞赛深度分析报告。',
      ongoingCount: competitions.filter(item => item.status === 'ongoing').length,
      upcomingCount: competitions.filter(item => item.status === 'upcoming').length,
      insightCount: visibleInsights.value.length,
    }
  })

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
  }
}
