import type { FeishuTaskScheduleConfig, FeishuTaskScheduleMode } from '~~/shared/types/domain'

export const DEFAULT_FEISHU_TASK_TIMEZONE = 'Asia/Shanghai'
export const DEFAULT_FEISHU_TASK_INTERVAL_MINUTES = 60
export const MIN_FEISHU_TASK_INTERVAL_MINUTES = 5
const CRON_FIELD_COUNT = 5
const CRON_MAX_SEARCH_MINUTES = 366 * 24 * 60

interface CronSpec {
  minute: Set<number>
  hour: Set<number>
  dayOfMonth: Set<number>
  month: Set<number>
  dayOfWeek: Set<number>
}

interface ZonedTimeParts {
  minute: number
  hour: number
  dayOfMonth: number
  month: number
  dayOfWeek: number
}

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function toBoolean(raw: unknown, fallback = false): boolean {
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized))
      return true
    if (['0', 'false', 'no', 'off'].includes(normalized))
      return false
  }
  return fallback
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function toOptionalInteger(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '')
    return null

  const value = Number(raw)
  if (!Number.isFinite(value))
    return null
  return Math.trunc(value)
}

function toScheduleMode(raw: unknown, fallback: FeishuTaskScheduleMode = 'interval'): FeishuTaskScheduleMode {
  const value = toText(raw)
  if (value === 'interval' || value === 'cron')
    return value
  return fallback
}

function assertTimezoneValid(timezone: string): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
  }
  catch {
    throw new Error(`时区无效：${timezone}`)
  }
}

function normalizeTimezone(raw: unknown, fallback = DEFAULT_FEISHU_TASK_TIMEZONE): string {
  const value = toText(raw) || fallback
  assertTimezoneValid(value)
  return value
}

function buildNumericRange(min: number, max: number): Set<number> {
  const values = new Set<number>()
  for (let cursor = min; cursor <= max; cursor += 1)
    values.add(cursor)
  return values
}

function parseFieldNumber(input: string, min: number, max: number, fieldName: string): number {
  const value = Number(input)
  if (!Number.isInteger(value))
    throw new Error(`cron ${fieldName} 字段包含非法值：${input}`)
  if (value < min || value > max)
    throw new Error(`cron ${fieldName} 字段超出范围：${input}`)
  return value
}

function normalizeWeekday(value: number): number {
  if (value === 7)
    return 0
  return value
}

function parseCronField(raw: string, input: {
  min: number
  max: number
  fieldName: string
  normalizeValue?: (value: number) => number
}): Set<number> {
  const source = toText(raw)
  if (!source)
    throw new Error(`cron ${input.fieldName} 字段不能为空`)

  const result = new Set<number>()
  const segments = source.split(',').map(item => item.trim()).filter(Boolean)
  if (!segments.length)
    throw new Error(`cron ${input.fieldName} 字段不能为空`)

  for (const segment of segments) {
    const [rangeToken = '', stepRaw] = segment.split('/')
    const rangeRaw = rangeToken.trim()
    if (!rangeRaw)
      throw new Error(`cron ${input.fieldName} 字段不能为空`)
    const step = stepRaw === undefined ? 1 : parseFieldNumber(stepRaw, 1, 10_000, input.fieldName)
    if (step <= 0)
      throw new Error(`cron ${input.fieldName} 步长必须大于 0`)

    let start = input.min
    let end = input.max

    if (rangeRaw !== '*') {
      if (rangeRaw.includes('-')) {
        const [startRaw = '', endRaw = ''] = rangeRaw.split('-')
        start = parseFieldNumber(startRaw, input.min, input.max, input.fieldName)
        end = parseFieldNumber(endRaw, input.min, input.max, input.fieldName)
        if (start > end)
          throw new Error(`cron ${input.fieldName} 范围非法：${rangeRaw}`)
      }
      else {
        const single = parseFieldNumber(rangeRaw, input.min, input.max, input.fieldName)
        start = single
        end = single
      }
    }

    for (let cursor = start; cursor <= end; cursor += step) {
      const normalized = input.normalizeValue ? input.normalizeValue(cursor) : cursor
      result.add(normalized)
    }
  }

  if (result.size === 0)
    throw new Error(`cron ${input.fieldName} 字段无可用取值`)

  return result
}

export function parseCronExpression(cronExpr: string): CronSpec {
  const source = toText(cronExpr)
  const fields = source.split(/\s+/).filter(Boolean)
  if (fields.length !== CRON_FIELD_COUNT) {
    throw new Error('cron 必须是 5 段表达式（分钟 小时 日 月 周）')
  }

  const [minute = '', hour = '', dayOfMonth = '', month = '', dayOfWeek = ''] = fields

  return {
    minute: parseCronField(minute, { min: 0, max: 59, fieldName: 'minute' }),
    hour: parseCronField(hour, { min: 0, max: 23, fieldName: 'hour' }),
    dayOfMonth: parseCronField(dayOfMonth, { min: 1, max: 31, fieldName: 'day-of-month' }),
    month: parseCronField(month, { min: 1, max: 12, fieldName: 'month' }),
    dayOfWeek: parseCronField(dayOfWeek, { min: 0, max: 7, fieldName: 'day-of-week', normalizeValue: normalizeWeekday }),
  }
}

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cacheKey = timezone
  const cached = formatterCache.get(cacheKey)
  if (cached)
    return cached

  const created = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  formatterCache.set(cacheKey, created)
  return created
}

function readPartsInTimezone(date: Date, timezone: string): ZonedTimeParts {
  const parts = getFormatter(timezone).formatToParts(date)
  let minute = 0
  let hour = 0
  let dayOfMonth = 1
  let month = 1
  let dayOfWeek = 0
  for (const part of parts) {
    if (part.type === 'minute')
      minute = Number(part.value)
    else if (part.type === 'hour')
      hour = Number(part.value)
    else if (part.type === 'day')
      dayOfMonth = Number(part.value)
    else if (part.type === 'month')
      month = Number(part.value)
    else if (part.type === 'weekday')
      dayOfWeek = WEEKDAY_MAP[String(part.value || '').slice(0, 3).toLowerCase()] ?? 0
  }
  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
  }
}

function cronMatches(spec: CronSpec, parts: ZonedTimeParts): boolean {
  return spec.minute.has(parts.minute)
    && spec.hour.has(parts.hour)
    && spec.dayOfMonth.has(parts.dayOfMonth)
    && spec.month.has(parts.month)
    && spec.dayOfWeek.has(parts.dayOfWeek)
}

export function getDefaultFeishuTaskScheduleConfig(): FeishuTaskScheduleConfig {
  return {
    enabled: false,
    mode: 'interval',
    intervalMinutes: DEFAULT_FEISHU_TASK_INTERVAL_MINUTES,
    cronExpr: null,
    timezone: DEFAULT_FEISHU_TASK_TIMEZONE,
  }
}

export function normalizeFeishuTaskScheduleConfig(
  raw: Partial<FeishuTaskScheduleConfig> | null | undefined,
  fallback?: FeishuTaskScheduleConfig,
): FeishuTaskScheduleConfig {
  const source = raw || {}
  const base = fallback || getDefaultFeishuTaskScheduleConfig()
  const mode = toScheduleMode(source.mode, base.mode)
  const timezone = normalizeTimezone(source.timezone, base.timezone || DEFAULT_FEISHU_TASK_TIMEZONE)
  const intervalFromSource = source.intervalMinutes === null
    ? null
    : (toOptionalInteger(source.intervalMinutes) ?? base.intervalMinutes ?? DEFAULT_FEISHU_TASK_INTERVAL_MINUTES)
  const cronExprFromSource = source.cronExpr === null
    ? null
    : (toText(source.cronExpr) || base.cronExpr || null)

  const normalized: FeishuTaskScheduleConfig = {
    enabled: toBoolean(source.enabled, base.enabled),
    mode,
    intervalMinutes: mode === 'interval'
      ? (intervalFromSource ?? DEFAULT_FEISHU_TASK_INTERVAL_MINUTES)
      : null,
    cronExpr: mode === 'cron'
      ? (cronExprFromSource ? toText(cronExprFromSource) : null)
      : null,
    timezone,
  }

  return normalized
}

export function validateFeishuTaskScheduleConfig(config: FeishuTaskScheduleConfig): string[] {
  const errors: string[] = []
  try {
    assertTimezoneValid(config.timezone)
  }
  catch (error) {
    errors.push(error instanceof Error ? error.message : '时区配置非法')
  }

  if (config.mode === 'interval') {
    const interval = Number(config.intervalMinutes || 0)
    if (!Number.isInteger(interval) || interval < MIN_FEISHU_TASK_INTERVAL_MINUTES) {
      errors.push(`interval 模式下 intervalMinutes 必须是整数且 >= ${MIN_FEISHU_TASK_INTERVAL_MINUTES}`)
    }
  }
  else {
    const cronExpr = toText(config.cronExpr)
    if (!cronExpr) {
      errors.push('cron 模式下 cronExpr 不能为空')
    }
    else {
      try {
        parseCronExpression(cronExpr)
      }
      catch (error) {
        errors.push(error instanceof Error ? error.message : 'cron 表达式不合法')
      }
    }
  }

  return errors
}

export function computeNextScheduledRunAt(
  config: FeishuTaskScheduleConfig,
  input: {
    from?: Date
  } = {},
): string | null {
  if (!config.enabled)
    return null

  const from = input.from || new Date()
  if (config.mode === 'interval') {
    const intervalMinutes = Math.max(
      MIN_FEISHU_TASK_INTERVAL_MINUTES,
      Number(config.intervalMinutes || DEFAULT_FEISHU_TASK_INTERVAL_MINUTES),
    )
    return new Date(from.getTime() + Math.trunc(intervalMinutes) * 60 * 1000).toISOString()
  }

  const cronExpr = toText(config.cronExpr)
  if (!cronExpr)
    throw new Error('cronExpr 不能为空')

  const spec = parseCronExpression(cronExpr)
  const timezone = normalizeTimezone(config.timezone, DEFAULT_FEISHU_TASK_TIMEZONE)
  const fromMs = from.getTime()
  const baseMinuteMs = fromMs - (fromMs % (60 * 1000))
  for (let offset = 1; offset <= CRON_MAX_SEARCH_MINUTES; offset += 1) {
    const candidate = new Date(baseMinuteMs + offset * 60 * 1000)
    const parts = readPartsInTimezone(candidate, timezone)
    if (cronMatches(spec, parts))
      return candidate.toISOString()
  }
  throw new Error('无法在 366 天内计算出下一次执行时间，请检查 cron 表达式')
}

export function computeNextScheduledRunAtOrNull(
  config: FeishuTaskScheduleConfig,
  input: {
    from?: Date
  } = {},
): string | null {
  try {
    return computeNextScheduledRunAt(config, input)
  }
  catch {
    return null
  }
}

export function mergeFeishuTaskSchedulePatch(input: {
  current: FeishuTaskScheduleConfig
  patch?: Partial<FeishuTaskScheduleConfig> | null
}): FeishuTaskScheduleConfig {
  const patch = input.patch || {}
  const merged = normalizeFeishuTaskScheduleConfig({
    enabled: patch.enabled ?? input.current.enabled,
    mode: patch.mode ?? input.current.mode,
    intervalMinutes: patch.intervalMinutes ?? input.current.intervalMinutes,
    cronExpr: patch.cronExpr ?? input.current.cronExpr,
    timezone: patch.timezone ?? input.current.timezone,
  }, input.current)
  return merged
}

export function inferCronFieldCandidates(input: {
  field: string
  min: number
  max: number
}): Set<number> {
  if (toText(input.field) === '*')
    return buildNumericRange(input.min, input.max)
  return parseCronField(input.field, {
    min: input.min,
    max: input.max,
    fieldName: 'field',
  })
}
