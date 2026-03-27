import type { Queryable } from '~~/server/utils/db'
import type {
  ChecklistItem,
  EngineContext,
  ObligationBinding,
  ObligationDefinition,
  PredicateExpr,
  RuleBinding,
  RuleDefinition,
  RuleVersion,
  ScopeType,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { getContestDetail } from '~~/server/utils/contest-store'
import { runRuleEngine } from '~~/server/utils/rule-engine'

interface RuleVersionRow {
  id: string
  name: string
  status: 'draft' | 'published'
  note: string
  published_at: string | null
  published_by_user_id: string | null
  rolled_back_from_version_id: string | null
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

interface RuleDefinitionRow {
  id: string
  version_id: string
  code: string
  name: string
  category: RuleDefinition['category']
  severity: RuleDefinition['severity']
  when_expr: unknown
  assert_expr: unknown
  message_template: string
  target_path: string
  metadata: unknown
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface RuleBindingRow {
  id: string
  version_id: string
  rule_id: string
  scope_type: ScopeType
  scope_value: string
  priority: number
  enabled: boolean
  effective_start_at: string | null
  effective_end_at: string | null
  metadata: unknown
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface ObligationDefinitionRow {
  id: string
  version_id: string
  code: string
  name: string
  required: boolean
  when_expr: unknown
  satisfied_by_expr: unknown
  message_when_missing: string
  metadata: unknown
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface ObligationBindingRow {
  id: string
  version_id: string
  obligation_id: string
  scope_type: ScopeType
  scope_value: string
  priority: number
  enabled: boolean
  metadata: unknown
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function toPredicate(value: unknown): PredicateExpr | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  return value as PredicateExpr
}

function toRuleVersion(row: RuleVersionRow): RuleVersion {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    note: row.note || '',
    publishedAt: row.published_at,
    publishedByUserId: row.published_by_user_id,
    rolledBackFromVersionId: row.rolled_back_from_version_id,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRuleDefinition(row: RuleDefinitionRow): RuleDefinition {
  const assertExpr = toPredicate(row.assert_expr)
  return {
    id: row.id,
    versionId: row.version_id,
    code: row.code,
    name: row.name,
    category: row.category,
    severity: row.severity,
    when: toPredicate(row.when_expr),
    assert: assertExpr || {
      op: 'eq',
      left: { type: 'const', value: true },
      right: { type: 'const', value: true },
    },
    messageTemplate: row.message_template || '',
    targetPath: row.target_path || '',
    metadata: toRecord(row.metadata),
    createdByUserId: row.created_by_user_id || undefined,
    updatedByUserId: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRuleBinding(row: RuleBindingRow): RuleBinding {
  return {
    id: row.id,
    versionId: row.version_id,
    ruleId: row.rule_id,
    scopeType: row.scope_type,
    scopeValue: row.scope_value || '*',
    priority: Number(row.priority || 0),
    enabled: Boolean(row.enabled),
    effectiveStartAt: row.effective_start_at,
    effectiveEndAt: row.effective_end_at,
    metadata: toRecord(row.metadata),
    createdByUserId: row.created_by_user_id || undefined,
    updatedByUserId: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toObligationDefinition(row: ObligationDefinitionRow): ObligationDefinition {
  return {
    id: row.id,
    versionId: row.version_id,
    code: row.code,
    name: row.name,
    required: Boolean(row.required),
    when: toPredicate(row.when_expr),
    satisfiedBy: toPredicate(row.satisfied_by_expr),
    messageWhenMissing: row.message_when_missing || '',
    metadata: toRecord(row.metadata),
    createdByUserId: row.created_by_user_id || undefined,
    updatedByUserId: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toObligationBinding(row: ObligationBindingRow): ObligationBinding {
  return {
    id: row.id,
    versionId: row.version_id,
    obligationId: row.obligation_id,
    scopeType: row.scope_type,
    scopeValue: row.scope_value || '*',
    priority: Number(row.priority || 0),
    enabled: Boolean(row.enabled),
    metadata: toRecord(row.metadata),
    createdByUserId: row.created_by_user_id || undefined,
    updatedByUserId: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getRuleVersionById(db: Queryable, versionId: string): Promise<RuleVersion | null> {
  const result = await db.query<RuleVersionRow>(
    `SELECT
      id,
      name,
      status,
      note,
      published_at::TEXT,
      published_by_user_id,
      rolled_back_from_version_id,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM rule_versions
     WHERE id = $1
     LIMIT 1`,
    [versionId],
  )
  return result.rows[0] ? toRuleVersion(result.rows[0]) : null
}

export async function listRuleVersions(
  db: Queryable,
  input: { status?: RuleVersion['status'], limit?: number } = {},
): Promise<RuleVersion[]> {
  const values: unknown[] = []
  const where: string[] = []
  if (input.status) {
    values.push(input.status)
    where.push(`status = $${values.length}`)
  }
  const limit = Math.max(1, Math.min(200, Number(input.limit || 50)))
  values.push(limit)

  const result = await db.query<RuleVersionRow>(
    `SELECT
      id,
      name,
      status,
      note,
      published_at::TEXT,
      published_by_user_id,
      rolled_back_from_version_id,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM rule_versions
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY updated_at DESC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows.map(toRuleVersion)
}

export async function createRuleVersion(
  db: Queryable,
  input: {
    actorUserId: string
    name: string
    note?: string
  },
): Promise<RuleVersion> {
  const versionId = randomUUID()
  await db.query(
    `INSERT INTO rule_versions (
      id,
      name,
      status,
      note,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'draft', $3, $4, $4, NOW(), NOW()
    )`,
    [
      versionId,
      normalizeString(input.name) || `规则版本 ${new Date().toISOString()}`,
      normalizeString(input.note),
      input.actorUserId,
    ],
  )

  return (await getRuleVersionById(db, versionId))!
}

export async function publishRuleVersion(
  db: Queryable,
  input: {
    actorUserId: string
    versionId: string
    note?: string
  },
): Promise<RuleVersion | null> {
  await db.query(
    `UPDATE rule_versions
     SET status = 'draft',
         updated_by_user_id = $1,
         updated_at = NOW()
     WHERE status = 'published'
       AND id <> $2`,
    [input.actorUserId, input.versionId],
  )

  await db.query(
    `UPDATE rule_versions
     SET status = 'published',
         note = CASE WHEN $3::TEXT = '' THEN note ELSE $3::TEXT END,
         published_at = NOW(),
         published_by_user_id = $1,
         updated_by_user_id = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [input.actorUserId, input.versionId, normalizeString(input.note)],
  )

  return getRuleVersionById(db, input.versionId)
}

export async function rollbackRuleVersion(
  db: Queryable,
  input: {
    actorUserId: string
    sourceVersionId: string
    name?: string
    note?: string
  },
): Promise<RuleVersion> {
  const source = await getRuleVersionById(db, input.sourceVersionId)
  if (!source)
    throw new Error('RULE_VERSION_NOT_FOUND')

  const next = await createRuleVersion(db, {
    actorUserId: input.actorUserId,
    name: normalizeString(input.name) || `${source.name} rollback`,
    note: normalizeString(input.note) || `rollback from ${source.id}`,
  })

  const sourceDefinitions = await listRuleDefinitions(db, { versionId: source.id })
  const sourceBindings = await listRuleBindings(db, { versionId: source.id })
  const sourceObligations = await listObligationDefinitions(db, { versionId: source.id })
  const sourceObligationBindings = await listObligationBindings(db, { versionId: source.id })

  const nextRuleIdBySourceRuleId = new Map<string, string>()
  for (const sourceDefinition of sourceDefinitions) {
    const nextRuleId = randomUUID()
    nextRuleIdBySourceRuleId.set(sourceDefinition.id, nextRuleId)
    await db.query(
      `INSERT INTO rule_definitions (
        id,
        version_id,
        code,
        name,
        category,
        severity,
        when_expr,
        assert_expr,
        message_template,
        target_path,
        metadata,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB, $9, $10, $11::JSONB, $12, $12, NOW(), NOW()
      )`,
      [
        nextRuleId,
        next.id,
        sourceDefinition.code,
        sourceDefinition.name,
        sourceDefinition.category,
        sourceDefinition.severity,
        JSON.stringify(toRecord(sourceDefinition.when)),
        JSON.stringify(toRecord(sourceDefinition.assert)),
        normalizeString(sourceDefinition.messageTemplate),
        normalizeString(sourceDefinition.targetPath),
        JSON.stringify(toRecord(sourceDefinition.metadata)),
        input.actorUserId,
      ],
    )
  }

  for (const sourceBinding of sourceBindings) {
    const nextRuleId = nextRuleIdBySourceRuleId.get(sourceBinding.ruleId)
    if (!nextRuleId)
      continue
    await db.query(
      `INSERT INTO rule_bindings (
        id,
        version_id,
        rule_id,
        scope_type,
        scope_value,
        priority,
        enabled,
        effective_start_at,
        effective_end_at,
        metadata,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ, $10::JSONB, $11, $11, NOW(), NOW()
      )`,
      [
        randomUUID(),
        next.id,
        nextRuleId,
        sourceBinding.scopeType,
        normalizeString(sourceBinding.scopeValue) || '*',
        Number(sourceBinding.priority || 0),
        sourceBinding.enabled !== false,
        normalizeString(sourceBinding.effectiveStartAt) || null,
        normalizeString(sourceBinding.effectiveEndAt) || null,
        JSON.stringify(toRecord(sourceBinding.metadata)),
        input.actorUserId,
      ],
    )
  }

  const nextObligationIdBySourceId = new Map<string, string>()
  for (const sourceObligation of sourceObligations) {
    const nextObligationId = randomUUID()
    nextObligationIdBySourceId.set(sourceObligation.id, nextObligationId)
    await db.query(
      `INSERT INTO obligation_definitions (
        id,
        version_id,
        code,
        name,
        required,
        when_expr,
        satisfied_by_expr,
        message_when_missing,
        metadata,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::JSONB, $7::JSONB, $8, $9::JSONB, $10, $10, NOW(), NOW()
      )`,
      [
        nextObligationId,
        next.id,
        sourceObligation.code,
        sourceObligation.name,
        sourceObligation.required !== false,
        JSON.stringify(toRecord(sourceObligation.when)),
        JSON.stringify(toRecord(sourceObligation.satisfiedBy)),
        normalizeString(sourceObligation.messageWhenMissing),
        JSON.stringify(toRecord(sourceObligation.metadata)),
        input.actorUserId,
      ],
    )
  }

  for (const sourceBinding of sourceObligationBindings) {
    const nextObligationId = nextObligationIdBySourceId.get(sourceBinding.obligationId)
    if (!nextObligationId)
      continue
    await db.query(
      `INSERT INTO obligation_bindings (
        id,
        version_id,
        obligation_id,
        scope_type,
        scope_value,
        priority,
        enabled,
        metadata,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9, $9, NOW(), NOW()
      )`,
      [
        randomUUID(),
        next.id,
        nextObligationId,
        sourceBinding.scopeType,
        normalizeString(sourceBinding.scopeValue) || '*',
        Number(sourceBinding.priority || 0),
        sourceBinding.enabled !== false,
        JSON.stringify(toRecord(sourceBinding.metadata)),
        input.actorUserId,
      ],
    )
  }

  await db.query(
    `UPDATE rule_versions
     SET rolled_back_from_version_id = $1,
         updated_by_user_id = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [source.id, input.actorUserId, next.id],
  )

  const published = await publishRuleVersion(db, {
    actorUserId: input.actorUserId,
    versionId: next.id,
    note: normalizeString(input.note),
  })

  return published || next
}

export async function listRuleDefinitions(
  db: Queryable,
  input: { versionId: string },
): Promise<RuleDefinition[]> {
  const result = await db.query<RuleDefinitionRow>(
    `SELECT
      id,
      version_id,
      code,
      name,
      category,
      severity,
      when_expr,
      assert_expr,
      message_template,
      target_path,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM rule_definitions
     WHERE version_id = $1
     ORDER BY code ASC, created_at ASC`,
    [input.versionId],
  )

  return result.rows.map(toRuleDefinition)
}

export async function upsertRuleDefinition(
  db: Queryable,
  input: {
    actorUserId: string
    versionId: string
    definition: Partial<RuleDefinition> & Pick<RuleDefinition, 'code' | 'name' | 'category' | 'severity' | 'assert' | 'messageTemplate'>
  },
): Promise<RuleDefinition> {
  const definitionId = normalizeString(input.definition.id) || randomUUID()
  const code = normalizeString(input.definition.code)
  const name = normalizeString(input.definition.name)
  if (!code || !name)
    throw new Error('RULE_CODE_OR_NAME_REQUIRED')

  await db.query(
    `INSERT INTO rule_definitions (
      id,
      version_id,
      code,
      name,
      category,
      severity,
      when_expr,
      assert_expr,
      message_template,
      target_path,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB, $9, $10, $11::JSONB, $12, $12, NOW(), NOW()
    )
    ON CONFLICT (id)
    DO UPDATE SET
      version_id = EXCLUDED.version_id,
      code = EXCLUDED.code,
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      severity = EXCLUDED.severity,
      when_expr = EXCLUDED.when_expr,
      assert_expr = EXCLUDED.assert_expr,
      message_template = EXCLUDED.message_template,
      target_path = EXCLUDED.target_path,
      metadata = EXCLUDED.metadata,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = EXCLUDED.updated_at`,
    [
      definitionId,
      input.versionId,
      code,
      name,
      input.definition.category,
      input.definition.severity,
      JSON.stringify(toRecord(input.definition.when)),
      JSON.stringify(toRecord(input.definition.assert)),
      normalizeString(input.definition.messageTemplate),
      normalizeString(input.definition.targetPath),
      JSON.stringify(toRecord(input.definition.metadata)),
      input.actorUserId,
    ],
  )

  const rows = await listRuleDefinitions(db, { versionId: input.versionId })
  const matched = rows.find(item => item.id === definitionId)
  if (!matched)
    throw new Error('RULE_UPSERT_FAILED')
  return matched
}

export async function listRuleBindings(
  db: Queryable,
  input: { versionId: string },
): Promise<RuleBinding[]> {
  const result = await db.query<RuleBindingRow>(
    `SELECT
      id,
      version_id,
      rule_id,
      scope_type,
      scope_value,
      priority,
      enabled,
      effective_start_at::TEXT,
      effective_end_at::TEXT,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM rule_bindings
     WHERE version_id = $1
     ORDER BY priority DESC, created_at ASC`,
    [input.versionId],
  )

  return result.rows.map(toRuleBinding)
}

export async function upsertRuleBinding(
  db: Queryable,
  input: {
    actorUserId: string
    versionId: string
    binding: Partial<RuleBinding> & Pick<RuleBinding, 'ruleId' | 'scopeType' | 'scopeValue'>
  },
): Promise<RuleBinding> {
  const bindingId = normalizeString(input.binding.id) || randomUUID()
  await db.query(
    `INSERT INTO rule_bindings (
      id,
      version_id,
      rule_id,
      scope_type,
      scope_value,
      priority,
      enabled,
      effective_start_at,
      effective_end_at,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ, $10::JSONB, $11, $11, NOW(), NOW()
    )
    ON CONFLICT (id)
    DO UPDATE SET
      version_id = EXCLUDED.version_id,
      rule_id = EXCLUDED.rule_id,
      scope_type = EXCLUDED.scope_type,
      scope_value = EXCLUDED.scope_value,
      priority = EXCLUDED.priority,
      enabled = EXCLUDED.enabled,
      effective_start_at = EXCLUDED.effective_start_at,
      effective_end_at = EXCLUDED.effective_end_at,
      metadata = EXCLUDED.metadata,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = EXCLUDED.updated_at`,
    [
      bindingId,
      input.versionId,
      input.binding.ruleId,
      input.binding.scopeType,
      normalizeString(input.binding.scopeValue) || '*',
      Number(input.binding.priority || 0),
      input.binding.enabled !== false,
      normalizeString(input.binding.effectiveStartAt) || null,
      normalizeString(input.binding.effectiveEndAt) || null,
      JSON.stringify(toRecord(input.binding.metadata)),
      input.actorUserId,
    ],
  )

  const rows = await listRuleBindings(db, { versionId: input.versionId })
  const matched = rows.find(item => item.id === bindingId)
  if (!matched)
    throw new Error('RULE_BINDING_UPSERT_FAILED')
  return matched
}

async function listObligationDefinitions(
  db: Queryable,
  input: { versionId: string },
): Promise<ObligationDefinition[]> {
  const result = await db.query<ObligationDefinitionRow>(
    `SELECT
      id,
      version_id,
      code,
      name,
      required,
      when_expr,
      satisfied_by_expr,
      message_when_missing,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM obligation_definitions
     WHERE version_id = $1
     ORDER BY code ASC, created_at ASC`,
    [input.versionId],
  )
  return result.rows.map(toObligationDefinition)
}

async function listObligationBindings(
  db: Queryable,
  input: { versionId: string },
): Promise<ObligationBinding[]> {
  const result = await db.query<ObligationBindingRow>(
    `SELECT
      id,
      version_id,
      obligation_id,
      scope_type,
      scope_value,
      priority,
      enabled,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM obligation_bindings
     WHERE version_id = $1
     ORDER BY priority DESC, created_at ASC`,
    [input.versionId],
  )
  return result.rows.map(toObligationBinding)
}

export async function resolveRuleVersionId(
  db: Queryable,
  input: { versionId?: string, fallbackPublished?: boolean },
): Promise<string | null> {
  const expected = normalizeString(input.versionId)
  if (expected)
    return expected
  if (!input.fallbackPublished)
    return null
  const rows = await listRuleVersions(db, {
    status: 'published',
    limit: 1,
  })
  return rows[0]?.id || null
}

export async function simulateRuleVersion(
  db: Queryable,
  input: {
    versionId?: string
    context: EngineContext
    now?: string
    fallbackPublished?: boolean
  },
): Promise<{
  versionId: string
  passed: boolean
  results: RuleDefinition[]
  engine: Awaited<ReturnType<typeof runRuleEngine>>['engine']
  checklist: ChecklistItem[]
}> {
  const versionId = await resolveRuleVersionId(db, {
    versionId: input.versionId,
    fallbackPublished: input.fallbackPublished !== false,
  })
  if (!versionId)
    throw new Error('RULE_VERSION_NOT_FOUND')

  const [definitions, bindings, obligations, obligationBindings] = await Promise.all([
    listRuleDefinitions(db, { versionId }),
    listRuleBindings(db, { versionId }),
    listObligationDefinitions(db, { versionId }),
    listObligationBindings(db, { versionId }),
  ])

  const engineResult = await runRuleEngine({
    context: input.context,
    rules: definitions,
    bindings,
    obligations,
    obligationBindings,
    now: input.now,
  })

  return {
    versionId,
    passed: engineResult.engine.passed,
    results: definitions,
    engine: engineResult.engine,
    checklist: engineResult.checklist,
  }
}

export async function buildContestRuleContext(
  db: Queryable,
  contestId: string,
): Promise<EngineContext> {
  const detail = await getContestDetail(db, {
    contestId,
    includeInternal: true,
  })
  if (!detail)
    throw new Error('CONTEST_NOT_FOUND')

  const contest = detail.contest
  return {
    activity: {
      id: contest.id,
      type: 'competition',
      name: contest.name,
    },
    instance: {
      id: contest.id,
      region: '',
      stage: '',
      track: '',
      currentSeason: contest.currentSeason || '',
      officialUrl: contest.officialUrl || '',
    },
    submission: {
      trackCount: (contest.tracks || []).length,
      timelineCount: (detail.timelines || []).length,
      rubricCount: (detail.rubrics || []).length,
    },
    policy: {
      visibility: contest.visibility || 'internal',
      status: contest.status || 'draft',
    },
    contest,
    timelines: detail.timelines,
    rubrics: detail.rubrics,
    now: new Date().toISOString(),
  }
}
