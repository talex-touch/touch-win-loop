import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { listContestLibrary } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { listVisibleProjects } from '~~/server/utils/platform-store'

type DashboardCompetitionStatus = 'ongoing' | 'upcoming'
type DashboardCompetitionTone = 'blue' | 'violet' | 'amber'

interface DashboardOverviewPayload {
  summary: {
    greeting: string
    subtitle: string
    ongoingCount: number
    upcomingCount: number
    insightCount: number
  }
  insights: Array<{
    id: string
    tag: string
    tone: 'primary' | 'success'
    publishedAt: string
    title: string
    description: string
    metricIcon: string
    metricText: string
    actionText: string
  }>
  competitions: Array<{
    id: string
    title: string
    level: string
    stage: string
    status: DashboardCompetitionStatus
    deadline: string
    icon: string
    tone: DashboardCompetitionTone
    actionText: string
  }>
  skillMetrics: Array<{
    id: string
    label: string
    score: number
  }>
  scheduleItems: Array<{
    id: string
    month: string
    day: string
    title: string
    time: string
  }>
}

function parseDateOnly(value: string): Date | null {
  if (!value)
    return null
  const parsed = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(parsed.getTime()))
    return null
  return parsed
}

function getContestStatus(windowText: string, deadlineText: string, now: Date): DashboardCompetitionStatus {
  const [startRaw = '', endRaw = ''] = String(windowText || '').split('~').map(item => item.trim())
  const start = parseDateOnly(startRaw)
  const end = parseDateOnly(endRaw)
  const deadline = parseDateOnly(deadlineText)

  if (start && start.getTime() > now.getTime())
    return 'upcoming'
  if (end && end.getTime() >= now.getTime())
    return 'ongoing'
  if (deadline && deadline.getTime() >= now.getTime())
    return 'ongoing'
  return 'upcoming'
}

function formatMonthDay(deadlineText: string): { month: string, day: string } {
  const date = parseDateOnly(deadlineText)
  if (!date)
    return { month: '--', day: '--' }
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Shanghai' }).toUpperCase()
  const day = date.toLocaleString('en-US', { day: '2-digit', timeZone: 'Asia/Shanghai' })
  return { month, day }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  const payload = await withClient(event, async (db) => {
    const contestResult = await listContestLibrary(db, {
      includeInternal,
      sort: 'deadline',
      page: 1,
      pageSize: 50,
    })
    const contests = contestResult.items
    const projects = await listVisibleProjects(db, user)

    const now = new Date()
    const tones: DashboardCompetitionTone[] = ['blue', 'violet', 'amber']
    const competitions = contests.slice(0, 8).map((contest, index) => {
      const status = getContestStatus(contest.registrationWindow, contest.submissionDeadline, now)
      const stage = status === 'ongoing' ? '进行中' : '即将开始'
      return {
        id: contest.id,
        title: contest.name,
        level: contest.level,
        stage,
        status,
        deadline: contest.submissionDeadline
          ? `提交截止：${contest.submissionDeadline}`
          : (contest.registrationWindow ? `报名窗口：${contest.registrationWindow}` : '时间待公布'),
        icon: index % 3 === 0 ? 'code' : (index % 3 === 1 ? 'design_services' : 'functions'),
        tone: tones[index % tones.length]!,
        actionText: '查看详情',
      }
    })

    const ongoingCount = competitions.filter(item => item.status === 'ongoing').length
    const upcomingCount = competitions.filter(item => item.status === 'upcoming').length
    const topHot = [...contests].sort((a, b) => Number(b.hotScore || 0) - Number(a.hotScore || 0))[0]

    const insights: DashboardOverviewPayload['insights'] = [
      {
        id: 'insight-hot-contest',
        tag: '趋势预测',
        tone: 'primary',
        publishedAt: '刚刚',
        title: topHot ? `${topHot.name} 热度领先` : '竞赛热度趋势已更新',
        description: topHot
          ? `当前热度最高竞赛为「${topHot.name}」，建议优先准备其重点赛道与评分口径。`
          : '暂无可分析竞赛，请先补充赛事库数据。',
        metricIcon: 'trending_up',
        metricText: topHot ? `热度 ${topHot.hotScore || 0}` : '待计算',
        actionText: '查看详情',
      },
      {
        id: 'insight-project-progress',
        tag: '个性化推荐',
        tone: 'success',
        publishedAt: '刚刚',
        title: `你当前可见项目 ${projects.length} 个`,
        description: projects.length > 0
          ? `其中草稿 ${projects.filter(item => item.status === 'draft').length} 个，建议优先推进即将截止赛事对应项目。`
          : '当前尚无项目记录，建议先进入工作台创建首个项目草案。',
        metricIcon: 'dashboard',
        metricText: `进行中 ${projects.filter(item => item.status === 'in_progress').length}`,
        actionText: '进入工作台',
      },
    ]

    const scoredProjects = projects.length > 0 ? projects.length : 1
    const techScore = Math.max(35, Math.min(96, Math.round(
      projects.reduce((sum, item) => sum + (item.techRouteSteps.length * 9 + item.innovationPoints.length * 7), 0) / scoredProjects,
    )))
    const teamScore = Math.max(30, Math.min(96, Math.round(
      projects.reduce((sum, item) => sum + (item.collegeBindings.length * 12 + item.advisorBindings.length * 15), 0) / scoredProjects + 40,
    )))

    const skillMetrics = [
      { id: 'skill-tech', label: '技术能力', score: techScore },
      { id: 'skill-team', label: '团队协作', score: teamScore },
    ]

    const scheduleItems = contests
      .filter(item => Boolean(item.submissionDeadline))
      .slice(0, 4)
      .map((contest) => {
        const monthDay = formatMonthDay(contest.submissionDeadline)
        return {
          id: `schedule-${contest.id}`,
          month: monthDay.month,
          day: monthDay.day,
          title: `${contest.name} 截止提醒`,
          time: contest.submissionDeadline ? `${contest.submissionDeadline} 23:59` : '时间待公布',
        }
      })

    const summary = {
      greeting: `你好，${user.username}`,
      subtitle: '这是为你准备的实时竞赛分析概览。',
      ongoingCount,
      upcomingCount,
      insightCount: insights.length,
    }

    return {
      summary,
      insights,
      competitions,
      skillMetrics,
      scheduleItems,
    }
  })

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
