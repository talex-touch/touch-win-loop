CREATE TABLE IF NOT EXISTS workspace_integration_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('feishu')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'needs_reauth', 'disabled', 'uninstalled')),
  tenant_key TEXT NOT NULL DEFAULT '',
  tenant_name TEXT NOT NULL DEFAULT '',
  external_app_id TEXT NOT NULL DEFAULT '',
  scopes JSONB NOT NULL DEFAULT '[]'::JSONB,
  capabilities JSONB NOT NULL DEFAULT '{}'::JSONB,
  config_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  installed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  authorized_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_health_check_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS workspace_integration_sync_policies (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL UNIQUE REFERENCES workspace_integration_connections(id) ON DELETE CASCADE,
  member_sync_mode TEXT NOT NULL DEFAULT 'whitelist' CHECK (member_sync_mode IN ('whitelist')),
  auto_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_workspace_role TEXT NOT NULL DEFAULT 'member' CHECK (default_workspace_role IN ('admin', 'manager', 'member')),
  department_ids TEXT[] NOT NULL DEFAULT '{}',
  user_ids TEXT[] NOT NULL DEFAULT '{}',
  group_ids TEXT[] NOT NULL DEFAULT '{}',
  role_mappings JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_preview_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_sync_result JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_integration_import_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES workspace_integration_connections(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('feishu')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'partial_success', 'failed')),
  requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  diagnostics JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_external_resource_refs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES workspace_integration_connections(id) ON DELETE CASCADE,
  import_job_id TEXT REFERENCES workspace_integration_import_jobs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('feishu')),
  external_type TEXT NOT NULL CHECK (external_type IN ('feishu_doc', 'feishu_wiki', 'feishu_drive_file', 'feishu_bitable')),
  external_token TEXT NOT NULL,
  external_url TEXT NOT NULL DEFAULT '',
  resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL,
  source_hash TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_import_status TEXT NOT NULL DEFAULT 'succeeded' CHECK (last_import_status IN ('succeeded', 'skipped', 'failed')),
  last_error TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id, external_type, external_token, project_id)
);

CREATE TABLE IF NOT EXISTS integration_event_dedup (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('feishu')),
  event_id TEXT NOT NULL,
  tenant_key TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  payload_hash TEXT NOT NULL DEFAULT '',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, event_id)
);

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
  ORDER BY con.conname
  LIMIT 1;

  IF source_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE project_resources DROP CONSTRAINT %I', source_check_name);
  END IF;

  BEGIN
    ALTER TABLE project_resources
      ADD CONSTRAINT project_resources_source_check
      CHECK (source IN ('upload', 'library', 'collab', 'external'));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_integration_connections_workspace
  ON workspace_integration_connections(workspace_id, provider, status);
CREATE INDEX IF NOT EXISTS idx_workspace_integration_connections_tenant
  ON workspace_integration_connections(provider, tenant_key)
  WHERE tenant_key <> '';
CREATE INDEX IF NOT EXISTS idx_workspace_external_resource_refs_resource
  ON workspace_external_resource_refs(resource_id);
CREATE INDEX IF NOT EXISTS idx_workspace_integration_import_jobs_project
  ON workspace_integration_import_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_event_dedup_provider_created
  ON integration_event_dedup(provider, created_at DESC);
