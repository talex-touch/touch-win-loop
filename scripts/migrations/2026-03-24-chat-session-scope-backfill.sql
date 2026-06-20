-- Chat session scope backfill
-- Goal: enforce workspace + project + mode isolation for ai_chat_sessions.

BEGIN;

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'dialog_ask';

UPDATE ai_chat_sessions
SET mode = 'dialog_ask'
WHERE COALESCE(mode, '') NOT IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense');

WITH audit_candidates AS (
  SELECT
    NULLIF(payload ->> 'sessionId', '') AS session_id,
    NULLIF(payload ->> 'projectId', '') AS project_id,
    CASE
      WHEN action = 'ai.invoke.defense' THEN 'defense'
      WHEN action = 'ai.invoke.workspace_agent' THEN
        CASE
          WHEN payload ->> 'mode' IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense') THEN payload ->> 'mode'
          ELSE 'dialog_ask'
        END
      WHEN action IN ('ai.invoke.project_chat', 'ai.invoke.topic_proposal') THEN 'dialog_ask'
      ELSE NULL
    END AS mode,
    created_at
  FROM contest_audit_logs
  WHERE action IN (
    'ai.invoke.workspace_agent',
    'ai.invoke.defense',
    'ai.invoke.project_chat',
    'ai.invoke.topic_proposal'
  )
),
audit_ranked AS (
  SELECT
    session_id,
    project_id,
    mode,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY session_id
      ORDER BY created_at DESC
    ) AS rn
  FROM audit_candidates
  WHERE session_id IS NOT NULL
    AND project_id IS NOT NULL
    AND mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense')
),
latest_audit AS (
  SELECT
    session_id,
    project_id,
    mode
  FROM audit_ranked
  WHERE rn = 1
),
fallback_candidates AS (
  SELECT
    session_id,
    project_id,
    mode,
    updated_at AS created_at
  FROM ai_project_change_requests

  UNION ALL

  SELECT
    session_id,
    project_id,
    source_mode AS mode,
    updated_at AS created_at
  FROM project_issue_reports
),
fallback_ranked AS (
  SELECT
    session_id,
    project_id,
    mode,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY session_id
      ORDER BY created_at DESC
    ) AS rn
  FROM fallback_candidates
  WHERE session_id IS NOT NULL
    AND project_id IS NOT NULL
    AND mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense')
),
latest_fallback AS (
  SELECT
    session_id,
    project_id,
    mode
  FROM fallback_ranked
  WHERE rn = 1
),
resolved_scope AS (
  SELECT
    s.id AS session_id,
    COALESCE(a.project_id, f.project_id, '') AS project_id,
    COALESCE(a.mode, f.mode, 'dialog_ask') AS mode
  FROM ai_chat_sessions s
  LEFT JOIN latest_audit a ON a.session_id = s.id
  LEFT JOIN latest_fallback f ON f.session_id = s.id
)
UPDATE ai_chat_sessions s
SET
  project_id = r.project_id,
  mode = r.mode,
  updated_at = NOW()
FROM resolved_scope r
WHERE s.id = r.session_id
  AND (
    s.project_id IS DISTINCT FROM r.project_id
    OR s.mode IS DISTINCT FROM r.mode
  );

ALTER TABLE ai_chat_sessions
  DROP CONSTRAINT IF EXISTS ai_chat_sessions_mode_check;

ALTER TABLE ai_chat_sessions
  ADD CONSTRAINT ai_chat_sessions_mode_check
  CHECK (mode IN ('dialog_ask', 'auto_optimize', 'issue_discovery', 'defense'));

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_workspace_project_mode_updated
  ON ai_chat_sessions(workspace_id, project_id, mode, updated_at DESC);

COMMIT;

-- Validation
DO $$
DECLARE
  conflicting_sessions INTEGER;
BEGIN
  WITH audit_candidates AS (
    SELECT
      NULLIF(payload ->> 'sessionId', '') AS session_id,
      NULLIF(payload ->> 'projectId', '') AS project_id
    FROM contest_audit_logs
    WHERE action IN (
      'ai.invoke.workspace_agent',
      'ai.invoke.defense',
      'ai.invoke.project_chat',
      'ai.invoke.topic_proposal'
    )
  )
  SELECT COUNT(*)
  INTO conflicting_sessions
  FROM (
    SELECT session_id
    FROM audit_candidates
    WHERE session_id IS NOT NULL
      AND project_id IS NOT NULL
    GROUP BY session_id
    HAVING COUNT(DISTINCT project_id) > 1
  ) c;

  IF conflicting_sessions > 0 THEN
    RAISE EXCEPTION 'Chat session scope backfill validation failed: % conflicting sessions remain.', conflicting_sessions;
  END IF;
END $$;
