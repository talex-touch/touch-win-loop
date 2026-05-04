ALTER TABLE platform_user_roles
  DROP CONSTRAINT IF EXISTS platform_user_roles_role_check;

ALTER TABLE platform_user_roles
  ADD CONSTRAINT platform_user_roles_role_check
  CHECK (role IN ('platform_super_admin', 'user_admin', 'contest_admin', 'pricing_admin'));

INSERT INTO platform_user_roles (id, user_id, role, created_at, updated_at)
SELECT 'rbac_' || md5(random()::TEXT || clock_timestamp()::TEXT || u.id), u.id, 'platform_super_admin', NOW(), NOW()
FROM users u
WHERE u.is_platform_admin = TRUE
ON CONFLICT (user_id, role) DO NOTHING;

WITH super_admins AS (
  SELECT DISTINCT user_id
  FROM platform_user_roles
  WHERE role = 'platform_super_admin'
)
SELECT user_id
FROM super_admins
WHERE (SELECT COUNT(*) FROM super_admins) > 1;
