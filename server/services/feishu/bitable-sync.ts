import type { H3Event } from 'h3'
import type { FeishuBitableRecord } from '~~/server/services/feishu/client'
import type { Queryable } from '~~/server/utils/db'
import type {
  ContestLevel,
  FeishuBitableSourceConfig,
  FeishuBitableSyncItemEntityType,
  FeishuBitableSyncItemPreviewRequest,
  FeishuBitableSyncItemPreviewResult,
  FeishuBitableSyncRunTriggerSource,
  FeishuBitableTablePreview,
  FeishuFieldDiagnosticItem,
  FeishuFieldInspectionItem,
  FeishuMappedPreviewRow,
  FeishuPreviewIssueCounts,
  FeishuSyncRunMode,
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
  ScopeType,
} from '~~/shared/types/domain'
import { createHash } from 'node:crypto'
import jsonata from 'jsonata'
import {
  batchUpdateFeishuBitableRecords,
  getFeishuTenantAccessToken,
  listFeishuBitableRecords,
  listFeishuBitableRecordsByIds,
  listFeishuBitableTables,
  listFeishuBitableViews,
} from '~~/server/services/feishu/client'
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
  completeFeishuBitableSyncItemRun,
  createFeishuBitableSyncItemRun,
  enqueueFeishuPostSyncTask,
  getFeishuBitableSyncById,
  getFeishuBitableSyncItemById,
  getFeishuExternalRef,
  readFeishuIntegrationConfig,
  upsertFeishuExternalRef,
  upsertFeishuSyncIssue,
} from '~~/server/utils/feishu-integration-store'

interface SyncSummary {
  fetchedCount: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  writebackSuccessCount: number
  writebackErrorCount: number
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
  entityType: FeishuBitableSyncItemEntityType
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

interface RecordResolverTransformError {
  key: string
  recordId: string
  transform: string
  message: string
}

interface CreateRecordResolverOptions {
  onTransformError?: (error: RecordResolverTransformError) => void
}

interface ApplyRecordResult {
  status: 'created' | 'updated' | 'skipped'
  externalId: string
  reasonCode?: string
  message?: string
  payload?: Record<string, unknown>
}

interface NormalizedWriteback {
  enabled: boolean
  fields: {
    status: string
    syncedAt: string
    errorMessage: string
    reasonCode: string
    entityId: string
    runId: string
    triggerSource: string
  }
  values: {
    success: string
    failed: string
    skipped: string
  }
}

const RAW_TABLE_PREVIEW_SAMPLE_LIMIT = 100
const FIELD_INSPECTION_PREVIEW_LIMIT = 120
const MAPPED_PREVIEW_SAMPLE_LIMIT = 20
const FIELD_DIAGNOSTIC_LIMIT = 200
const TRANSFORM_ERROR_LIMIT = 100

const FEISHU_EMBED_ALLOWED_HOSTS = ['feishu.cn']

const TARGET_PREVIEW_FIELDS: Record<FeishuBitableSyncItemEntityType, string[]> = {
  contest: [
    'externalId',
    'name',
    'officialUrl',
    'summary',
    'level',
    'organizer',
    'coOrganizer',
    'participantRequirements',
    'teamRule',
    'currentSeason',
    'disciplines',
    'aliases',
    'keywords',
    'recommendedFor',
  ],
  track: [
    'externalId',
    'contestExternalId',
    'name',
    'summary',
    'suitableMajors',
    'deliverableTypes',
    'sortOrder',
  ],
  resource: [
    'externalId',
    'contestExternalId',
    'trackExternalId',
    'title',
    'name',
    'summary',
    'content',
    'category',
    'url',
    'sourceType',
    'year',
  ],
}

const REQUIRED_TARGET_FIELDS: Record<FeishuBitableSyncItemEntityType, string[]> = {
  contest: ['name', 'officialUrl'],
  track: ['contestExternalId', 'name'],
  resource: ['contestExternalId', 'title', 'url'],
}

const ARRAY_PREVIEW_FIELDS = new Set([
  'disciplines',
  'aliases',
  'keywords',
  'recommendedFor',
  'suitableMajors',
  'deliverableTypes',
])

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw as Record<string, unknown>
}

function hasOwn(source: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
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

function isEntityType(raw: unknown): raw is FeishuBitableSyncItemEntityType {
  return raw === 'contest' || raw === 'track' || raw === 'resource'
}

function resolvePreviewOverrideString(
  override: Record<string, unknown> | null | undefined,
  key: keyof FeishuBitableSourceConfig,
  fallback: string,
): string {
  if (!override || !hasOwn(override, key))
    return fallback
  return toText(override[key])
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

function normalizePreviewCell(raw: unknown): string {
  if (raw === undefined || raw === null)
    return ''
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean')
    return String(raw).trim()
  if (Array.isArray(raw)) {
    return raw
      .map(item => normalizePreviewCell(item))
      .filter(Boolean)
      .join(' | ')
  }
  if (typeof raw === 'object') {
    const source = raw as Record<string, unknown>
    const text = toText(source.text ?? source.name ?? source.url ?? '')
    if (text)
      return text
    try {
      return JSON.stringify(raw)
    }
    catch {
      return ''
    }
  }
  return ''
}

function collectRecordFieldNames(records: FeishuBitableRecord[], limit = records.length): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const record of records.slice(0, Math.max(0, limit))) {
    for (const fieldName of Object.keys(record.fields || {})) {
      const normalized = toText(fieldName)
      if (!normalized || seen.has(normalized))
        continue
      seen.add(normalized)
      names.push(normalized)
    }
  }
  return names
}

function buildTablePreviewRows(
  records: FeishuBitableRecord[],
  columns: string[],
  limit = RAW_TABLE_PREVIEW_SAMPLE_LIMIT,
): Array<Record<string, string>> {
  return records.slice(0, Math.max(0, limit)).map((record) => {
    const row: Record<string, string> = {}
    for (const column of columns)
      row[column] = normalizePreviewCell(record.fields?.[column])
    return row
  })
}

function isAllowedFeishuEmbedHost(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase()
  if (!normalized)
    return false
  return FEISHU_EMBED_ALLOWED_HOSTS.some(host => normalized === host || normalized.endsWith(`.${host}`))
}

function normalizeFeishuEmbedUrl(raw: unknown): string {
  const text = toText(raw)
  if (!text)
    return ''
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:')
      return ''
    if (!isAllowedFeishuEmbedHost(url.hostname))
      return ''
    return url.toString()
  }
  catch {
    return ''
  }
}

function buildFallbackFeishuOpenUrl(source: {
  appToken: string
  tableId: string
  viewId?: string
}): string {
  const url = new URL(`https://feishu.cn/base/${encodeURIComponent(source.appToken)}`)
  if (source.tableId)
    url.searchParams.set('table', source.tableId)
  if (source.viewId)
    url.searchParams.set('view', source.viewId)
  return url.toString()
}

function buildFeishuPreviewLinks(source: FeishuBitableSourceConfig): {
  iframeUrl: string
  openUrl: string
} {
  const safeSourceUrl = normalizeFeishuEmbedUrl(source.sourceUrl)
  const openUrl = safeSourceUrl || buildFallbackFeishuOpenUrl(source)
  return {
    iframeUrl: normalizeFeishuEmbedUrl(openUrl),
    openUrl,
  }
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
  entityType: FeishuBitableSyncItemEntityType
}): boolean {
  if (input.scopeType === 'global')
    return true

  const expected = toText(input.scopeValue)
  if (!expected || expected === '*')
    return true
  if (expected === input.entityType)
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

function normalizeMapping(raw: unknown, optionsRaw: unknown, entityType: FeishuBitableSyncItemEntityType): NormalizedMapping {
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
      entityType,
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
      entityType,
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
    entityType,
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

function normalizeWritebackConfig(raw: unknown): NormalizedWriteback {
  const source = parseJsonObject(raw)
  const fields = parseJsonObject(source.fields)
  const values = parseJsonObject(source.values)
  return {
    enabled: source.enabled !== false,
    fields: {
      status: toText(fields.status),
      syncedAt: toText(fields.syncedAt),
      errorMessage: toText(fields.errorMessage),
      reasonCode: toText(fields.reasonCode),
      entityId: toText(fields.entityId),
      runId: toText(fields.runId),
      triggerSource: toText(fields.triggerSource),
    },
    values: {
      success: toText(values.success) || '已同步',
      failed: toText(values.failed) || '失败',
      skipped: toText(values.skipped) || '跳过',
    },
  }
}

function normalizeWritebackValue(raw: unknown): unknown {
  if (raw === undefined || raw === null)
    return ''
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean')
    return raw
  if (Array.isArray(raw))
    return raw.map(item => normalizeSpecialText(item)).filter(Boolean).join(' | ')
  try {
    return JSON.stringify(raw)
  }
  catch {
    return ''
  }
}

function buildPostSyncSourceHash(input: {
  scope: FeishuBitableSyncItemEntityType
  externalId: string
  record: FeishuBitableRecord
}): string {
  const payload = JSON.stringify({
    scope: input.scope,
    externalId: input.externalId,
    recordId: input.record.recordId,
    fields: input.record.fields || {},
  })
  return createHash('sha256').update(payload).digest('hex')
}

function createRecordResolver(
  record: FeishuBitableRecord,
  mapping: NormalizedMapping,
  options: CreateRecordResolverOptions = {},
): RecordValueResolver {
  const valueCache = new Map<string, Promise<unknown>>()
  const reportTransformError = (key: string, transform: string, error: unknown) => {
    options.onTransformError?.({
      key,
      recordId: record.recordId,
      transform,
      message: error instanceof Error ? error.message : String(error || 'TRANSFORM_ERROR'),
    })
  }

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
        try {
          return await evaluateJsonataExpression({
            expression: computedExpr,
            payload: {
              recordId: record.recordId,
              fields: record.fields,
              record,
              defaults: mapping.defaults,
              entityType: mapping.entityType,
              targetType: mapping.entityType,
              now: new Date().toISOString(),
            },
          })
        }
        catch (error) {
          reportTransformError(normalizedKey, computedExpr, error)
          throw error
        }
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
          entityType: mapping.entityType,
          targetType: mapping.entityType,
          now: new Date().toISOString(),
        },
      }).catch((error) => {
        reportTransformError(key, computedExpr, error)
        return ''
      })
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
    writebackSuccessCount: 0,
    writebackErrorCount: 0,
    errors: [],
  }
}

function createEmptyPreviewIssueCounts(): FeishuPreviewIssueCounts {
  return {
    total: 0,
    externalIdMissing: 0,
    missingRequiredField: 0,
    contestRefNotFound: 0,
    trackRefNotFound: 0,
    transformError: 0,
    sourceFieldMissing: 0,
    writebackFieldMissing: 0,
    mappingEmpty: 0,
    other: 0,
  }
}

function finalizePreviewIssueCounts(counts: FeishuPreviewIssueCounts): FeishuPreviewIssueCounts {
  counts.total = counts.externalIdMissing
    + counts.missingRequiredField
    + counts.contestRefNotFound
    + counts.trackRefNotFound
    + counts.transformError
    + counts.sourceFieldMissing
    + counts.writebackFieldMissing
    + counts.mappingEmpty
    + counts.other
  return counts
}

function incrementIssueCountsByReasonCode(
  counts: FeishuPreviewIssueCounts,
  reasonCode: string,
): void {
  const normalized = toText(reasonCode)
  if (!normalized)
    return

  if (normalized === 'EXTERNAL_ID_MISSING')
    counts.externalIdMissing += 1
  else if (normalized === 'MISSING_REQUIRED_FIELD')
    counts.missingRequiredField += 1
  else if (normalized === 'CONTEST_REF_NOT_FOUND')
    counts.contestRefNotFound += 1
  else if (normalized === 'TRACK_REF_NOT_FOUND')
    counts.trackRefNotFound += 1
  else
    counts.other += 1
}

function incrementIssueCountsByDiagnostic(
  counts: FeishuPreviewIssueCounts,
  diagnostic: FeishuFieldDiagnosticItem,
): void {
  if (diagnostic.kind === 'mapping_empty' || diagnostic.kind === 'mapping_missing')
    counts.mappingEmpty += 1
  else if (diagnostic.kind === 'source_field_missing')
    counts.sourceFieldMissing += 1
  else if (diagnostic.kind === 'writeback_field_missing')
    counts.writebackFieldMissing += 1
}

function pushPreviewDiagnostic(
  target: FeishuFieldDiagnosticItem[],
  seen: Set<string>,
  item: FeishuFieldDiagnosticItem,
  limit: number,
): void {
  if (target.length >= limit)
    return

  const key = [
    item.kind,
    item.level,
    item.fieldKey || '',
    item.sourceField || '',
    item.recordId || '',
    item.externalId || '',
    item.transform || '',
    item.detail || '',
    item.message,
  ].join('::')
  if (seen.has(key))
    return
  seen.add(key)
  target.push(item)
}

function buildTransformDiagnostic(error: RecordResolverTransformError): FeishuFieldDiagnosticItem {
  return {
    kind: 'transform_error',
    level: 'error',
    message: `字段 ${error.key} 的 transform 执行失败。`,
    fieldKey: error.key,
    recordId: error.recordId,
    transform: error.transform,
    detail: error.message,
  }
}

function buildReasonDiagnostic(
  result: ApplyRecordResult,
  recordId: string,
): FeishuFieldDiagnosticItem | null {
  if (result.reasonCode === 'CONTEST_REF_NOT_FOUND') {
    return {
      kind: 'contest_ref_not_found',
      level: 'error',
      message: result.message || '无法根据 contestExternalId 关联到赛事。',
      recordId,
      externalId: result.externalId,
    }
  }

  if (result.reasonCode === 'TRACK_REF_NOT_FOUND') {
    return {
      kind: 'track_ref_not_found',
      level: 'error',
      message: result.message || '无法根据 trackExternalId 关联到赛道。',
      recordId,
      externalId: result.externalId,
    }
  }

  return null
}

function hasMappingValue(mapping: NormalizedMapping, key: string): boolean {
  if (mapping.fieldMap[key])
    return true
  if (mapping.computedMap[key])
    return true
  return Object.prototype.hasOwnProperty.call(mapping.defaults, key)
}

function buildStaticPreviewDiagnostics(input: {
  entityType: FeishuBitableSyncItemEntityType
  mapping: NormalizedMapping
  writeback: NormalizedWriteback
  sourceFields: Set<string>
}): FeishuFieldDiagnosticItem[] {
  const diagnostics: FeishuFieldDiagnosticItem[] = []
  const seen = new Set<string>()
  const hasAnyMapping = Object.keys(input.mapping.fieldMap).length > 0
    || Object.keys(input.mapping.computedMap).length > 0
    || Object.keys(input.mapping.defaults).length > 0
    || Boolean(input.mapping.externalIdField || input.mapping.contestExternalIdField || input.mapping.trackExternalIdField)

  if (!hasAnyMapping) {
    pushPreviewDiagnostic(diagnostics, seen, {
      kind: 'mapping_empty',
      level: 'warning',
      message: '当前任务尚未配置有效字段映射，预检结果可能全部为空。',
    }, FIELD_DIAGNOSTIC_LIMIT)
  }

  for (const key of REQUIRED_TARGET_FIELDS[input.entityType] || []) {
    if (hasMappingValue(input.mapping, key))
      continue
    pushPreviewDiagnostic(diagnostics, seen, {
      kind: 'mapping_empty',
      level: 'warning',
      fieldKey: key,
      message: `目标字段 ${key} 尚未配置来源字段、transform 或默认值。`,
    }, FIELD_DIAGNOSTIC_LIMIT)
  }

  const sourceBindings: Array<{ fieldKey: string, sourceField: string }> = []
  for (const [fieldKey, sourceField] of Object.entries(input.mapping.fieldMap)) {
    if (!sourceField)
      continue
    sourceBindings.push({ fieldKey, sourceField })
  }
  if (input.mapping.externalIdField)
    sourceBindings.push({ fieldKey: 'externalId', sourceField: input.mapping.externalIdField })
  if (input.mapping.contestExternalIdField)
    sourceBindings.push({ fieldKey: 'contestExternalId', sourceField: input.mapping.contestExternalIdField })
  if (input.mapping.trackExternalIdField)
    sourceBindings.push({ fieldKey: 'trackExternalId', sourceField: input.mapping.trackExternalIdField })

  for (const binding of sourceBindings) {
    if (input.sourceFields.has(binding.sourceField))
      continue
    pushPreviewDiagnostic(diagnostics, seen, {
      kind: 'source_field_missing',
      level: 'error',
      fieldKey: binding.fieldKey,
      sourceField: binding.sourceField,
      message: `映射字段 ${binding.fieldKey} 指向的来源列 ${binding.sourceField} 在当前视图中不存在。`,
    }, FIELD_DIAGNOSTIC_LIMIT)
  }

  if (input.writeback.enabled) {
    for (const [fieldKey, fieldName] of Object.entries(input.writeback.fields || {})) {
      const normalizedFieldName = toText(fieldName)
      if (!normalizedFieldName || input.sourceFields.has(normalizedFieldName))
        continue
      pushPreviewDiagnostic(diagnostics, seen, {
        kind: 'writeback_field_missing',
        level: 'warning',
        fieldKey,
        sourceField: normalizedFieldName,
        message: `状态回填字段 ${normalizedFieldName} 在当前视图样本中未找到，回填可能失败。`,
      }, FIELD_DIAGNOSTIC_LIMIT)
    }
  }

  return diagnostics
}

async function resolveMappedPreviewValue(
  resolver: RecordValueResolver,
  key: string,
): Promise<string> {
  if (key === 'externalId' || key === 'contestExternalId' || key === 'trackExternalId')
    return resolver.getSpecialText(key)
  if (ARRAY_PREVIEW_FIELDS.has(key))
    return (await resolver.getStringArray(key)).join(' | ')
  const value = await resolver.getValue(key)
  return normalizePreviewCell(value)
}

async function resolvePreviewSourceMeta(
  tenantAccessToken: string,
  source: FeishuBitableSourceConfig,
): Promise<FeishuBitableSourceConfig> {
  if (!source.appToken || !source.tableId)
    return source

  if (source.tableName && (!source.viewId || source.viewName))
    return source

  try {
    const [tables, views] = await Promise.all([
      listFeishuBitableTables({
        tenantAccessToken,
        appToken: source.appToken,
      }),
      source.viewId
        ? listFeishuBitableViews({
            tenantAccessToken,
            appToken: source.appToken,
            tableId: source.tableId,
          })
        : Promise.resolve([]),
    ])

    return {
      ...source,
      tableName: source.tableName || tables.find(item => item.tableId === source.tableId)?.name || '',
      viewName: source.viewName || views.find(item => item.viewId === source.viewId)?.name || '',
    }
  }
  catch {
    return source
  }
}

function buildTablePreviewPayload(input: {
  source: FeishuBitableSourceConfig
  records: FeishuBitableRecord[]
}): FeishuBitableTablePreview {
  const source = {
    appToken: toText(input.source.appToken),
    tableId: toText(input.source.tableId),
    viewId: toText(input.source.viewId),
    appName: toText(input.source.appName),
    tableName: toText(input.source.tableName),
    viewName: toText(input.source.viewName),
    sourceUrl: toText(input.source.sourceUrl),
  }
  const columns = collectRecordFieldNames(input.records, RAW_TABLE_PREVIEW_SAMPLE_LIMIT)
  const sampleRows = buildTablePreviewRows(input.records, columns, RAW_TABLE_PREVIEW_SAMPLE_LIMIT)
  const { iframeUrl, openUrl } = buildFeishuPreviewLinks(source)

  return {
    source,
    columns,
    sampleRows,
    sampleCount: sampleRows.length,
    totalFetched: input.records.length,
    fieldInspection: summarizeInspectionRecords(input.records, FIELD_INSPECTION_PREVIEW_LIMIT),
    iframeUrl,
    openUrl,
  }
}

async function applyContestRecord(
  db: Queryable,
  input: {
    actorUserId: string
    syncItemId: string
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
        bypassSourceOfTruthGuard: true,
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
        syncItemId: input.syncItemId,
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
      syncItemId: input.syncItemId,
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
    syncItemId: string
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
        bypassSourceOfTruthGuard: true,
        patch: {
          name,
          summary: await input.resolver.getText('summary'),
          suitableMajors: await input.resolver.getStringArray('suitableMajors'),
          deliverableTypes: await input.resolver.getStringArray('deliverableTypes'),
          sortOrder: Number(await input.resolver.getText('sortOrder') || 0),
        },
      })
      await upsertFeishuExternalRef(db, {
        syncItemId: input.syncItemId,
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
      syncItemId: input.syncItemId,
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
    syncItemId: string
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
        bypassSourceOfTruthGuard: true,
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
        syncItemId: input.syncItemId,
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
      syncItemId: input.syncItemId,
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
    syncItemId: string
    entityType: FeishuBitableSyncItemEntityType
    record: FeishuBitableRecord
    mapping: NormalizedMapping
    options: NormalizedOptions
    resolver?: RecordValueResolver
    dryRun: boolean
  },
): Promise<ApplyRecordResult> {
  const resolver = input.resolver || createRecordResolver(input.record, input.mapping)
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

  if (input.entityType === 'contest') {
    return applyContestRecord(db, {
      actorUserId: input.actorUserId,
      syncItemId: input.syncItemId,
      record: input.record,
      externalId,
      mapping: input.mapping,
      options: input.options,
      resolver,
      dryRun: input.dryRun,
    })
  }

  if (input.entityType === 'track') {
    return applyTrackRecord(db, {
      actorUserId: input.actorUserId,
      syncItemId: input.syncItemId,
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
    syncItemId: input.syncItemId,
    record: input.record,
    externalId,
    mapping: input.mapping,
    options: input.options,
    resolver,
    dryRun: input.dryRun,
  })
}

function buildWritebackFields(input: {
  config: NormalizedWriteback
  result: ApplyRecordResult
  entityId: string
  runId: string
  triggerSource: FeishuBitableSyncRunTriggerSource
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (!input.config.enabled)
    return fields

  const statusText = input.result.status === 'created' || input.result.status === 'updated'
    ? input.config.values.success
    : input.result.status === 'skipped'
      ? input.config.values.skipped
      : input.config.values.failed
  if (input.config.fields.status)
    fields[input.config.fields.status] = statusText
  if (input.config.fields.syncedAt)
    fields[input.config.fields.syncedAt] = new Date().toISOString()
  if (input.config.fields.errorMessage) {
    fields[input.config.fields.errorMessage] = input.result.status === 'created' || input.result.status === 'updated'
      ? ''
      : toText(input.result.message || '')
  }
  if (input.config.fields.reasonCode)
    fields[input.config.fields.reasonCode] = toText(input.result.reasonCode || '')
  if (input.config.fields.entityId)
    fields[input.config.fields.entityId] = input.entityId
  if (input.config.fields.runId)
    fields[input.config.fields.runId] = input.runId
  if (input.config.fields.triggerSource)
    fields[input.config.fields.triggerSource] = input.triggerSource

  return fields
}

async function executeRecords(
  db: Queryable,
  input: {
    actorUserId: string
    runId?: string
    triggerSource: FeishuBitableSyncRunTriggerSource
    syncItemId: string
    entityType: FeishuBitableSyncItemEntityType
    mapping: NormalizedMapping
    options: NormalizedOptions
    writeback: NormalizedWriteback
    tenantAccessToken?: string
    appToken: string
    tableId: string
    records: FeishuBitableRecord[]
    dryRun: boolean
  },
): Promise<SyncSummary> {
  const summary = buildSummaryBase(input.records)
  const writebackRecords: Array<{ recordId: string, fields: Record<string, unknown> }> = []

  for (const record of input.records) {
    try {
      const result = await applySingleRecord(db, {
        actorUserId: input.actorUserId,
        syncItemId: input.syncItemId,
        entityType: input.entityType,
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

      if (!input.dryRun && (result.status === 'created' || result.status === 'updated')) {
        const ref = await getFeishuExternalRef(db, {
          scope: input.entityType,
          externalId: result.externalId,
        })
        if (ref?.entityId && input.runId) {
          const sourceHash = buildPostSyncSourceHash({
            scope: input.entityType,
            externalId: result.externalId,
            record,
          })
          await enqueueFeishuPostSyncTask(db, {
            syncItemId: input.syncItemId,
            runId: input.runId,
            scope: input.entityType,
            entityId: ref.entityId,
            externalId: result.externalId,
            taskType: 'embedding_upsert',
            sourceHash,
            payload: {
              recordId: record.recordId,
              externalId: result.externalId,
              recordFields: record.fields || {},
            },
          })
          await enqueueFeishuPostSyncTask(db, {
            syncItemId: input.syncItemId,
            runId: input.runId,
            scope: input.entityType,
            entityId: ref.entityId,
            externalId: result.externalId,
            taskType: 'search_index_refresh',
            sourceHash,
            payload: {
              recordId: record.recordId,
              externalId: result.externalId,
            },
          })
          await enqueueFeishuPostSyncTask(db, {
            syncItemId: input.syncItemId,
            runId: input.runId,
            scope: input.entityType,
            entityId: ref.entityId,
            externalId: result.externalId,
            taskType: 'entity_analysis',
            sourceHash,
            payload: {
              recordId: record.recordId,
              externalId: result.externalId,
              entityId: ref.entityId,
              recordFields: record.fields || {},
            },
          })
        }
      }

      if (!input.dryRun && result.status === 'skipped' && result.reasonCode) {
        await upsertFeishuSyncIssue(db, {
          syncItemId: input.syncItemId,
          entityType: input.entityType,
          recordId: record.recordId,
          externalId: result.externalId || record.recordId,
          reasonCode: result.reasonCode,
          message: result.message || '记录未通过同步校验。',
          payload: {
            ...(result.payload || {}),
            schemaVersion: input.mapping.schemaVersion,
            mappingEntityType: input.mapping.entityType,
          },
        })
      }

      if (!input.dryRun && input.writeback.enabled && input.runId) {
        const ref = await getFeishuExternalRef(db, {
          scope: input.entityType,
          externalId: result.externalId,
        })
        const writebackFields = buildWritebackFields({
          config: input.writeback,
          result,
          entityId: ref?.entityId || '',
          runId: input.runId,
          triggerSource: input.triggerSource,
        })
        const normalizedFields: Record<string, unknown> = {}
        for (const [fieldName, value] of Object.entries(writebackFields)) {
          const key = toText(fieldName)
          if (!key)
            continue
          normalizedFields[key] = normalizeWritebackValue(value)
        }
        if (Object.keys(normalizedFields).length > 0) {
          writebackRecords.push({
            recordId: record.recordId,
            fields: normalizedFields,
          })
        }
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

  if (!input.dryRun && input.tenantAccessToken && writebackRecords.length > 0) {
    const chunkSize = 200
    for (let index = 0; index < writebackRecords.length; index += chunkSize) {
      const chunk = writebackRecords.slice(index, index + chunkSize)
      try {
        await batchUpdateFeishuBitableRecords({
          tenantAccessToken: input.tenantAccessToken,
          appToken: input.appToken,
          tableId: input.tableId,
          records: chunk,
        })
        summary.writebackSuccessCount += chunk.length
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error || 'WRITEBACK_FAILED')
        summary.writebackErrorCount += chunk.length
        if (input.runId) {
          await enqueueFeishuPostSyncTask(db, {
            syncItemId: input.syncItemId,
            runId: input.runId,
            scope: input.entityType,
            entityId: input.syncItemId,
            externalId: '',
            taskType: 'writeback_retry',
            sourceHash: createHash('sha256').update(JSON.stringify(chunk)).digest('hex'),
            payload: {
              appToken: input.appToken,
              tableId: input.tableId,
              records: chunk,
              errorMessage: message,
            },
          })
        }
        summary.errors.push({
          recordId: chunk[0]?.recordId || '',
          message: `WRITEBACK_FAILED:${message}`,
        })
      }
    }
  }

  return summary
}

async function loadTablePreviewContext(
  event: H3Event,
  source: FeishuBitableSourceConfig,
): Promise<{
  source: FeishuBitableSourceConfig
  records: FeishuBitableRecord[]
}> {
  const appToken = toText(source.appToken)
  const tableId = toText(source.tableId)
  if (!appToken || !tableId)
    throw new Error('APP_TOKEN_AND_TABLE_ID_REQUIRED')

  const config = await withClient(event, async (db) => {
    return readFeishuIntegrationConfig(db)
  })
  if (!config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')

  const tenantAccessToken = await getFeishuTenantAccessToken(config)
  const resolvedSource = await resolvePreviewSourceMeta(tenantAccessToken, {
    ...source,
    appToken,
    tableId,
    viewId: toText(source.viewId),
    appName: toText(source.appName),
    tableName: toText(source.tableName),
    viewName: toText(source.viewName),
    sourceUrl: toText(source.sourceUrl),
  })
  const records = await listFeishuBitableRecords({
    tenantAccessToken,
    appToken,
    tableId,
    viewId: toText(source.viewId),
  })

  return {
    source: resolvedSource,
    records,
  }
}

async function buildFeishuBitableSyncItemPreview(
  db: Queryable,
  input: {
    actorUserId: string
    syncItemId: string
    entityType: FeishuBitableSyncItemEntityType
    mapping: NormalizedMapping
    options: NormalizedOptions
    writeback: NormalizedWriteback
    records: FeishuBitableRecord[]
  },
): Promise<FeishuBitableSyncItemPreviewResult> {
  const summary = buildSummaryBase(input.records)
  const mappedColumns = [...TARGET_PREVIEW_FIELDS[input.entityType]]
  const mappedSampleRows: FeishuMappedPreviewRow[] = []
  const fieldDiagnostics: FeishuFieldDiagnosticItem[] = []
  const transformErrors: FeishuFieldDiagnosticItem[] = []
  const fieldDiagnosticSeen = new Set<string>()
  const transformErrorSeen = new Set<string>()
  const issueCounts = createEmptyPreviewIssueCounts()
  const sourceFields = new Set(collectRecordFieldNames(input.records))

  for (const diagnostic of buildStaticPreviewDiagnostics({
    entityType: input.entityType,
    mapping: input.mapping,
    writeback: input.writeback,
    sourceFields,
  })) {
    pushPreviewDiagnostic(fieldDiagnostics, fieldDiagnosticSeen, diagnostic, FIELD_DIAGNOSTIC_LIMIT)
    incrementIssueCountsByDiagnostic(issueCounts, diagnostic)
  }

  for (const record of input.records) {
    const values: Record<string, string> = {}
    const shouldCollectSample = mappedSampleRows.length < MAPPED_PREVIEW_SAMPLE_LIMIT
    let transformErrorCountForRecord = 0

    const resolver = createRecordResolver(record, input.mapping, {
      onTransformError: (error) => {
        transformErrorCountForRecord += 1
        issueCounts.transformError += 1
        const diagnostic = buildTransformDiagnostic(error)
        pushPreviewDiagnostic(transformErrors, transformErrorSeen, diagnostic, TRANSFORM_ERROR_LIMIT)
        pushPreviewDiagnostic(fieldDiagnostics, fieldDiagnosticSeen, diagnostic, FIELD_DIAGNOSTIC_LIMIT)
      },
    })

    if (shouldCollectSample) {
      for (const column of mappedColumns) {
        try {
          values[column] = await resolveMappedPreviewValue(resolver, column)
        }
        catch {
          values[column] = ''
        }
      }
    }

    try {
      const result = await applySingleRecord(db, {
        actorUserId: input.actorUserId,
        syncItemId: input.syncItemId,
        entityType: input.entityType,
        record,
        mapping: input.mapping,
        options: input.options,
        resolver,
        dryRun: true,
      })

      if (result.status === 'created')
        summary.createdCount += 1
      else if (result.status === 'updated')
        summary.updatedCount += 1
      else
        summary.skippedCount += 1

      if (result.reasonCode) {
        incrementIssueCountsByReasonCode(issueCounts, result.reasonCode)
        const diagnostic = buildReasonDiagnostic(result, record.recordId)
        if (diagnostic)
          pushPreviewDiagnostic(fieldDiagnostics, fieldDiagnosticSeen, diagnostic, FIELD_DIAGNOSTIC_LIMIT)
      }

      if (shouldCollectSample) {
        mappedSampleRows.push({
          recordId: record.recordId,
          externalId: result.externalId || values.externalId || record.recordId,
          status: result.status,
          reasonCode: result.reasonCode,
          message: result.message,
          values,
        })
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR')
      summary.errorCount += 1
      summary.errors.push({
        recordId: record.recordId,
        message,
      })
      if (!transformErrorCountForRecord)
        issueCounts.other += 1

      if (shouldCollectSample) {
        mappedSampleRows.push({
          recordId: record.recordId,
          externalId: values.externalId || record.recordId,
          status: 'error',
          message,
          values,
        })
      }
    }
  }

  return {
    ...summary,
    mappedColumns,
    mappedSampleRows,
    fieldDiagnostics,
    transformErrors,
    issueCounts: finalizePreviewIssueCounts(issueCounts),
  }
}

export async function previewFeishuBitableSourceTable(
  event: H3Event,
  input: FeishuBitableSourceConfig,
): Promise<FeishuBitableTablePreview> {
  const context = await loadTablePreviewContext(event, input)
  return buildTablePreviewPayload(context)
}

async function previewFeishuBitableSyncItemTableById(
  event: H3Event,
  input: {
    syncItemId: string
  },
): Promise<FeishuBitableTablePreview> {
  const configAndTask = await withClient(event, async (db) => {
    const config = await readFeishuIntegrationConfig(db)
    const task = await getFeishuBitableSyncItemById(db, input.syncItemId)
    return { config, task }
  })

  if (!configAndTask.config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')
  if (!configAndTask.task)
    throw new Error('FEISHU_BITABLE_SYNC_ITEM_NOT_FOUND')

  const task = configAndTask.task
  return previewFeishuBitableSourceTable(event, task.source || {
    appToken: task.appToken,
    tableId: task.tableId,
    viewId: task.viewId,
  })
}

export async function previewFeishuBitableSyncItemTable(
  event: H3Event,
  input: {
    syncItemId: string
  },
): Promise<FeishuBitableTablePreview> {
  return previewFeishuBitableSyncItemTableById(event, {
    syncItemId: input.syncItemId,
  })
}

async function previewFeishuBitableSyncItemById(
  event: H3Event,
  input: {
    syncItemId: string
    actorUserId: string
    draft?: FeishuBitableSyncItemPreviewRequest
  },
): Promise<FeishuBitableSyncItemPreviewResult> {
  const configAndTask = await withClient(event, async (db) => {
    const config = await readFeishuIntegrationConfig(db)
    const task = await getFeishuBitableSyncItemById(db, input.syncItemId)
    return { config, task }
  })

  if (!configAndTask.config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')
  if (!configAndTask.task)
    throw new Error('FEISHU_BITABLE_SYNC_ITEM_NOT_FOUND')
  const task = configAndTask.task
  const sourceOverride = parseJsonObject(input.draft?.source)
  const source: FeishuBitableSourceConfig = {
    appToken: resolvePreviewOverrideString(sourceOverride, 'appToken', toText(task.source?.appToken) || toText(task.appToken)),
    tableId: resolvePreviewOverrideString(sourceOverride, 'tableId', toText(task.source?.tableId) || toText(task.tableId)),
    viewId: resolvePreviewOverrideString(sourceOverride, 'viewId', toText(task.source?.viewId) || toText(task.viewId)),
    appName: resolvePreviewOverrideString(sourceOverride, 'appName', toText(task.source?.appName)),
    tableName: resolvePreviewOverrideString(sourceOverride, 'tableName', toText(task.source?.tableName)),
    viewName: resolvePreviewOverrideString(sourceOverride, 'viewName', toText(task.source?.viewName)),
    sourceUrl: resolvePreviewOverrideString(sourceOverride, 'sourceUrl', toText(task.source?.sourceUrl)),
  }
  const entityType = isEntityType(input.draft?.entityType) ? input.draft.entityType : (task.entityType || 'contest')
  const mappingRaw = input.draft && hasOwn(input.draft, 'mapping') ? input.draft.mapping : task.mapping
  const optionsRaw = input.draft && hasOwn(input.draft, 'options') ? input.draft.options : task.options
  const writebackRaw = input.draft && hasOwn(input.draft, 'writeback')
    ? input.draft.writeback
    : (task.writeback || parseJsonObject(task.options).writeback)

  const tenantAccessToken = await getFeishuTenantAccessToken(configAndTask.config)
  const records = await listFeishuBitableRecords({
    tenantAccessToken,
    appToken: source.appToken,
    tableId: source.tableId,
    viewId: source.viewId,
  })

  return withClient(event, async (db) => {
    const mapping = normalizeMapping(mappingRaw, optionsRaw, entityType)
    const options = normalizeOptions(optionsRaw, mapping.defaults)
    const writeback = normalizeWritebackConfig(writebackRaw)
    return buildFeishuBitableSyncItemPreview(db, {
      actorUserId: input.actorUserId,
      syncItemId: task.id,
      entityType,
      mapping,
      options,
      writeback,
      records,
    })
  })
}

export async function previewFeishuBitableSyncItem(
  event: H3Event,
  input: {
    syncItemId: string
    actorUserId: string
    draft?: FeishuBitableSyncItemPreviewRequest
  },
): Promise<FeishuBitableSyncItemPreviewResult> {
  return previewFeishuBitableSyncItemById(event, {
    syncItemId: input.syncItemId,
    actorUserId: input.actorUserId,
    draft: input.draft,
  })
}

async function runFeishuBitableSyncItemById(
  event: H3Event | undefined,
  input: {
    syncItemId: string
    actorUserId: string
    triggerSource?: FeishuBitableSyncRunTriggerSource
    mode?: FeishuSyncRunMode
    recordIds?: string[]
  },
): Promise<SyncSummary & { runId: string, status: 'success' | 'partial_success' | 'failed' }> {
  const triggerSource = input.triggerSource || 'manual'
  const mode: FeishuSyncRunMode = input.mode === 'delta' ? 'delta' : 'full'
  const deltaRecordIds = [...new Set((input.recordIds || []).map(item => toText(item)).filter(Boolean))]
  const configAndTask = await withClient(event, async (db) => {
    const config = await readFeishuIntegrationConfig(db)
    const task = await getFeishuBitableSyncItemById(db, input.syncItemId)
    const sync = task?.syncId ? await getFeishuBitableSyncById(db, task.syncId) : null
    return { config, task, sync }
  })

  if (!configAndTask.config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')
  if (!configAndTask.task)
    throw new Error('FEISHU_BITABLE_SYNC_ITEM_NOT_FOUND')
  if (configAndTask.task.syncId && !configAndTask.sync)
    throw new Error('FEISHU_BITABLE_SYNC_NOT_FOUND')
  if (configAndTask.sync && !configAndTask.sync.enabled)
    throw new Error('FEISHU_BITABLE_SYNC_DISABLED')
  if (!configAndTask.task.isEnabled)
    throw new Error('FEISHU_BITABLE_SYNC_ITEM_INACTIVE')
  const task = configAndTask.task

  const runId = await withClient(event, async (db) => {
    return createFeishuBitableSyncItemRun(db, {
      syncItemId: task.id,
      triggerSource,
      mode,
      deltaRecordCount: deltaRecordIds.length,
      createdByUserId: input.actorUserId,
    })
  })

  try {
    const tenantAccessToken = await getFeishuTenantAccessToken(configAndTask.config)
    const records = mode === 'delta'
      ? await listFeishuBitableRecordsByIds({
          tenantAccessToken,
          appToken: task.appToken,
          tableId: task.tableId,
          recordIds: deltaRecordIds,
        })
      : await listFeishuBitableRecords({
          tenantAccessToken,
          appToken: task.appToken,
          tableId: task.tableId,
          viewId: task.viewId,
        })

    const summary = await withTransaction(event, async (db) => {
      const entityType = task.entityType || 'contest'
      const mapping = normalizeMapping(task.mapping, task.options, entityType)
      const options = normalizeOptions(task.options, mapping.defaults)
      const writeback = normalizeWritebackConfig(task.writeback || parseJsonObject(task.options).writeback)
      return executeRecords(db, {
        actorUserId: input.actorUserId,
        runId,
        triggerSource,
        syncItemId: task.id,
        entityType,
        mapping,
        options,
        writeback,
        tenantAccessToken,
        appToken: task.appToken,
        tableId: task.tableId,
        records,
        dryRun: false,
      })
    })

    const status = (summary.errorCount > 0 || summary.writebackErrorCount > 0)
      ? ((summary.createdCount > 0 || summary.updatedCount > 0) ? 'partial_success' : 'failed')
      : 'success'

    await withClient(event, async (db) => {
      await completeFeishuBitableSyncItemRun(db, {
        runId,
        syncItemId: task.id,
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
      await completeFeishuBitableSyncItemRun(db, {
        runId,
        syncItemId: task.id,
        status: 'failed',
        errorCount: 1,
        errorMessage: message,
      })
    })
    throw error
  }
}

export async function runFeishuBitableSyncItem(
  event: H3Event | undefined,
  input: {
    syncItemId: string
    actorUserId: string
    triggerSource?: FeishuBitableSyncRunTriggerSource
    mode?: FeishuSyncRunMode
    recordIds?: string[]
  },
): Promise<SyncSummary & { runId: string, status: 'success' | 'partial_success' | 'failed' }> {
  return runFeishuBitableSyncItemById(event, {
    syncItemId: input.syncItemId,
    actorUserId: input.actorUserId,
    triggerSource: input.triggerSource,
    mode: input.mode,
    recordIds: input.recordIds,
  })
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

function summarizeInspectionRecords(
  records: FeishuBitableRecord[],
  maxRecords: number,
): FeishuFieldInspectionItem[] {
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

export async function inspectFeishuBitableSourceFields(
  event: H3Event,
  input: {
    appToken: string
    tableId: string
    viewId?: string
    sampleRecords?: number
  },
): Promise<FeishuFieldInspectionItem[]> {
  const appToken = toText(input.appToken)
  const tableId = toText(input.tableId)
  const viewId = toText(input.viewId)
  if (!appToken || !tableId)
    throw new Error('APP_TOKEN_AND_TABLE_ID_REQUIRED')

  const config = await withClient(event, async (db) => {
    return readFeishuIntegrationConfig(db)
  })

  if (!config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')

  const tenantAccessToken = await getFeishuTenantAccessToken(config)
  const records = await listFeishuBitableRecords({
    tenantAccessToken,
    appToken,
    tableId,
    viewId,
  })
  const maxRecords = Math.max(1, Math.min(500, Number(input.sampleRecords || 120)))
  return summarizeInspectionRecords(records, maxRecords)
}

async function inspectFeishuBitableSyncItemFieldsById(
  event: H3Event,
  input: {
    syncItemId: string
    sampleRecords?: number
  },
): Promise<FeishuFieldInspectionItem[]> {
  const configAndTask = await withClient(event, async (db) => {
    const config = await readFeishuIntegrationConfig(db)
    const task = await getFeishuBitableSyncItemById(db, input.syncItemId)
    return { config, task }
  })

  if (!configAndTask.config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')
  if (!configAndTask.task)
    throw new Error('FEISHU_BITABLE_SYNC_ITEM_NOT_FOUND')

  const task = configAndTask.task
  const tenantAccessToken = await getFeishuTenantAccessToken(configAndTask.config)
  const records = await listFeishuBitableRecords({
    tenantAccessToken,
    appToken: task.appToken,
    tableId: task.tableId,
    viewId: task.viewId,
  })

  const maxRecords = Math.max(1, Math.min(500, Number(input.sampleRecords || 120)))
  return summarizeInspectionRecords(records, maxRecords)
}

export async function inspectFeishuBitableSyncItemFields(
  event: H3Event,
  input: {
    syncItemId: string
    sampleRecords?: number
  },
): Promise<FeishuFieldInspectionItem[]> {
  return inspectFeishuBitableSyncItemFieldsById(event, {
    syncItemId: input.syncItemId,
    sampleRecords: input.sampleRecords,
  })
}
