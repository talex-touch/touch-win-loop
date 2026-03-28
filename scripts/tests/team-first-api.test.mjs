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
const DB_SCHEMA_FILE = resolve(process.cwd(), 'server/utils/db.ts')
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
  'server/api/teams/[id]/billing/estimate.get.ts',
  'server/api/teams/[id]/chat/sessions/index.get.ts',
  'server/api/teams/[id]/chat/sessions/index.post.ts',
  'server/api/teams/[id]/chat/sessions/[sessionId]/messages/index.get.ts',
  'server/api/teams/[id]/chat/sessions/[sessionId]/messages/index.post.ts',
]

it('workspace 旧接口统一返回 Team-First 410', async () => {
  for (const relativePath of WORKSPACE_ENDPOINT_FILES) {
    const source = await readFile(resolve(process.cwd(), relativePath), 'utf8')
    assert.match(source, /teamFirstApiRemoved/, `${relativePath} 未统一为 Team-First 410 兼容返回`)
  }
})

it('team 成员管理新增移除接口', async () => {
  const source = await readFile(TEAM_MEMBER_DELETE_FILE, 'utf8')
  assert.match(source, /teamRemoveWorkspaceMember/, '成员移除接口未接入 teamRemoveWorkspaceMember')
  assert.match(source, /toTeamMemberManagementSnapshotResponse/, '成员移除接口未返回 Team 成员快照')
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
    /UPDATE invitations[\s\S]*accepted_at IS NULL[\s\S]*expires_at > NOW\(\)[\s\S]*COALESCE\(invitee_username, ''\) = COALESCE\(\$3, ''\)/,
    'createInvitation 缺少同目标活跃邀请去重逻辑',
  )
})

it('邀请接受接口实现幂等语义', async () => {
  const source = await readFile(TEAM_INVITATION_STORE_FILE, 'utf8')
  assert.match(source, /if \(invitation\.accepted_at\)/, 'acceptInvitation 缺少已接受幂等分支')
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
})

it('team API 改为通过分域 store 引用，不再直接依赖 platform-store', async () => {
  for (const relativePath of TEAM_SPLIT_IMPORT_FILES) {
    const source = await readFile(resolve(process.cwd(), relativePath), 'utf8')
    assert.doesNotMatch(source, /server\/utils\/platform-store/, `${relativePath} 仍直接依赖 platform-store`)
  }
})

it('db schema 不再创建 Team-First 过渡桥接视图与触发器', async () => {
  const source = await readFile(DB_SCHEMA_FILE, 'utf8')
  assert.doesNotMatch(source, /CREATE OR REPLACE VIEW teams AS/, 'db.ts 仍包含 teams 过渡视图创建')
  assert.doesNotMatch(source, /CREATE OR REPLACE VIEW team_members AS/, 'db.ts 仍包含 team_members 过渡视图创建')
  assert.doesNotMatch(source, /CREATE OR REPLACE VIEW team_billing AS/, 'db.ts 仍包含 team_billing 过渡视图创建')
  assert.doesNotMatch(source, /sync_team_workspace_ids/, 'db.ts 仍包含 team/workspace 双写触发器逻辑')
})
