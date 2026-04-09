import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const CREATE_DIALOG_FILE = resolve(process.cwd(), 'app/components/team/TeamCreateProjectDialog.vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')

it('创建项目弹层提供选题板预配置入口', async () => {
  const source = await readFile(CREATE_DIALOG_FILE, 'utf8')

  assert.match(source, /创建后自动生成 AI 智能选题板/, '创建项目弹层缺少选题板自动生成入口')
  assert.match(source, /团队技能标签/, '创建项目弹层缺少团队技能标签输入')
  assert.match(source, /候选数（3-5）/, '创建项目弹层缺少候选数控制')
})

it('项目仪表盘展示选题板与关键动作', async () => {
  const source = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')

  assert.match(source, /AI 智能选题板/, '仪表盘缺少 AI 智能选题板区块')
  assert.match(source, /发送到右侧 AI/, '选题板缺少发送到右侧 AI 动作')
  assert.match(source, /写入项目草案/, '选题板缺少写入项目草案动作')
  assert.match(source, /对比决策矩阵/, '仪表盘缺少对比决策矩阵')
})

it('topic board 写入草案会同步项目设置并支持立即保存', async () => {
  const source = await readFile(PROJECT_PAGE_FILE, 'utf8')

  assert.match(source, /function buildTopicBoardDraftContent\(candidate: TopicProposalItem\)/)
  assert.match(source, /function syncTopicBoardCandidateToProjectSettings\(candidate: TopicProposalItem\)/)
  assert.match(source, /scheduleProjectSettingsDraftPersist\(\)/)
  assert.match(source, /await saveProjectSettingsManually\(\)/)
})
