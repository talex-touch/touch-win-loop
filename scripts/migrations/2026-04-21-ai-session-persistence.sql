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

CREATE INDEX IF NOT EXISTS idx_ai_chat_session_context_workspace_mode_updated
  ON ai_chat_session_context(workspace_id, project_id, mode, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_session_context_resume
  ON ai_chat_session_context(workspace_id, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_deepagent_checkpoints_thread_updated
  ON ai_deepagent_checkpoints(thread_id, checkpoint_ns, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_deepagent_store_items_namespace
  ON ai_deepagent_store_items(namespace_path, updated_at DESC);
