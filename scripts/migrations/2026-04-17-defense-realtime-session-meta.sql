ALTER TABLE IF EXISTS project_defense_session_state
  ADD COLUMN IF NOT EXISTS realtime_meta_json JSONB NOT NULL DEFAULT '{}'::JSONB;
