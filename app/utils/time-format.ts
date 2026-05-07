export type TimeMode = 'relative' | 'absolute'

function padTimePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function parseTimeValue(value: string | null | undefined): Date | null {
  const normalized = String(value || '').trim()
  if (!normalized)
    return null

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime()))
    return null

  return date
}

export function formatAbsoluteDateTime(date: Date): string {
  return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())} ${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`
}

function addOneCalendarYear(date: Date): Date {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + 1)
  return next
}

function wholeMonthDiff(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth()
  if (to.getDate() < from.getDate())
    months -= 1
  return Math.max(0, months)
}

export function formatRelativeTime(date: Date, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - date.getTime())
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1)
    return '刚刚'
  if (diffMinutes < 60)
    return `${diffMinutes} 分钟前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24)
    return `${diffHours} 小时前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30)
    return `${diffDays} 天前`

  const current = new Date(nowMs)
  const monthDiff = wholeMonthDiff(date, current)
  if (monthDiff <= 1)
    return '上个月'
  if (monthDiff < 12)
    return `${monthDiff} 个月以前`

  if (current.getTime() <= addOneCalendarYear(date).getTime())
    return '1 年前'

  return formatAbsoluteDateTime(date)
}
