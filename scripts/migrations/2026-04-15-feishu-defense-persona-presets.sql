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

CREATE INDEX IF NOT EXISTS idx_defense_persona_presets_scope
  ON defense_persona_presets(contest_external_id, track_external_id, enabled, sort_order, updated_at DESC);
