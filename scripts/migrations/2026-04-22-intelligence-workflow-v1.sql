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

ALTER TABLE ai_workflow_runs
  DROP CONSTRAINT IF EXISTS ai_workflow_runs_status_check;

ALTER TABLE ai_workflow_runs
  ADD CONSTRAINT ai_workflow_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_review'));

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
