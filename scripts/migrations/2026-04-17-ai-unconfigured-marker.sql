ALTER TABLE ai_chat_messages
  ALTER COLUMN provider SET DEFAULT 'unconfigured';

UPDATE ai_chat_messages
SET provider = 'unconfigured'
WHERE COALESCE(BTRIM(provider), '') IN ('', 'mock');

WITH normalized AS (
  SELECT
    key,
    jsonb_set(
      jsonb_set(
        value::jsonb,
        '{ai,provider}',
        to_jsonb(
          CASE
            WHEN COALESCE(BTRIM(value::jsonb #>> '{ai,provider}'), '') IN ('', 'mock')
              THEN 'unconfigured'
            ELSE value::jsonb #>> '{ai,provider}'
          END::text
        ),
        true
      ),
      '{docAi,provider}',
      to_jsonb(
        CASE
          WHEN COALESCE(BTRIM(value::jsonb #>> '{docAi,provider}'), '') IN ('', 'mock')
            THEN 'unconfigured'
          ELSE value::jsonb #>> '{docAi,provider}'
        END::text
      ),
      true
    ) AS next_value
  FROM migrations_meta
  WHERE key = 'platform_ai_runtime_overrides.v1'
    AND COALESCE(BTRIM(value), '') <> ''
)
UPDATE migrations_meta AS target
SET value = normalized.next_value::text,
    updated_at = NOW()
FROM normalized
WHERE target.key = normalized.key;
