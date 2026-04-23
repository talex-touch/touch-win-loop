import type { Pool as PgPoolType, QueryResultRow } from 'pg'

let schemaReady = false
let schemaPromise: Promise<void> | null = null
let projectResourceTreeSchemaReady = false
let projectResourceTreeSchemaPromise: Promise<void> | null = null

interface MissingSchemaColumnRow extends QueryResultRow {
  table_name: string
  column_name: string
}

const PROJECT_RESOURCE_TREE_SCHEMA_CHECK_SQL = `
SELECT required.table_name, required.column_name
FROM (
  VALUES
    ('project_resources', 'parent_resource_id'),
    ('project_resources', 'sort_order'),
    ('project_resource_upload_sessions', 'parent_resource_id')
) AS required(table_name, column_name)
LEFT JOIN information_schema.columns cols
  ON cols.table_schema = 'public'
 AND cols.table_name = required.table_name
 AND cols.column_name = required.column_name
WHERE cols.column_name IS NULL
ORDER BY required.table_name, required.column_name;
`

export function normalizeDbError(error: unknown): Error {
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
  avatar_url TEXT,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

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
  team_profile JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id, role)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'workspace_members'
      AND column_name = 'is_active'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'workspace_members'
      AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE workspace_members
      RENAME COLUMN is_active TO is_enabled;
  END IF;
END $$;

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'workspace_members'
      AND column_name = 'is_active'
  ) THEN
    UPDATE workspace_members
    SET is_enabled = is_active;

    ALTER TABLE workspace_members
      DROP COLUMN is_active;
  END IF;
END $$;

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
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
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
  project_id TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'dialog_ask' CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent')),
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
  provider TEXT NOT NULL DEFAULT 'unconfigured',
  model TEXT NOT NULL DEFAULT '',
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_session_context (
  session_id TEXT PRIMARY KEY REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'dialog_ask' CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent')),
  context_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  run_state_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_checkpoint_ref TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_deepagent_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT NOT NULL DEFAULT '',
  checkpoint_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  pending_writes_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS ai_deepagent_store_items (
  namespace_path TEXT NOT NULL,
  namespace_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  item_key TEXT NOT NULL,
  value_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  index_fields_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (namespace_path, item_key)
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

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_role TEXT CHECK (project_role IS NULL OR project_role IN ('manager', 'editor', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invitee_username TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS project_role TEXT;

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('platform', 'contest', 'collab')),
  type TEXT NOT NULL CHECK (type IN (
    'platform.announcement',
    'contest.deadline_reminder',
    'workspace.invitation.created',
    'workspace.invitation.accepted',
    'workspace.member.removed',
    'project.invitation.created',
    'project.invitation.accepted',
    'project.member.added',
    'project.member.removed',
    'project.member.role_changed'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  action_url TEXT,
  action_label TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  dedupe_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS platform_user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('platform_super_admin', 'contest_admin', 'pricing_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS feishu_bitable_syncs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_mode TEXT NOT NULL DEFAULT 'interval' CHECK (schedule_mode IN ('interval', 'cron')),
  schedule_interval_minutes INTEGER,
  schedule_cron_expr TEXT,
  schedule_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  schedule_next_run_at TIMESTAMPTZ,
  schedule_last_run_at TIMESTAMPTZ,
  schedule_last_error TEXT NOT NULL DEFAULT '',
  schedule_locked_at TIMESTAMPTZ,
  schedule_lock_token TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  archived_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'interval';

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_interval_minutes INTEGER;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_cron_expr TEXT;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai';

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_next_run_at TIMESTAMPTZ;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_last_run_at TIMESTAMPTZ;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_last_error TEXT NOT NULL DEFAULT '';

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_locked_at TIMESTAMPTZ;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS schedule_lock_token TEXT;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS archived_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE feishu_bitable_syncs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$
BEGIN
  IF to_regclass('public.feishu_bitable_tasks') IS NOT NULL
    AND to_regclass('public.feishu_bitable_sync_items') IS NULL THEN
    ALTER TABLE feishu_bitable_tasks RENAME TO feishu_bitable_sync_items;
  END IF;

  IF to_regclass('public.feishu_bitable_sync_runs') IS NOT NULL
    AND to_regclass('public.feishu_bitable_sync_item_runs') IS NULL THEN
    ALTER TABLE feishu_bitable_sync_runs RENAME TO feishu_bitable_sync_item_runs;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS feishu_bitable_sync_items (
  id TEXT PRIMARY KEY,
  sync_id TEXT REFERENCES feishu_bitable_syncs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona')),
  app_token TEXT NOT NULL,
  table_id TEXT NOT NULL,
  view_id TEXT NOT NULL DEFAULT '',
  source_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  writeback_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  auto_sync_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mapping_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  options_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_run_at TIMESTAMPTZ,
  schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_mode TEXT NOT NULL DEFAULT 'interval' CHECK (schedule_mode IN ('interval', 'cron')),
  schedule_interval_minutes INTEGER,
  schedule_cron_expr TEXT,
  schedule_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  schedule_next_run_at TIMESTAMPTZ,
  schedule_last_run_at TIMESTAMPTZ,
  schedule_last_error TEXT NOT NULL DEFAULT '',
  schedule_locked_at TIMESTAMPTZ,
  schedule_lock_token TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feishu_bitable_sync_item_runs (
  id TEXT PRIMARY KEY,
  sync_item_id TEXT NOT NULL REFERENCES feishu_bitable_sync_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('manual', 'event', 'scheduled')),
  mode TEXT NOT NULL DEFAULT 'full' CHECK (mode IN ('full', 'delta')),
  delta_record_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  diagnostics_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feishu_bitable_sync_run_samples (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES feishu_bitable_sync_item_runs(id) ON DELETE CASCADE,
  sync_item_id TEXT NOT NULL REFERENCES feishu_bitable_sync_items(id) ON DELETE CASCADE,
  sample_type TEXT NOT NULL CHECK (sample_type IN ('auto_sync_filtered', 'business_skipped')),
  sample_index INTEGER NOT NULL,
  record_id TEXT NOT NULL DEFAULT '',
  external_id TEXT,
  reason_code TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, sample_type, sample_index)
);

CREATE TABLE IF NOT EXISTS feishu_external_refs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('feishu_bitable')),
  scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona')),
  external_id TEXT NOT NULL,
  sync_item_id TEXT REFERENCES feishu_bitable_sync_items(id) ON DELETE SET NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, scope, external_id)
);

CREATE TABLE IF NOT EXISTS feishu_bitable_event_dedup (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL DEFAULT '',
  app_token TEXT NOT NULL DEFAULT '',
  table_id TEXT NOT NULL DEFAULT '',
  record_ids TEXT[] NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feishu_post_sync_tasks (
  id TEXT PRIMARY KEY,
  sync_item_id TEXT REFERENCES feishu_bitable_sync_items(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES feishu_bitable_sync_item_runs(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona')),
  entity_id TEXT NOT NULL,
  external_id TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL CHECK (task_type IN ('embedding_upsert', 'search_index_refresh', 'entity_analysis', 'writeback_retry')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempt INTEGER NOT NULL DEFAULT 6,
  source_hash TEXT NOT NULL DEFAULT '',
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_type, scope, entity_id, source_hash)
);

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'vector'
  ) THEN
    CREATE TABLE IF NOT EXISTS feishu_vectors (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona')),
      entity_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      embedding vector,
      source_hash TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(scope, entity_id, chunk_index, source_hash)
    );
  ELSE
    CREATE TABLE IF NOT EXISTS feishu_vectors (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona')),
      entity_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      embedding_json JSONB NOT NULL DEFAULT '[]'::JSONB,
      source_hash TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(scope, entity_id, chunk_index, source_hash)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS feishu_search_index (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona')),
  entity_id TEXT NOT NULL,
  external_id TEXT NOT NULL DEFAULT '',
  sync_item_id TEXT REFERENCES feishu_bitable_sync_items(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES feishu_bitable_sync_item_runs(id) ON DELETE SET NULL,
  source_hash TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scope, entity_id, source_hash)
);

CREATE TABLE IF NOT EXISTS feishu_entity_analysis (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona')),
  entity_id TEXT NOT NULL,
  external_id TEXT NOT NULL DEFAULT '',
  sync_item_id TEXT REFERENCES feishu_bitable_sync_items(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES feishu_bitable_sync_item_runs(id) ON DELETE SET NULL,
  source_hash TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  analysis_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scope, entity_id, source_hash)
);

CREATE TABLE IF NOT EXISTS activity_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('competition', 'exam', 'application')),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  official_url TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_instances (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activity_catalog(id) ON DELETE CASCADE,
  year INTEGER,
  batch_label TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  track TEXT NOT NULL DEFAULT '',
  registration_start_at TIMESTAMPTZ,
  registration_end_at TIMESTAMPTZ,
  event_start_at TIMESTAMPTZ,
  event_end_at TIMESTAMPTZ,
  location_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  activity_id TEXT REFERENCES activity_catalog(id) ON DELETE SET NULL,
  instance_id TEXT REFERENCES activity_instances(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('web', 'wechat', 'pdf', 'word', 'excel', 'manual', 'feishu_bitable')),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  file_url TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  publish_time TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS semantic_paths (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'date', 'array', 'object')),
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rule_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  note TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  rolled_back_from_version_id TEXT REFERENCES rule_versions(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rule_definitions (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES rule_versions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('eligibility', 'material', 'workflow', 'reminder', 'quality', 'compliance')),
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
  when_expr JSONB NOT NULL DEFAULT '{}'::JSONB,
  assert_expr JSONB NOT NULL DEFAULT '{}'::JSONB,
  message_template TEXT NOT NULL DEFAULT '',
  target_path TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version_id, code)
);

CREATE TABLE IF NOT EXISTS rule_bindings (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES rule_versions(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES rule_definitions(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'activity', 'instance', 'region', 'stage', 'track', 'policy')),
  scope_value TEXT NOT NULL DEFAULT '*',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  effective_start_at TIMESTAMPTZ,
  effective_end_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS obligation_definitions (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES rule_versions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  when_expr JSONB NOT NULL DEFAULT '{}'::JSONB,
  satisfied_by_expr JSONB NOT NULL DEFAULT '{}'::JSONB,
  message_when_missing TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version_id, code)
);

CREATE TABLE IF NOT EXISTS obligation_bindings (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES rule_versions(id) ON DELETE CASCADE,
  obligation_id TEXT NOT NULL REFERENCES obligation_definitions(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'activity', 'instance', 'region', 'stage', 'track', 'policy')),
  scope_value TEXT NOT NULL DEFAULT '*',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rule_annotations (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES rule_definitions(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('feishu', 'document', 'manual')),
  source_id TEXT NOT NULL,
  source_field TEXT NOT NULL DEFAULT '',
  source_path TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feishu_sync_issues (
  id TEXT PRIMARY KEY,
  sync_item_id TEXT NOT NULL REFERENCES feishu_bitable_sync_items(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona')),
  record_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  reason_code TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  resolution TEXT NOT NULL DEFAULT '' CHECK (resolution IN ('', 'manual_bind', 'ignored', 'auto_recovered')),
  resolution_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sync_item_id, record_id, external_id)
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
  cover_image_url TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  organizer TEXT NOT NULL DEFAULT '',
  undertaker TEXT NOT NULL DEFAULT '',
  participant_requirements TEXT NOT NULL DEFAULT '',
  team_rule TEXT NOT NULL DEFAULT '',
  award_ratio TEXT NOT NULL DEFAULT '',
  suitable_majors TEXT[] NOT NULL DEFAULT '{}',
  deliverable_types TEXT[] NOT NULL DEFAULT '{}',
  rubric_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contest_id, name)
);

CREATE TABLE IF NOT EXISTS project_contest_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES contest_tracks(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, contest_id)
);

CREATE TABLE IF NOT EXISTS project_contest_adaptations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES contest_tracks(id) ON DELETE RESTRICT,
  problem_statement TEXT NOT NULL DEFAULT '',
  innovation_points TEXT[] NOT NULL DEFAULT '{}',
  tech_route_steps TEXT[] NOT NULL DEFAULT '{}',
  scoring_mapping TEXT[] NOT NULL DEFAULT '{}',
  risks TEXT[] NOT NULL DEFAULT '{}',
  deliverables TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, contest_id)
);

CREATE TABLE IF NOT EXISTS project_settings_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  revision BIGINT NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT '',
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id, device_id)
);

CREATE TABLE IF NOT EXISTS project_workspace_view_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  revision BIGINT NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT '',
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id, device_id)
);

ALTER TABLE project_settings_drafts
  ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';

ALTER TABLE project_settings_drafts
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE project_settings_drafts
  DROP CONSTRAINT IF EXISTS project_settings_drafts_user_id_project_id_key;

ALTER TABLE project_settings_drafts
  DROP CONSTRAINT IF EXISTS project_settings_drafts_user_id_project_id_device_id_key;

ALTER TABLE project_settings_drafts
  ADD CONSTRAINT project_settings_drafts_user_id_project_id_device_id_key
  UNIQUE (user_id, project_id, device_id);

ALTER TABLE project_workspace_view_states
  ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';

ALTER TABLE project_workspace_view_states
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE project_workspace_view_states
  DROP CONSTRAINT IF EXISTS project_workspace_view_states_user_id_project_id_key;

ALTER TABLE project_workspace_view_states
  DROP CONSTRAINT IF EXISTS project_workspace_view_states_user_id_project_id_device_id_key;

ALTER TABLE project_workspace_view_states
  ADD CONSTRAINT project_workspace_view_states_user_id_project_id_device_id_key
  UNIQUE (user_id, project_id, device_id);

CREATE TABLE IF NOT EXISTS user_workspace_last_projects (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS user_workspace_display_defaults (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_project_workspace_ai_tabs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS workspace_display_defaults (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_workspace_display_overrides (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_user_workspace_display_overrides_workspace_user
  ON user_workspace_display_overrides (workspace_id, user_id);

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

CREATE TABLE IF NOT EXISTS contest_track_timelines (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES contest_tracks(id) ON DELETE CASCADE,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contest_id, id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contest_resources_contest_id_id_key'
      AND conrelid = 'contest_resources'::regclass
  ) THEN
    ALTER TABLE contest_resources
      ADD CONSTRAINT contest_resources_contest_id_id_key
      UNIQUE (contest_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_resources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('upload', 'library', 'collab')),
  resource_kind TEXT NOT NULL DEFAULT 'binary' CHECK (resource_kind IN ('binary', 'markdown', 'draw')),
  linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
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
  year INTEGER NOT NULL DEFAULT 0,
  source_link TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT 'public' CHECK (availability IN ('public', 'login_required', 'unavailable')),
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'pending_verify', 'archived')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_resource_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES contest_resources(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('library', 'upload')),
  added_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, resource_id)
);

CREATE TABLE IF NOT EXISTS project_resource_shares (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  share_key TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'workspace')),
  duration TEXT NOT NULL CHECK (duration IN ('1h', '1d', '3d', '7d', '1mon')),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS contest_resource_profiles (
  resource_id TEXT PRIMARY KEY REFERENCES contest_resources(id) ON DELETE CASCADE,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  predicted_category TEXT NOT NULL DEFAULT '',
  category_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  ai_tags TEXT[] NOT NULL DEFAULT '{}',
  major_tags TEXT[] NOT NULL DEFAULT '{}',
  stage_tags TEXT[] NOT NULL DEFAULT '{}',
  quality_score INTEGER NOT NULL DEFAULT 0,
  value_score INTEGER NOT NULL DEFAULT 0,
  hot_score INTEGER NOT NULL DEFAULT 0,
  quality_issues JSONB NOT NULL DEFAULT '[]'::JSONB,
  governance_status TEXT NOT NULL DEFAULT 'pending' CHECK (governance_status IN ('pending', 'healthy', 'review', 'suggested_invalid', 'suggested_archive')),
  analysis_version TEXT NOT NULL DEFAULT 'v1',
  manual_overrides JSONB NOT NULL DEFAULT '{}'::JSONB,
  component_scores JSONB NOT NULL DEFAULT '{}'::JSONB,
  analysis_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_analyzed_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contest_resource_profiles_contest_resource_fk
    FOREIGN KEY (contest_id, resource_id)
    REFERENCES contest_resources(contest_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contest_resource_relations (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  source_resource_id TEXT NOT NULL REFERENCES contest_resources(id) ON DELETE CASCADE,
  target_resource_id TEXT NOT NULL REFERENCES contest_resources(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('recommended', 'similar', 'duplicate', 'complementary')),
  weight INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contest_resource_relations_source_contest_resource_fk
    FOREIGN KEY (contest_id, source_resource_id)
    REFERENCES contest_resources(contest_id, id)
    ON DELETE CASCADE,
  CONSTRAINT contest_resource_relations_target_contest_resource_fk
    FOREIGN KEY (contest_id, target_resource_id)
    REFERENCES contest_resources(contest_id, id)
    ON DELETE CASCADE,
  UNIQUE(source_resource_id, target_resource_id, relation_type)
);

CREATE TABLE IF NOT EXISTS contest_resource_search_events (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
  query TEXT NOT NULL DEFAULT '',
  filters_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_count INTEGER NOT NULL DEFAULT 0,
  clicked BOOLEAN NOT NULL DEFAULT FALSE,
  session_id TEXT NOT NULL DEFAULT '',
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contest_resource_search_events_contest_resource_fk
    FOREIGN KEY (contest_id, resource_id)
    REFERENCES contest_resources(contest_id, id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS contest_resource_governance_tasks (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  resource_id TEXT REFERENCES contest_resources(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('profile_analyze', 'relation_refresh', 'governance_apply', 'search_metric_rollup')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempt INTEGER NOT NULL DEFAULT 6,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contest_resource_governance_tasks_contest_resource_fk
    FOREIGN KEY (contest_id, resource_id)
    REFERENCES contest_resources(contest_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_resource_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_resource_id TEXT NOT NULL UNIQUE REFERENCES project_resources(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  source_object_key TEXT NOT NULL DEFAULT '',
  preview_object_key TEXT NOT NULL DEFAULT '',
  storage_provider TEXT NOT NULL DEFAULT 'local',
  source_storage_provider TEXT NOT NULL DEFAULT 'local',
  preview_storage_provider TEXT NOT NULL DEFAULT 'local',
  file_name TEXT NOT NULL DEFAULT '',
  source_file_name TEXT NOT NULL DEFAULT '',
  preview_file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  source_mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  preview_mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size BIGINT NOT NULL DEFAULT 0,
  source_file_size BIGINT NOT NULL DEFAULT 0,
  preview_file_size BIGINT NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  parse_status TEXT NOT NULL DEFAULT 'queued' CHECK (parse_status IN ('queued', 'processing', 'succeeded', 'failed')),
  preview_status TEXT NOT NULL DEFAULT 'queued' CHECK (preview_status IN ('queued', 'converting', 'finalizing', 'succeeded', 'failed')),
  preview_stage TEXT NOT NULL DEFAULT 'queued' CHECK (preview_stage IN ('queued', 'converting', 'finalizing', 'succeeded', 'failed')),
  preview_progress_percent INTEGER NOT NULL DEFAULT 0,
  preview_eta_seconds INTEGER NOT NULL DEFAULT 0,
  preview_error TEXT NOT NULL DEFAULT '',
  parse_error TEXT NOT NULL DEFAULT '',
  queued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_attempt_duration_ms INTEGER NOT NULL DEFAULT 0,
  total_attempt_duration_ms INTEGER NOT NULL DEFAULT 0,
  parser_provider TEXT NOT NULL DEFAULT '',
  parser_model TEXT NOT NULL DEFAULT '',
  analysis_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  annotation_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_resource_review_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_resource_id TEXT NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES project_resource_documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  prompt TEXT NOT NULL DEFAULT '',
  page_total INTEGER NOT NULL DEFAULT 0,
  page_reviewed INTEGER NOT NULL DEFAULT 0,
  result_summary TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_resource_review_findings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES project_resource_review_jobs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_resource_id TEXT NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES project_resource_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'low', 'medium', 'high')),
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  quote TEXT NOT NULL DEFAULT '',
  source_block_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  locator_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  bbox_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_resource_collab_docs (
  resource_id TEXT PRIMARY KEY REFERENCES project_resources(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('markdown', 'draw')),
  ydoc_update BYTEA NOT NULL DEFAULT '\\x',
  revision BIGINT NOT NULL DEFAULT 1,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_resource_device_arrangements (
  resource_id TEXT PRIMARY KEY REFERENCES project_resources(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  preview_svg TEXT NOT NULL DEFAULT '',
  revision BIGINT NOT NULL DEFAULT 1,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_knowledge_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project_resource', 'contest_resource')),
  source_resource_id TEXT REFERENCES project_resources(id) ON DELETE CASCADE,
  linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'extracting', 'chunking', 'embedding', 'ready', 'failed', 'stale', 'skipped')),
  progress_percent INTEGER NOT NULL DEFAULT 0,
  eta_seconds INTEGER NOT NULL DEFAULT 0,
  chunk_total INTEGER NOT NULL DEFAULT 0,
  chunk_indexed INTEGER NOT NULL DEFAULT 0,
  source_hash TEXT NOT NULL DEFAULT '',
  index_version TEXT NOT NULL DEFAULT '',
  last_indexed_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  last_error_stage TEXT NOT NULL DEFAULT '',
  last_task_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_knowledge_sources_target_check
    CHECK (source_resource_id IS NOT NULL OR linked_contest_resource_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS project_knowledge_index_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project_resource', 'contest_resource')),
  source_resource_id TEXT REFERENCES project_resources(id) ON DELETE CASCADE,
  linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('upsert', 'reindex', 'delete')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  stage TEXT NOT NULL DEFAULT 'queued' CHECK (stage IN ('queued', 'extracting', 'chunking', 'embedding', 'finalizing')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempt INTEGER NOT NULL DEFAULT 3,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  eta_seconds INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_knowledge_index_tasks_target_check
    CHECK (source_resource_id IS NOT NULL OR linked_contest_resource_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS project_knowledge_analytics_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('relations_refresh', 'snapshot_capture', 'semantic_layout_refresh')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  snapshot_type TEXT CHECK (snapshot_type IN ('hourly', 'manual')),
  target_source_id TEXT REFERENCES project_knowledge_sources(id) ON DELETE CASCADE,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'vector'
  ) THEN
    CREATE TABLE IF NOT EXISTS project_knowledge_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES project_knowledge_sources(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('project_resource', 'contest_resource')),
      source_resource_id TEXT REFERENCES project_resources(id) ON DELETE CASCADE,
      linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      chunk_kind TEXT NOT NULL CHECK (chunk_kind IN ('document_page', 'document_section', 'markdown_section', 'draw_summary', 'resource_summary', 'image_summary', 'image_ocr', 'meeting_notes', 'meeting_transcript')),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      citation_label TEXT NOT NULL DEFAULT '',
      page_number INTEGER,
      section_label TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL DEFAULT '',
      index_version TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      embedding vector,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_id, chunk_index, source_hash)
    );
  ELSE
    CREATE TABLE IF NOT EXISTS project_knowledge_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES project_knowledge_sources(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('project_resource', 'contest_resource')),
      source_resource_id TEXT REFERENCES project_resources(id) ON DELETE CASCADE,
      linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      chunk_kind TEXT NOT NULL CHECK (chunk_kind IN ('document_page', 'document_section', 'markdown_section', 'draw_summary', 'resource_summary', 'image_summary', 'image_ocr', 'meeting_notes', 'meeting_transcript')),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      citation_label TEXT NOT NULL DEFAULT '',
      page_number INTEGER,
      section_label TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL DEFAULT '',
      index_version TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      embedding_json JSONB NOT NULL DEFAULT '[]'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_id, chunk_index, source_hash)
    );
  END IF;
END $$;

DO $$
DECLARE
  project_knowledge_chunk_kind_check_name TEXT;
BEGIN
  SELECT con.conname
    INTO project_knowledge_chunk_kind_check_name
  FROM pg_constraint con
  JOIN pg_class rel
    ON rel.oid = con.conrelid
  WHERE rel.relname = 'project_knowledge_chunks'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%chunk_kind%'
  LIMIT 1;

  IF project_knowledge_chunk_kind_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE project_knowledge_chunks DROP CONSTRAINT %I', project_knowledge_chunk_kind_check_name);
  END IF;

  ALTER TABLE project_knowledge_chunks
    ADD CONSTRAINT project_knowledge_chunks_chunk_kind_check
    CHECK (chunk_kind IN (
      'document_page',
      'document_section',
      'markdown_section',
      'draw_summary',
      'resource_summary',
      'image_summary',
      'image_ocr',
      'meeting_notes',
      'meeting_transcript'
    ));
END $$;

CREATE TABLE IF NOT EXISTS project_knowledge_index_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('hourly', 'manual')),
  summary_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  diagnostics_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  visuals_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_knowledge_relations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_id TEXT REFERENCES project_knowledge_index_snapshots(id) ON DELETE SET NULL,
  source_node_type TEXT NOT NULL CHECK (source_node_type IN ('source', 'chunk')),
  source_node_id TEXT NOT NULL,
  target_node_type TEXT NOT NULL CHECK (target_node_type IN ('source', 'chunk')),
  target_node_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('belongs_to', 'derived_from', 'similar_to', 'aligned_to', 'references', 'duplicated_with')),
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  evidence_metric TEXT NOT NULL DEFAULT '',
  evidence_model TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_knowledge_semantic_layouts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_id TEXT REFERENCES project_knowledge_index_snapshots(id) ON DELETE SET NULL,
  layout_type TEXT NOT NULL CHECK (layout_type IN ('chunk_space', 'document_galaxy', 'multimodal_bridge')),
  algorithm TEXT NOT NULL CHECK (algorithm IN ('umap3d', 'pca3d')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'degraded', 'failed')),
  point_count INTEGER NOT NULL DEFAULT 0,
  cluster_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_knowledge_semantic_points (
  id TEXT PRIMARY KEY,
  layout_id TEXT NOT NULL REFERENCES project_knowledge_semantic_layouts(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('source', 'chunk', 'cluster')),
  node_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('cluster', 'document', 'chunk')),
  cluster_id TEXT NOT NULL DEFAULT '',
  modality TEXT NOT NULL DEFAULT 'unknown',
  embedding_status TEXT NOT NULL DEFAULT 'missing' CHECK (embedding_status IN ('native', 'derived', 'fallback', 'missing', 'failed')),
  importance DOUBLE PRECISION NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  z DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(layout_id, node_type, node_id, level)
);

CREATE TABLE IF NOT EXISTS canvas_library_items (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('template', 'asset')),
  template_target TEXT CHECK (template_target IN ('scene', 'page', 'frame')),
  asset_kind TEXT CHECK (asset_kind IN ('image', 'svg', 'device_shell')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  cover JSONB NOT NULL DEFAULT '{}'::JSONB,
  source TEXT NOT NULL CHECK (source IN ('admin_upload', 'design_publish')),
  draft_version_id TEXT,
  published_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canvas_library_item_versions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES canvas_library_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload_schema_version INTEGER NOT NULL DEFAULT 1,
  payload_type TEXT NOT NULL CHECK (payload_type IN ('scene_document', 'design_fragment', 'binary_asset')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  preview_payload JSONB,
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, version)
);

CREATE TABLE IF NOT EXISTS mockup_device_models (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('phone', 'tablet', 'desktop', 'watch', 'earbuds', 'glasses', 'browser')),
  brand TEXT,
  model_name TEXT NOT NULL,
  screen_width INTEGER NOT NULL CHECK (screen_width > 0),
  screen_height INTEGER NOT NULL CHECK (screen_height > 0),
  preview_asset_item_id TEXT REFERENCES canvas_library_items(id) ON DELETE SET NULL,
  preview_asset_version_id TEXT REFERENCES canvas_library_item_versions(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  default_variant_slot_key TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mockup_device_variants (
  id TEXT PRIMARY KEY,
  device_model_id TEXT NOT NULL REFERENCES mockup_device_models(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  shell_asset_item_id TEXT REFERENCES canvas_library_items(id) ON DELETE SET NULL,
  shell_asset_version_id TEXT REFERENCES canvas_library_item_versions(id) ON DELETE SET NULL,
  preview_asset_item_id TEXT REFERENCES canvas_library_items(id) ON DELETE SET NULL,
  preview_asset_version_id TEXT REFERENCES canvas_library_item_versions(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(device_model_id, slot_key)
);

ALTER TABLE mockup_device_models
  ADD COLUMN IF NOT EXISTS preview_asset_item_id TEXT REFERENCES canvas_library_items(id) ON DELETE SET NULL;

ALTER TABLE mockup_device_models
  ADD COLUMN IF NOT EXISTS preview_asset_version_id TEXT REFERENCES canvas_library_item_versions(id) ON DELETE SET NULL;

ALTER TABLE mockup_device_variants
  ADD COLUMN IF NOT EXISTS preview_asset_item_id TEXT REFERENCES canvas_library_items(id) ON DELETE SET NULL;

ALTER TABLE mockup_device_variants
  ADD COLUMN IF NOT EXISTS preview_asset_version_id TEXT REFERENCES canvas_library_item_versions(id) ON DELETE SET NULL;

ALTER TABLE mockup_device_models
  DROP CONSTRAINT IF EXISTS mockup_device_models_category_check;

UPDATE mockup_device_models
SET category = 'phone'
WHERE category IN ('iphone', 'android');

UPDATE mockup_device_models
SET category = 'desktop'
WHERE category = 'pc';

ALTER TABLE mockup_device_models
  ADD CONSTRAINT mockup_device_models_category_check
  CHECK (category IN ('phone', 'tablet', 'desktop', 'watch', 'earbuds', 'glasses', 'browser'));

ALTER TABLE mockup_device_models
  DROP CONSTRAINT IF EXISTS mockup_device_models_default_variant_slot_key_check;

ALTER TABLE mockup_device_variants
  DROP CONSTRAINT IF EXISTS mockup_device_variants_slot_key_check;

CREATE TABLE IF NOT EXISTS project_resource_comment_threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  anchor_type TEXT NOT NULL CHECK (anchor_type IN ('text_selection', 'image_node')),
  anchor_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  summary_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_resource_comment_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES project_resources(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES project_resource_comment_threads(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_meetings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL CHECK (mode IN ('audio', 'video')),
  provider TEXT NOT NULL DEFAULT '',
  provider_room_id TEXT NOT NULL DEFAULT '',
  provider_room_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'ended', 'failed')),
  transcript_status TEXT NOT NULL DEFAULT 'idle' CHECK (transcript_status IN ('idle', 'running', 'completed', 'failed')),
  recording_status TEXT NOT NULL DEFAULT 'idle' CHECK (recording_status IN ('idle', 'requested', 'processing', 'completed', 'failed')),
  summary_status TEXT NOT NULL DEFAULT 'idle' CHECK (summary_status IN ('idle', 'queued', 'processing', 'completed', 'failed')),
  recording_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL,
  notes_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  started_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_meeting_participants (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider_participant_id TEXT NOT NULL DEFAULT '',
  provider_identity TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('host', 'member', 'guest', 'system', 'unknown')),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  audio_track_state TEXT NOT NULL DEFAULT 'unknown' CHECK (audio_track_state IN ('unknown', 'muted', 'active', 'ended')),
  video_track_state TEXT NOT NULL DEFAULT 'unknown' CHECK (video_track_state IN ('unknown', 'muted', 'active', 'ended')),
  screen_share_track_state TEXT NOT NULL DEFAULT 'unknown' CHECK (screen_share_track_state IN ('unknown', 'muted', 'active', 'ended')),
  screen_share_audio_track_state TEXT NOT NULL DEFAULT 'unknown' CHECK (screen_share_audio_track_state IN ('unknown', 'muted', 'active', 'ended')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meeting_id, provider_identity)
);

CREATE TABLE IF NOT EXISTS project_meeting_invitees (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('host', 'member', 'guest', 'system', 'unknown')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_meeting_utterances (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  participant_id TEXT REFERENCES project_meeting_participants(id) ON DELETE SET NULL,
  speaker_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  speaker_name TEXT NOT NULL DEFAULT '',
  speaker_label TEXT NOT NULL DEFAULT '',
  sequence_no INTEGER NOT NULL DEFAULT 1,
  started_at_ms BIGINT NOT NULL DEFAULT 0,
  ended_at_ms BIGINT NOT NULL DEFAULT 0,
  text TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_final BOOLEAN NOT NULL DEFAULT TRUE,
  provider_event_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_meeting_jobs (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('transcript_finalize', 'recording_finalize', 'meeting_summary')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempt INTEGER NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_meeting_guest_shares (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES project_meetings(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  share_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_export_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id TEXT,
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'retry')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 1,
  parent_job_id TEXT REFERENCES project_export_jobs(id) ON DELETE SET NULL,
  error_message TEXT NOT NULL DEFAULT '',
  manifest_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  artifacts_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  started_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_meetings_project_started_at
  ON project_meetings(project_id, started_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_meetings_provider_room_id
  ON project_meetings(provider, provider_room_id);

CREATE INDEX IF NOT EXISTS idx_project_meetings_provider_room_name
  ON project_meetings(provider, provider_room_name);

CREATE INDEX IF NOT EXISTS idx_project_meeting_participants_meeting_joined_at
  ON project_meeting_participants(meeting_id, joined_at ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_meeting_participants_project_user
  ON project_meeting_participants(project_id, user_id);

CREATE INDEX IF NOT EXISTS idx_project_meeting_invitees_meeting_invited_at
  ON project_meeting_invitees(meeting_id, invited_at ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_meeting_invitees_project_user
  ON project_meeting_invitees(project_id, user_id);

CREATE INDEX IF NOT EXISTS idx_canvas_library_items_status_kind_updated_at
  ON canvas_library_items(status, kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_canvas_library_items_source_updated_at
  ON canvas_library_items(source, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_canvas_library_items_published_version_id
  ON canvas_library_items(published_version_id);

CREATE INDEX IF NOT EXISTS idx_canvas_library_item_versions_item_version_desc
  ON canvas_library_item_versions(item_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_mockup_device_models_status_category_sort_updated_at
  ON mockup_device_models(status, category, sort_order ASC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mockup_device_variants_model_slot
  ON mockup_device_variants(device_model_id, slot_key);

CREATE INDEX IF NOT EXISTS idx_mockup_device_variants_shell_asset_item_id
  ON mockup_device_variants(shell_asset_item_id);

CREATE INDEX IF NOT EXISTS idx_mockup_device_models_preview_asset_item_id
  ON mockup_device_models(preview_asset_item_id);

CREATE INDEX IF NOT EXISTS idx_mockup_device_variants_preview_asset_item_id
  ON mockup_device_variants(preview_asset_item_id);

CREATE INDEX IF NOT EXISTS idx_project_meeting_utterances_meeting_sequence
  ON project_meeting_utterances(meeting_id, sequence_no ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_meeting_utterances_event_key
  ON project_meeting_utterances(meeting_id, provider_event_key);

CREATE INDEX IF NOT EXISTS idx_project_meeting_jobs_meeting_created_at
  ON project_meeting_jobs(meeting_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_meeting_jobs_status_next_run_at
  ON project_meeting_jobs(status, next_run_at ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_export_jobs_project_created_at
  ON project_export_jobs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_export_jobs_status_created_at
  ON project_export_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_meeting_guest_shares_meeting
  ON project_meeting_guest_shares(meeting_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_meeting_guest_shares_active_meeting
  ON project_meeting_guest_shares(meeting_id)
  WHERE revoked_at IS NULL;

ALTER TABLE project_meetings
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;

ALTER TABLE project_meetings
  ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ;

ALTER TABLE project_meetings
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE project_meeting_participants
  ADD COLUMN IF NOT EXISTS screen_share_track_state TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE project_meeting_participants
  ADD COLUMN IF NOT EXISTS screen_share_audio_track_state TEXT NOT NULL DEFAULT 'unknown';

DO $$
DECLARE
  meeting_status_check_name TEXT;
BEGIN
  SELECT con.conname INTO meeting_status_check_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'project_meetings'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    AND pg_get_constraintdef(con.oid) ILIKE '%active%'
    AND pg_get_constraintdef(con.oid) ILIKE '%ended%'
    AND pg_get_constraintdef(con.oid) ILIKE '%failed%';

  IF meeting_status_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE project_meetings DROP CONSTRAINT %I', meeting_status_check_name);
  END IF;

  BEGIN
    ALTER TABLE project_meetings
      ADD CONSTRAINT project_meetings_status_check
      CHECK (status IN ('scheduled', 'active', 'ended', 'failed'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE TABLE IF NOT EXISTS project_resource_document_tasks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES project_resource_documents(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL DEFAULT 'convert_preview_pdf',
  provider TEXT NOT NULL DEFAULT 'onlyoffice',
  stage TEXT NOT NULL DEFAULT 'queued' CHECK (stage IN ('queued', 'converting', 'finalizing', 'succeeded', 'failed')),
  eta_seconds INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS project_resource_upload_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT NOT NULL DEFAULT 0,
  last_modified BIGINT NOT NULL DEFAULT 0,
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
  access_level TEXT NOT NULL DEFAULT 'public' CHECK (access_level IN ('public', 'login_required', 'unavailable')),
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  chunk_size INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 1,
  uploaded_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_chunk_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'uploading', 'paused', 'finalizing', 'completed', 'failed', 'canceled')),
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  final_object_key TEXT NOT NULL DEFAULT '',
  final_storage_provider TEXT NOT NULL DEFAULT '',
  resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_resource_upload_chunks (
  session_id TEXT NOT NULL REFERENCES project_resource_upload_sessions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL DEFAULT 0,
  object_key TEXT NOT NULL DEFAULT '',
  checksum_sha256 TEXT NOT NULL DEFAULT '',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_project_resource_upload_sessions_project_updated
  ON project_resource_upload_sessions(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_resource_upload_sessions_project_status
  ON project_resource_upload_sessions(project_id, status, expires_at);

CREATE TABLE IF NOT EXISTS project_outline_snapshots (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  context_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  reason TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_project_change_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent')),
  change_type TEXT NOT NULL CHECK (change_type IN (
    'settings_common_patch',
    'contest_bindings_replace',
    'adaptation_patch',
    'resource_bind_library',
    'resource_update_metadata',
    'resource_archive',
    'resource_restore',
    'resource_purge'
  )),
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  destructive BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'failed')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_reason TEXT NOT NULL DEFAULT '',
  executed_result JSONB NOT NULL DEFAULT '{}'::JSONB,
  failed_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_workflow_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  definition_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES ai_workflow_definitions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_review')),
  trigger_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  trigger_payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  definition_snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  runtime_state_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  latest_step_index INTEGER NOT NULL DEFAULT -1,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_workflow_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_workflow_runs(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL REFERENCES ai_workflow_definitions(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL DEFAULT '',
  step_index INTEGER NOT NULL DEFAULT 0,
  step_name TEXT NOT NULL DEFAULT '',
  step_type TEXT NOT NULL CHECK (step_type IN ('prompt', 'tool', 'agent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_review', 'skipped')),
  tool_key TEXT NOT NULL DEFAULT '',
  agent_mode TEXT NOT NULL DEFAULT '' CHECK (agent_mode = '' OR agent_mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'document_assist', 'contextual_agent')),
  continue_on_error BOOLEAN NOT NULL DEFAULT FALSE,
  input_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  review_context_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, step_index)
);

CREATE TABLE IF NOT EXISTS project_issue_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  source_mode TEXT NOT NULL CHECK (source_mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent')),
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  review_submission_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_submission_status IN ('draft', 'submitted')),
  review_submitted_at TIMESTAMPTZ,
  review_submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_resource_favorites (
  id TEXT PRIMARY KEY,
  contest_resource_id TEXT NOT NULL REFERENCES contest_resources(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(actor_user_id, contest_resource_id)
);

CREATE TABLE IF NOT EXISTS project_issues (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES project_issue_reports(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  evidence TEXT NOT NULL DEFAULT '',
  recommendation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_topic_boards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contest_id TEXT NOT NULL DEFAULT '',
  track_id TEXT NOT NULL DEFAULT '',
  input_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  team_skill_profile TEXT[] NOT NULL DEFAULT '{}',
  compare_matrix JSONB NOT NULL DEFAULT '[]'::JSONB,
  board_summary TEXT NOT NULL DEFAULT '',
  selected_candidate_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_topic_candidates (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES project_topic_boards(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  decision_status TEXT NOT NULL DEFAULT 'candidate' CHECK (decision_status IN ('candidate', 'shortlisted', 'rejected', 'selected')),
  total_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(board_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'page_view',
  event_name TEXT NOT NULL DEFAULT '',
  page_key TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS policy_library_items (
  id TEXT PRIMARY KEY,
  meeting_name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  conference_date TEXT NOT NULL DEFAULT '',
  importance TEXT NOT NULL DEFAULT '',
  official_material TEXT NOT NULL DEFAULT '',
  official_material_link TEXT NOT NULL DEFAULT '',
  wechat_material TEXT NOT NULL DEFAULT '',
  wechat_material_link TEXT NOT NULL DEFAULT '',
  weibo_material TEXT NOT NULL DEFAULT '',
  weibo_material_link TEXT NOT NULL DEFAULT '',
  douyin_material TEXT NOT NULL DEFAULT '',
  douyin_material_link TEXT NOT NULL DEFAULT '',
  xiaohongshu_material TEXT NOT NULL DEFAULT '',
  xiaohongshu_material_link TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS defense_persona_presets (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  contest_external_id TEXT NOT NULL,
  track_external_id TEXT NOT NULL DEFAULT '',
  sync_item_id TEXT REFERENCES feishu_bitable_sync_items(id) ON DELETE SET NULL,
  judge_type TEXT NOT NULL CHECK (judge_type IN ('technical', 'business', 'expression', 'custom')),
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  focus_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  scoring_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_defense_personas (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_contest_id TEXT REFERENCES contests(id) ON DELETE SET NULL,
  source_track_id TEXT REFERENCES contest_tracks(id) ON DELETE SET NULL,
  source_template_key TEXT NOT NULL DEFAULT '',
  judge_type TEXT NOT NULL CHECK (judge_type IN ('technical', 'business', 'expression', 'custom')),
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  focus_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  scoring_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_customized BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_defense_session_state (
  session_id TEXT PRIMARY KEY REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL CHECK (current_stage IN ('opening', 'qa', 'rebuttal', 'closing')),
  turn_count INTEGER NOT NULL DEFAULT 0,
  selected_persona_ids_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  summary_status TEXT NOT NULL DEFAULT 'idle' CHECK (summary_status IN ('idle', 'queued', 'processing', 'completed', 'failed')),
  summary_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL,
  linked_meeting_id TEXT REFERENCES project_meetings(id) ON DELETE SET NULL,
  last_input_mode TEXT NOT NULL DEFAULT 'text' CHECK (last_input_mode IN ('text', 'audio', 'image', 'video_frames', 'mixed')),
  last_context_pack_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_scorecard_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  realtime_meta_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_defense_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('opening', 'qa', 'rebuttal', 'closing')),
  turn_index INTEGER NOT NULL DEFAULT 1,
  persona_id TEXT REFERENCES project_defense_personas(id) ON DELETE SET NULL,
  judge_type TEXT NOT NULL CHECK (judge_type IN ('technical', 'business', 'expression', 'custom')),
  judge_name TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT '',
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  evidence_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  attachment_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_defense_summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL CHECK (summary_type IN ('turn', 'session')),
  turn_index INTEGER,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'queued', 'processing', 'completed', 'failed')),
  summary_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  markdown TEXT NOT NULL DEFAULT '',
  resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS release_versions (
  id TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('contest', 'policy_library')),
  scope_id TEXT NOT NULL,
  live_entity_id TEXT NOT NULL DEFAULT '',
  scope_title TEXT NOT NULL DEFAULT '',
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN (
    'pending_first_review',
    'pending_second_review',
    'approved',
    'rejected',
    'published',
    'superseded'
  )),
  snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  diff_summary_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  sync_item_id TEXT REFERENCES feishu_bitable_sync_items(id) ON DELETE SET NULL,
  sync_run_id TEXT REFERENCES feishu_bitable_sync_item_runs(id) ON DELETE SET NULL,
  first_review_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  first_review_at TIMESTAMPTZ,
  second_review_claimed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  second_review_claimed_at TIMESTAMPTZ,
  second_review_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  second_review_at TIMESTAMPTZ,
  rejected_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  reject_reason TEXT NOT NULL DEFAULT '',
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  superseded_by_version_id TEXT REFERENCES release_versions(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scope_kind, scope_id, version_number)
);

CREATE TABLE IF NOT EXISTS release_review_logs (
  id TEXT PRIMARY KEY,
  release_version_id TEXT NOT NULL REFERENCES release_versions(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'sync_generated',
    'manual_generated',
    'sync_draft_overwritten',
    'first_review_approved',
    'second_review_claimed',
    'second_review_approved',
    'rejected',
    'published'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE release_review_logs
  DROP CONSTRAINT IF EXISTS release_review_logs_action_check;

ALTER TABLE release_review_logs
  ADD CONSTRAINT release_review_logs_action_check
  CHECK (action IN (
    'sync_generated',
    'manual_generated',
    'sync_draft_overwritten',
    'first_review_approved',
    'second_review_claimed',
    'second_review_approved',
    'rejected',
    'published'
  ));

-- Audit logs intentionally avoid foreign keys so events remain queryable
-- even after referenced workspaces, projects, resources, or users are deleted.
CREATE TABLE IF NOT EXISTS billing_usage_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  contest_id TEXT,
  track_id TEXT,
  project_resource_id TEXT,
  contest_resource_id TEXT,
  report_id TEXT,
  actor_user_id TEXT,
  event_code TEXT NOT NULL CHECK (event_code IN (
    'resource.download',
    'resource.favorite.create',
    'ai.topic_proposal.generate',
    'review.submit',
    'review.report.export',
    'ai.defense.start'
  )),
  result TEXT NOT NULL CHECK (result IN ('success', 'failed')),
  source_route TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'business_team' CHECK (plan_tier IN ('personal_team', 'business_team')),
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  included_seats INTEGER NOT NULL DEFAULT 0,
  extra_seat_price_cents INTEGER NOT NULL DEFAULT 0,
  included_ai_quota INTEGER NOT NULL DEFAULT 0,
  included_projects INTEGER NOT NULL DEFAULT 0,
  projects_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  extra_project_slot_price_cents INTEGER NOT NULL DEFAULT 0,
  default_project_seat_limit INTEGER NOT NULL DEFAULT 15,
  project_seat_price_cents INTEGER NOT NULL DEFAULT 0,
  min_charged_project_seats INTEGER NOT NULL DEFAULT 0,
  charge_all_project_seats BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'billing_plans'
      AND column_name = 'is_active'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'billing_plans'
      AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE billing_plans
      RENAME COLUMN is_active TO is_enabled;
  END IF;
END $$;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'billing_plans'
      AND column_name = 'is_active'
  ) THEN
    UPDATE billing_plans
    SET is_enabled = is_active;

    ALTER TABLE billing_plans
      DROP COLUMN is_active;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workspace_billing (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES billing_plans(id) ON DELETE SET NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  extra_project_slots INTEGER NOT NULL DEFAULT 0,
  estimated_amount_cents INTEGER NOT NULL DEFAULT 0,
  snapshot_seat_used INTEGER NOT NULL DEFAULT 0,
  snapshot_seat_limit INTEGER NOT NULL DEFAULT 0,
  snapshot_ai_quota_total INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_billing_orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'failed')),
  provider TEXT NOT NULL DEFAULT 'mock' CHECK (provider IN ('mock')),
  estimate_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_seat_quotas (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seat_limit INTEGER NOT NULL DEFAULT 5,
  seat_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migrations_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_issue_reports
  ADD COLUMN IF NOT EXISTS review_submission_status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE project_issue_reports
  ADD COLUMN IF NOT EXISTS review_submitted_at TIMESTAMPTZ;

ALTER TABLE project_issue_reports
  ADD COLUMN IF NOT EXISTS review_submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ai_workflow_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  definition_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_workflow_definitions
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE ai_workflow_definitions
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE ai_workflow_definitions
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_workflow_definitions
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_workflow_definitions
  ADD COLUMN IF NOT EXISTS definition_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_workflow_definitions
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ai_workflow_definitions
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ai_workflow_definitions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ai_workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES ai_workflow_definitions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_review')),
  trigger_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  trigger_payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  definition_snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  runtime_state_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  latest_step_index INTEGER NOT NULL DEFAULT -1,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS trigger_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS trigger_payload_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS definition_snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS runtime_state_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS latest_step_index INTEGER NOT NULL DEFAULT -1;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE ai_workflow_runs
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ai_workflow_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_workflow_runs(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL REFERENCES ai_workflow_definitions(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL DEFAULT '',
  step_index INTEGER NOT NULL DEFAULT 0,
  step_name TEXT NOT NULL DEFAULT '',
  step_type TEXT NOT NULL CHECK (step_type IN ('prompt', 'tool', 'agent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_review', 'skipped')),
  tool_key TEXT NOT NULL DEFAULT '',
  agent_mode TEXT NOT NULL DEFAULT '' CHECK (agent_mode = '' OR agent_mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'document_assist', 'contextual_agent')),
  continue_on_error BOOLEAN NOT NULL DEFAULT FALSE,
  input_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  review_context_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, step_index)
);

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS workflow_id TEXT REFERENCES ai_workflow_definitions(id) ON DELETE CASCADE;

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS step_id TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS step_index INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS step_name TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS step_type TEXT NOT NULL DEFAULT 'prompt';

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS tool_key TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS agent_mode TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS continue_on_error BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS input_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS output_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS review_context_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE ai_workflow_run_steps
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE project_issue_reports
SET review_submission_status = 'draft'
WHERE COALESCE(review_submission_status, '') NOT IN ('draft', 'submitted');

-- 先补齐旧库在索引依赖上的缺失列，避免 CREATE INDEX 因列不存在而中断整段迁移。
ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_status TEXT NOT NULL DEFAULT 'queued';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;

ALTER TABLE project_resource_document_tasks
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'queued';

DO $$
BEGIN
  IF to_regclass('public.feishu_bitable_sync_items') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_bitable_sync_items'
        AND column_name = 'target_type'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_bitable_sync_items'
        AND column_name = 'entity_type'
    ) THEN
      ALTER TABLE feishu_bitable_sync_items RENAME COLUMN target_type TO entity_type;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_bitable_sync_items'
        AND column_name = 'is_active'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_bitable_sync_items'
        AND column_name = 'is_enabled'
    ) THEN
      ALTER TABLE feishu_bitable_sync_items RENAME COLUMN is_active TO is_enabled;
    END IF;
  END IF;

  IF to_regclass('public.feishu_bitable_sync_item_runs') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_bitable_sync_item_runs'
        AND column_name = 'task_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_bitable_sync_item_runs'
        AND column_name = 'sync_item_id'
    ) THEN
    ALTER TABLE feishu_bitable_sync_item_runs RENAME COLUMN task_id TO sync_item_id;
  END IF;

  IF to_regclass('public.feishu_external_refs') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_external_refs'
        AND column_name = 'task_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_external_refs'
        AND column_name = 'sync_item_id'
    ) THEN
    ALTER TABLE feishu_external_refs RENAME COLUMN task_id TO sync_item_id;
  END IF;

  IF to_regclass('public.feishu_post_sync_tasks') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_post_sync_tasks'
        AND column_name = 'task_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_post_sync_tasks'
        AND column_name = 'sync_item_id'
    ) THEN
    ALTER TABLE feishu_post_sync_tasks RENAME COLUMN task_id TO sync_item_id;
  END IF;

  IF to_regclass('public.feishu_search_index') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_search_index'
        AND column_name = 'task_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_search_index'
        AND column_name = 'sync_item_id'
    ) THEN
    ALTER TABLE feishu_search_index RENAME COLUMN task_id TO sync_item_id;
  END IF;

  IF to_regclass('public.feishu_entity_analysis') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_entity_analysis'
        AND column_name = 'task_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_entity_analysis'
        AND column_name = 'sync_item_id'
    ) THEN
    ALTER TABLE feishu_entity_analysis RENAME COLUMN task_id TO sync_item_id;
  END IF;

  IF to_regclass('public.feishu_sync_issues') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_sync_issues'
        AND column_name = 'task_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_sync_issues'
        AND column_name = 'sync_item_id'
    ) THEN
      ALTER TABLE feishu_sync_issues RENAME COLUMN task_id TO sync_item_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_sync_issues'
        AND column_name = 'target_type'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'feishu_sync_issues'
        AND column_name = 'entity_type'
    ) THEN
      ALTER TABLE feishu_sync_issues RENAME COLUMN target_type TO entity_type;
    END IF;
  END IF;
END $$;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS sync_id TEXT REFERENCES feishu_bitable_syncs(id) ON DELETE CASCADE;

INSERT INTO feishu_bitable_syncs (
  id,
  name,
  source_json,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
SELECT
  CONCAT('sync_', t.id),
  COALESCE(NULLIF(t.name, ''), CONCAT('多维同步 ', ROW_NUMBER() OVER (ORDER BY t.created_at, t.id))),
  jsonb_strip_nulls(jsonb_build_object(
    'appToken', t.app_token,
    'appName', COALESCE(t.source_json->>'appName', ''),
    'sourceUrl', COALESCE(t.source_json->>'sourceUrl', '')
  )),
  t.created_by_user_id,
  t.updated_by_user_id,
  COALESCE(t.created_at, NOW()),
  COALESCE(t.updated_at, NOW())
FROM feishu_bitable_sync_items t
WHERE t.sync_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE feishu_bitable_sync_items
SET sync_id = CONCAT('sync_', id)
WHERE sync_id IS NULL;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS source_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS writeback_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS auto_sync_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'interval';

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_interval_minutes INTEGER;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_cron_expr TEXT;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai';

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_next_run_at TIMESTAMPTZ;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_last_run_at TIMESTAMPTZ;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_last_error TEXT NOT NULL DEFAULT '';

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_locked_at TIMESTAMPTZ;

ALTER TABLE feishu_bitable_sync_items
  ADD COLUMN IF NOT EXISTS schedule_lock_token TEXT;

ALTER TABLE feishu_bitable_sync_items
  DROP CONSTRAINT IF EXISTS feishu_bitable_tasks_schedule_mode_check;

ALTER TABLE feishu_bitable_sync_items
  DROP CONSTRAINT IF EXISTS feishu_bitable_sync_items_schedule_mode_check;

ALTER TABLE feishu_bitable_sync_items
  ADD CONSTRAINT feishu_bitable_sync_items_schedule_mode_check
  CHECK (schedule_mode IN ('interval', 'cron'));

ALTER TABLE feishu_bitable_sync_item_runs
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'full';

ALTER TABLE feishu_bitable_sync_item_runs
  ADD COLUMN IF NOT EXISTS delta_record_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE feishu_bitable_sync_item_runs
  ADD COLUMN IF NOT EXISTS diagnostics_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE feishu_bitable_sync_item_runs
  DROP CONSTRAINT IF EXISTS feishu_bitable_sync_runs_trigger_source_check;

ALTER TABLE feishu_bitable_sync_item_runs
  DROP CONSTRAINT IF EXISTS feishu_bitable_sync_item_runs_trigger_source_check;

ALTER TABLE feishu_bitable_sync_item_runs
  ADD CONSTRAINT feishu_bitable_sync_item_runs_trigger_source_check
  CHECK (trigger_source IN ('manual', 'event', 'scheduled'));

ALTER TABLE feishu_bitable_sync_item_runs
  DROP CONSTRAINT IF EXISTS feishu_bitable_sync_runs_mode_check;

ALTER TABLE feishu_bitable_sync_item_runs
  DROP CONSTRAINT IF EXISTS feishu_bitable_sync_item_runs_mode_check;

ALTER TABLE feishu_bitable_sync_item_runs
  ADD CONSTRAINT feishu_bitable_sync_item_runs_mode_check
  CHECK (mode IN ('full', 'delta'));

ALTER TABLE feishu_post_sync_tasks
  ADD COLUMN IF NOT EXISTS sync_item_id TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feishu_post_sync_tasks'
      AND column_name = 'task_id'
  ) THEN
    UPDATE feishu_post_sync_tasks
    SET sync_item_id = task_id
    WHERE sync_item_id IS NULL
      AND task_id IS NOT NULL;
  END IF;
END $$;

ALTER TABLE feishu_sync_issues
  ADD COLUMN IF NOT EXISTS sync_item_id TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feishu_sync_issues'
      AND column_name = 'task_id'
  ) THEN
    UPDATE feishu_sync_issues
    SET sync_item_id = task_id
    WHERE sync_item_id IS NULL
      AND task_id IS NOT NULL;
  END IF;
END $$;

ALTER TABLE feishu_sync_issues
  ADD COLUMN IF NOT EXISTS entity_type TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feishu_sync_issues'
      AND column_name = 'target_type'
  ) THEN
    UPDATE feishu_sync_issues
    SET entity_type = target_type
    WHERE COALESCE(entity_type, '') = ''
      AND COALESCE(target_type, '') <> '';
  END IF;
END $$;

ALTER TABLE feishu_bitable_sync_items
  DROP CONSTRAINT IF EXISTS feishu_bitable_sync_items_entity_type_check;

ALTER TABLE feishu_bitable_sync_items
  ADD CONSTRAINT feishu_bitable_sync_items_entity_type_check
  CHECK (entity_type IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona'));

ALTER TABLE feishu_sync_issues
  DROP CONSTRAINT IF EXISTS feishu_sync_issues_entity_type_check;

ALTER TABLE feishu_sync_issues
  ADD CONSTRAINT feishu_sync_issues_entity_type_check
  CHECK (entity_type IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona'));

ALTER TABLE feishu_sync_issues
  DROP CONSTRAINT IF EXISTS feishu_sync_issues_resolution_check;

ALTER TABLE feishu_sync_issues
  ADD CONSTRAINT feishu_sync_issues_resolution_check
  CHECK (resolution IN ('', 'manual_bind', 'ignored', 'auto_recovered'));

ALTER TABLE feishu_external_refs
  DROP CONSTRAINT IF EXISTS feishu_external_refs_scope_check;

ALTER TABLE feishu_external_refs
  ADD CONSTRAINT feishu_external_refs_scope_check
  CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona'));

ALTER TABLE feishu_post_sync_tasks
  DROP CONSTRAINT IF EXISTS feishu_post_sync_tasks_scope_check;

ALTER TABLE feishu_post_sync_tasks
  ADD CONSTRAINT feishu_post_sync_tasks_scope_check
  CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona'));

ALTER TABLE feishu_vectors
  DROP CONSTRAINT IF EXISTS feishu_vectors_scope_check;

ALTER TABLE feishu_vectors
  ADD CONSTRAINT feishu_vectors_scope_check
  CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona'));

ALTER TABLE feishu_search_index
  DROP CONSTRAINT IF EXISTS feishu_search_index_scope_check;

ALTER TABLE feishu_search_index
  ADD CONSTRAINT feishu_search_index_scope_check
  CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona'));

ALTER TABLE feishu_entity_analysis
  DROP CONSTRAINT IF EXISTS feishu_entity_analysis_scope_check;

ALTER TABLE feishu_entity_analysis
  ADD CONSTRAINT feishu_entity_analysis_scope_check
  CHECK (scope IN ('contest', 'track', 'track_timeline', 'resource', 'policy', 'persona'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_feishu_sync_issues_sync_item_record_external_unique
  ON feishu_sync_issues(sync_item_id, record_id, external_id);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_user ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_updated ON projects(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_members_project_user ON project_members(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_college_bindings_project ON project_college_bindings(project_id);
CREATE INDEX IF NOT EXISTS idx_project_advisor_bindings_project ON project_advisor_bindings(project_id);
CREATE INDEX IF NOT EXISTS idx_project_contest_bindings_project_sort ON project_contest_bindings(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_contest_bindings_contest ON project_contest_bindings(contest_id);
CREATE INDEX IF NOT EXISTS idx_project_contest_adaptations_project ON project_contest_adaptations(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_contest_adaptations_contest ON project_contest_adaptations(contest_id);
CREATE INDEX IF NOT EXISTS idx_project_settings_drafts_user_project ON project_settings_drafts(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_settings_drafts_project ON project_settings_drafts(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_settings_drafts_user_project_opened ON project_settings_drafts(user_id, project_id, last_opened_at DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_settings_drafts_user_project_device ON project_settings_drafts(user_id, project_id, device_id);
CREATE INDEX IF NOT EXISTS idx_project_workspace_view_states_user_project ON project_workspace_view_states(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_workspace_view_states_project ON project_workspace_view_states(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_workspace_view_states_user_project_opened ON project_workspace_view_states(user_id, project_id, last_opened_at DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_workspace_view_states_user_project_device ON project_workspace_view_states(user_id, project_id, device_id);
CREATE INDEX IF NOT EXISTS idx_user_project_workspace_ai_tabs_project_user ON user_project_workspace_ai_tabs(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_workspace_last_projects_workspace_updated ON user_workspace_last_projects(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_workspace_updated ON ai_chat_sessions(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_created ON ai_chat_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_session_context_workspace_mode_updated
  ON ai_chat_session_context(workspace_id, project_id, mode, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_session_context_resume
  ON ai_chat_session_context(workspace_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_deepagent_checkpoints_thread_updated
  ON ai_deepagent_checkpoints(thread_id, checkpoint_ns, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_deepagent_store_items_namespace
  ON ai_deepagent_store_items(namespace_path, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_project_change_requests_project_status ON ai_project_change_requests(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_project_change_requests_session ON ai_project_change_requests(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_definitions_project_updated
  ON ai_workflow_definitions(project_id, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_project_created
  ON ai_workflow_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_workflow_created
  ON ai_workflow_runs(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_project_status_updated
  ON ai_workflow_runs(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_run_steps_run_index
  ON ai_workflow_run_steps(run_id, step_index ASC);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_run_steps_run_status
  ON ai_workflow_run_steps(run_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_issue_reports_project_created ON project_issue_reports(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_issues_project_status ON project_issues(project_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_issues_report ON project_issues(report_id);
CREATE INDEX IF NOT EXISTS idx_contest_resource_favorites_actor_created ON contest_resource_favorites(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_resource_favorites_resource ON contest_resource_favorites(contest_resource_id);
CREATE INDEX IF NOT EXISTS idx_billing_usage_events_workspace_created ON billing_usage_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_usage_events_event_created ON billing_usage_events(event_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_usage_events_actor_created ON billing_usage_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_usage_events_project_created ON billing_usage_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_usage_events_contest_resource_id ON billing_usage_events(contest_resource_id);
CREATE INDEX IF NOT EXISTS idx_billing_usage_events_report_id ON billing_usage_events(report_id);
CREATE INDEX IF NOT EXISTS idx_project_topic_boards_project_updated ON project_topic_boards(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_topic_boards_workspace_status ON project_topic_boards(workspace_id, status, updated_at DESC);
DO $$
BEGIN
  IF to_regclass('public.project_topic_boards') IS NULL THEN
    RETURN;
  END IF;

  WITH duplicated_active_boards AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY project_id
        ORDER BY updated_at DESC, created_at DESC, id DESC
      ) AS row_num
    FROM project_topic_boards
    WHERE status = 'active'
  )
  UPDATE project_topic_boards AS target
  SET status = 'archived',
      updated_at = NOW()
  FROM duplicated_active_boards AS duplicated
  WHERE target.id = duplicated.id
    AND duplicated.row_num > 1;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_topic_boards_one_active_per_project ON project_topic_boards(project_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_project_topic_candidates_board_sort ON project_topic_candidates(board_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_project_topic_candidates_project_status ON project_topic_candidates(project_id, decision_status, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_created ON analytics_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_project_created ON analytics_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page_created ON analytics_events(page_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_ai_memories_user_created ON user_ai_memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_workspace_project_created ON invitations(workspace_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_project_created ON invitations(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created ON user_notifications(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_workspace_created ON user_notifications(user_id, workspace_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read_created ON user_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_user_roles_user ON platform_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_provider_user ON auth_identities(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_syncs_updated ON feishu_bitable_syncs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_syncs_archived_updated ON feishu_bitable_syncs(archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_items_updated ON feishu_bitable_sync_items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_items_sync_id ON feishu_bitable_sync_items(sync_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feishu_bitable_sync_items_sync_table_view_entity
  ON feishu_bitable_sync_items(sync_id, table_id, view_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_items_schedule_scan
  ON feishu_bitable_sync_items(is_enabled, schedule_enabled, schedule_next_run_at);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_items_schedule_lock
  ON feishu_bitable_sync_items(schedule_locked_at);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_item_runs_sync_item_started ON feishu_bitable_sync_item_runs(sync_item_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_item_runs_sync_item_mode_started ON feishu_bitable_sync_item_runs(sync_item_id, mode, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_run_samples_run_type_index
  ON feishu_bitable_sync_run_samples(run_id, sample_type, sample_index ASC);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_run_samples_sync_item_run
  ON feishu_bitable_sync_run_samples(sync_item_id, run_id, sample_index ASC);
CREATE INDEX IF NOT EXISTS idx_feishu_external_refs_entity ON feishu_external_refs(scope, entity_id);
CREATE INDEX IF NOT EXISTS idx_feishu_sync_issues_sync_item_status ON feishu_sync_issues(sync_item_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_sync_issues_sync_item_record ON feishu_sync_issues(sync_item_id, record_id, external_id);
CREATE INDEX IF NOT EXISTS idx_feishu_bitable_event_dedup_created ON feishu_bitable_event_dedup(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_post_sync_tasks_status_next ON feishu_post_sync_tasks(status, next_run_at, created_at);
CREATE INDEX IF NOT EXISTS idx_feishu_post_sync_tasks_scope_entity ON feishu_post_sync_tasks(scope, entity_id, task_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_vectors_scope_entity ON feishu_vectors(scope, entity_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_search_index_scope_entity ON feishu_search_index(scope, entity_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feishu_search_index_keywords ON feishu_search_index USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_feishu_entity_analysis_scope_entity ON feishu_entity_analysis(scope, entity_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_catalog_type ON activity_catalog(activity_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_instances_activity ON activity_instances(activity_id, year DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_documents_instance ON source_documents(instance_id, publish_time DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_documents_activity ON source_documents(activity_id, publish_time DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_versions_status_updated ON rule_versions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_definitions_version_code ON rule_definitions(version_id, code);
CREATE INDEX IF NOT EXISTS idx_rule_bindings_version_scope ON rule_bindings(version_id, scope_type, scope_value, priority DESC);
CREATE INDEX IF NOT EXISTS idx_obligation_definitions_version_code ON obligation_definitions(version_id, code);
CREATE INDEX IF NOT EXISTS idx_obligation_bindings_version_scope ON obligation_bindings(version_id, scope_type, scope_value, priority DESC);
CREATE INDEX IF NOT EXISTS idx_rule_annotations_rule ON rule_annotations(rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contests_status_visibility ON contests(status, visibility);
CREATE INDEX IF NOT EXISTS idx_contests_level ON contests(level);
CREATE INDEX IF NOT EXISTS idx_contest_tracks_contest ON contest_tracks(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_timelines_contest ON contest_timelines(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_track_timelines_contest ON contest_track_timelines(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_track_timelines_track ON contest_track_timelines(track_id);
CREATE INDEX IF NOT EXISTS idx_contest_rubrics_contest_track ON contest_rubrics(contest_id, track_id);
CREATE INDEX IF NOT EXISTS idx_contest_resources_contest_category ON contest_resources(contest_id, category);
CREATE INDEX IF NOT EXISTS idx_contest_resources_status ON contest_resources(status);
CREATE INDEX IF NOT EXISTS idx_contest_resource_profiles_contest_status ON contest_resource_profiles(contest_id, governance_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_resource_profiles_quality ON contest_resource_profiles(contest_id, quality_score DESC, value_score DESC, hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_contest_resource_profiles_tags ON contest_resource_profiles USING GIN(ai_tags);
CREATE INDEX IF NOT EXISTS idx_contest_resource_relations_source ON contest_resource_relations(contest_id, source_resource_id, weight DESC);
CREATE INDEX IF NOT EXISTS idx_contest_resource_relations_target ON contest_resource_relations(contest_id, target_resource_id, weight DESC);
CREATE INDEX IF NOT EXISTS idx_contest_resource_search_events_contest_created ON contest_resource_search_events(contest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_resource_search_events_query ON contest_resource_search_events(contest_id, query, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_resource_search_events_resource ON contest_resource_search_events(resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_resource_governance_tasks_status_next ON contest_resource_governance_tasks(status, next_run_at, created_at);
CREATE INDEX IF NOT EXISTS idx_contest_resource_governance_tasks_contest_resource ON contest_resource_governance_tasks(contest_id, resource_id, task_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_bindings_project_created ON project_resource_bindings(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_bindings_resource ON project_resource_bindings(resource_id);
CREATE INDEX IF NOT EXISTS idx_project_resources_project_created ON project_resources(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resources_linked_contest_resource ON project_resources(linked_contest_resource_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_resources_project_linked_unique
  ON project_resources(project_id, linked_contest_resource_id)
  WHERE linked_contest_resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_resource_shares_project_created ON project_resource_shares(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_shares_resource ON project_resource_shares(resource_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_resource_shares_share_key ON project_resource_shares(share_key);
CREATE INDEX IF NOT EXISTS idx_project_resource_documents_project_status ON project_resource_documents(project_id, parse_status);
CREATE INDEX IF NOT EXISTS idx_project_resource_documents_resource ON project_resource_documents(project_resource_id);
CREATE INDEX IF NOT EXISTS idx_project_resource_documents_preview_status ON project_resource_documents(project_id, preview_status, queued_at);
CREATE INDEX IF NOT EXISTS idx_project_resource_review_jobs_resource_created ON project_resource_review_jobs(project_resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_review_jobs_status ON project_resource_review_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_review_findings_job_page ON project_resource_review_findings(job_id, page_number);
CREATE INDEX IF NOT EXISTS idx_project_resource_document_tasks_status_created ON project_resource_document_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_project_resource_document_tasks_document ON project_resource_document_tasks(document_id);
CREATE INDEX IF NOT EXISTS idx_project_resource_document_tasks_stage ON project_resource_document_tasks(stage, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_collab_docs_project_resource ON project_resource_collab_docs(project_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_project_resource_collab_docs_project_updated ON project_resource_collab_docs(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_device_arrangements_project_updated ON project_resource_device_arrangements(project_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_knowledge_sources_project_scope_entity
  ON project_knowledge_sources(project_id, scope_type, COALESCE(source_resource_id, ''), COALESCE(linked_contest_resource_id, ''));
CREATE INDEX IF NOT EXISTS idx_project_knowledge_sources_project_status
  ON project_knowledge_sources(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_sources_resource
  ON project_knowledge_sources(project_id, source_resource_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_knowledge_index_tasks_active_unique
  ON project_knowledge_index_tasks(project_id, scope_type, COALESCE(source_resource_id, ''), COALESCE(linked_contest_resource_id, ''))
  WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_project_knowledge_index_tasks_status_updated
  ON project_knowledge_index_tasks(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_index_tasks_resource
  ON project_knowledge_index_tasks(project_id, source_resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_analytics_jobs_project_status
  ON project_knowledge_analytics_jobs(project_id, job_type, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_knowledge_analytics_jobs_active_unique
  ON project_knowledge_analytics_jobs(project_id, job_type, COALESCE(target_source_id, ''), COALESCE(snapshot_type, ''))
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_project_knowledge_chunks_project_source
  ON project_knowledge_chunks(project_id, source_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_chunks_project_resource
  ON project_knowledge_chunks(project_id, source_resource_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_index_snapshots_project_captured
  ON project_knowledge_index_snapshots(project_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_relations_project_source
  ON project_knowledge_relations(project_id, source_node_type, source_node_id, relation_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_relations_project_target
  ON project_knowledge_relations(project_id, target_node_type, target_node_id, relation_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_semantic_layouts_project_type
  ON project_knowledge_semantic_layouts(project_id, layout_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_semantic_points_layout_level
  ON project_knowledge_semantic_points(layout_id, level, importance DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_comment_threads_resource_updated ON project_resource_comment_threads(project_id, resource_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_comment_threads_status ON project_resource_comment_threads(project_id, resource_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_comment_messages_thread_created ON project_resource_comment_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_resource_documents_contest_status ON contest_resource_documents(contest_id, parse_status);
CREATE INDEX IF NOT EXISTS idx_resource_documents_resource ON contest_resource_documents(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_document_tasks_status_created ON contest_resource_document_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_resource_document_tasks_document ON contest_resource_document_tasks(document_id);
CREATE INDEX IF NOT EXISTS idx_project_seat_quotas_workspace ON project_seat_quotas(workspace_id);

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS team_profile JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'workspaces'
      AND column_name = 'school_profile'
  ) THEN
    UPDATE workspaces
    SET team_profile = school_profile
    WHERE team_profile IS NULL
      AND school_profile IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'workspaces'
      AND column_name = 'school_profile'
  ) THEN
    ALTER TABLE workspaces
      DROP COLUMN school_profile;
  END IF;
END $$;

ALTER TABLE workspace_members
  DROP COLUMN IF EXISTS college_codes;

DO $$
DECLARE
  role_check_name TEXT;
BEGIN
  FOR role_check_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'workspace_members'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE workspace_members DROP CONSTRAINT %I', role_check_name);
  END LOOP;
END $$;

WITH normalized AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, user_id, CASE
        WHEN role = 'team_owner' THEN 'owner'
        WHEN role = 'team_admin' THEN 'admin'
        WHEN role = 'school_admin' THEN 'manager'
        WHEN role = 'college_admin' THEN 'manager'
        WHEN role = 'advisor' THEN 'member'
        WHEN role IN ('owner', 'admin', 'manager', 'member') THEN role
        ELSE 'member'
      END
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM workspace_members
)
DELETE FROM workspace_members wm
USING normalized n
WHERE wm.id = n.id
  AND n.rn > 1;

UPDATE workspace_members
SET role = CASE
  WHEN role = 'team_owner' THEN 'owner'
  WHEN role = 'team_admin' THEN 'admin'
  WHEN role = 'school_admin' THEN 'manager'
  WHEN role = 'college_admin' THEN 'manager'
  WHEN role = 'advisor' THEN 'member'
  WHEN role IN ('owner', 'admin', 'manager', 'member') THEN role
  ELSE 'member'
END;

UPDATE workspace_members wm
SET role = 'member'
FROM workspaces w
WHERE wm.workspace_id = w.id
  AND w.type = 'personal'
  AND wm.role IN ('admin', 'manager');

WITH normalized AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, user_id, role
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM workspace_members
)
DELETE FROM workspace_members wm
USING normalized n
WHERE wm.id = n.id
  AND n.rn > 1;

DO $$
BEGIN
  BEGIN
    ALTER TABLE workspace_members
      ADD CONSTRAINT workspace_members_role_check
      CHECK (role IN ('owner', 'admin', 'manager', 'member'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE invitations
  DROP COLUMN IF EXISTS college_codes;

DO $$
DECLARE
  invitation_role_check_name TEXT;
BEGIN
  FOR invitation_role_check_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'invitations'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE invitations DROP CONSTRAINT %I', invitation_role_check_name);
  END LOOP;
END $$;

UPDATE invitations
SET role = CASE
  WHEN role = 'team_owner' THEN 'admin'
  WHEN role = 'team_admin' THEN 'admin'
  WHEN role = 'school_admin' THEN 'manager'
  WHEN role = 'college_admin' THEN 'manager'
  WHEN role = 'advisor' THEN 'member'
  WHEN role IN ('admin', 'manager', 'member') THEN role
  ELSE 'member'
END;

UPDATE invitations i
SET role = 'member'
FROM workspaces w
WHERE i.workspace_id = w.id
  AND w.type = 'personal'
  AND i.role IN ('admin', 'manager');

DO $$
BEGIN
  BEGIN
    ALTER TABLE invitations
      ADD CONSTRAINT invitations_role_check
      CHECK (role IN ('admin', 'manager', 'member'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE invitations
      ADD CONSTRAINT invitations_project_role_check
      CHECK (project_role IS NULL OR project_role IN ('manager', 'editor', 'viewer'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'business_team';

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS included_projects INTEGER NOT NULL DEFAULT 0;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS projects_unlimited BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS extra_project_slot_price_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS default_project_seat_limit INTEGER NOT NULL DEFAULT 15;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS project_seat_price_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS min_charged_project_seats INTEGER NOT NULL DEFAULT 0;

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS charge_all_project_seats BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE workspace_billing
  ADD COLUMN IF NOT EXISTS extra_project_slots INTEGER NOT NULL DEFAULT 0;

UPDATE billing_plans
SET plan_tier = CASE
  WHEN code ILIKE 'personal%' THEN 'personal_team'
  ELSE 'business_team'
END
WHERE COALESCE(plan_tier, '') NOT IN ('personal_team', 'business_team');

UPDATE billing_plans
SET included_projects = 0,
    projects_unlimited = TRUE,
    default_project_seat_limit = 15
WHERE plan_tier = 'personal_team';

UPDATE billing_plans
SET default_project_seat_limit = 15
WHERE default_project_seat_limit < 15;

DO $$
DECLARE
  plan_tier_check_name TEXT;
BEGIN
  SELECT con.conname INTO plan_tier_check_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'billing_plans'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%plan_tier%'
  ORDER BY con.conname
  LIMIT 1;

  IF plan_tier_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE billing_plans DROP CONSTRAINT %I', plan_tier_check_name);
  END IF;

  BEGIN
    ALTER TABLE billing_plans
      ADD CONSTRAINT billing_plans_plan_tier_check
      CHECK (plan_tier IN ('personal_team', 'business_team'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

INSERT INTO project_seat_quotas (
  project_id,
  workspace_id,
  seat_limit,
  seat_used,
  updated_at
)
SELECT
  p.id,
  p.workspace_id,
  15,
  COALESCE(member_count.used, 0),
  NOW()
FROM projects p
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT pm.user_id)::INTEGER AS used
  FROM project_members pm
  WHERE pm.project_id = p.id
) member_count ON TRUE
ON CONFLICT (project_id)
DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  seat_used = EXCLUDED.seat_used,
  updated_at = EXCLUDED.updated_at;

UPDATE project_seat_quotas psq
SET seat_limit = 15,
    updated_at = NOW()
WHERE psq.seat_used <= 15
  AND psq.seat_limit <> 15;

ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS faq_items JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS rubric_id TEXT;

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS organizer TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS undertaker TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS participant_requirements TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS team_rule TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_tracks
  ADD COLUMN IF NOT EXISTS award_ratio TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_rubrics
  ADD COLUMN IF NOT EXISTS scoring_mode TEXT NOT NULL DEFAULT 'weighted';

ALTER TABLE contest_resources
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_resources
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_chat_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_chat_messages
  ALTER COLUMN provider SET DEFAULT 'unconfigured';

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'dialog_ask';

CREATE TABLE IF NOT EXISTS ai_chat_session_context (
  session_id TEXT PRIMARY KEY REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'dialog_ask' CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent')),
  context_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  run_state_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_checkpoint_ref TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_chat_session_context
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE ai_chat_session_context
  ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_chat_session_context
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'dialog_ask';

ALTER TABLE ai_chat_session_context
  ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_chat_session_context
  ADD COLUMN IF NOT EXISTS run_state_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_chat_session_context
  ADD COLUMN IF NOT EXISTS last_checkpoint_ref TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_chat_session_context
  ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_chat_session_context
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE ai_chat_session_context
  DROP CONSTRAINT IF EXISTS ai_chat_session_context_mode_check;

ALTER TABLE ai_chat_session_context
  ADD CONSTRAINT ai_chat_session_context_mode_check
  CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent'));

CREATE TABLE IF NOT EXISTS ai_deepagent_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT NOT NULL DEFAULT '',
  checkpoint_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  pending_writes_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

ALTER TABLE ai_deepagent_checkpoints
  ADD COLUMN IF NOT EXISTS parent_checkpoint_id TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_deepagent_checkpoints
  ADD COLUMN IF NOT EXISTS checkpoint_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_deepagent_checkpoints
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_deepagent_checkpoints
  ADD COLUMN IF NOT EXISTS pending_writes_json JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE TABLE IF NOT EXISTS ai_deepagent_store_items (
  namespace_path TEXT NOT NULL,
  namespace_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  item_key TEXT NOT NULL,
  value_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  index_fields_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (namespace_path, item_key)
);

ALTER TABLE ai_deepagent_store_items
  ADD COLUMN IF NOT EXISTS namespace_json JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE ai_deepagent_store_items
  ADD COLUMN IF NOT EXISTS value_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE ai_deepagent_store_items
  ADD COLUMN IF NOT EXISTS index_fields_json JSONB NOT NULL DEFAULT '[]'::JSONB;

UPDATE ai_chat_sessions
SET mode = 'dialog_ask'
WHERE COALESCE(mode, '') NOT IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent');

ALTER TABLE ai_chat_sessions
  DROP CONSTRAINT IF EXISTS ai_chat_sessions_mode_check;

ALTER TABLE ai_chat_sessions
  ADD CONSTRAINT ai_chat_sessions_mode_check
  CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent'));

ALTER TABLE ai_project_change_requests
  DROP CONSTRAINT IF EXISTS ai_project_change_requests_mode_check;

ALTER TABLE ai_project_change_requests
  ADD CONSTRAINT ai_project_change_requests_mode_check
  CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent'));

ALTER TABLE ai_workflow_runs
  DROP CONSTRAINT IF EXISTS ai_workflow_runs_status_check;

ALTER TABLE ai_workflow_runs
  ADD CONSTRAINT ai_workflow_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_review'));

ALTER TABLE ai_workflow_run_steps
  DROP CONSTRAINT IF EXISTS ai_workflow_run_steps_step_type_check;

ALTER TABLE ai_workflow_run_steps
  ADD CONSTRAINT ai_workflow_run_steps_step_type_check
  CHECK (step_type IN ('prompt', 'tool', 'agent'));

ALTER TABLE ai_workflow_run_steps
  DROP CONSTRAINT IF EXISTS ai_workflow_run_steps_status_check;

ALTER TABLE ai_workflow_run_steps
  ADD CONSTRAINT ai_workflow_run_steps_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_review', 'skipped'));

ALTER TABLE ai_workflow_run_steps
  DROP CONSTRAINT IF EXISTS ai_workflow_run_steps_agent_mode_check;

ALTER TABLE ai_workflow_run_steps
  ADD CONSTRAINT ai_workflow_run_steps_agent_mode_check
  CHECK (agent_mode = '' OR agent_mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'document_assist', 'contextual_agent'));

ALTER TABLE project_issue_reports
  DROP CONSTRAINT IF EXISTS project_issue_reports_source_mode_check;

ALTER TABLE project_issue_reports
  ADD CONSTRAINT project_issue_reports_source_mode_check
  CHECK (source_mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense', 'document_assist', 'contextual_agent'));

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_workspace_project_mode_updated
  ON ai_chat_sessions(workspace_id, project_id, mode, updated_at DESC);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contest_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS parent_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL;

ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked_project_resources AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY created_at DESC, id DESC
    ) - 1 AS next_sort_order
  FROM project_resources
  WHERE parent_resource_id IS NULL
)
UPDATE project_resources AS pr
SET sort_order = ranked_project_resources.next_sort_order
FROM ranked_project_resources
WHERE pr.id = ranked_project_resources.id
  AND pr.parent_resource_id IS NULL
  AND pr.sort_order = 0;

ALTER TABLE project_resource_upload_sessions
  ADD COLUMN IF NOT EXISTS parent_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL;

ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS resource_kind TEXT NOT NULL DEFAULT 'binary';

UPDATE project_resources
SET resource_kind = 'binary'
WHERE COALESCE(resource_kind, '') NOT IN ('binary', 'markdown', 'draw');

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS source_object_key TEXT NOT NULL DEFAULT '';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_object_key TEXT NOT NULL DEFAULT '';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS source_storage_provider TEXT NOT NULL DEFAULT 'local';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_storage_provider TEXT NOT NULL DEFAULT 'local';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS source_file_name TEXT NOT NULL DEFAULT '';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_file_name TEXT NOT NULL DEFAULT '';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS source_mime_type TEXT NOT NULL DEFAULT 'application/octet-stream';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_mime_type TEXT NOT NULL DEFAULT 'application/pdf';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS source_file_size BIGINT NOT NULL DEFAULT 0;

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_file_size BIGINT NOT NULL DEFAULT 0;

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_status TEXT NOT NULL DEFAULT 'queued';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_stage TEXT NOT NULL DEFAULT 'queued';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_progress_percent INTEGER NOT NULL DEFAULT 0;

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_eta_seconds INTEGER NOT NULL DEFAULT 0;

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS preview_error TEXT NOT NULL DEFAULT '';

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS last_attempt_duration_ms INTEGER NOT NULL DEFAULT 0;

ALTER TABLE project_resource_documents
  ADD COLUMN IF NOT EXISTS total_attempt_duration_ms INTEGER NOT NULL DEFAULT 0;

ALTER TABLE project_resource_document_tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'convert_preview_pdf';

ALTER TABLE project_resource_document_tasks
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'onlyoffice';

ALTER TABLE project_resource_document_tasks
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'queued';

ALTER TABLE project_resource_document_tasks
  ADD COLUMN IF NOT EXISTS eta_seconds INTEGER NOT NULL DEFAULT 0;

UPDATE project_resource_documents
SET source_object_key = object_key
WHERE COALESCE(source_object_key, '') = ''
  AND COALESCE(object_key, '') <> '';

UPDATE project_resource_documents
SET source_storage_provider = storage_provider
WHERE COALESCE(source_storage_provider, '') = ''
  AND COALESCE(storage_provider, '') <> '';

UPDATE project_resource_documents
SET source_file_name = file_name
WHERE COALESCE(source_file_name, '') = ''
  AND COALESCE(file_name, '') <> '';

UPDATE project_resource_documents
SET source_mime_type = mime_type
WHERE COALESCE(source_mime_type, '') = ''
  AND COALESCE(mime_type, '') <> '';

UPDATE project_resource_documents
SET source_file_size = file_size
WHERE COALESCE(source_file_size, 0) = 0
  AND COALESCE(file_size, 0) > 0;

UPDATE project_resource_documents
SET preview_object_key = object_key
WHERE COALESCE(preview_object_key, '') = ''
  AND COALESCE(object_key, '') <> ''
  AND (
    COALESCE(preview_mime_type, '') ILIKE '%pdf%'
    OR COALESCE(mime_type, '') ILIKE '%pdf%'
    OR COALESCE(file_name, '') ILIKE '%.pdf'
  );

UPDATE project_resource_documents
SET preview_storage_provider = storage_provider
WHERE COALESCE(preview_storage_provider, '') = ''
  AND COALESCE(storage_provider, '') <> '';

UPDATE project_resource_documents
SET preview_file_name = CASE
  WHEN COALESCE(file_name, '') ILIKE '%.pdf' THEN file_name
  ELSE ''
END
WHERE COALESCE(preview_file_name, '') = '';

UPDATE project_resource_documents
SET preview_mime_type = CASE
  WHEN COALESCE(mime_type, '') ILIKE '%pdf%' THEN mime_type
  ELSE preview_mime_type
END
WHERE COALESCE(preview_mime_type, '') = '';

UPDATE project_resource_documents
SET preview_file_size = CASE
  WHEN COALESCE(mime_type, '') ILIKE '%pdf%' THEN file_size
  ELSE preview_file_size
END
WHERE COALESCE(preview_file_size, 0) = 0;

UPDATE project_resource_documents
SET preview_status = CASE
  WHEN parse_status = 'processing' THEN 'converting'
  ELSE parse_status
END
WHERE COALESCE(preview_status, '') = ''
   OR preview_status = 'queued';

UPDATE project_resource_documents
SET preview_stage = preview_status
WHERE COALESCE(preview_stage, '') = '';

UPDATE project_resource_documents
SET preview_stage = preview_status
WHERE COALESCE(preview_stage, '') = 'queued'
  AND COALESCE(preview_status, '') <> 'queued';

UPDATE project_resource_documents
SET preview_progress_percent = CASE
  WHEN preview_status = 'succeeded' THEN 100
  WHEN preview_status = 'failed' THEN 100
  WHEN preview_status = 'converting' THEN 45
  ELSE 0
END
WHERE COALESCE(preview_progress_percent, 0) <= 0;

UPDATE projects
SET contest_ids = ARRAY[contest_id]
WHERE contest_id IS NOT NULL
  AND (
    contest_ids IS NULL
    OR array_length(contest_ids, 1) IS NULL
  );

INSERT INTO project_resources (
  id,
  project_id,
  source,
  resource_kind,
  linked_contest_resource_id,
  title,
  mime_type,
  category,
  year,
  source_link,
  availability,
  summary,
  content,
  metadata,
  status,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
SELECT
  CONCAT('pr_', b.id),
  b.project_id,
  CASE WHEN COALESCE(r.source_type, '') = 'project_upload' THEN 'upload' ELSE 'library' END,
  'binary',
  CASE WHEN COALESCE(r.source_type, '') = 'project_upload' THEN NULL ELSE r.id END,
  r.title,
  COALESCE(r.metadata->>'mimeType', 'application/octet-stream'),
  r.category,
  r.year,
  r.url,
  r.access_level,
  r.summary,
  r.content,
  r.metadata,
  r.status,
  r.created_by_user_id,
  r.updated_by_user_id,
  b.created_at,
  r.updated_at
FROM project_resource_bindings b
JOIN contest_resources r ON r.id = b.resource_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO project_contest_bindings (
  id,
  project_id,
  contest_id,
  track_id,
  sort_order,
  created_at,
  updated_at
)
SELECT
  CONCAT('pcb_', p.id, '_', p.contest_id),
  p.id,
  p.contest_id,
  p.track_id,
  0,
  NOW(),
  NOW()
FROM projects p
JOIN contests c ON c.id = p.contest_id
JOIN contest_tracks ct ON ct.id = p.track_id
  AND ct.contest_id = p.contest_id
WHERE p.contest_id IS NOT NULL
  AND p.contest_id <> ''
  AND p.track_id IS NOT NULL
  AND p.track_id <> ''
ON CONFLICT (project_id, contest_id) DO NOTHING;

INSERT INTO project_contest_adaptations (
  id,
  project_id,
  contest_id,
  track_id,
  problem_statement,
  innovation_points,
  tech_route_steps,
  scoring_mapping,
  risks,
  deliverables,
  summary,
  created_at,
  updated_at
)
SELECT
  CONCAT('pca_', p.id, '_', p.contest_id),
  p.id,
  p.contest_id,
  p.track_id,
  p.problem_statement,
  p.innovation_points,
  p.tech_route_steps,
  p.scoring_mapping,
  p.risks,
  p.deliverables,
  COALESCE(p.summary, ''),
  NOW(),
  NOW()
FROM projects p
JOIN contests c ON c.id = p.contest_id
JOIN contest_tracks ct ON ct.id = p.track_id
  AND ct.contest_id = p.contest_id
WHERE p.contest_id IS NOT NULL
  AND p.contest_id <> ''
  AND p.track_id IS NOT NULL
  AND p.track_id <> ''
ON CONFLICT (project_id, contest_id) DO NOTHING;

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
  source_check_name TEXT;
BEGIN
  SELECT con.conname INTO source_check_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'project_resources'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%source%'
    AND pg_get_constraintdef(con.oid) ILIKE '%upload%'
    AND pg_get_constraintdef(con.oid) ILIKE '%library%'
  ORDER BY con.conname
  LIMIT 1;

  IF source_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE project_resources DROP CONSTRAINT %I', source_check_name);
  END IF;

  BEGIN
    ALTER TABLE project_resources
      ADD CONSTRAINT project_resources_source_check
      CHECK (source IN ('upload', 'library', 'collab'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
DECLARE
  resource_kind_check_name TEXT;
BEGIN
  SELECT con.conname INTO resource_kind_check_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'project_resources'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%resource_kind%'
  ORDER BY con.conname
  LIMIT 1;

  IF resource_kind_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE project_resources DROP CONSTRAINT %I', resource_kind_check_name);
  END IF;

  BEGIN
    ALTER TABLE project_resources
      ADD CONSTRAINT project_resources_resource_kind_check
      CHECK (resource_kind IN ('binary', 'markdown', 'draw'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
DECLARE
  rule_category_check_name TEXT;
BEGIN
  SELECT con.conname INTO rule_category_check_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'rule_definitions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%category%'
  ORDER BY con.conname
  LIMIT 1;

  IF rule_category_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE rule_definitions DROP CONSTRAINT %I', rule_category_check_name);
  END IF;

  BEGIN
    ALTER TABLE rule_definitions
      ADD CONSTRAINT rule_definitions_category_check
      CHECK (category IN ('eligibility', 'material', 'workflow', 'reminder', 'quality', 'compliance'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DELETE FROM contest_resource_profiles profile
WHERE NOT EXISTS (
  SELECT 1
  FROM contest_resources resource
  WHERE resource.id = profile.resource_id
    AND resource.contest_id = profile.contest_id
);

DELETE FROM contest_resource_relations relation
WHERE NOT EXISTS (
  SELECT 1
  FROM contest_resources resource
  WHERE resource.id = relation.source_resource_id
    AND resource.contest_id = relation.contest_id
)
   OR NOT EXISTS (
     SELECT 1
     FROM contest_resources resource
     WHERE resource.id = relation.target_resource_id
       AND resource.contest_id = relation.contest_id
   );

UPDATE contest_resource_search_events event
SET resource_id = NULL,
    updated_at = NOW()
WHERE event.resource_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM contest_resources resource
    WHERE resource.id = event.resource_id
      AND resource.contest_id = event.contest_id
  );

DELETE FROM contest_resource_governance_tasks task
WHERE task.resource_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM contest_resources resource
    WHERE resource.id = task.resource_id
      AND resource.contest_id = task.contest_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contest_resource_profiles_contest_resource_fk'
      AND conrelid = 'contest_resource_profiles'::regclass
  ) THEN
    ALTER TABLE contest_resource_profiles
      ADD CONSTRAINT contest_resource_profiles_contest_resource_fk
      FOREIGN KEY (contest_id, resource_id)
      REFERENCES contest_resources(contest_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contest_resource_relations_source_contest_resource_fk'
      AND conrelid = 'contest_resource_relations'::regclass
  ) THEN
    ALTER TABLE contest_resource_relations
      ADD CONSTRAINT contest_resource_relations_source_contest_resource_fk
      FOREIGN KEY (contest_id, source_resource_id)
      REFERENCES contest_resources(contest_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contest_resource_relations_target_contest_resource_fk'
      AND conrelid = 'contest_resource_relations'::regclass
  ) THEN
    ALTER TABLE contest_resource_relations
      ADD CONSTRAINT contest_resource_relations_target_contest_resource_fk
      FOREIGN KEY (contest_id, target_resource_id)
      REFERENCES contest_resources(contest_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contest_resource_search_events_contest_resource_fk'
      AND conrelid = 'contest_resource_search_events'::regclass
  ) THEN
    ALTER TABLE contest_resource_search_events
      ADD CONSTRAINT contest_resource_search_events_contest_resource_fk
      FOREIGN KEY (contest_id, resource_id)
      REFERENCES contest_resources(contest_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contest_resource_governance_tasks_contest_resource_fk'
      AND conrelid = 'contest_resource_governance_tasks'::regclass
  ) THEN
    ALTER TABLE contest_resource_governance_tasks
      ADD CONSTRAINT contest_resource_governance_tasks_contest_resource_fk
      FOREIGN KEY (contest_id, resource_id)
      REFERENCES contest_resources(contest_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

WITH ranked_governance_tasks AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY contest_id, COALESCE(resource_id, ''), task_type
      ORDER BY
        CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM contest_resource_governance_tasks
  WHERE status IN ('queued', 'processing')
)
UPDATE contest_resource_governance_tasks task
SET status = 'dead_letter',
    finished_at = COALESCE(task.finished_at, NOW()),
    updated_at = NOW(),
    error_message = CASE
      WHEN COALESCE(task.error_message, '') = '' THEN 'Superseded by active task deduplication.'
      ELSE task.error_message
    END
FROM ranked_governance_tasks ranked
WHERE task.id = ranked.id
  AND ranked.rn > 1;

CREATE INDEX IF NOT EXISTS idx_contest_resource_profiles_contest_resource
  ON contest_resource_profiles(contest_id, resource_id);

CREATE INDEX IF NOT EXISTS idx_contest_resource_search_events_contest_resource
  ON contest_resource_search_events(contest_id, resource_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_resource_governance_tasks_active_unique
  ON contest_resource_governance_tasks(contest_id, COALESCE(resource_id, ''), task_type)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS idx_policy_library_items_status_updated
  ON policy_library_items(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_defense_persona_presets_scope
  ON defense_persona_presets(contest_external_id, track_external_id, enabled, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_defense_personas_project_sort
  ON project_defense_personas(project_id, sort_order ASC, created_at ASC);

ALTER TABLE IF EXISTS project_defense_session_state
  ADD COLUMN IF NOT EXISTS realtime_meta_json JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_project_defense_turns_session_turn_created
  ON project_defense_turns(session_id, turn_index ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_defense_summaries_session_lookup
  ON project_defense_summaries(session_id, summary_type, turn_index, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_defense_summaries_project_latest
  ON project_defense_summaries(project_id, summary_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_versions_scope_updated
  ON release_versions(scope_kind, scope_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_versions_status_created
  ON release_versions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_versions_second_review_claim
  ON release_versions(status, second_review_claimed_by_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_review_logs_version_created
  ON release_review_logs(release_version_id, created_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_workspace_billing_orders_workspace_created ON workspace_billing_orders(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_billing_orders_plan ON workspace_billing_orders(plan_id);
`

const PROJECT_RESOURCE_TREE_SCHEMA_SQL = `
ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS parent_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL;

ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked_project_resources AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY created_at DESC, id DESC
    ) - 1 AS next_sort_order
  FROM project_resources
  WHERE parent_resource_id IS NULL
)
UPDATE project_resources AS pr
SET sort_order = ranked_project_resources.next_sort_order
FROM ranked_project_resources
WHERE pr.id = ranked_project_resources.id
  AND pr.parent_resource_id IS NULL
  AND pr.sort_order = 0;

ALTER TABLE project_resource_upload_sessions
  ADD COLUMN IF NOT EXISTS parent_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_resources_project_parent_sort
  ON project_resources(project_id, parent_resource_id, sort_order ASC, created_at ASC);
`

export async function ensureSchemaReady(poolRef: PgPoolType) {
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

export async function ensureProjectResourceTreeSchemaReady(poolRef: PgPoolType) {
  if (projectResourceTreeSchemaReady)
    return

  if (!projectResourceTreeSchemaPromise) {
    projectResourceTreeSchemaPromise = (async () => {
      try {
        await poolRef.query(PROJECT_RESOURCE_TREE_SCHEMA_SQL)
        const result = await poolRef.query<MissingSchemaColumnRow>(PROJECT_RESOURCE_TREE_SCHEMA_CHECK_SQL)
        const missingColumns = result.rows.map(row => `${row.table_name}.${row.column_name}`)
        if (missingColumns.length > 0) {
          console.error('[db] project resource tree schema ensure incomplete', {
            missingColumns,
          })
          throw new Error(`项目资料树 schema 未就绪，缺少字段：${missingColumns.join(', ')}`)
        }
        projectResourceTreeSchemaReady = true
      }
      catch (error) {
        console.error('[db] project resource tree schema ensure failed', error)
        throw error
      }
    })().finally(() => {
      projectResourceTreeSchemaPromise = null
    })
  }

  await projectResourceTreeSchemaPromise
}
