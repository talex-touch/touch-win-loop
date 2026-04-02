import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const INVITE_PAGE_FILE = resolve(process.cwd(), 'app/pages/invite/[token].vue')
const TEAM_HOME_FILE = resolve(process.cwd(), 'app/pages/team/index.vue')
const TEAM_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')
const TEAM_UI_FILE = resolve(process.cwd(), 'app/composables/team-ui.ts')

it('邀请接受成功后直接写入 activeWorkspaceId 并跳转 team 根页', async () => {
  const source = await readFile(INVITE_PAGE_FILE, 'utf8')

  assert.match(source, /writeActiveWorkspacePreference\(teamId\)/, '邀请页未在接受成功后写入 activeWorkspaceId')
  assert.match(source, /path:\s*teamDetailPath\(teamId\)[\s\S]*joined:\s*'1'/, '邀请页未在接受成功后 replace 跳转到 Team 根页 joined=1')
  assert.doesNotMatch(source, /打开 Team/, '邀请页仍保留成功后手动打开 Team 的终态按钮')
})

it('team 根页消费 joined=1 并展示一次性成功提示', async () => {
  const source = await readFile(TEAM_DETAIL_FILE, 'utf8')

  assert.match(source, /joinedNoticeText\.value = '你已加入当前 Team，可直接查看项目或新建项目。'/, 'Team 根页缺少 joined 成功提示文案')
  assert.match(source, /if \(!shouldOpenCreateDialog\(route\.query\.joined\)\)\s+return/, 'Team 根页未消费 joined=1 约定')
  assert.match(source, /if \(key === 'joined'\)\s+continue/, 'Team 根页未在消费后清理 joined query')
})

it('team ui 兼容解析收口到共享工具与共享视图组件', async () => {
  const teamUiSource = await readFile(TEAM_UI_FILE, 'utf8')
  const teamHomeSource = await readFile(TEAM_HOME_FILE, 'utf8')
  const teamDetailSource = await readFile(TEAM_DETAIL_FILE, 'utf8')

  assert.match(teamUiSource, /export function resolveWorkspaceOptions[\s\S]*auth\.teams[\s\S]*auth\.workspaces/, '共享 Team UI 工具未兼容 teams/workspaces 双结构')
  assert.match(teamHomeSource, /<TeamProjectOverview[\s\S]*<TeamCreateProjectDialog/, '/team 未切换到共享 Team 视图原语')
  assert.match(teamDetailSource, /<TeamProjectOverview[\s\S]*<TeamCreateProjectDialog/, '/team\/:id 未切换到共享 Team 视图原语')
})
