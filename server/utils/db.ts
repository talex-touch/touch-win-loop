import type { H3Event } from 'h3'
import type { Pool as PgPoolType, PoolClient, QueryResult, QueryResultRow } from 'pg'
import { Pool as PgPool } from 'pg'
import { readRuntimeSettings } from '~~/server/utils/env'

export interface Queryable {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<T>>
}

let pool: PgPoolType | null = null
let schemaReady = false
let schemaPromise: Promise<void> | null = null

function normalizeDbError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message || ''
    if (message.includes('client password must be a string')) {
      return new Error('PostgreSQL 连接失败：请在 .env.local 配置完整的 WINLOOP_PG_URL（包含用户名和密码）后重启服务。')
    }
    if (message.includes('password authentication failed for user')) {
      return new Error('PostgreSQL 鉴权失败：WINLOOP_PG_URL 的用户名或密码不正确。请优先在 .env.local 覆盖正确连接串后重启服务。')
    }
    return error
  }

  return new Error('数据库连接失败，请检查 WINLOOP_PG_URL 配置。')
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('personal', 'team')),
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  school_profile JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('team_owner', 'team_admin', 'school_admin', 'college_admin', 'advisor', 'member')),
  college_codes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS group_permission_templates (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_memberships (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  contest_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  contest_ids TEXT[] NOT NULL DEFAULT '{}',
  problem_statement TEXT NOT NULL,
  innovation_points TEXT[] NOT NULL DEFAULT '{}',
  tech_route_steps TEXT[] NOT NULL DEFAULT '{}',
  scoring_mapping TEXT[] NOT NULL DEFAULT '{}',
  risks TEXT[] NOT NULL DEFAULT '{}',
  deliverables TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT,
  source TEXT NOT NULL CHECK (source IN ('chat', 'form')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'editor', 'viewer')),
  added_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_college_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  college_code TEXT NOT NULL,
  college_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, college_code)
);

CREATE TABLE IF NOT EXISTS project_advisor_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  advisor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, advisor_user_id)
);

CREATE TABLE IF NOT EXISTS team_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  payer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_code TEXT NOT NULL DEFAULT 'team-basic',
  status TEXT NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_quotas (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  seat_limit INTEGER NOT NULL DEFAULT 20,
  seat_used INTEGER NOT NULL DEFAULT 0,
  ai_quota_total INTEGER NOT NULL DEFAULT 1000,
  ai_quota_used INTEGER NOT NULL DEFAULT 0,
  reset_cycle TEXT NOT NULL DEFAULT 'monthly',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  contest_id TEXT NOT NULL DEFAULT '',
  track_id TEXT NOT NULL DEFAULT '',
  major TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'assistant', 'user')),
  content TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mock',
  model TEXT NOT NULL DEFAULT '',
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pilot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reasoning_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  network_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  temperature DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  selected_model_group TEXT NOT NULL DEFAULT 'auto',
  selected_model_id TEXT NOT NULL DEFAULT 'auto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_ai_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_sync_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('csv_url')),
  source_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_sync_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES contest_sync_sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  preview_total INTEGER NOT NULL DEFAULT 0,
  preview_valid INTEGER NOT NULL DEFAULT 0,
  preview_invalid INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invitee_username TEXT,
  role TEXT NOT NULL CHECK (role IN ('team_owner', 'team_admin', 'school_admin', 'college_admin', 'advisor', 'member')),
  college_codes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('platform_super_admin', 'contest_admin', 'pricing_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS contests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  level TEXT NOT NULL CHECK (level IN ('national', 'provincial', 'school', 'industry')),
  disciplines TEXT[] NOT NULL DEFAULT '{}',
  organizer TEXT NOT NULL DEFAULT '',
  co_organizer TEXT NOT NULL DEFAULT '',
  official_url TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  participant_requirements TEXT NOT NULL DEFAULT '',
  team_rule TEXT NOT NULL DEFAULT '',
  current_season TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'public')),
  hot_score INTEGER NOT NULL DEFAULT 0,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  recommended_for TEXT[] NOT NULL DEFAULT '{}',
  faq TEXT NOT NULL DEFAULT '',
  faq_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_tracks (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  suitable_majors TEXT[] NOT NULL DEFAULT '{}',
  deliverable_types TEXT[] NOT NULL DEFAULT '{}',
  rubric_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contest_id, name)
);

CREATE TABLE IF NOT EXISTS contest_timelines (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('registration', 'submission', 'preliminary', 'final', 'other')),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  note TEXT NOT NULL DEFAULT '',
  source_link TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_rubrics (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES contest_tracks(id) ON DELETE CASCADE,
  scoring_mode TEXT NOT NULL DEFAULT 'weighted' CHECK (scoring_mode IN ('weighted', 'checklist')),
  version INTEGER NOT NULL DEFAULT 1,
  dimensions JSONB NOT NULL DEFAULT '[]'::JSONB,
  scoring_points TEXT[] NOT NULL DEFAULT '{}',
  deduction_items TEXT[] NOT NULL DEFAULT '{}',
  evidence_requirements TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contest_id, track_id, version)
);

CREATE TABLE IF NOT EXISTS contest_resources (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'basic_info',
    'timeline',
    'tracks',
    'scoring',
    'past_questions',
    'awarded_works',
    'templates',
    'faq',
    'judge_guidelines',
    'track_details',
    'ai_prompts',
    'submission_examples',
    'policy_notice',
    'compliance'
  )),
  title TEXT NOT NULL,
  year INTEGER NOT NULL,
  url TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'public' CHECK (access_level IN ('public', 'login_required', 'unavailable')),
  source_type TEXT NOT NULL DEFAULT 'official',
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  copyright_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'pending_verify', 'archived')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_resource_documents (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL UNIQUE REFERENCES contest_resources(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size BIGINT NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  parse_status TEXT NOT NULL DEFAULT 'queued' CHECK (parse_status IN ('queued', 'processing', 'succeeded', 'failed')),
  parse_error TEXT NOT NULL DEFAULT '',
  parser_provider TEXT NOT NULL DEFAULT '',
  parser_model TEXT NOT NULL DEFAULT '',
  analysis_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  annotation_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_resource_document_tasks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES contest_resource_documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  result_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_trends (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  hot_tags TEXT[] NOT NULL DEFAULT '{}',
  evidence_sources TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_audit_logs (
  id TEXT PRIMARY KEY,
  contest_id TEXT REFERENCES contests(id) ON DELETE SET NULL,
  resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  included_seats INTEGER NOT NULL DEFAULT 0,
  extra_seat_price_cents INTEGER NOT NULL DEFAULT 0,
  included_ai_quota INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_billing (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES billing_plans(id) ON DELETE SET NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  estimated_amount_cents INTEGER NOT NULL DEFAULT 0,
  snapshot_seat_used INTEGER NOT NULL DEFAULT 0,
  snapshot_seat_limit INTEGER NOT NULL DEFAULT 0,
  snapshot_ai_quota_total INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migrations_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_user ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_updated ON projects(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_members_project_user ON project_members(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_college_bindings_project ON project_college_bindings(project_id);
CREATE INDEX IF NOT EXISTS idx_project_advisor_bindings_project ON project_advisor_bindings(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_workspace_updated ON ai_chat_sessions(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_created ON ai_chat_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_user_ai_memories_user_created ON user_ai_memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_sync_sources_created ON contest_sync_sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_sync_runs_source_started ON contest_sync_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_platform_user_roles_user ON platform_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_contests_status_visibility ON contests(status, visibility);
CREATE INDEX IF NOT EXISTS idx_contests_level ON contests(level);
CREATE INDEX IF NOT EXISTS idx_contest_tracks_contest ON contest_tracks(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_timelines_contest ON contest_timelines(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_rubrics_contest_track ON contest_rubrics(contest_id, track_id);
CREATE INDEX IF NOT EXISTS idx_contest_resources_contest_category ON contest_resources(contest_id, category);
CREATE INDEX IF NOT EXISTS idx_contest_resources_status ON contest_resources(status);
CREATE INDEX IF NOT EXISTS idx_resource_documents_contest_status ON contest_resource_documents(contest_id, parse_status);
CREATE INDEX IF NOT EXISTS idx_resource_documents_resource ON contest_resource_documents(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_document_tasks_status_created ON contest_resource_document_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_resource_document_tasks_document ON contest_resource_document_tasks(document_id);

ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS faq_items JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS rubric_id TEXT;

ALTER TABLE contest_rubrics
  ADD COLUMN IF NOT EXISTS scoring_mode TEXT NOT NULL DEFAULT 'weighted';

ALTER TABLE contest_sync_runs
  ADD COLUMN IF NOT EXISTS updated_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE contest_resources
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_resources
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_chat_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contest_ids TEXT[] NOT NULL DEFAULT '{}';

UPDATE projects
SET contest_ids = ARRAY[contest_id]
WHERE contest_id IS NOT NULL
  AND (
    contest_ids IS NULL
    OR array_length(contest_ids, 1) IS NULL
  );

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS pilot_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS reasoning_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS network_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION NOT NULL DEFAULT 0.2;

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS selected_model_group TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS selected_model_id TEXT NOT NULL DEFAULT 'auto';

DO $$
DECLARE
  category_check_name TEXT;
BEGIN
  SELECT con.conname INTO category_check_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'contest_resources'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%category%'
  ORDER BY con.conname
  LIMIT 1;

  IF category_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contest_resources DROP CONSTRAINT %I', category_check_name);
  END IF;

  BEGIN
    ALTER TABLE contest_resources
      ADD CONSTRAINT contest_resources_category_check
      CHECK (category IN (
        'basic_info',
        'timeline',
        'tracks',
        'scoring',
        'past_questions',
        'awarded_works',
        'templates',
        'faq',
        'judge_guidelines',
        'track_details',
        'ai_prompts',
        'submission_examples',
        'policy_notice',
        'compliance'
      ));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_contest_trends_contest_year ON contest_trends(contest_id, year);
CREATE INDEX IF NOT EXISTS idx_contest_audit_logs_contest_created ON contest_audit_logs(contest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_audit_logs_action_created ON contest_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_billing_plan ON workspace_billing(plan_id);
`

async function ensureSchemaReady(poolRef: PgPoolType) {
  if (schemaReady)
    return

  if (!schemaPromise) {
    schemaPromise = (async () => {
      await poolRef.query(SCHEMA_SQL)
      schemaReady = true
    })().finally(() => {
      schemaPromise = null
    })
  }

  await schemaPromise
}

export async function getPool(event?: H3Event): Promise<PgPoolType> {
  if (!pool) {
    const runtime = readRuntimeSettings(event)
    pool = new PgPool({
      connectionString: runtime.pg.url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }

  try {
    await ensureSchemaReady(pool)
  }
  catch (error) {
    throw normalizeDbError(error)
  }

  return pool
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  event: H3Event | undefined,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  try {
    const poolRef = await getPool(event)
    return await poolRef.query<T>(text, params)
  }
  catch (error) {
    throw normalizeDbError(error)
  }
}

export async function withClient<T>(event: H3Event | undefined, run: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
    const poolRef = await getPool(event)
    const client = await poolRef.connect()

    try {
      return await run(client)
    }
    finally {
      client.release()
    }
  }
  catch (error) {
    throw normalizeDbError(error)
  }
}

export async function withTransaction<T>(event: H3Event | undefined, run: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(event, async (client) => {
    await client.query('BEGIN')
    try {
      const result = await run(client)
      await client.query('COMMIT')
      return result
    }
    catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}
