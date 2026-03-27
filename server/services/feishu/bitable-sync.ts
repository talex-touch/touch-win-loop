import type { H3Event } from 'h3'
import type { FeishuBitableRecord } from '~~/server/services/feishu/client'
import type { Queryable } from '~~/server/utils/db'
import type {
  ContestLevel,
  FeishuBitableTaskTargetType,
  FeishuFieldInspectionItem,
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
  ScopeType,
} from '~~/shared/types/domain'
import jsonata from 'jsonata'
import { getFeishuTenantAccessToken, listFeishuBitableRecords } from '~~/server/services/feishu/client'
import {
  createAdminContest,
  createAdminResource,
  createAdminTrack,
  patchAdminContest,
  patchAdminResource,
  patchAdminTrack,
} from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import {
  completeFeishuBitableSyncRun,
  createFeishuBitableSyncRun,
  getFeishuBitableTaskById,
  getFeishuExternalRef,
  readFeishuIntegrationConfig,
  upsertFeishuExternalRef,
  upsertFeishuSyncIssue,
} from '~~/server/utils/feishu-integration-store'

type SyncTriggerSource = 'manual' | 'event'

interface SyncSummary {
  fetchedCount: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  errors: Array<{ recordId: string, message: string }>
}

interface NormalizedMapping {
  fieldMap: Record<string, string>
  computedMap: Record<string, string>
  externalIdField: string
  contestExternalIdField: string
  trackExternalIdField: string
  defaults: Record<string, unknown>
  schemaVersion: number
  targetType: FeishuBitableTaskTargetType
}

interface NormalizedOptions {
  contestId: string
  defaultVisibility: 'internal' | 'public'
  defaultStatus: ResourceStatus
  defaultResourceCategory: ResourceCategory
  defaultResourceAccessLevel: ResourceAvailability
  raw: Record<string, unknown>
}

interface RecordValueResolver {
  getValue: (key: string) => Promise<unknown>
  getText: (key: string) => Promise<string>
  getStringArray: (key: string) => Promise<string[]>
  getSpecialText: (key: 'externalId' | 'contestExternalId' | 'trackExternalId') => Promise<string>
}

interface ApplyRecordResult {
  status: 'created' | 'updated' | 'skipped'
  externalId: string
  reasonCode?: string
  message?: string
  payload?: Record<string, unknown>
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw as Record<string, unknown>
}

function toText(raw: unknown): string {
  if (typeof raw === 'string')
    return raw.trim()
  if (typeof raw === 'number' || typeof raw === 'boolean')
    return String(raw).trim()
  return ''
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const result: string[] = []
    for (const item of raw) {
      const normalized = toText(typeof item === 'object' && item ? ((item as any).text ?? (item as any).name ?? item) : item)
      if (normalized)
        result.push(normalized)
    }
    return result
  }
  const single = toText(raw)
  if (!single)
    return []
  if (single.includes('|'))
    return single.split('|').map(item => item.trim()).filter(Boolean)
  return [single]
}

const jsonataExpressionCache = new Map<string, ReturnType<typeof jsonata>>()

async function evaluateJsonataExpression(input: {
  expression: string
  payload: Record<string, unknown>
}): Promise<unknown> {
  const expressionText = toText(input.expression)
  if (!expressionText)
    return undefined

  let compiled = jsonataExpressionCache.get(expressionText)
  if (!compiled) {
    compiled = jsonata(expressionText)
    jsonataExpressionCache.set(expressionText, compiled)
  }
  return compiled.evaluate(input.payload)
}

function normalizeSpecialText(raw: unknown): string {
  if (Array.isArray(raw)) {
    const flattened = toStringArray(raw)
    return flattened[0] || ''
  }
  if (raw && typeof raw === 'object') {
    const objectRaw = raw as Record<string, unknown>
    return toText(objectRaw.text ?? objectRaw.name ?? '')
  }
  return toText(raw)
}

function pickField(record: FeishuBitableRecord, fieldName: string): unknown {
  const normalizedField = String(fieldName || '').trim()
  if (!normalizedField)
    return undefined
  return record.fields?.[normalizedField]
}

function pickFieldText(record: FeishuBitableRecord, fieldName: string): string {
  const raw = pickField(record, fieldName)
  return normalizeSpecialText(raw)
}

function mapContestLevel(raw: string): ContestLevel {
  const value = String(raw || '').trim().toLowerCase()
  if (!value)
    return 'national'
  if (value.includes('national') || value.includes('国'))
    return 'national'
  if (value.includes('provincial') || value.includes('省'))
    return 'provincial'
  if (value.includes('school') || value.includes('校'))
    return 'school'
  if (value.includes('industry') || value.includes('行业'))
    return 'industry'
  return 'national'
}

function mapResourceCategory(raw: string, fallback: ResourceCategory): ResourceCategory {
  const value = String(raw || '').trim().toLowerCase()
  const dictionary: Record<string, ResourceCategory> = {
    basic_info: 'basic_info',
    timeline: 'timeline',
    tracks: 'tracks',
    scoring: 'scoring',
    past_questions: 'past_questions',
    awarded_works: 'awarded_works',
    templates: 'templates',
    faq: 'faq',
    judge_guidelines: 'judge_guidelines',
    track_details: 'track_details',
    ai_prompts: 'ai_prompts',
    submission_examples: 'submission_examples',
    policy_notice: 'policy_notice',
    compliance: 'compliance',
  }
  if (dictionary[value])
    return dictionary[value]

  if (value.includes('时间'))
    return 'timeline'
  if (value.includes('赛道'))
    return 'tracks'
  if (value.includes('评分'))
    return 'scoring'
  if (value.includes('真题'))
    return 'past_questions'
  if (value.includes('获奖'))
    return 'awarded_works'
  if (value.includes('模板'))
    return 'templates'
  if (value.includes('答疑') || value.includes('faq'))
    return 'faq'
  if (value.includes('评审'))
    return 'judge_guidelines'
  if (value.includes('提示词'))
    return 'ai_prompts'
  if (value.includes('政策'))
    return 'policy_notice'
  if (value.includes('合规'))
    return 'compliance'
  return fallback
}

function normalizeFieldMap(raw: unknown): Record<string, string> {
  const source = parseJsonObject(raw)
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(source))
    result[key] = toText(value)
  return result
}

function normalizeScopeType(raw: unknown): ScopeType {
  const value = toText(raw)
  if (['global', 'activity', 'instance', 'region', 'stage', 'track', 'policy'].includes(value))
    return value as ScopeType
  return 'global'
}

function parseScopeCandidates(source: Record<string, unknown>, keys: string[]): string[] {
  const candidates: string[] = []
  for (const key of keys) {
    const value = source[key]
    if (value === undefined || value === null)
      continue
    candidates.push(...toStringArray(value))
    const asText = toText(value)
    if (asText)
      candidates.push(asText)
  }
  return [...new Set(candidates.filter(Boolean))]
}

function shouldApplyLayer(input: {
  scopeType: ScopeType
  scopeValue: string
  optionsRaw: Record<string, unknown>
  targetType: FeishuBitableTaskTargetType
}): boolean {
  if (input.scopeType === 'global')
    return true

  const expected = toText(input.scopeValue)
  if (!expected || expected === '*')
    return true
  if (expected === input.targetType)
    return true

  const candidates = input.scopeType === 'activity'
    ? parseScopeCandidates(input.optionsRaw, ['activityId', 'activityType', 'contestId'])
    : input.scopeType === 'instance'
      ? parseScopeCandidates(input.optionsRaw, ['instanceId', 'contestId'])
      : input.scopeType === 'region'
        ? parseScopeCandidates(input.optionsRaw, ['region'])
        : input.scopeType === 'stage'
          ? parseScopeCandidates(input.optionsRaw, ['stage'])
          : input.scopeType === 'track'
            ? parseScopeCandidates(input.optionsRaw, ['track', 'trackId', 'contestTrackId'])
            : parseScopeCandidates(input.optionsRaw, ['policy', 'policyId'])

  return candidates.includes(expected)
}

function inferBindingKey(input: {
  key: string
  targetPath: string
}): string {
  const direct = toText(input.key)
  if (direct)
    return direct

  const targetPath = toText(input.targetPath)
  if (!targetPath)
    return ''
  const suffix = targetPath.split('.').filter(Boolean).pop() || ''
  const normalizedSuffix = toText(suffix)
  if (!normalizedSuffix)
    return ''

  const aliasMap: Record<string, string> = {
    sourceLink: 'url',
    sourceUrl: 'url',
    contestId: 'contestExternalId',
    contestExternalId: 'contestExternalId',
    trackId: 'trackExternalId',
    trackExternalId: 'trackExternalId',
    externalId: 'externalId',
  }
  return aliasMap[normalizedSuffix] || normalizedSuffix
}

function normalizeMapping(raw: unknown, optionsRaw: unknown, targetType: FeishuBitableTaskTargetType): NormalizedMapping {
  const source = parseJsonObject(raw)
  const options = parseJsonObject(optionsRaw)
  const schemaVersion = Number(source.schemaVersion || 0)
  const externalIdFieldV1 = toText(source.externalIdField)
  const contestExternalIdFieldV1 = toText(source.contestExternalIdField)
  const trackExternalIdFieldV1 = toText(source.trackExternalIdField)
  const defaultsV1 = parseJsonObject(source.defaults)
  const fieldMapV1 = normalizeFieldMap(source.fieldMap)
  const computedMapV1 = normalizeFieldMap(source.computedMap)

  if (schemaVersion !== 2 || !Array.isArray(source.layers)) {
    return {
      fieldMap: fieldMapV1,
      computedMap: computedMapV1,
      externalIdField: externalIdFieldV1,
      contestExternalIdField: contestExternalIdFieldV1,
      trackExternalIdField: trackExternalIdFieldV1,
      defaults: defaultsV1,
      schemaVersion: 1,
      targetType,
    }
  }

  const fieldMap: Record<string, string> = {}
  const computedMap: Record<string, string> = {}
  const defaults: Record<string, unknown> = {}
  const layers = (Array.isArray(source.layers) ? source.layers : [])
    .map(item => parseJsonObject(item))
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
  for (const layer of layers) {
    if (layer.enabled === false)
      continue
    if (!shouldApplyLayer({
      scopeType: normalizeScopeType(layer.scopeType),
      scopeValue: toText(layer.scopeValue) || '*',
      optionsRaw: options,
      targetType,
    })) { continue }

    Object.assign(fieldMap, normalizeFieldMap(layer.fieldMap))
    Object.assign(defaults, parseJsonObject(layer.defaults))

    const bindings = Array.isArray(layer.fieldBindings) ? layer.fieldBindings : []
    for (const bindingRaw of bindings) {
      const binding = parseJsonObject(bindingRaw)
      const key = inferBindingKey({
        key: toText(binding.key),
        targetPath: toText(binding.targetPath),
      })
      if (!key)
        continue
      const sourceField = toText(binding.sourceField)
      const transform = toText(binding.transform)
      if (sourceField)
        fieldMap[key] = sourceField
      if (transform)
        computedMap[key] = transform
    }
  }

  const match = parseJsonObject(source.match)
  return {
    fieldMap,
    computedMap,
    externalIdField: toText(match.externalIdField) || externalIdFieldV1,
    contestExternalIdField: toText(match.contestExternalIdField) || contestExternalIdFieldV1,
    trackExternalIdField: toText(match.trackExternalIdField) || trackExternalIdFieldV1,
    defaults,
    schemaVersion: 2,
    targetType,
  }
}

function normalizeOptions(raw: unknown, mappingDefaults: Record<string, unknown> = {}): NormalizedOptions {
  const source = parseJsonObject(raw)
  const merged = {
    ...parseJsonObject(mappingDefaults),
    ...source,
  }
  const defaultVisibility = toText(merged.defaultVisibility).toLowerCase() === 'public' ? 'public' : 'internal'
  const defaultStatusCandidate = toText(merged.defaultStatus).toLowerCase()
  const defaultStatus: ResourceStatus = ['active', 'invalid', 'pending_verify', 'archived'].includes(defaultStatusCandidate)
    ? (defaultStatusCandidate as ResourceStatus)
    : 'active'
  const accessLevelCandidate = toText(merged.defaultResourceAccessLevel).toLowerCase()
  const defaultResourceAccessLevel: ResourceAvailability = ['public', 'login_required', 'unavailable'].includes(accessLevelCandidate)
    ? (accessLevelCandidate as ResourceAvailability)
    : 'public'

  return {
    contestId: toText(merged.contestId),
    defaultVisibility,
    defaultStatus,
    defaultResourceCategory: mapResourceCategory(toText(merged.defaultResourceCategory), 'basic_info'),
    defaultResourceAccessLevel,
    raw: merged,
  }
}

function createRecordResolver(record: FeishuBitableRecord, mapping: NormalizedMapping): RecordValueResolver {
  const valueCache = new Map<string, Promise<unknown>>()

  const evaluate = (key: string): Promise<unknown> => {
    const normalizedKey = toText(key)
    const cacheKey = normalizedKey || '__empty__'
    const cached = valueCache.get(cacheKey)
    if (cached)
      return cached

    const computed = (async () => {
      if (!normalizedKey)
        return undefined

      const computedExpr = toText(mapping.computedMap[normalizedKey])
      if (computedExpr) {
        return evaluateJsonataExpression({
          expression: computedExpr,
          payload: {
            recordId: record.recordId,
            fields: record.fields,
            record,
            defaults: mapping.defaults,
            targetType: mapping.targetType,
            now: new Date().toISOString(),
          },
        })
      }

      const sourceField = toText(mapping.fieldMap[normalizedKey])
      if (sourceField)
        return pickField(record, sourceField)

      if (Object.prototype.hasOwnProperty.call(mapping.defaults, normalizedKey))
        return mapping.defaults[normalizedKey]
      return undefined
    })()

    valueCache.set(cacheKey, computed)
    return computed
  }

  const readSpecialText = async (key: 'externalId' | 'contestExternalId' | 'trackExternalId'): Promise<string> => {
    const computedExpr = toText(mapping.computedMap[key])
    if (computedExpr) {
      const fromExpr = await evaluateJsonataExpression({
        expression: computedExpr,
        payload: {
          recordId: record.recordId,
          fields: record.fields,
          record,
          defaults: mapping.defaults,
          targetType: mapping.targetType,
          now: new Date().toISOString(),
        },
      }).catch(() => '')
      const normalizedFromExpr = normalizeSpecialText(fromExpr)
      if (normalizedFromExpr)
        return normalizedFromExpr
    }

    const sourceField = key === 'externalId'
      ? mapping.externalIdField
      : key === 'contestExternalId'
        ? mapping.contestExternalIdField
        : mapping.trackExternalIdField
    if (!sourceField)
      return ''
    return pickFieldText(record, sourceField)
  }

  return {
    getValue: evaluate,
    async getText(key) {
      const raw = await evaluate(key)
      return normalizeSpecialText(raw)
    },
    async getStringArray(key) {
      const raw = await evaluate(key)
      return toStringArray(raw)
    },
    getSpecialText: readSpecialText,
  }
}

async function resolveExternalId(record: FeishuBitableRecord, resolver: RecordValueResolver): Promise<string> {
  const fromMapping = await resolver.getSpecialText('externalId')
  return fromMapping || record.recordId
}

async function resolveContestIdByExternal(
  db: Queryable,
  input: {
    options: NormalizedOptions
    resolver: RecordValueResolver
  },
): Promise<{ contestId: string | null, contestExternalId: string }> {
  const staticContestId = String(input.options.contestId || '').trim()
  if (staticContestId) {
    return {
      contestId: staticContestId,
      contestExternalId: '',
    }
  }

  const contestExternalId = await input.resolver.getSpecialText('contestExternalId')
  if (!contestExternalId) {
    return {
      contestId: null,
      contestExternalId: '',
    }
  }

  const contestRef = await getFeishuExternalRef(db, {
    scope: 'contest',
    externalId: contestExternalId,
  })
  return {
    contestId: contestRef?.entityId || null,
    contestExternalId,
  }
}

async function resolveTrackIdByExternal(
  db: Queryable,
  input: {
    resolver: RecordValueResolver
  },
): Promise<{ trackId: string | null, trackExternalId: string }> {
  const trackExternalId = await input.resolver.getSpecialText('trackExternalId')
  if (!trackExternalId) {
    return {
      trackId: null,
      trackExternalId: '',
    }
  }

  const trackRef = await getFeishuExternalRef(db, {
    scope: 'track',
    externalId: trackExternalId,
  })
  return {
    trackId: trackRef?.entityId || null,
    trackExternalId,
  }
}

function buildSummaryBase(records: FeishuBitableRecord[]): SyncSummary {
  return {
    fetchedCount: records.length,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
  }
}

async function applyContestRecord(
  db: Queryable,
  input: {
    actorUserId: string
    taskId: string
    record: FeishuBitableRecord
    externalId: string
    mapping: NormalizedMapping
    options: NormalizedOptions
    resolver: RecordValueResolver
    dryRun: boolean
  },
): Promise<ApplyRecordResult> {
  const name = await input.resolver.getText('name')
  const officialUrl = await input.resolver.getText('officialUrl')
  if (!name || !officialUrl) {
    return {
      status: 'skipped',
      externalId: input.externalId,
      reasonCode: 'MISSING_REQUIRED_FIELD',
      message: '赛事记录缺少必要字段（name 或 officialUrl）。',
      payload: {
        hasName: Boolean(name),
        hasOfficialUrl: Boolean(officialUrl),
      },
    }
  }

  const existingRef = await getFeishuExternalRef(db, {
    scope: 'contest',
    externalId: input.externalId,
  })

  if (existingRef) {
    if (!input.dryRun) {
      await patchAdminContest(db, {
        actorUserId: input.actorUserId,
        contestId: existingRef.entityId,
        patch: {
          name,
          level: mapContestLevel(await input.resolver.getText('level')),
          organizer: await input.resolver.getText('organizer'),
          coOrganizer: await input.resolver.getText('coOrganizer'),
          officialUrl,
          summary: await input.resolver.getText('summary'),
          participantRequirements: await input.resolver.getText('participantRequirements'),
          teamRule: await input.resolver.getText('teamRule'),
          currentSeason: await input.resolver.getText('currentSeason'),
          disciplines: await input.resolver.getStringArray('disciplines'),
          aliases: await input.resolver.getStringArray('aliases'),
          keywords: await input.resolver.getStringArray('keywords'),
          recommendedFor: await input.resolver.getStringArray('recommendedFor'),
          visibility: input.options.defaultVisibility,
        },
      })
      await upsertFeishuExternalRef(db, {
        taskId: input.taskId,
        scope: 'contest',
        externalId: input.externalId,
        entityId: existingRef.entityId,
      })
    }
    return {
      status: 'updated',
      externalId: input.externalId,
    }
  }

  if (!input.dryRun) {
    const created = await createAdminContest(db, {
      actorUserId: input.actorUserId,
      name,
      level: mapContestLevel(await input.resolver.getText('level')),
      organizer: await input.resolver.getText('organizer'),
      coOrganizer: await input.resolver.getText('coOrganizer'),
      officialUrl,
      summary: await input.resolver.getText('summary'),
      participantRequirements: await input.resolver.getText('participantRequirements'),
      teamRule: await input.resolver.getText('teamRule'),
      currentSeason: await input.resolver.getText('currentSeason'),
      disciplines: await input.resolver.getStringArray('disciplines'),
      aliases: await input.resolver.getStringArray('aliases'),
      keywords: await input.resolver.getStringArray('keywords'),
      recommendedFor: await input.resolver.getStringArray('recommendedFor'),
      visibility: input.options.defaultVisibility,
    })
    await upsertFeishuExternalRef(db, {
      taskId: input.taskId,
      scope: 'contest',
      externalId: input.externalId,
      entityId: created.id,
    })
  }
  return {
    status: 'created',
    externalId: input.externalId,
  }
}

async function applyTrackRecord(
  db: Queryable,
  input: {
    actorUserId: string
    taskId: string
    record: FeishuBitableRecord
    externalId: string
    mapping: NormalizedMapping
    options: NormalizedOptions
    resolver: RecordValueResolver
    dryRun: boolean
  },
): Promise<ApplyRecordResult> {
  const contestLink = await resolveContestIdByExternal(db, {
    options: input.options,
    resolver: input.resolver,
  })
  if (!contestLink.contestId) {
    return {
      status: 'skipped',
      externalId: input.externalId,
      reasonCode: 'CONTEST_REF_NOT_FOUND',
      message: '赛道记录未找到关联赛事（contestExternalId 未映射或未完成绑定）。',
      payload: {
        contestExternalId: contestLink.contestExternalId,
      },
    }
  }

  const name = await input.resolver.getText('name')
  if (!name) {
    return {
      status: 'skipped',
      externalId: input.externalId,
      reasonCode: 'MISSING_REQUIRED_FIELD',
      message: '赛道记录缺少必要字段 name。',
      payload: {
        hasName: false,
      },
    }
  }

  const existingRef = await getFeishuExternalRef(db, {
    scope: 'track',
    externalId: input.externalId,
  })

  if (existingRef) {
    if (!input.dryRun) {
      await patchAdminTrack(db, {
        actorUserId: input.actorUserId,
        contestId: contestLink.contestId,
        trackId: existingRef.entityId,
        patch: {
          name,
          summary: await input.resolver.getText('summary'),
          suitableMajors: await input.resolver.getStringArray('suitableMajors'),
          deliverableTypes: await input.resolver.getStringArray('deliverableTypes'),
          sortOrder: Number(await input.resolver.getText('sortOrder') || 0),
        },
      })
      await upsertFeishuExternalRef(db, {
        taskId: input.taskId,
        scope: 'track',
        externalId: input.externalId,
        entityId: existingRef.entityId,
        metadata: {
          contestId: contestLink.contestId,
        },
      })
    }
    return {
      status: 'updated',
      externalId: input.externalId,
    }
  }

  if (!input.dryRun) {
    const created = await createAdminTrack(db, {
      actorUserId: input.actorUserId,
      contestId: contestLink.contestId,
      name,
      summary: await input.resolver.getText('summary'),
      suitableMajors: await input.resolver.getStringArray('suitableMajors'),
      deliverableTypes: await input.resolver.getStringArray('deliverableTypes'),
      sortOrder: Number(await input.resolver.getText('sortOrder') || 0),
    })
    await upsertFeishuExternalRef(db, {
      taskId: input.taskId,
      scope: 'track',
      externalId: input.externalId,
      entityId: created.id,
      metadata: {
        contestId: contestLink.contestId,
      },
    })
  }
  return {
    status: 'created',
    externalId: input.externalId,
  }
}

async function applyResourceRecord(
  db: Queryable,
  input: {
    actorUserId: string
    taskId: string
    record: FeishuBitableRecord
    externalId: string
    mapping: NormalizedMapping
    options: NormalizedOptions
    resolver: RecordValueResolver
    dryRun: boolean
  },
): Promise<ApplyRecordResult> {
  const contestLink = await resolveContestIdByExternal(db, {
    options: input.options,
    resolver: input.resolver,
  })
  if (!contestLink.contestId) {
    return {
      status: 'skipped',
      externalId: input.externalId,
      reasonCode: 'CONTEST_REF_NOT_FOUND',
      message: '资源记录未找到关联赛事（contestExternalId 未映射或未完成绑定）。',
      payload: {
        contestExternalId: contestLink.contestExternalId,
      },
    }
  }

  const title = await input.resolver.getText('title') || await input.resolver.getText('name')
  if (!title) {
    return {
      status: 'skipped',
      externalId: input.externalId,
      reasonCode: 'MISSING_REQUIRED_FIELD',
      message: '资源记录缺少必要字段 title/name。',
      payload: {
        hasTitle: false,
      },
    }
  }

  const category = mapResourceCategory(
    await input.resolver.getText('category'),
    input.options.defaultResourceCategory,
  )
  const trackLink = await resolveTrackIdByExternal(db, {
    resolver: input.resolver,
  })
  if (trackLink.trackExternalId && !trackLink.trackId) {
    return {
      status: 'skipped',
      externalId: input.externalId,
      reasonCode: 'TRACK_REF_NOT_FOUND',
      message: '资源记录存在 trackExternalId，但未找到对应赛道绑定。',
      payload: {
        trackExternalId: trackLink.trackExternalId,
      },
    }
  }

  const year = Number(await input.resolver.getText('year') || new Date().getFullYear())

  const existingRef = await getFeishuExternalRef(db, {
    scope: 'resource',
    externalId: input.externalId,
  })

  if (existingRef) {
    if (!input.dryRun) {
      await patchAdminResource(db, {
        actorUserId: input.actorUserId,
        contestId: contestLink.contestId,
        resourceId: existingRef.entityId,
        patch: {
          category,
          title,
          year,
          url: await input.resolver.getText('url'),
          sourceType: await input.resolver.getText('sourceType') || 'feishu_bitable',
          summary: await input.resolver.getText('summary'),
          content: await input.resolver.getText('content'),
          status: input.options.defaultStatus,
          metadata: {
            trackId: trackLink.trackId || '',
            source: 'feishu_bitable',
            recordId: input.record.recordId,
          },
          accessLevel: input.options.defaultResourceAccessLevel,
        },
      })
      await upsertFeishuExternalRef(db, {
        taskId: input.taskId,
        scope: 'resource',
        externalId: input.externalId,
        entityId: existingRef.entityId,
        metadata: {
          contestId: contestLink.contestId,
          trackId: trackLink.trackId || '',
        },
      })
    }
    return {
      status: 'updated',
      externalId: input.externalId,
    }
  }

  if (!input.dryRun) {
    const created = await createAdminResource(db, {
      actorUserId: input.actorUserId,
      contestId: contestLink.contestId,
      category,
      title,
      year,
      url: await input.resolver.getText('url'),
      sourceType: await input.resolver.getText('sourceType') || 'feishu_bitable',
      summary: await input.resolver.getText('summary'),
      content: await input.resolver.getText('content'),
      status: input.options.defaultStatus,
      metadata: {
        trackId: trackLink.trackId || '',
        source: 'feishu_bitable',
        recordId: input.record.recordId,
      },
      accessLevel: input.options.defaultResourceAccessLevel,
    })
    await upsertFeishuExternalRef(db, {
      taskId: input.taskId,
      scope: 'resource',
      externalId: input.externalId,
      entityId: created.id,
      metadata: {
        contestId: contestLink.contestId,
        trackId: trackLink.trackId || '',
      },
    })
  }
  return {
    status: 'created',
    externalId: input.externalId,
  }
}

async function applySingleRecord(
  db: Queryable,
  input: {
    actorUserId: string
    taskId: string
    taskTargetType: FeishuBitableTaskTargetType
    record: FeishuBitableRecord
    mapping: NormalizedMapping
    options: NormalizedOptions
    dryRun: boolean
  },
): Promise<ApplyRecordResult> {
  const resolver = createRecordResolver(input.record, input.mapping)
  const externalId = await resolveExternalId(input.record, resolver)
  if (!externalId) {
    return {
      status: 'skipped',
      externalId: input.record.recordId,
      reasonCode: 'EXTERNAL_ID_MISSING',
      message: '记录缺少 externalId，且 recordId 不可用。',
      payload: {},
    }
  }

  if (input.taskTargetType === 'contest') {
    return applyContestRecord(db, {
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      record: input.record,
      externalId,
      mapping: input.mapping,
      options: input.options,
      resolver,
      dryRun: input.dryRun,
    })
  }

  if (input.taskTargetType === 'track') {
    return applyTrackRecord(db, {
      actorUserId: input.actorUserId,
      taskId: input.taskId,
      record: input.record,
      externalId,
      mapping: input.mapping,
      options: input.options,
      resolver,
      dryRun: input.dryRun,
    })
  }

  return applyResourceRecord(db, {
    actorUserId: input.actorUserId,
    taskId: input.taskId,
    record: input.record,
    externalId,
    mapping: input.mapping,
    options: input.options,
    resolver,
    dryRun: input.dryRun,
  })
}

async function executeRecords(
  db: Queryable,
  input: {
    actorUserId: string
    taskId: string
    taskTargetType: FeishuBitableTaskTargetType
    mapping: NormalizedMapping
    options: NormalizedOptions
    records: FeishuBitableRecord[]
    dryRun: boolean
  },
): Promise<SyncSummary> {
  const summary = buildSummaryBase(input.records)

  for (const record of input.records) {
    try {
      const result = await applySingleRecord(db, {
        actorUserId: input.actorUserId,
        taskId: input.taskId,
        taskTargetType: input.taskTargetType,
        record,
        mapping: input.mapping,
        options: input.options,
        dryRun: input.dryRun,
      })

      if (result.status === 'created')
        summary.createdCount += 1
      else if (result.status === 'updated')
        summary.updatedCount += 1
      else
        summary.skippedCount += 1

      if (!input.dryRun && result.status === 'skipped' && result.reasonCode) {
        await upsertFeishuSyncIssue(db, {
          taskId: input.taskId,
          targetType: input.taskTargetType,
          recordId: record.recordId,
          externalId: result.externalId || record.recordId,
          reasonCode: result.reasonCode,
          message: result.message || '记录未通过同步校验。',
          payload: {
            ...(result.payload || {}),
            schemaVersion: input.mapping.schemaVersion,
            mappingTargetType: input.mapping.targetType,
          },
        })
      }
    }
    catch (error) {
      summary.errorCount += 1
      summary.errors.push({
        recordId: record.recordId,
        message: error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR'),
      })
    }
  }

  return summary
}

export async function previewFeishuBitableTask(
  event: H3Event,
  input: {
    taskId: string
    actorUserId: string
  },
): Promise<SyncSummary> {
  const configAndTask = await withClient(event, async (db) => {
    const config = await readFeishuIntegrationConfig(db)
    const task = await getFeishuBitableTaskById(db, input.taskId)
    return { config, task }
  })

  if (!configAndTask.config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')
  if (!configAndTask.task)
    throw new Error('FEISHU_BITABLE_TASK_NOT_FOUND')
  if (!configAndTask.task.isActive)
    throw new Error('FEISHU_BITABLE_TASK_INACTIVE')
  const task = configAndTask.task

  const tenantAccessToken = await getFeishuTenantAccessToken(configAndTask.config)
  const records = await listFeishuBitableRecords({
    tenantAccessToken,
    appToken: task.appToken,
    tableId: task.tableId,
    viewId: task.viewId,
  })

  return withClient(event, async (db) => {
    const mapping = normalizeMapping(task.mapping, task.options, task.targetType)
    const options = normalizeOptions(task.options, mapping.defaults)
    return executeRecords(db, {
      actorUserId: input.actorUserId,
      taskId: task.id,
      taskTargetType: task.targetType,
      mapping,
      options,
      records,
      dryRun: true,
    })
  })
}

export async function runFeishuBitableTask(
  event: H3Event,
  input: {
    taskId: string
    actorUserId: string
    triggerSource?: SyncTriggerSource
  },
): Promise<SyncSummary & { runId: string, status: 'success' | 'partial_success' | 'failed' }> {
  const triggerSource = input.triggerSource || 'manual'
  const configAndTask = await withClient(event, async (db) => {
    const config = await readFeishuIntegrationConfig(db)
    const task = await getFeishuBitableTaskById(db, input.taskId)
    return { config, task }
  })

  if (!configAndTask.config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')
  if (!configAndTask.task)
    throw new Error('FEISHU_BITABLE_TASK_NOT_FOUND')
  if (!configAndTask.task.isActive)
    throw new Error('FEISHU_BITABLE_TASK_INACTIVE')
  const task = configAndTask.task

  const runId = await withClient(event, async (db) => {
    return createFeishuBitableSyncRun(db, {
      taskId: task.id,
      triggerSource,
      createdByUserId: input.actorUserId,
    })
  })

  try {
    const tenantAccessToken = await getFeishuTenantAccessToken(configAndTask.config)
    const records = await listFeishuBitableRecords({
      tenantAccessToken,
      appToken: task.appToken,
      tableId: task.tableId,
      viewId: task.viewId,
    })

    const summary = await withTransaction(event, async (db) => {
      const mapping = normalizeMapping(task.mapping, task.options, task.targetType)
      const options = normalizeOptions(task.options, mapping.defaults)
      return executeRecords(db, {
        actorUserId: input.actorUserId,
        taskId: task.id,
        taskTargetType: task.targetType,
        mapping,
        options,
        records,
        dryRun: false,
      })
    })

    const status = summary.errorCount > 0
      ? ((summary.createdCount > 0 || summary.updatedCount > 0) ? 'partial_success' : 'failed')
      : 'success'

    await withClient(event, async (db) => {
      await completeFeishuBitableSyncRun(db, {
        runId,
        taskId: task.id,
        status,
        fetchedCount: summary.fetchedCount,
        createdCount: summary.createdCount,
        updatedCount: summary.updatedCount,
        skippedCount: summary.skippedCount,
        errorCount: summary.errorCount,
        errorMessage: summary.errors.slice(0, 5).map(item => `${item.recordId}: ${item.message}`).join('；'),
      })
    })

    return {
      ...summary,
      runId,
      status,
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR')
    await withClient(event, async (db) => {
      await completeFeishuBitableSyncRun(db, {
        runId,
        taskId: task.id,
        status: 'failed',
        errorCount: 1,
        errorMessage: message,
      })
    })
    throw error
  }
}

function toInspectionValues(raw: unknown): string[] {
  if (Array.isArray(raw))
    return toStringArray(raw).slice(0, 3)

  if (raw && typeof raw === 'object') {
    const objectRaw = raw as Record<string, unknown>
    const direct = normalizeSpecialText(objectRaw.text ?? objectRaw.name ?? '')
    if (direct)
      return [direct]
    try {
      const serialized = JSON.stringify(raw)
      return serialized ? [serialized.slice(0, 120)] : []
    }
    catch {
      return []
    }
  }

  const text = toText(raw)
  return text ? [text] : []
}

export async function inspectFeishuBitableTaskFields(
  event: H3Event,
  input: {
    taskId: string
    sampleRecords?: number
  },
): Promise<FeishuFieldInspectionItem[]> {
  const configAndTask = await withClient(event, async (db) => {
    const config = await readFeishuIntegrationConfig(db)
    const task = await getFeishuBitableTaskById(db, input.taskId)
    return { config, task }
  })

  if (!configAndTask.config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')
  if (!configAndTask.task)
    throw new Error('FEISHU_BITABLE_TASK_NOT_FOUND')
  if (!configAndTask.task.isActive)
    throw new Error('FEISHU_BITABLE_TASK_INACTIVE')

  const task = configAndTask.task
  const tenantAccessToken = await getFeishuTenantAccessToken(configAndTask.config)
  const records = await listFeishuBitableRecords({
    tenantAccessToken,
    appToken: task.appToken,
    tableId: task.tableId,
    viewId: task.viewId,
  })

  const maxRecords = Math.max(1, Math.min(500, Number(input.sampleRecords || 120)))
  const fieldMap = new Map<string, { count: number, samples: Set<string> }>()
  for (const record of records.slice(0, maxRecords)) {
    for (const [fieldName, rawValue] of Object.entries(record.fields || {})) {
      const normalizedFieldName = toText(fieldName)
      if (!normalizedFieldName)
        continue

      const bucket = fieldMap.get(normalizedFieldName) || { count: 0, samples: new Set<string>() }
      bucket.count += 1
      for (const sample of toInspectionValues(rawValue)) {
        if (!sample || bucket.samples.size >= 5)
          continue
        bucket.samples.add(sample)
      }
      fieldMap.set(normalizedFieldName, bucket)
    }
  }

  return [...fieldMap.entries()]
    .map(([fieldName, bucket]) => ({
      fieldName,
      sampleValues: [...bucket.samples],
      sampleCount: bucket.count,
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.fieldName.localeCompare(b.fieldName))
}
