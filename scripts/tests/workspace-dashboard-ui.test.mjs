import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')
const OVERVIEW_COMPONENT_FILE = resolve(process.cwd(), 'app/components/team/TeamProjectOverview.vue')
const TEAM_UI_FILE = resolve(process.cwd(), 'app/composables/team-ui.ts')

it('工作空间详情页基于计费估算计算项目配额剩余值', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(
    source,
    /const remainingProjectSlots = computed\(\(\) => \{\s+return calculateRemainingProjectSlots\(\{/,
    '工作空间详情页未基于 billing estimate 计算剩余项目配额',
  )
  assert.match(
    source,
    /if \(workspaceBillingEstimate\.value && remainingProjectSlots\.value === 0\)\s+return '当前空间项目数量已达上限，请先扩容项目配额。'/,
    '工作空间详情页未在前端兜底禁用已满配额的新建入口',
  )
  assert.match(
    source,
    /if \(!workspaceCanCreateProject\.value\)\s+return '当前为只读成员，不能新建项目。'/,
    '工作空间详情页未限制 member 只读新建权限',
  )
})

it('工作空间摘要卡展示 plan、项目配额、空间席位与 AI 配额', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const componentSource = await readFile(OVERVIEW_COMPONENT_FILE, 'utf8')

  assert.match(source, /label: '当前 Plan'/, '工作空间摘要缺少当前 Plan 信息')
  assert.match(source, /label: '项目配额'/, '工作空间摘要缺少项目配额信息')
  assert.match(source, /label: '空间席位'/, '工作空间摘要缺少空间席位信息')
  assert.match(source, /label: 'AI 配额'/, '工作空间摘要缺少 AI 配额信息')
  assert.match(componentSource, /v-if="summaryStats.length > 0"/, '共享工作台概览组件未渲染摘要统计卡片')
})

it('项目卡展示项目席位 used\/limit\/remaining', async () => {
  const source = await readFile(OVERVIEW_COMPONENT_FILE, 'utf8')
  const teamUiSource = await readFile(TEAM_UI_FILE, 'utf8')

  assert.match(source, /项目席位：\{\{ project\.projectSeatUsed \}\}\/\{\{ project\.projectSeatLimit \}\}，剩余 \{\{ project\.projectSeatRemaining \}\}/, '项目卡未展示项目席位摘要')
  assert.match(teamUiSource, /projectSeatUsed\?: number/, 'TeamProjectCardItem 缺少项目席位 used 字段')
  assert.match(teamUiSource, /projectSeatRemaining\?: number/, 'TeamProjectCardItem 缺少项目席位 remaining 字段')
})
