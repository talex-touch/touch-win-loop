-- 清理资料库历史版本与 live 资源 metadata 中已废弃的关联信息文本字段

UPDATE contest_resources
SET metadata = COALESCE(metadata, '{}'::JSONB) - 'contestRelationInfo' - 'trackRelationInfo'
WHERE COALESCE(metadata, '{}'::JSONB) ? 'contestRelationInfo'
   OR COALESCE(metadata, '{}'::JSONB) ? 'trackRelationInfo';

UPDATE release_versions AS rv
SET snapshot_json = jsonb_set(
  rv.snapshot_json,
  '{resources}',
  COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(resource.value) = 'object'
          AND jsonb_typeof(resource.value -> 'metadata') = 'object'
        THEN jsonb_set(
          resource.value,
          '{metadata}',
          (resource.value -> 'metadata') - 'contestRelationInfo' - 'trackRelationInfo',
          true
        )
        ELSE resource.value
      END
      ORDER BY resource.ordinality
    )
    FROM jsonb_array_elements(COALESCE(rv.snapshot_json -> 'resources', '[]'::JSONB))
      WITH ORDINALITY AS resource(value, ordinality)
  ), '[]'::JSONB),
  true
)
WHERE rv.scope_kind = 'contest'
  AND jsonb_typeof(rv.snapshot_json -> 'resources') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(rv.snapshot_json -> 'resources') AS resource(value)
    WHERE jsonb_typeof(resource.value) = 'object'
      AND jsonb_typeof(resource.value -> 'metadata') = 'object'
      AND (
        (resource.value -> 'metadata') ? 'contestRelationInfo'
        OR (resource.value -> 'metadata') ? 'trackRelationInfo'
      )
  );
