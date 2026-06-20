ALTER TABLE platform_user_roles
  DROP CONSTRAINT IF EXISTS platform_user_roles_role_check;

ALTER TABLE platform_user_roles
  ADD CONSTRAINT platform_user_roles_role_check
  CHECK (role IN ('platform_super_admin', 'user_admin', 'contest_admin', 'pricing_admin'));

DROP TABLE IF EXISTS winloop_legacy_platform_admins;

CREATE TEMP TABLE winloop_legacy_platform_admins AS
SELECT
  u.id AS user_id,
  u.created_at,
  EXISTS (
    SELECT 1
    FROM platform_user_roles pr
    WHERE pr.user_id = u.id
      AND pr.role = 'platform_super_admin'
  ) AS has_super_role
FROM users u
WHERE u.is_platform_admin = TRUE
   OR EXISTS (
     SELECT 1
     FROM platform_user_roles pr
     WHERE pr.user_id = u.id
       AND pr.role = 'platform_super_admin'
   );

WITH
canonical_super_admin AS (
  SELECT user_id
  FROM winloop_legacy_platform_admins
  ORDER BY has_super_role DESC, created_at ASC, user_id ASC
  LIMIT 1
)
UPDATE users u
SET
  is_platform_admin = EXISTS (
    SELECT 1
    FROM canonical_super_admin c
    WHERE c.user_id = u.id
  ),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM winloop_legacy_platform_admins l
  WHERE l.user_id = u.id
);

WITH canonical_super_admin AS (
  SELECT id AS user_id
  FROM users
  WHERE is_platform_admin = TRUE
  ORDER BY created_at ASC, id ASC
  LIMIT 1
)
DELETE FROM platform_user_roles pr
WHERE pr.role = 'platform_super_admin'
  AND NOT EXISTS (
    SELECT 1
    FROM canonical_super_admin c
    WHERE c.user_id = pr.user_id
  );

INSERT INTO platform_user_roles (id, user_id, role, created_at, updated_at)
SELECT 'rbac_' || md5(random()::TEXT || clock_timestamp()::TEXT || u.id), u.id, 'platform_super_admin', NOW(), NOW()
FROM users u
WHERE u.is_platform_admin = TRUE
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO platform_user_roles (id, user_id, role, created_at, updated_at)
SELECT 'rbac_' || md5(random()::TEXT || clock_timestamp()::TEXT || u.id), u.id, 'user_admin', NOW(), NOW()
FROM users u
WHERE EXISTS (
    SELECT 1
    FROM winloop_legacy_platform_admins l
    WHERE l.user_id = u.id
  )
  AND u.is_platform_admin = FALSE
ON CONFLICT (user_id, role) DO NOTHING;

WITH super_admins AS (
  SELECT DISTINCT user_id
  FROM platform_user_roles
  WHERE role = 'platform_super_admin'
)
SELECT user_id
FROM super_admins
WHERE (SELECT COUNT(*) FROM super_admins) <> 1;
