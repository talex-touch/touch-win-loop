import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const TEAM_DASHBOARD_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')

it('team 项目台已将详情/设置/成员弹窗拆成独立组件', async () => {
  const source = await readFile(TEAM_DASHBOARD_FILE, 'utf8')

  assert.match(source, /<TeamProjectDetailDialog\b/, 'Team 项目台未复用详情弹窗组件')
  assert.match(source, /<TeamProjectProfileDialog\b/, 'Team 项目台未复用设置弹窗组件')
  assert.match(source, /<TeamProjectMembersDialog\b/, 'Team 项目台未复用成员弹窗组件')
  assert.doesNotMatch(source, /title="详细信息"\s+data-testid="team-project-detail-modal"/, 'Team 项目台仍内联详情弹窗')
  assert.doesNotMatch(source, /title="项目设置"\s+data-testid="team-project-settings-modal"/, 'Team 项目台仍内联项目设置弹窗')
  assert.doesNotMatch(source, /title="成员管理"\s+data-testid="team-project-members-modal"/, 'Team 项目台仍内联成员管理弹窗')
})
