import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const TEAM_PATCH_FILE = resolve(process.cwd(), 'server/api/teams/[id].patch.ts')
const TEAM_WORKSPACE_STORE_FILE = resolve(process.cwd(), 'server/utils/team-workspace-store.ts')

it('工作空间改名权限矩阵符合个人空间 owner、团队空间 owner/admin 与平台管理员规则', async () => {
  const [patchSource, storeSource] = await Promise.all([
    readFile(TEAM_PATCH_FILE, 'utf8'),
    readFile(TEAM_WORKSPACE_STORE_FILE, 'utf8'),
  ])

  assert.match(storeSource, /if \(isPlatformAdmin\)\s+return true/, '工作空间改名未为平台管理员保留兜底权限')
  assert.match(storeSource, /workspaceType === 'personal'\)\s+return roles\.includes\('owner'\)/, '个人空间改名权限未限制为 owner')
  assert.match(storeSource, /workspaceType === 'team'\)\s+return roles\.includes\('owner'\) \|\| roles\.includes\('admin'\)/, '团队空间改名权限未限制为 owner\/admin')
  assert.doesNotMatch(storeSource, /workspaceType === 'team'.*manager/s, '团队空间改名权限错误地放开给 manager')
  assert.match(patchSource, /teamRenameWorkspace/, 'Team patch 接口未接入工作空间改名逻辑')
  assert.match(patchSource, /缺少 teamId 或名称。/, 'Team patch 接口缺少名称为空校验')
  assert.match(storeSource, /UPDATE workspaces\s+SET name = \$2,/s, '工作空间改名未写入 workspaces.name')
  assert.match(storeSource, /canRenameWorkspaceWithRoles/, '工作空间改名未复用统一权限 helper')
  assert.match(storeSource, /WORKSPACE_NAME_REQUIRED/, '工作空间改名缺少空名称保护')
})
