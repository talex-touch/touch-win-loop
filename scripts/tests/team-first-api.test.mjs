import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_ENDPOINT_FILES = [
  'server/api/workspaces/index.get.ts',
  'server/api/workspaces/index.post.ts',
  'server/api/workspaces/[id]/billing.patch.ts',
  'server/api/workspaces/[id]/billing/addons.patch.ts',
  'server/api/workspaces/[id]/billing/estimate.get.ts',
  'server/api/workspaces/[id]/chat/sessions/index.get.ts',
  'server/api/workspaces/[id]/chat/sessions/index.post.ts',
  'server/api/workspaces/[id]/chat/sessions/[sessionId]/messages/index.get.ts',
  'server/api/workspaces/[id]/chat/sessions/[sessionId]/messages/index.post.ts',
  'server/api/workspaces/[id]/invitations.post.ts',
  'server/api/workspaces/[id]/members.get.ts',
  'server/api/workspaces/[id]/members/[userId]/role.patch.ts',
]

const TEAM_INVITATION_STORE_FILE = resolve(process.cwd(), 'server/utils/team-invitation-store.ts')
const TEAM_INVITATION_CREATE_FILE = resolve(process.cwd(), 'server/api/teams/[id]/invitations.post.ts')
const TEAM_MEMBER_ROLE_PATCH_FILE = resolve(process.cwd(), 'server/api/teams/[id]/members/[userId]/role.patch.ts')
const TEAM_MEMBERSHIP_STORE_FILE = resolve(process.cwd(), 'server/utils/team-membership-store.ts')
const DB_SCHEMA_FILE = resolve(process.cwd(), 'server/utils/db.ts')
const DB_BOOTSTRAP_SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const TEAM_MEMBER_DELETE_FILE = resolve(process.cwd(), 'server/api/teams/[id]/members/[userId].delete.ts')
const TEAM_INVITATION_REVOKE_FILE = resolve(process.cwd(), 'server/api/teams/[id]/invitations/[invitationId]/revoke.post.ts')
const TEAM_SPLIT_IMPORT_FILES = [
  'server/api/invitations/[token]/accept.post.ts',
  'server/api/teams/index.get.ts',
  'server/api/teams/index.post.ts',
  'server/api/teams/[id]/members.get.ts',
  'server/api/teams/[id]/members/[userId]/role.patch.ts',
  'server/api/teams/[id]/members/[userId].delete.ts',
  'server/api/teams/[id]/invitations.post.ts',
  'server/api/teams/[id]/invitations/[invitationId]/revoke.post.ts',
  'server/api/teams/[id]/seats.patch.ts',
  'server/api/teams/[id]/billing.patch.ts',
  'server/api/teams/[id]/billing/addons.patch.ts',
  'server/api/teams/[id]/billing/checkout.post.ts',
  'server/api/teams/[id]/billing/estimate.get.ts',
  'server/api/teams/[id]/billing/orders.get.ts',
  'server/api/teams/[id]/chat/sessions/index.get.ts',
  'server/api/teams/[id]/chat/sessions/index.post.ts',
  'server/api/teams/[id]/chat/sessions/[sessionId]/messages/index.get.ts',
  'server/api/teams/[id]/chat/sessions/[sessionId]/messages/index.post.ts',
]

it('workspace 旧接口统一返回 Team-First 410', async () => {
  for (const relativePath of WORKSPACE_ENDPOINT_FILES) {
    const source = await readFile(resolve(process.cwd(), relativePath), 'utf8')
    assert.match(source, /teamFirstDeprecatedHandler/, `${relativePath} 未统一为 Team-First 410 兼容返回`)
  }
})

it('team 成员管理新增移除接口', async () => {
  const source = await readFile(TEAM_MEMBER_DELETE_FILE, 'utf8')
  assert.match(source, /teamRemoveWorkspaceMember/, '成员移除接口未接入 teamRemoveWorkspaceMember')
  assert.match(source, /toTeamMemberManagementSnapshotResponse/, '成员移除接口未返回 Team 成员快照')
  assert.match(source, /WORKSPACE_MEMBER_OWNS_PROJECTS/, '成员移除接口未处理项目 owner 保护错误')
})

it('team 邀请管理新增撤销接口', async () => {
  const source = await readFile(TEAM_INVITATION_REVOKE_FILE, 'utf8')
  assert.match(source, /teamRevokeWorkspaceInvitation/, '邀请撤销接口未接入 teamRevokeWorkspaceInvitation')
  assert.match(source, /revoked/, '邀请撤销接口未返回 revoked 状态')
})

it('邀请创建具备活跃邀请去重逻辑', async () => {
  const source = await readFile(TEAM_INVITATION_STORE_FILE, 'utf8')
  assert.match(
    source,
    /UPDATE invitations[\s\S]*COALESCE\(project_id, ''\) = COALESCE\(\$2, ''\)[\s\S]*COALESCE\(project_role, ''\) = COALESCE\(\$3, ''\)[\s\S]*accepted_at IS NULL[\s\S]*expires_at > NOW\(\)[\s\S]*COALESCE\(invitee_username, ''\) = COALESCE\(\$5, ''\)/,
    'createInvitation 缺少按 projectId 维度隔离的活跃邀请去重逻辑',
  )
})

it('邀请接受接口实现幂等语义', async () => {
  const source = await readFile(TEAM_INVITATION_STORE_FILE, 'utf8')
  assert.match(source, /if \(isTargetedInvitation && invitation\.accepted_at\)/, 'acceptInvitation 缺少定向邀请已接受幂等分支')
  const acceptInvitationSection = source.match(
    /export async function teamAcceptInvitation[\s\S]*?export async function teamRevokeWorkspaceInvitation/,
  )?.[0] || ''
  assert.ok(acceptInvitationSection, '未找到 acceptInvitation 实现片段')

  const tokenQuerySql = acceptInvitationSection.match(/`SELECT[\s\S]*?FROM invitations[\s\S]*?`/)?.[0] || ''
  assert.ok(tokenQuerySql, 'acceptInvitation 缺少 token 查询 SQL')
  assert.doesNotMatch(
    tokenQuerySql,
    /accepted_at IS NULL|expires_at > NOW\(\)/,
    'acceptInvitation 仍使用旧的非幂等查询条件',
  )
  assert.match(tokenQuerySql, /FOR UPDATE/, 'acceptInvitation 未对 invitation 行加锁')
  assert.match(acceptInvitationSection, /const isTargetedInvitation = Boolean\(invitation\.invitee_username\)/, 'acceptInvitation 未按 invitee_username 区分定向与通用邀请')
  assert.match(acceptInvitationSection, /if \(isTargetedInvitation && invitation\.accepted_at\)/, '定向邀请未保留 accepted_at 单次消费幂等分支')
  assert.match(acceptInvitationSection, /if \(!isTargetedInvitation\) \{[\s\S]*acceptedAt: null[\s\S]*\}/, '通用邀请未保留 acceptedAt 为空的多人复用分支')
})

it('team 邀请支持携带项目上下文并在接受后补齐项目成员', async () => {
  const source = await readFile(TEAM_INVITATION_STORE_FILE, 'utf8')

  assert.match(source, /projectId\?: string \| null/, 'Invitation store 未声明 projectId 输入')
  assert.match(source, /projectId: normalizedProjectId/, 'createInvitation 未回传 projectId')
  assert.match(source, /project_id,\s*project_role,\s*invited_by_user_id,\s*role,\s*invitee_username/, 'acceptInvitation 未读取 project_id / project_role / invited_by_user_id')
  assert.match(source, /role:\s*normalizeInvitationProjectRole\(invitation\.project_role\) \|\| 'viewer'/, 'acceptInvitation 未按 projectRole 自动补齐项目成员')
})

it('team 邀请创建接口校验当前项目管理权限并透传 projectId', async () => {
  const source = await readFile(TEAM_INVITATION_CREATE_FILE, 'utf8')

  assert.match(source, /projectId\?: string/, '邀请创建接口未声明 projectId 请求体')
  assert.match(source, /const projectId = String\(body\?\.projectId \|\| ''\)\.trim\(\) \|\| null/, '邀请创建接口未解析 projectId')
  assert.match(source, /const canManageProject = await teamCanManageProject\(db, user, projectId\)/, '邀请创建接口未校验当前项目管理权限')
  assert.match(source, /projectId,\s+invitedByUserId: user\.id/, '邀请创建接口未把 projectId 透传到 store')
})

it('personal 空间不再允许 admin 或 manager 二级空间角色', async () => {
  const invitationSource = await readFile(TEAM_INVITATION_CREATE_FILE, 'utf8')
  const rolePatchSource = await readFile(TEAM_MEMBER_ROLE_PATCH_FILE, 'utf8')
  const membershipSource = await readFile(TEAM_MEMBERSHIP_STORE_FILE, 'utf8')
  const dbSource = await readFile(DB_BOOTSTRAP_SCHEMA_FILE, 'utf8')

  assert.match(invitationSource, /if \(workspaceType === 'personal' && role !== 'member'\)\s+throw new Error\('PERSONAL_WORKSPACE_ONLY_MEMBER_ALLOWED'\)/, 'personal 仍允许通过 Team 邀请授予 admin\/manager')
  assert.match(rolePatchSource, /PERSONAL_WORKSPACE_SECONDARY_ROLE_FORBIDDEN/, 'personal 空间成员角色接口未拒绝 admin\/manager')
  assert.match(membershipSource, /if \(workspaceType === 'personal' && input\.role !== 'member'\)\s+throw new Error\('PERSONAL_WORKSPACE_SECONDARY_ROLE_FORBIDDEN'\)/, 'teamPatchWorkspaceMemberRole 未限制 personal 二级角色')
  assert.match(membershipSource, /if \(workspaceType === 'personal' && role !== 'owner'\)\s+return 'member'/, 'teamEnsureWorkspaceMember 未把 personal 非 owner 角色收敛为 member')
  assert.match(dbSource, /UPDATE workspace_members wm[\s\S]*w\.type = 'personal'[\s\S]*wm\.role IN \('admin', 'manager'\)/, 'db 迁移未清理 personal 历史 admin\/manager 成员')
  assert.match(dbSource, /UPDATE invitations i[\s\S]*w\.type = 'personal'[\s\S]*i\.role IN \('admin', 'manager'\)/, 'db 迁移未清理 personal 历史 admin\/manager 邀请')
})

it('移除 Team 成员前会阻止删除仍持有项目 owner 的用户，避免悬空 owner', async () => {
  const membershipSource = await readFile(TEAM_MEMBERSHIP_STORE_FILE, 'utf8')

  assert.match(
    membershipSource,
    /SELECT id[\s\S]*FROM projects[\s\S]*workspace_id = \$1[\s\S]*owner_user_id = \$2[\s\S]*throw new Error\('WORKSPACE_MEMBER_OWNS_PROJECTS'\)/,
    'teamRemoveWorkspaceMember 未阻止移除仍持有项目 owner 的成员',
  )
})

it('team API 改为通过分域 store 引用，不再直接依赖 platform-store', async () => {
  for (const relativePath of TEAM_SPLIT_IMPORT_FILES) {
    const source = await readFile(resolve(process.cwd(), relativePath), 'utf8')
    assert.doesNotMatch(source, /server\/utils\/platform-store/, `${relativePath} 仍直接依赖 platform-store`)
  }
})

it('db schema 不再创建 Team-First 过渡桥接视图与触发器', async () => {
  const source = await readFile(DB_BOOTSTRAP_SCHEMA_FILE, 'utf8')
  assert.doesNotMatch(source, /CREATE OR REPLACE VIEW teams AS/, 'db.ts 仍包含 teams 过渡视图创建')
  assert.doesNotMatch(source, /CREATE OR REPLACE VIEW team_members AS/, 'db.ts 仍包含 team_members 过渡视图创建')
  assert.doesNotMatch(source, /CREATE OR REPLACE VIEW team_billing AS/, 'db.ts 仍包含 team_billing 过渡视图创建')
  assert.doesNotMatch(source, /sync_team_workspace_ids/, 'db.ts 仍包含 team/workspace 双写触发器逻辑')
  assert.match(source, /project_id TEXT REFERENCES projects\(id\) ON DELETE SET NULL/, 'invitations 表未新增 project_id 上下文字段')
})

it('db schema 会先补齐 invitations.project_id 再创建对应索引', async () => {
  const source = await readFile(DB_BOOTSTRAP_SCHEMA_FILE, 'utf8')
  const addColumnSql = `ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;`
  const indexSql = `CREATE INDEX IF NOT EXISTS idx_invitations_workspace_project_created ON invitations(workspace_id, project_id, created_at DESC);`

  const addColumnIndex = source.indexOf(addColumnSql)
  const createIndexIndex = source.indexOf(indexSql)

  assert.notEqual(addColumnIndex, -1, 'db.ts 缺少 invitations.project_id 补列迁移')
  assert.notEqual(createIndexIndex, -1, 'db.ts 缺少 invitations project 维度索引')
  assert.ok(addColumnIndex < createIndexIndex, 'db.ts 先创建 invitations.project_id 索引后补列，旧库启动会失败')
})

it('db 连接层已从 schema bootstrap 中剥离', async () => {
  const source = await readFile(DB_SCHEMA_FILE, 'utf8')
  assert.match(source, /ensureSchemaReady/, 'db.ts 未委托 schema bootstrap')
  assert.match(source, /ensureProjectResourceTreeSchemaReady/, 'db.ts 未委托资料树 schema bootstrap')
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS users/, 'db.ts 仍内联 schema bootstrap SQL')
})
