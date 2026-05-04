import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const ROOT = process.cwd()
const DOMAIN_TYPES_FILE = resolve(ROOT, 'shared/types/domain-legacy.ts')
const CONTEST_STORE_FILE = resolve(ROOT, 'server/utils/contest-store.ts')
const PLATFORM_ROLES_POST_FILE = resolve(ROOT, 'server/api/admin/platform-roles.post.ts')
const PLATFORM_ROLES_GET_FILE = resolve(ROOT, 'server/api/admin/platform-roles.get.ts')
const USERS_GET_FILE = resolve(ROOT, 'server/api/admin/users.get.ts')
const USER_DETAIL_GET_FILE = resolve(ROOT, 'server/api/admin/users/[id].get.ts')
const USERS_POST_FILE = resolve(ROOT, 'server/api/admin/users.post.ts')
const USER_PATCH_FILE = resolve(ROOT, 'server/api/admin/users/[id].patch.ts')
const USER_STATUS_FILE = resolve(ROOT, 'server/api/admin/users/[id]/status.patch.ts')
const USER_MAGIC_LINK_FILE = resolve(ROOT, 'server/api/admin/users/[id]/magic-link.post.ts')
const USERS_PAGE_FILE = resolve(ROOT, 'app/pages/admin/users.vue')
const ROLES_PAGE_FILE = resolve(ROOT, 'app/pages/admin/roles.vue')
const ADMIN_LAYOUT_FILE = resolve(ROOT, 'app/layouts/admin.vue')
const SCHEMA_FILE = resolve(ROOT, 'server/database/bootstrap/schema.ts')
const MIGRATION_FILE = resolve(ROOT, 'scripts/migrations/2026-05-04-simplified-rbac-user-admin.sql')

it('平台 RBAC 类型包含 user_admin 与用户管理权限', async () => {
  const source = await readFile(DOMAIN_TYPES_FILE, 'utf8')

  assert.match(source, /'user_admin'/, 'PlatformRole 缺少 user_admin')
  assert.match(source, /'user\.read'/, 'PlatformPermission 缺少 user.read')
  assert.match(source, /'user\.write'/, 'PlatformPermission 缺少 user.write')
  assert.match(source, /'user\.status\.write'/, 'PlatformPermission 缺少 user.status.write')
  assert.match(source, /'user\.security\.write'/, 'PlatformPermission 缺少 user.security.write')
  assert.match(source, /'role\.super\.assign'/, 'PlatformPermission 缺少 role.super.assign')
})

it('内置角色权限符合精简 RBAC 边界', async () => {
  const source = await readFile(CONTEST_STORE_FILE, 'utf8')

  assert.match(source, /platform_super_admin:[\s\S]*'user\.read'[\s\S]*'user\.write'[\s\S]*'user\.status\.write'[\s\S]*'user\.security\.write'[\s\S]*'role\.assign'[\s\S]*'role\.super\.assign'/, 'platform_super_admin 未包含完整用户与角色权限')
  assert.match(source, /user_admin:[\s\S]*'user\.read'[\s\S]*'user\.write'[\s\S]*'user\.status\.write'[\s\S]*'user\.security\.write'[\s\S]*'role\.assign'/, 'user_admin 未覆盖用户管理与普通角色分配权限')
  assert.doesNotMatch(source, /user_admin:[\s\S]*'role\.super\.assign'/, 'user_admin 不应拥有超管转移权限')
  assert.doesNotMatch(source, /if \(user\.isPlatformAdmin\)\s+roleSet\.add\('platform_super_admin'\)/, '运行时权限不应继续直接依赖 users.is_platform_admin')
})

it('用户管理 API 按拆分后的权限校验', async () => {
  const [
    usersGet,
    detailGet,
    usersPost,
    userPatch,
    statusPatch,
    magicLink,
  ] = await Promise.all([
    readFile(USERS_GET_FILE, 'utf8'),
    readFile(USER_DETAIL_GET_FILE, 'utf8'),
    readFile(USERS_POST_FILE, 'utf8'),
    readFile(USER_PATCH_FILE, 'utf8'),
    readFile(USER_STATUS_FILE, 'utf8'),
    readFile(USER_MAGIC_LINK_FILE, 'utf8'),
  ])

  assert.match(usersGet, /checkPlatformPermission\(event, user, 'user\.read'\)/, '用户列表未使用 user.read')
  assert.match(detailGet, /checkPlatformPermission\(event, user, 'user\.read'\)/, '用户详情未使用 user.read')
  assert.match(usersPost, /checkPlatformPermission\(event, user, 'user\.write'\)/, '用户创建未使用 user.write')
  assert.match(userPatch, /checkPlatformPermission\(event, user, 'user\.write'\)/, '用户资料更新未使用 user.write')
  assert.match(statusPatch, /checkPlatformPermission\(event, user, 'user\.status\.write'\)/, '用户状态未使用 user.status.write')
  assert.match(statusPatch, /SELF_DISABLE_NOT_ALLOWED/, '状态接口缺少禁止禁用自己保护')
  assert.match(statusPatch, /LAST_SUPER_ADMIN/, '状态接口缺少唯一超管保护')
  assert.match(magicLink, /checkPlatformPermission\(event, user, 'user\.security\.write'\)/, 'magic link 未使用 user.security.write')
  assert.match(magicLink, /checkPlatformPermission\(event, user, 'role\.super\.assign'\)/, 'magic link 未要求超管权限')
  assert.match(magicLink, /userId === user\.id/, 'magic link 未禁止给自己生成')
})

it('角色分配接口只允许批量分配普通内置角色', async () => {
  const [apiSource, storeSource, getSource] = await Promise.all([
    readFile(PLATFORM_ROLES_POST_FILE, 'utf8'),
    readFile(CONTEST_STORE_FILE, 'utf8'),
    readFile(PLATFORM_ROLES_GET_FILE, 'utf8'),
  ])

  assert.match(apiSource, /ASSIGNABLE_ROLES:[\s\S]*'user_admin'[\s\S]*'contest_admin'[\s\S]*'pricing_admin'/, '角色分配接口未允许普通内置角色')
  assert.doesNotMatch(apiSource, /ASSIGNABLE_ROLES:[\s\S]*'platform_super_admin'/, '批量角色分配不应允许 platform_super_admin')
  assert.match(apiSource, /targetUserIds/, '角色分配接口未支持多用户 targetUserIds')
  assert.match(apiSource, /for \(const targetUserId of uniqueTargetUserIds\)/, '角色分配接口未批量处理用户')
  assert.match(storeSource, /DELETE FROM platform_user_roles[\s\S]*role = 'platform_super_admin'[\s\S]*user_id <> \$1/, 'store 未原子移除其它超管')
  assert.match(storeSource, /UNIQUE_SUPER_ADMIN_REQUIRED/, 'store 未强制刚好一个超管')
  assert.match(getSource, /adminUsers\.map\(item => assignmentMap\.get\(item\.userId\)/, '权限管理读取接口未返回全部用户分配行')
  assert.match(getSource, /users:/, '权限管理读取接口未返回用户选择器数据')
})

it('用户管理与权限页按新权限控制 UI', async () => {
  const [usersPage, rolesPage, adminLayout] = await Promise.all([
    readFile(USERS_PAGE_FILE, 'utf8'),
    readFile(ROLES_PAGE_FILE, 'utf8'),
    readFile(ADMIN_LAYOUT_FILE, 'utf8'),
  ])

  assert.match(usersPage, /permissions\.includes\('user\.read'\)/, '用户管理页未按 user.read 控制访问')
  assert.match(usersPage, /permissions\.includes\('user\.write'\)/, '用户管理页未按 user.write 控制编辑')
  assert.match(usersPage, /permissions\.includes\('user\.status\.write'\)/, '用户管理页未按 user.status.write 控制状态')
  assert.match(usersPage, /permissions\.includes\('user\.security\.write'\)/, '用户管理页未按 user.security.write 控制安全操作')
  assert.match(usersPage, /user_admin（用户管理）/, '用户管理页未展示 user_admin 角色')
  assert.match(usersPage, /唯一平台超管转移/, '用户管理页缺少超管转移危险确认')
  assert.match(rolesPage, /<a-drawer/, '权限页未改为 drawer')
  assert.match(rolesPage, /multiple/, '权限页未支持多用户选择')
  assert.match(rolesPage, /全选角色/, '权限页缺少角色全选')
  assert.match(rolesPage, /全选用户/, '权限页缺少用户全选')
  assert.match(rolesPage, /platform_super_admin 是唯一超管，不允许在批量分配中授予或移除/, '权限页缺少禁止分配超管说明')
  assert.match(adminLayout, /admin-users[\s\S]*requiredAny: \['user\.read'\]/, 'admin 导航用户管理未改为 user.read')
})

it('schema 与迁移支持 user_admin 并拒绝多超管静默迁移', async () => {
  const [schemaSource, migrationSource] = await Promise.all([
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(MIGRATION_FILE, 'utf8'),
  ])

  assert.match(schemaSource, /'user_admin'/, 'bootstrap schema 未允许 user_admin')
  assert.match(migrationSource, /ADD CONSTRAINT platform_user_roles_role_check/, '迁移未重建角色 CHECK')
  assert.match(migrationSource, /'user_admin'/, '迁移 CHECK 未允许 user_admin')
  assert.match(migrationSource, /users u[\s\S]*u\.is_platform_admin = TRUE[\s\S]*'platform_super_admin'/, '迁移未把历史 is_platform_admin 回填到角色表')
  assert.match(migrationSource, /WHERE \(SELECT COUNT\(\*\) FROM super_admins\) > 1/, '迁移未在多超管时返回校验失败行')
})
