import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const TARGET_FILE = resolve(process.cwd(), 'server/utils/platform-store.ts')
const ACCESS_TARGET_FILE = resolve(process.cwd(), 'server/utils/project-access-store.ts')
const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain.ts')

it('listVisibleProjects 非平台管理员查询必须包含 workspace 可见性门槛', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')

  const requiredPattern = /WHERE \(\$2::TEXT IS NULL OR p\.workspace_id = \$2\)\s+AND EXISTS \(\s+SELECT 1\s+FROM workspace_members wm_visible\s+WHERE wm_visible\.workspace_id = p\.workspace_id\s+AND wm_visible\.user_id = \$1\s+AND wm_visible\.is_active = TRUE\s+\)\s+AND \(/
  assert.match(
    source,
    requiredPattern,
    'listVisibleProjects 缺少 workspace 成员可见性约束，可能导致返回不可访问空间的项目',
  )
})

it('listVisibleProjects 在可见性门槛后仍保留项目角色分支', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')
  assert.match(
    source,
    /FROM workspace_members wm[\s\S]*JOIN project_members pm ON pm\.project_id = p\.id AND pm\.user_id = wm\.user_id[\s\S]*wm\.role = ANY\(\$4::TEXT\[\]\)/,
    'listVisibleProjects 中缺少 project_members 角色分支，可能导致项目管理角色不可用',
  )
})

it('getVisibleProjectById 改为单项目直接查询，而不是全量列表过滤', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')

  assert.doesNotMatch(source, /const projects = await listVisibleProjects\(db, user\)\s+return projects\.find\(project => project\.id === projectId\)/, 'getVisibleProjectById 仍通过全量项目列表过滤单项目')
  assert.match(source, /WHERE p\.id = \$2[\s\S]*AND EXISTS \(/, 'getVisibleProjectById 未改为单项目直接查询')
})

it('listVisibleProjects 包含基础工作区角色分支（manager/member）', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')
  assert.match(
    source,
    /const BASIC_WORKSPACE_ROLES: WorkspaceMemberRole\[\] = \['manager', 'member'\]/,
    '缺少 BASIC_WORKSPACE_ROLES 常量定义，容易导致基础成员可见范围回归',
  )
  assert.match(
    source,
    /\[user\.id, workspaceId \|\| null, FULL_WORKSPACE_ROLES, BASIC_WORKSPACE_ROLES\]/,
    'listVisibleProjects 查询参数中未传 BASIC_WORKSPACE_ROLES，分支可能失效',
  )
})

it('canManageProject owner/admin 全局可管理，manager 仅限分配项目', async () => {
  const source = await readFile(ACCESS_TARGET_FILE, 'utf8')
  const platformStoreSource = await readFile(TARGET_FILE, 'utf8')

  assert.match(
    platformStoreSource,
    /export async function canManageProject[\s\S]*return canManageProjectImpl\(db, user, projectId\)/,
    'platform-store 中 canManageProject 未委托到 project-access-store 实现',
  )
  assert.match(
    source,
    /export async function teamCanManageProject[\s\S]*wm\.role = ANY\(\$3::TEXT\[\]\)[\s\S]*\[projectId, user\.id, FULL_WORKSPACE_ROLES\]/,
    'canManageProject 缺少 owner\/admin 全局可管理分支',
  )
  assert.match(
    source,
    /JOIN project_members pm ON pm\.project_id = p\.id[\s\S]*wm\.role = 'manager'[\s\S]*pm\.user_id = \$2/,
    'canManageProject 缺少 manager 仅限已分配项目的分支',
  )
  assert.match(
    source,
    /JOIN workspace_members wm ON wm\.workspace_id = p\.workspace_id[\s\S]*wm\.user_id = \$2[\s\S]*wm\.is_active = TRUE[\s\S]*pm\.user_id = \$2[\s\S]*pm\.role = ANY\(\$3::TEXT\[\]\)/,
    'canManageProject 对 project owner\/manager 分支缺少 active workspace member 约束，移出 Team 后仍可能残留管理权限',
  )
})

it('project 创建权限不再对 personal 默认追加 2 个项目上限', async () => {
  const source = await readFile(ACCESS_TARGET_FILE, 'utf8')

  assert.doesNotMatch(source, /workspace\.type === 'personal' \? 2 : 0/, 'personal 仍保留 2 个项目的默认上限')
  assert.match(source, /const projectsUnlimited = workspace\.projects_unlimited === null\s+\? true\s+: workspace\.projects_unlimited === true/, '未在缺省配置下统一 personal\/business 的项目创建能力')
})

it('createProject creator 与 owner 不同时自动补齐 creator 项目成员', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')
  assert.match(
    source,
    /const creatorIsDifferentOwner = input\.creatorUserId !== input\.ownerUserId/,
    'createProject 缺少 creator/owner 差异判断，创建者可能无法自动加入项目成员',
  )
  assert.match(
    source,
    /await assertProjectSeatAvailable\(db, projectId, input\.workspaceId, creatorIsDifferentOwner \? 2 : 1\)/,
    'createProject 未按 creator/owner 人数差异校验项目席位，可能导致成员写入后超限',
  )
  assert.match(
    source,
    /await ensureProjectOwnerMember\(db, projectId, input\.ownerUserId\)\s+if \(creatorIsDifferentOwner\)\s+await ensureProjectManagerMember\(db, projectId, input\.creatorUserId\)/,
    'createProject 缺少 creator 自动入组逻辑，可能导致创建者看不见自己创建的项目',
  )
})

it('移除 Team 成员时会同步清理该空间下的 project_members 残留', async () => {
  const membershipSource = await readFile(resolve(process.cwd(), 'server/utils/team-membership-store.ts'), 'utf8')

  assert.match(
    membershipSource,
    /DELETE FROM project_members pm[\s\S]*USING projects p[\s\S]*p\.workspace_id = \$1[\s\S]*pm\.user_id = \$2[\s\S]*RETURNING pm\.project_id/,
    'teamRemoveWorkspaceMember 未同步删除该空间下的项目成员残留',
  )
  assert.match(
    membershipSource,
    /UPDATE project_seat_quotas psq[\s\S]*SET seat_used = usage\.seat_used[\s\S]*WHERE psq\.project_id = \$1/,
    'teamRemoveWorkspaceMember 删除项目成员后未刷新项目 seat usage',
  )
})

it('项目列表返回项目席位摘要，避免前端逐项目补请求', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')
  const domainSource = await readFile(DOMAIN_TYPES_FILE, 'utf8')

  assert.match(
    source,
    /const \[bindings, projectSeatQuotaMap\] = await Promise\.all\(\[\s+loadProjectBindingsByIds\(db, projectIds\),\s+listProjectSeatQuotaSummaryByProjectIds\(db, projectIds\),\s+\]\)/,
    'loadProjectsFromRows 未批量加载项目席位摘要，可能导致前端 N+1 请求',
  )
  assert.match(
    source,
    /projectSeatQuotaMap\.get\(row\.id\) \|\| null/,
    'mapProject 未写入 projectSeatQuota 摘要，工作台项目卡无法展示席位信息',
  )
  assert.match(
    domainSource,
    /export interface ProjectSeatQuotaSummary \{\s+seatLimit: number\s+seatUsed: number\s+\}/,
    '共享类型缺少 ProjectSeatQuotaSummary 定义',
  )
  assert.match(
    domainSource,
    /projectSeatQuota\?: ProjectSeatQuotaSummary \| null/,
    'Project 类型未暴露 projectSeatQuota 摘要字段',
  )
})
