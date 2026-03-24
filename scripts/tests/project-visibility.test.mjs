import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const TARGET_FILE = resolve(process.cwd(), 'server/utils/platform-store.ts')

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
  const source = await readFile(TARGET_FILE, 'utf8')
  assert.match(
    source,
    /export async function canManageProject[\s\S]*wm\.role = ANY\(\$3::TEXT\[\]\)[\s\S]*\[projectId, user\.id, FULL_WORKSPACE_ROLES\]/,
    'canManageProject 缺少 owner\/admin 全局可管理分支',
  )
  assert.match(
    source,
    /JOIN project_members pm ON pm\.project_id = p\.id[\s\S]*wm\.role = 'manager'[\s\S]*pm\.user_id = \$2/,
    'canManageProject 缺少 manager 仅限已分配项目的分支',
  )
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
