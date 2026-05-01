CREATE TABLE IF NOT EXISTS project_competition_loop_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contest_id TEXT NOT NULL DEFAULT '',
  track_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty', 'ready', 'attention', 'blocked')),
  snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  summary_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, contest_id, track_id)
);

CREATE TABLE IF NOT EXISTS project_risk_signals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contest_id TEXT NOT NULL DEFAULT '',
  track_id TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK (source_type IN ('contest', 'track', 'rubric', 'profile', 'knowledge', 'deadline', 'project_issue', 'ai', 'analytics')),
  source_id TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  evidence_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contest_id TEXT NOT NULL DEFAULT '',
  track_id TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK (source_type IN ('contest', 'track', 'rubric', 'profile', 'knowledge', 'deadline', 'project_issue', 'ai', 'analytics')),
  source_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'blocked', 'ignored')),
  owner_user_id TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ,
  link_url TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_risk_signals_source_unique
  ON project_risk_signals(project_id, source_type, COALESCE(source_id, ''), title);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tasks_source_unique
  ON project_tasks(project_id, source_type, COALESCE(source_id, ''), title);

CREATE INDEX IF NOT EXISTS idx_project_competition_loop_snapshots_workspace
  ON project_competition_loop_snapshots(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_competition_loop_snapshots_project
  ON project_competition_loop_snapshots(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_risk_signals_project_status
  ON project_risk_signals(project_id, status, severity, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status
  ON project_tasks(project_id, status, priority, updated_at DESC);
