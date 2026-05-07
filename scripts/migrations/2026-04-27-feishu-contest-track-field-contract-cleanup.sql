-- 按飞书多维表字段口径清理历史同步配置与 release snapshot。
-- 竞赛库不再保存主办方、协办/承办、参赛对象、组队规则、当前届次。
-- 赛道库不再保存当前届次；审核按赛道库保留时间节点与必备项。

CREATE OR REPLACE FUNCTION pg_temp.winloop_strip_mapping_keys(mapping JSONB, keys TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB := COALESCE(mapping, '{}'::JSONB);
BEGIN
  IF jsonb_typeof(result) <> 'object' THEN
    RETURN result;
  END IF;

  IF jsonb_typeof(result -> 'fieldMap') = 'object' THEN
    result := jsonb_set(result, '{fieldMap}', (result -> 'fieldMap') - keys, true);
  END IF;

  IF jsonb_typeof(result -> 'defaults') = 'object' THEN
    result := jsonb_set(result, '{defaults}', (result -> 'defaults') - keys, true);
  END IF;

  IF jsonb_typeof(result -> 'fieldBindings') = 'array' THEN
    result := jsonb_set(
      result,
      '{fieldBindings}',
      COALESCE((
        SELECT jsonb_agg(binding.value ORDER BY binding.ordinality)
        FROM jsonb_array_elements(result -> 'fieldBindings') WITH ORDINALITY AS binding(value, ordinality)
        WHERE NOT (
          COALESCE(binding.value ->> 'targetPath', '') = ANY(keys)
          OR COALESCE(binding.value ->> 'key', '') = ANY(keys)
        )
      ), '[]'::JSONB),
      true
    );
  END IF;

  IF jsonb_typeof(result -> 'layers') = 'array' THEN
    result := jsonb_set(
      result,
      '{layers}',
      COALESCE((
        SELECT jsonb_agg(pg_temp.winloop_strip_mapping_keys(layer.value, keys) ORDER BY layer.ordinality)
        FROM jsonb_array_elements(result -> 'layers') WITH ORDINALITY AS layer(value, ordinality)
      ), '[]'::JSONB),
      true
    );
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.winloop_mapping_has_stale_keys(mapping JSONB, keys TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  source JSONB := COALESCE(mapping, '{}'::JSONB);
BEGIN
  IF jsonb_typeof(source) <> 'object' THEN
    RETURN false;
  END IF;

  IF COALESCE(source -> 'fieldMap', '{}'::JSONB) ?| keys
    OR COALESCE(source -> 'defaults', '{}'::JSONB) ?| keys THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(source -> 'fieldBindings') = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(source -> 'fieldBindings') AS binding(value)
      WHERE COALESCE(binding.value ->> 'targetPath', '') = ANY(keys)
         OR COALESCE(binding.value ->> 'key', '') = ANY(keys)
    ) THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(source -> 'layers') = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(source -> 'layers') AS layer(value)
      WHERE pg_temp.winloop_mapping_has_stale_keys(layer.value, keys)
    ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.winloop_sanitize_contest_release_snapshot(snapshot JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB := COALESCE(snapshot, '{}'::JSONB);
  contest_keys TEXT[] := ARRAY['organizer', 'participantRequirements', 'currentSeason', 'coOrganizer', 'teamRule'];
  track_keys TEXT[] := ARRAY['currentSeason'];
BEGIN
  IF jsonb_typeof(result) <> 'object' THEN
    RETURN result;
  END IF;

  IF jsonb_typeof(result -> 'contest') = 'object' THEN
    result := jsonb_set(result, '{contest}', (result -> 'contest') - contest_keys, true);
  END IF;

  IF jsonb_typeof(result -> 'tracks') = 'array' THEN
    result := jsonb_set(
      result,
      '{tracks}',
      COALESCE((
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(track.value) = 'object'
              THEN track.value - track_keys
            ELSE track.value
          END
          ORDER BY track.ordinality
        )
        FROM jsonb_array_elements(result -> 'tracks') WITH ORDINALITY AS track(value, ordinality)
      ), '[]'::JSONB),
      true
    );
  END IF;

  RETURN result;
END;
$$;

UPDATE feishu_bitable_sync_items
SET mapping_json = pg_temp.winloop_strip_mapping_keys(
  mapping_json,
  ARRAY['organizer', 'coOrganizer', 'participantRequirements', 'teamRule', 'currentSeason']
)
WHERE entity_type = 'contest';

UPDATE feishu_bitable_sync_items
SET mapping_json = pg_temp.winloop_strip_mapping_keys(
  mapping_json,
  ARRAY['currentSeason']
)
WHERE entity_type = 'track';

UPDATE release_versions
SET snapshot_json = pg_temp.winloop_sanitize_contest_release_snapshot(snapshot_json)
WHERE scope_kind = 'contest';

SELECT 'contest_mapping_stale' AS issue, id
FROM feishu_bitable_sync_items
WHERE entity_type = 'contest'
  AND pg_temp.winloop_mapping_has_stale_keys(
    mapping_json,
    ARRAY['organizer', 'coOrganizer', 'participantRequirements', 'teamRule', 'currentSeason']
  )
UNION ALL
SELECT 'track_mapping_stale' AS issue, id
FROM feishu_bitable_sync_items
WHERE entity_type = 'track'
  AND pg_temp.winloop_mapping_has_stale_keys(
    mapping_json,
    ARRAY['currentSeason']
  )
UNION ALL
SELECT 'release_snapshot_stale' AS issue, id
FROM release_versions
WHERE scope_kind = 'contest'
  AND (
    COALESCE(snapshot_json -> 'contest', '{}'::JSONB) ?| ARRAY['organizer', 'participantRequirements', 'currentSeason', 'coOrganizer', 'teamRule']
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(snapshot_json -> 'tracks', '[]'::JSONB)) AS track(value)
      WHERE jsonb_typeof(track.value) = 'object'
        AND track.value ? 'currentSeason'
    )
  );
