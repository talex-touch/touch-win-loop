import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const INVITE_PAGE_FILE = resolve(process.cwd(), 'app/pages/invite/[token].vue')
const WORKSPACE_HOME_FILE = resolve(process.cwd(), 'app/pages/workspace/index.vue')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/workspace/[workspaceId].vue')
const WORKSPACE_PROJECT_FILE = resolve(process.cwd(), 'app/pages/workspace/[workspaceId]/project/[projectId].vue')
const TEAM_HOME_FILE = resolve(process.cwd(), 'app/pages/team/index.vue')
const TEAM_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')
const TEAM_PROJECT_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const TEAM_UI_FILE = resolve(process.cwd(), 'app/composables/team-ui.ts')

it('邀请接受成功后直接写入 activeWorkspaceId，并在有 projectId 时优先跳转项目页', async () => {
  const source = await readFile(INVITE_PAGE_FILE, 'utf8')

  assert.match(source, /const workspaceId = String\(invitation\.teamId \|\| invitation\.workspaceId \|\| ''\)\.trim\(\)/, '邀请页未统一解析工作空间 ID')
  assert.match(source, /const projectId = String\(invitation\.projectId \|\| ''\)\.trim\(\)/, '邀请页未解析邀请返回的 projectId')
  assert.match(source, /writeActiveWorkspacePreference\(workspaceId\)/, '邀请页未在接受成功后写入 activeWorkspaceId')
  assert.match(source, /path:\s*projectId \? workspaceProjectPath\(workspaceId, projectId\) : workspaceDetailPath\(workspaceId\)/, '邀请页未在有 projectId 时优先跳转项目页')
  assert.match(source, /joined:\s*'1'/, '邀请页未继续通过 joined=1 透传成功态')
  assert.doesNotMatch(source, /打开 Team/, '邀请页仍保留成功后手动打开 Team 的终态按钮')
})

it('工作空间根页消费 joined=1 并展示一次性成功提示', async () => {
  const source = await readFile(TEAM_DETAIL_FILE, 'utf8')

  assert.match(source, /joinedNoticeText\.value = '你已加入当前工作空间，可直接查看项目。'/, '工作空间根页缺少 joined 成功提示文案')
  assert.match(source, /if \(!shouldOpenCreateDialog\(route\.query\.joined\)\)\s+return/, '工作空间根页未消费 joined=1 约定')
  assert.match(source, /if \(key === 'joined'\)\s+continue/, '工作空间根页未在消费后清理 joined query')
})

it('项目工作区消费 joined=1 并展示一次性成功提示', async () => {
  const source = await readFile(TEAM_PROJECT_FILE, 'utf8')

  assert.match(source, /if \(!isTruthyQueryFlag\(route\.query\.joined\)\)\s+return/, '项目工作区未消费 joined=1 约定')
  assert.match(source, /statusLine\.value = '已加入当前 Team 和项目，可立即开始协作。'/, '项目工作区缺少 joined 成功提示文案')
  assert.match(source, /if \(key === 'joined'\)\s+continue/, '项目工作区未在消费后清理 joined query')
  assert.match(source, /path:\s*workspaceDetailPath\(routeWorkspaceId\.value, routeProjectId\.value\)/, '项目工作区未在清理 joined 后保持当前项目路由')
})

it('工作空间 canonical 路由保留旧 team 兼容入口', async () => {
  const teamHomeSource = await readFile(TEAM_HOME_FILE, 'utf8')
  const workspaceHomeSource = await readFile(WORKSPACE_HOME_FILE, 'utf8')
  const workspaceDetailSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const workspaceProjectSource = await readFile(WORKSPACE_PROJECT_FILE, 'utf8')

  assert.match(teamHomeSource, /workspaceDashboardPath\(\)/, '/team 未重定向到 /workspace 主入口')
  assert.match(workspaceHomeSource, /readActiveWorkspacePreference\(\)/, '/workspace 未读取 activeWorkspaceId')
  assert.match(workspaceHomeSource, /workspaceDetailPath\(targetWorkspaceId\)/, '/workspace 未跳转到当前工作空间根页')
  assert.match(workspaceDetailSource, /import WorkspaceDetailRouteView from '~\/pages\/team\/\[teamId\]\/index\.vue'/, '/workspace\/:workspaceId 未复用工作空间详情实现')
  assert.match(workspaceProjectSource, /import WorkspaceProjectRouteView from '~\/pages\/team\/\[teamId\]\/project\/\[projectId\]\.vue'/, '/workspace\/:workspaceId\/project\/:projectId 未复用项目工作区实现')
})

it('工作空间 ui 继续复用共享视图与路径工具', async () => {
  const teamUiSource = await readFile(TEAM_UI_FILE, 'utf8')
  const teamDetailSource = await readFile(TEAM_DETAIL_FILE, 'utf8')

  assert.match(teamUiSource, /export function resolveWorkspaceOptions[\s\S]*auth\.teams[\s\S]*auth\.workspaces/, '共享 Team UI 工具未兼容 teams/workspaces 双结构')
  assert.match(teamUiSource, /export function workspaceDetailPath\(workspaceId: string\): string \{\s+return `\/workspace\/\$\{workspaceId\}`/, '共享路径工具未切到 /workspace canonical 路由')
  assert.match(teamDetailSource, /<TeamProjectOverview[\s\S]*summary-stats[\s\S]*<TeamCreateProjectDialog/, '工作空间详情页未切换到带配额摘要的共享视图原语')
})
