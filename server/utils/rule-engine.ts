import type {
  ChecklistItem,
  EngineContext,
  EngineOutput,
  ObligationBinding,
  ObligationDefinition,
  PredicateExpr,
  RuleBinding,
  RuleDefinition,
  RuleResult,
  ScopeType,
  ValueExpr,
} from '~~/shared/types/domain'
import { Engine, Rule } from 'json-rules-engine'

interface EvaluateContext {
  root: EngineContext
  item?: unknown
  now: Date
}

interface PredicateEvaluation {
  matched: boolean
  details: string[]
}

interface ActiveRule {
  rule: RuleDefinition
  binding: RuleBinding
}

interface ActiveObligation {
  obligation: ObligationDefinition
  binding: ObligationBinding
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeDate(value: unknown): Date | null {
  if (!value)
    return null
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value
  const parsed = new Date(String(value))
  if (!Number.isFinite(parsed.getTime()))
    return null
  return parsed
}

function parsePath(path: string): string[] {
  const normalized = String(path || '')
    .trim()
    .replaceAll(/\[(\d+)\]/g, '.$1')
    .replaceAll(/\[\*\]/g, '.*')
    .replaceAll(/^\./g, '')
  if (!normalized)
    return []
  return normalized.split('.').filter(Boolean)
}

function walkPath(value: unknown, tokens: string[], index = 0): unknown {
  if (index >= tokens.length)
    return value
  if (value === null || value === undefined)
    return undefined

  const token = tokens[index]!
  if (token === '*') {
    if (!Array.isArray(value))
      return []
    return value.flatMap((item) => {
      const next = walkPath(item, tokens, index + 1)
      return Array.isArray(next) ? next : [next]
    })
  }

  const key = token
  if (Array.isArray(value) && /^\d+$/.test(key)) {
    const item = value[Number(key)]
    return walkPath(item, tokens, index + 1)
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return walkPath(record[key], tokens, index + 1)
  }

  return undefined
}

function readPath(ctx: EvaluateContext, path: string): unknown {
  const normalized = normalizeString(path)
  if (!normalized)
    return undefined

  if (normalized === '$item')
    return ctx.item
  if (normalized === 'now')
    return ctx.now.toISOString()

  if (normalized.startsWith('$item.')) {
    const tokens = parsePath(normalized.slice('$item.'.length))
    return walkPath(ctx.item, tokens, 0)
  }

  const tokens = parsePath(normalized)
  return walkPath(ctx.root, tokens, 0)
}

function evalValue(expr: ValueExpr, ctx: EvaluateContext): unknown {
  if (expr.type === 'const')
    return expr.value
  if (expr.type === 'var')
    return readPath(ctx, expr.path)
  if (expr.type === 'exists') {
    const value = readPath(ctx, expr.path)
    if (Array.isArray(value))
      return value.length > 0
    if (typeof value === 'string')
      return value.trim().length > 0
    return value !== undefined && value !== null
  }
  const value = readPath(ctx, expr.path)
  if (Array.isArray(value))
    return value.length
  if (value && typeof value === 'object')
    return Object.keys(value as Record<string, unknown>).length
  if (typeof value === 'string')
    return value.trim() ? 1 : 0
  return value ? 1 : 0
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value))
    return value
  if (value === null || value === undefined)
    return []
  return [value]
}

function compare(left: unknown, right: unknown): number | null {
  const leftDate = normalizeDate(left)
  const rightDate = normalizeDate(right)
  if (leftDate && rightDate) {
    const diff = leftDate.getTime() - rightDate.getTime()
    return diff === 0 ? 0 : (diff > 0 ? 1 : -1)
  }

  const leftNum = Number(left)
  const rightNum = Number(right)
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    const diff = leftNum - rightNum
    return diff === 0 ? 0 : (diff > 0 ? 1 : -1)
  }

  const leftText = normalizeString(left)
  const rightText = normalizeString(right)
  if (!leftText && !rightText)
    return 0
  if (!leftText || !rightText)
    return null

  return leftText.localeCompare(rightText)
}

function evalPredicate(expr: PredicateExpr, ctx: EvaluateContext): PredicateEvaluation {
  if (expr.op === 'and') {
    const details: string[] = []
    for (const child of expr.children || []) {
      const result = evalPredicate(child, ctx)
      details.push(...result.details)
      if (!result.matched)
        return { matched: false, details }
    }
    return { matched: true, details }
  }

  if (expr.op === 'or') {
    const details: string[] = []
    for (const child of expr.children || []) {
      const result = evalPredicate(child, ctx)
      details.push(...result.details)
      if (result.matched)
        return { matched: true, details }
    }
    return { matched: false, details }
  }

  if (expr.op === 'not') {
    const result = evalPredicate(expr.child, ctx)
    return {
      matched: !result.matched,
      details: result.details,
    }
  }

  if (expr.op === 'any_match' || expr.op === 'all_match' || expr.op === 'none_match') {
    const list = asArray(readPath(ctx, expr.path))
    const matchedCount = list.filter((item) => {
      const result = evalPredicate(expr.child, {
        ...ctx,
        item,
      })
      return result.matched
    }).length

    if (expr.op === 'any_match')
      return { matched: matchedCount > 0, details: [`any_match count=${matchedCount}`] }
    if (expr.op === 'all_match')
      return { matched: list.length > 0 && matchedCount === list.length, details: [`all_match count=${matchedCount}/${list.length}`] }
    return { matched: matchedCount === 0, details: [`none_match count=${matchedCount}`] }
  }

  if (expr.op === 'date_between') {
    const target = normalizeDate(evalValue(expr.target, ctx))
    const start = normalizeDate(evalValue(expr.start, ctx))
    const end = normalizeDate(evalValue(expr.end, ctx))
    if (!target || !start || !end)
      return { matched: false, details: ['date_between invalid date'] }
    return {
      matched: target.getTime() >= start.getTime() && target.getTime() <= end.getTime(),
      details: [`date_between ${target.toISOString()} in [${start.toISOString()}, ${end.toISOString()}]`],
    }
  }

  const left = evalValue((expr as any).left, ctx)
  const right = evalValue((expr as any).right, ctx)

  if (expr.op === 'eq')
    return { matched: left === right, details: [`eq ${JSON.stringify(left)} === ${JSON.stringify(right)}`] }
  if (expr.op === 'neq')
    return { matched: left !== right, details: [`neq ${JSON.stringify(left)} !== ${JSON.stringify(right)}`] }
  if (expr.op === 'contains') {
    if (Array.isArray(left))
      return { matched: left.includes(right), details: ['contains(array)'] }
    return { matched: normalizeString(left).includes(normalizeString(right)), details: ['contains(string)'] }
  }
  if (expr.op === 'in_set') {
    const rightSet = asArray(right).map(item => normalizeString(item))
    return {
      matched: rightSet.includes(normalizeString(left)),
      details: ['in_set'],
    }
  }
  if (expr.op === 'regex') {
    try {
      const pattern = normalizeString(right)
      if (!pattern)
        return { matched: false, details: ['regex empty pattern'] }
      const reg = new RegExp(pattern)
      return {
        matched: reg.test(normalizeString(left)),
        details: ['regex'],
      }
    }
    catch {
      return { matched: false, details: ['regex invalid'] }
    }
  }
  if (expr.op === 'date_before') {
    const leftDate = normalizeDate(left)
    const rightDate = normalizeDate(right)
    return {
      matched: Boolean(leftDate && rightDate && leftDate.getTime() < rightDate.getTime()),
      details: ['date_before'],
    }
  }
  if (expr.op === 'date_after') {
    const leftDate = normalizeDate(left)
    const rightDate = normalizeDate(right)
    return {
      matched: Boolean(leftDate && rightDate && leftDate.getTime() > rightDate.getTime()),
      details: ['date_after'],
    }
  }

  const cmp = compare(left, right)
  if (cmp === null)
    return { matched: false, details: ['compare invalid'] }

  if (expr.op === 'lt')
    return { matched: cmp < 0, details: ['lt'] }
  if (expr.op === 'lte')
    return { matched: cmp <= 0, details: ['lte'] }
  if (expr.op === 'gt')
    return { matched: cmp > 0, details: ['gt'] }
  if (expr.op === 'gte')
    return { matched: cmp >= 0, details: ['gte'] }

  return { matched: false, details: ['unsupported op'] }
}

function scopeRank(scopeType: ScopeType): number {
  if (scopeType === 'policy')
    return 7
  if (scopeType === 'track')
    return 6
  if (scopeType === 'stage')
    return 5
  if (scopeType === 'region')
    return 4
  if (scopeType === 'instance')
    return 3
  if (scopeType === 'activity')
    return 2
  return 1
}

function resolveScopeCandidates(scopeType: ScopeType, context: EngineContext): string[] {
  const fromRecord = (value: unknown): string[] => {
    if (Array.isArray(value))
      return value.map(item => normalizeString(item)).filter(Boolean)
    const normalized = normalizeString(value)
    return normalized ? [normalized] : []
  }

  if (scopeType === 'global')
    return ['*']
  if (scopeType === 'activity') {
    const activity = context.activity as Record<string, unknown> | undefined
    return [...fromRecord(activity?.id), ...fromRecord(activity?.type), ...fromRecord((context as Record<string, unknown>).activityId)]
  }
  if (scopeType === 'instance') {
    const instance = context.instance as Record<string, unknown> | undefined
    return [...fromRecord(instance?.id), ...fromRecord((context as Record<string, unknown>).instanceId)]
  }
  if (scopeType === 'region') {
    const instance = context.instance as Record<string, unknown> | undefined
    return [...fromRecord(instance?.region), ...fromRecord((context as Record<string, unknown>).region)]
  }
  if (scopeType === 'stage') {
    const instance = context.instance as Record<string, unknown> | undefined
    return [...fromRecord(instance?.stage), ...fromRecord((context as Record<string, unknown>).stage)]
  }
  if (scopeType === 'track') {
    const instance = context.instance as Record<string, unknown> | undefined
    return [...fromRecord(instance?.track), ...fromRecord((context as Record<string, unknown>).trackId), ...fromRecord((context as Record<string, unknown>).track)]
  }
  const policy = context.policy as Record<string, unknown> | undefined
  return [...fromRecord(policy?.id), ...fromRecord(policy?.code), ...fromRecord((context as Record<string, unknown>).policyId)]
}

function matchScope(scopeType: ScopeType, scopeValue: string, context: EngineContext): boolean {
  if (scopeType === 'global')
    return true
  const expected = normalizeString(scopeValue)
  if (!expected || expected === '*')
    return true
  const candidates = resolveScopeCandidates(scopeType, context)
  return candidates.includes(expected)
}

function inEffectiveWindow(binding: RuleBinding, now: Date): boolean {
  const start = normalizeDate(binding.effectiveStartAt || null)
  const end = normalizeDate(binding.effectiveEndAt || null)
  if (start && now.getTime() < start.getTime())
    return false
  if (end && now.getTime() > end.getTime())
    return false
  return true
}

function resolveActiveRules(input: {
  rules: RuleDefinition[]
  bindings: RuleBinding[]
  context: EngineContext
  now: Date
}): ActiveRule[] {
  const ruleById = new Map(input.rules.map(rule => [rule.id, rule]))
  const candidates = input.bindings
    .filter(binding => binding.enabled !== false)
    .filter(binding => inEffectiveWindow(binding, input.now))
    .filter(binding => matchScope(binding.scopeType, binding.scopeValue, input.context))
    .sort((a, b) => {
      const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0)
      if (priorityDelta !== 0)
        return priorityDelta
      return scopeRank(b.scopeType) - scopeRank(a.scopeType)
    })

  const picked = new Map<string, RuleBinding>()
  for (const binding of candidates) {
    if (!picked.has(binding.ruleId))
      picked.set(binding.ruleId, binding)
  }

  return [...picked.entries()]
    .map(([ruleId, binding]) => {
      const rule = ruleById.get(ruleId)
      if (!rule)
        return null
      return { rule, binding }
    })
    .filter((item): item is ActiveRule => Boolean(item))
}

function resolveActiveObligations(input: {
  obligations: ObligationDefinition[]
  bindings: ObligationBinding[]
  context: EngineContext
}): ActiveObligation[] {
  const obligationById = new Map(input.obligations.map(item => [item.id, item]))
  const candidates = input.bindings
    .filter(binding => binding.enabled !== false)
    .filter(binding => matchScope(binding.scopeType, binding.scopeValue, input.context))
    .sort((a, b) => {
      const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0)
      if (priorityDelta !== 0)
        return priorityDelta
      return scopeRank(b.scopeType) - scopeRank(a.scopeType)
    })

  const picked = new Map<string, ObligationBinding>()
  for (const binding of candidates) {
    if (!picked.has(binding.obligationId))
      picked.set(binding.obligationId, binding)
  }

  return [...picked.entries()]
    .map(([obligationId, binding]) => {
      const obligation = obligationById.get(obligationId)
      if (!obligation)
        return null
      return { obligation, binding }
    })
    .filter((item): item is ActiveObligation => Boolean(item))
}

export async function runRuleEngine(input: {
  context: EngineContext
  rules: RuleDefinition[]
  bindings: RuleBinding[]
  obligations?: ObligationDefinition[]
  obligationBindings?: ObligationBinding[]
  now?: string
}): Promise<{
  engine: EngineOutput
  checklist: ChecklistItem[]
}> {
  const now = normalizeDate(input.now) || new Date()
  const activeRules = resolveActiveRules({
    rules: input.rules,
    bindings: input.bindings,
    context: input.context,
    now,
  })

  const evalCtx: EvaluateContext = {
    root: input.context,
    now,
  }

  const engine = new Engine([], { allowUndefinedFacts: true })
  for (const item of activeRules) {
    const whenFact = `rule_when_${item.rule.id}`
    const assertFact = `rule_assert_${item.rule.id}`
    engine.addFact(whenFact, async () => {
      if (!item.rule.when)
        return true
      return evalPredicate(item.rule.when, evalCtx).matched
    })
    engine.addFact(assertFact, async () => evalPredicate(item.rule.assert, evalCtx).matched)
    engine.addRule(new Rule({
      name: item.rule.code,
      conditions: {
        all: [
          { fact: whenFact, operator: 'equal', value: true },
          { fact: assertFact, operator: 'equal', value: true },
        ],
      },
      event: {
        type: `rule_pass_${item.rule.id}`,
        params: {
          ruleId: item.rule.id,
        },
      },
    }))
  }

  const runResult = await engine.run(input.context as Record<string, unknown>)
  const passedRuleIds = new Set(
    (runResult.events || [])
      .map(item => normalizeString(item?.params?.ruleId))
      .filter(Boolean),
  )

  const results: RuleResult[] = activeRules.map(({ rule }) => {
    const whenResult = rule.when
      ? evalPredicate(rule.when, evalCtx)
      : { matched: true, details: ['when omitted, default true'] }
    const assertResult = evalPredicate(rule.assert, evalCtx)
    const skipped = !whenResult.matched
    const passed = skipped ? true : passedRuleIds.has(rule.id)
    return {
      ruleId: rule.id,
      ruleCode: rule.code,
      severity: rule.severity,
      passed,
      skipped,
      message: rule.messageTemplate || rule.name,
      targetPath: normalizeString(rule.targetPath) || undefined,
      trace: {
        whenMatched: whenResult.matched,
        assertMatched: assertResult.matched,
        details: [...whenResult.details, ...assertResult.details],
      },
    }
  })

  const errors = results.filter(item => item.severity === 'error' && !item.passed && !item.skipped)
  const warnings = results.filter(item => item.severity === 'warning' && !item.passed && !item.skipped)
  const infos = results.filter(item => item.severity === 'info' && !item.passed && !item.skipped)

  const activeObligations = resolveActiveObligations({
    obligations: input.obligations || [],
    bindings: input.obligationBindings || [],
    context: input.context,
  })

  const checklist: ChecklistItem[] = activeObligations.map(({ obligation }) => {
    const whenResult = obligation.when
      ? evalPredicate(obligation.when, evalCtx).matched
      : true
    if (!whenResult) {
      return {
        code: obligation.code,
        name: obligation.name,
        status: obligation.required ? 'optional' : 'optional',
        message: '',
      }
    }

    const satisfied = obligation.satisfiedBy
      ? evalPredicate(obligation.satisfiedBy, evalCtx).matched
      : false

    if (satisfied) {
      return {
        code: obligation.code,
        name: obligation.name,
        status: 'completed',
        message: '',
      }
    }

    return {
      code: obligation.code,
      name: obligation.name,
      status: obligation.required ? 'missing' : 'optional',
      message: obligation.messageWhenMissing || '',
    }
  })

  return {
    engine: {
      passed: errors.length === 0,
      results,
      errors,
      warnings,
      infos,
    },
    checklist,
  }
}
