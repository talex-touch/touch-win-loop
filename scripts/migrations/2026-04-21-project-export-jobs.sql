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

CREATE INDEX IF NOT EXISTS idx_project_export_jobs_project_created_at
  ON project_export_jobs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_export_jobs_status_created_at
  ON project_export_jobs(status, created_at DESC);
