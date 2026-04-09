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
const PROJECT_DETAIL_FILE = resolve(process.cwd(), 'app/pages/projects/[id].vue')

it('邀请接受成功后写入 activeWorkspaceId，并优先进入 canonical 项目工作区', async () => {
  const source = await readFile(INVITE_PAGE_FILE, 'utf8')

  assert.match(source, /const workspaceId = String\(invitation\.teamId \|\| invitation\.workspaceId \|\| ''\)\.trim\(\)/, '邀请页未统一解析 Team ID')
  assert.match(source, /const projectId = String\(invitation\.projectId \|\| ''\)\.trim\(\)/, '邀请页未解析 projectId')
  assert.match(source, /writeActiveWorkspacePreference\(workspaceId\)/, '邀请页未在接受成功后写入 activeWorkspaceId')
  assert.match(source, /path:\s*projectId \? projectWorkspacePath\(workspaceId, projectId\) : teamDetailPath\(workspaceId\)/, '邀请页未跳转到 canonical Team / Project 路由')
  assert.match(source, /joined:\s*'1'/, '邀请页未继续透传 joined=1')
})

it('team dashboard 与项目工作区都会消费 joined=1 一次性提示', async () => {
  const teamDetailSource = await readFile(TEAM_DETAIL_FILE, 'utf8')
  const teamProjectSource = await readFile(TEAM_PROJECT_FILE, 'utf8')

  assert.match(teamDetailSource, /joinedNoticeText\.value = '你已加入当前 Team，可直接查看项目。'/, 'Team dashboard 缺少 joined 成功提示文案')
  assert.match(teamDetailSource, /if \(!shouldOpenCreateDialog\(route\.query\.joined\)\)\s+return/, 'Team dashboard 未消费 joined=1')
  assert.match(teamDetailSource, /if \(key === 'joined'\)\s+continue/, 'Team dashboard 未清理 joined query')

  assert.match(teamProjectSource, /if \(!isTruthyQueryFlag\(route\.query\.joined\)\)\s+return/, '项目工作区未消费 joined=1')
  assert.match(teamProjectSource, /statusLine\.value = '已加入当前 Team 和项目，可立即开始协作。'/, '项目工作区缺少 joined 成功提示文案')
  assert.match(teamProjectSource, /if \(key === 'joined'\)\s+continue/, '项目工作区未清理 joined query')
})

it('邀请入口会明确区分通用链接与指定用户名邀请', async () => {
  const teamDetailSource = await readFile(TEAM_DETAIL_FILE, 'utf8')

  assert.match(teamDetailSource, /留空用户名 = 通用链接可多人加入；填写后仅指定账号可加入/, 'Team dashboard 邀请入口未说明通用链接与定向邀请的区别')
  assert.match(teamDetailSource, /placeholder="留空则生成可多人加入的通用邀请链接"/, 'Team dashboard 邀请输入框未标注通用链接可多人加入')
})

it('/team 负责解析当前活跃项目台，/workspace 旧入口直接 404 下线', async () => {
  const teamHomeSource = await readFile(TEAM_HOME_FILE, 'utf8')
  const workspaceHomeSource = await readFile(WORKSPACE_HOME_FILE, 'utf8')
  const workspaceDetailSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const workspaceProjectSource = await readFile(WORKSPACE_PROJECT_FILE, 'utf8')

  assert.match(teamHomeSource, /readActiveWorkspacePreference\(\)/, '/team 未读取 activeWorkspaceId')
  assert.match(teamHomeSource, /const targetPath = legacyProjectId\s+\? projectWorkspacePath\(targetWorkspaceId, legacyProjectId\)\s+: teamDetailPath\(targetWorkspaceId\)/, '/team 未按 projectId 跳转 canonical 路由')

  assert.match(workspaceHomeSource, /statusCode:\s*404/, '/workspace 未直接返回 404')
  assert.match(workspaceHomeSource, /旧的 \/workspace 入口已下线，请改用 \/team。/, '/workspace 下线提示不正确')
  assert.match(workspaceDetailSource, /旧的 \/workspace\/:workspaceId 入口已下线，请改用 \/team\/:teamId。/, '/workspace/:workspaceId 下线提示不正确')
  assert.match(workspaceProjectSource, /旧的 \/workspace\/:workspaceId\/project\/:projectId 入口已下线，请改用 \/team\/:teamId\/project\/:projectId。/, '/workspace 项目页下线提示不正确')
})

it('共享 Team UI helper 只暴露 /team canonical 路径', async () => {
  const teamUiSource = await readFile(TEAM_UI_FILE, 'utf8')

  assert.match(teamUiSource, /export function resolveWorkspaceOptions[\s\S]*auth\.teams[\s\S]*auth\.workspaces/, '共享 Team UI 工具未兼容 teams/workspaces 双结构')
  assert.match(teamUiSource, /export function teamDashboardPath\(\): string \{\s+return '\/team'/, '未导出 /team dashboard helper')
  assert.match(teamUiSource, /export function teamDetailPath\(teamId: string\): string \{\s+return `\/team\/\$\{teamId\}`/, '未导出 /team/:teamId helper')
  assert.match(teamUiSource, /export function projectWorkspacePath\(teamId: string, projectId: string\): string \{\s+return `\/team\/\$\{teamId\}\/project\/\$\{projectId\}`/, '未导出 /team/:teamId/project/:projectId helper')
  assert.doesNotMatch(teamUiSource, /export function workspaceDetailPath/, '仍然暴露旧的 workspace 路径 helper')
})

it('/projects/:id 不再保留独立详情页，而是重定向到项目工作区', async () => {
  const source = await readFile(PROJECT_DETAIL_FILE, 'utf8')

  assert.match(source, /const teamId = String\(project\.teamId \|\| project\.workspaceId \|\| ''\)\.trim\(\)/, '/projects/:id 未解析项目所属 Team')
  assert.match(source, /await navigateTo\(projectWorkspacePath\(teamId, project\.id\), \{ replace: true \}\)/, '/projects/:id 未重定向到 canonical 项目工作区')
  assert.match(source, /返回 Team 项目台/, '/projects/:id 缺少失败态回退入口')
  assert.doesNotMatch(source, /项目详情/, '/projects/:id 仍保留独立项目详情视图')
})
