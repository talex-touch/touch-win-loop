import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_BARREL_FILE = resolve(process.cwd(), 'shared/types/domain.ts')
const DOMAIN_LEGACY_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const PROJECT_TYPES_FILE = resolve(process.cwd(), 'shared/types/project.ts')
const WORKSPACE_TYPES_FILE = resolve(process.cwd(), 'shared/types/workspace.ts')
const DB_SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const PLATFORM_STORE_FILE = resolve(process.cwd(), 'server/utils/platform-store.ts')
const TEAM_INVITATION_STORE_FILE = resolve(process.cwd(), 'server/utils/team-invitation-store.ts')
const CONTEST_STORE_FILE = resolve(process.cwd(), 'server/utils/contest-store.ts')
const PROJECT_MEMBER_GET_FILE = resolve(process.cwd(), 'server/api/projects/[id]/members.get.ts')
const PROJECT_INVITATION_CREATE_FILE = resolve(process.cwd(), 'server/api/projects/[id]/invitations/index.post.ts')
const PROJECT_INVITATION_REVOKE_FILE = resolve(process.cwd(), 'server/api/projects/[id]/invitations/[invitationId]/revoke.post.ts')

it('项目协作快照类型暴露 invitations 与 projectRole', async () => {
  const [domainBarrelSource, domainLegacySource, projectTypesSource, workspaceTypesSource] = await Promise.all([
    readFile(DOMAIN_BARREL_FILE, 'utf8'),
    readFile(DOMAIN_LEGACY_FILE, 'utf8'),
    readFile(PROJECT_TYPES_FILE, 'utf8'),
    readFile(WORKSPACE_TYPES_FILE, 'utf8'),
  ])

  assert.match(domainBarrelSource, /export \* from '\.\/project'/, 'shared/types/domain.ts 未继续转发 project 类型出口')
  assert.match(domainBarrelSource, /export \* from '\.\/workspace'/, 'shared/types/domain.ts 未继续转发 workspace 类型出口')
  assert.match(workspaceTypesSource, /ProjectInvitationSummary,[\s\S]*ProjectMemberRole,[\s\S]*from '\.\/domain-legacy'/, 'workspace 类型聚合未继续转发项目邀请相关类型')
  assert.match(projectTypesSource, /ProjectMemberManagementSnapshot,[\s\S]*from '\.\/domain-legacy'/, 'project 类型聚合未继续转发项目成员管理快照')
  assert.match(domainLegacySource, /projectRole\?: ProjectMemberRole \| null/, '邀请类型未暴露 projectRole')
  assert.match(domainLegacySource, /export interface ProjectInvitationSummary extends Invitation \{/, '缺少 ProjectInvitationSummary 类型')
  assert.match(domainLegacySource, /export interface ProjectMemberManagementSnapshot \{\s+projectId: string[\s\S]*members: ProjectMemberSummary\[\][\s\S]*invitations: ProjectInvitationSummary\[\][\s\S]*seatQuota: ProjectSeatQuota \| null/, '项目成员快照未包含 invitations 或 seatQuota')
})

it('项目成员快照接口与邀请接口都走 projects 域', async () => {
  const memberGetSource = await readFile(PROJECT_MEMBER_GET_FILE, 'utf8')
  const invitationCreateSource = await readFile(PROJECT_INVITATION_CREATE_FILE, 'utf8')
  const invitationRevokeSource = await readFile(PROJECT_INVITATION_REVOKE_FILE, 'utf8')

  assert.match(memberGetSource, /getProjectMemberManagementSnapshot/, 'GET /api/projects/:id/members 未返回项目协作快照')
  assert.match(invitationCreateSource, /projectRole\?: ProjectMemberRole/, 'POST /api/projects/:id/invitations 未声明 projectRole')
  assert.match(invitationCreateSource, /projectRole: body\.projectRole/, 'POST /api/projects/:id/invitations 未透传 projectRole')
  assert.match(invitationRevokeSource, /revokeProjectInvitation/, '项目邀请撤销接口未接入 revokeProjectInvitation')
  assert.match(invitationRevokeSource, /revoked/, '项目邀请撤销接口未返回 revoked 状态')
})

it('项目邀请与成员管理遵循 manager/editor/viewer 协作模型', async () => {
  const source = await readFile(PLATFORM_STORE_FILE, 'utf8')

  assert.match(source, /function normalizeProjectInvitationRole\(input: ProjectMemberRole \| null \| undefined\): ProjectMemberRole \{\s+if \(input === 'manager' \|\| input === 'editor' \|\| input === 'viewer'\)/, '项目邀请角色未限制为 manager\/editor\/viewer')
  assert.match(source, /if \(!canAssignElevatedProjectRole\(input\.actorUser, actorWorkspaceRoles\) && nextProjectRole !== 'viewer'\)\s+throw new Error\('MANAGER_CAN_ONLY_INVITE_VIEWER'\)/, 'manager 邀请权限未限制为 viewer')
  assert.match(source, /if \(!isOwnerOrAdminActor && nextRole !== 'viewer'\)\s+throw new Error\('MANAGER_CAN_ONLY_ASSIGN_MEMBER'\)/, 'manager 成员分配权限未限制为 viewer')
})

it('所有项目统一执行 15 席位上限与 3 位指导老师上限', async () => {
  const dbSource = await readFile(DB_SCHEMA_FILE, 'utf8')
  const platformSource = await readFile(PLATFORM_STORE_FILE, 'utf8')

  assert.match(dbSource, /ADD COLUMN IF NOT EXISTS project_role TEXT;/, 'invitations 表未补 project_role 列')
  assert.match(dbSource, /ADD CONSTRAINT invitations_project_role_check[\s\S]*project_role IN \('manager', 'editor', 'viewer'\)/, 'invitations.project_role 未加角色约束')
  assert.match(dbSource, /SET default_project_seat_limit = 15[\s\S]*default_project_seat_limit < 15;/, '默认项目席位未统一迁移到 15')
  assert.match(dbSource, /SELECT[\s\S]*p\.id,[\s\S]*p\.workspace_id,[\s\S]*15,[\s\S]*COALESCE\(member_count\.used, 0\)/, '新项目席位初始化未统一为 15')
  assert.match(dbSource, /SET seat_limit = 15,[\s\S]*psq\.seat_used <= 15[\s\S]*psq\.seat_limit <> 15;/, '历史项目 seat_limit 未按 <=15 的规则迁移')
  assert.match(platformSource, /const MAX_PROJECT_SEAT_LIMIT = 15/, 'platform-store 未声明统一的项目 seat 上限常量')
  assert.match(platformSource, /const MAX_PROJECT_ADVISOR_COUNT = 3/, 'platform-store 未声明统一的指导老师上限常量')
  assert.match(platformSource, /if \(seatUsed \+ normalizedAdditional > effectiveSeatLimit\)\s+throw new Error\('PROJECT_SEAT_LIMIT_REACHED'\)/, '项目 seat 校验未统一收敛到有效上限')
  assert.match(platformSource, /if \(resolvedIds\.length > MAX_PROJECT_ADVISOR_COUNT\)\s+throw new Error\('PROJECT_ADVISOR_LIMIT_EXCEEDED'\)/, '指导老师上限未限制为 3')
  assert.match(platformSource, /if \(nextSeatLimit > MAX_PROJECT_SEAT_LIMIT\)\s+throw new Error\('PROJECT_SEAT_LIMIT_MAX_EXCEEDED'\)/, '项目 seat 调整未统一限制为最大 15')
  assert.match(platformSource, /await assertProjectSeatAvailable\(db, input\.projectId, project\.workspaceId, 1\)/, '项目邀请创建未在满员或超限时阻止继续邀请')
})

it('项目邀请接受对通用链接支持多人复用，并继续补齐 Team member + 项目角色', async () => {
  const source = await readFile(TEAM_INVITATION_STORE_FILE, 'utf8')

  assert.match(source, /const isTargetedInvitation = Boolean\(invitation\.invitee_username\)/, '项目邀请接受链路未区分通用与定向邀请')
  assert.match(source, /if \(!isTargetedInvitation\) \{[\s\S]*teamEnsureWorkspaceMember\(db, invitation\.workspace_id, user\.id, invitation\.role\)[\s\S]*ensureResolvedInvitationProjectMember\(db, invitation, resolvedProjectId, user\.id\)[\s\S]*acceptedAt: null[\s\S]*\}/, '通用项目邀请未在多人复用时补齐 Team member 与项目角色')
  assert.match(source, /if \(isTargetedInvitation && invitation\.accepted_at\)/, '定向项目邀请未保留 accepted_at 单次消费语义')
})

it('personal 与 business 在项目数量能力上保持一致，不再默认限制 personal 仅 2 个项目', async () => {
  const source = await readFile(CONTEST_STORE_FILE, 'utf8')

  assert.match(source, /code: 'personal-team'[\s\S]*includedProjects: 0[\s\S]*projectsUnlimited: true/, 'personal 默认计费计划仍保留 2 个项目限制')
  assert.match(source, /const includedProjects = Math\.max\(0, Number\(plan\?\.includedProjects \|\| 0\)\)/, '计费估算仍在 personal 场景回退 2 个项目')
  assert.match(source, /const projectsUnlimited = plan\?\.projectsUnlimited \?\? true/, '计费估算未把 personal 与 business 的项目数量能力统一')
})
