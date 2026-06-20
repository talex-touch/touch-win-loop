-- Project resource tree schema backfill
-- Goal: align existing databases with parent_resource_id / sort_order tree fields.

BEGIN;

SET lock_timeout = '10s';
SET statement_timeout = '0';

ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS parent_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL;

ALTER TABLE project_resources
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked_project_resources AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY created_at DESC, id DESC
    ) - 1 AS next_sort_order
  FROM project_resources
  WHERE parent_resource_id IS NULL
)
UPDATE project_resources AS pr
SET sort_order = ranked_project_resources.next_sort_order
FROM ranked_project_resources
WHERE pr.id = ranked_project_resources.id
  AND pr.parent_resource_id IS NULL
  AND pr.sort_order = 0;

ALTER TABLE project_resource_upload_sessions
  ADD COLUMN IF NOT EXISTS parent_resource_id TEXT REFERENCES project_resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_resources_project_parent_sort
  ON project_resources(project_id, parent_resource_id, sort_order ASC, created_at ASC);

COMMIT;

-- Validation
SELECT required.table_name, required.column_name
FROM (
  VALUES
    ('project_resources', 'parent_resource_id'),
    ('project_resources', 'sort_order'),
    ('project_resource_upload_sessions', 'parent_resource_id')
) AS required(table_name, column_name)
LEFT JOIN information_schema.columns cols
  ON cols.table_schema = 'public'
 AND cols.table_name = required.table_name
 AND cols.column_name = required.column_name
WHERE cols.column_name IS NULL;
