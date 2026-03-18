export type DashboardFeedFilter = 'all' | 'ongoing' | 'upcoming'
export type DashboardCompetitionStatus = Exclude<DashboardFeedFilter, 'all'>
export type DashboardCompetitionTone = 'blue' | 'violet' | 'amber'
export type DashboardInsightTone = 'primary' | 'success'

export interface DashboardMenuItem {
  id: string
  label: string
  icon: string
  to: string
  active?: boolean
}

export interface DashboardTopic {
  id: string
  label: string
}

export interface DashboardInsight {
  id: string
  tag: string
  tone: DashboardInsightTone
  publishedAt: string
  title: string
  description: string
  metricIcon: string
  metricText: string
  actionText: string
}

export interface DashboardCompetition {
  id: string
  title: string
  level: string
  stage: string
  status: DashboardCompetitionStatus
  deadline: string
  icon: string
  tone: DashboardCompetitionTone
  actionText: string
}

export interface DashboardQuickAction {
  id: string
  label: string
  icon: string
  to: string
}

export interface DashboardSkillMetric {
  id: string
  label: string
  score: number
}

export interface DashboardScheduleItem {
  id: string
  month: string
  day: string
  title: string
  time: string
}

export interface DashboardSummary {
  greeting: string
  subtitle: string
  ongoingCount: number
  upcomingCount: number
  insightCount: number
}

export interface DashboardAnalystProfile {
  name: string
  tier: string
}
