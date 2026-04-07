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
  project_id TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'dialog_ask' CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense')),
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
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
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
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contest', 'track', 'resource')),
  app_token TEXT NOT NULL,
  table_id TEXT NOT NULL,
  view_id TEXT NOT NULL DEFAULT '',
  source_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  writeback_json JSONB NOT NULL DEFAULT '{}'::JSONB,
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
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feishu_external_refs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('feishu_bitable')),
  scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'resource')),
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
  scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'resource')),
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
      scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'resource')),
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
      scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'resource')),
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
  scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'resource')),
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
  scope TEXT NOT NULL CHECK (scope IN ('contest', 'track', 'resource')),
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
  category TEXT NOT NULL CHECK (category IN ('eligibility', 'material', 'workflow', 'reminder')),
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
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contest', 'track', 'resource')),
  record_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  reason_code TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  resolution TEXT NOT NULL DEFAULT '' CHECK (resolution IN ('', 'manual_bind', 'ignored')),
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id)
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

CREATE TABLE IF NOT EXISTS project_resources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS project_resource_collab_docs (
  resource_id TEXT PRIMARY KEY REFERENCES project_resources(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('markdown', 'draw')),
  ydoc_update BYTEA NOT NULL DEFAULT '\\x',
  revision BIGINT NOT NULL DEFAULT 1,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  mode TEXT NOT NULL CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense')),
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

CREATE TABLE IF NOT EXISTS project_issue_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  source_mode TEXT NOT NULL CHECK (source_mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense')),
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_workspace_updated ON ai_chat_sessions(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_created ON ai_chat_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_project_change_requests_project_status ON ai_project_change_requests(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_project_change_requests_session ON ai_project_change_requests(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_issue_reports_project_created ON project_issue_reports(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_issues_project_status ON project_issues(project_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_issues_report ON project_issues(report_id);
CREATE INDEX IF NOT EXISTS idx_user_ai_memories_user_created ON user_ai_memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_sync_sources_created ON contest_sync_sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contest_sync_runs_source_started ON contest_sync_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_workspace_project_created ON invitations(workspace_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_project_created ON invitations(project_id, created_at DESC);
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
CREATE INDEX IF NOT EXISTS idx_contest_rubrics_contest_track ON contest_rubrics(contest_id, track_id);
CREATE INDEX IF NOT EXISTS idx_contest_resources_contest_category ON contest_resources(contest_id, category);
CREATE INDEX IF NOT EXISTS idx_contest_resources_status ON contest_resources(status);
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
CREATE INDEX IF NOT EXISTS idx_project_resource_document_tasks_status_created ON project_resource_document_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_project_resource_document_tasks_document ON project_resource_document_tasks(document_id);
CREATE INDEX IF NOT EXISTS idx_project_resource_document_tasks_stage ON project_resource_document_tasks(stage, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_resource_collab_docs_project_resource ON project_resource_collab_docs(project_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_project_resource_collab_docs_project_updated ON project_resource_collab_docs(project_id, updated_at DESC);
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

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'dialog_ask';

UPDATE ai_chat_sessions
SET mode = 'dialog_ask'
WHERE COALESCE(mode, '') NOT IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense');

ALTER TABLE ai_chat_sessions
  DROP CONSTRAINT IF EXISTS ai_chat_sessions_mode_check;

ALTER TABLE ai_chat_sessions
  ADD CONSTRAINT ai_chat_sessions_mode_check
  CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense'));

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_workspace_project_mode_updated
  ON ai_chat_sessions(workspace_id, project_id, mode, updated_at DESC);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contest_ids TEXT[] NOT NULL DEFAULT '{}';

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
