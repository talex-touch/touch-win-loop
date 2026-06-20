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

ALTER TABLE IF EXISTS project_defense_session_state
  ADD COLUMN IF NOT EXISTS realtime_meta_json JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_project_defense_personas_project_sort
  ON project_defense_personas(project_id, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_defense_turns_session_turn_created
  ON project_defense_turns(session_id, turn_index ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_defense_summaries_session_lookup
  ON project_defense_summaries(session_id, summary_type, turn_index, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_defense_summaries_project_latest
  ON project_defense_summaries(project_id, summary_type, updated_at DESC);
