import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const CREATE_DIALOG_FILE = resolve(process.cwd(), 'app/components/team/TeamCreateProjectDialog.vue')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')

it('创建项目弹层提供选题板预配置入口', async () => {
  const source = await readFile(CREATE_DIALOG_FILE, 'utf8')

  assert.match(source, /创建后自动生成 AI 智能选题板/, '创建项目弹层缺少选题板自动生成入口')
  assert.match(source, /团队技能标签/, '创建项目弹层缺少团队技能标签输入')
  assert.match(source, /候选数（3-5）/, '创建项目弹层缺少候选数控制')
})

it('项目页保留选题板状态与关键动作', async () => {
  const source = await readFile(PROJECT_PAGE_FILE, 'utf8')

  assert.match(source, /选题板已生成，可继续设主推、写入草案或发送到右侧 AI。/, '项目页缺少选题板生成后的状态提示')
  assert.match(source, /function sendTopicBoardCandidateToChat\(candidateId: string\)/, '选题板缺少发送到右侧 AI 动作')
  assert.match(source, /async function applyTopicBoardCandidateToForm\(candidateId: string\)/, '选题板缺少写入项目草案动作')
  assert.match(source, /async function selectTopicBoardCandidate\(candidateId: string\)/, '选题板缺少设主推动作')
  assert.match(source, /async function updateTopicBoardCandidateStatus\(candidateId: string, decisionStatus: TopicProposalDecisionStatus\)/, '选题板缺少短名单\/淘汰决策动作')
})

it('topic board 写入草案会同步项目设置并支持立即保存', async () => {
  const source = await readFile(PROJECT_PAGE_FILE, 'utf8')

  assert.match(source, /function buildTopicBoardDraftContent\(candidate: TopicProposalItem\)/)
  assert.match(source, /function syncTopicBoardCandidateToProjectSettings\(candidate: TopicProposalItem\)/)
  assert.match(source, /scheduleProjectSettingsDraftPersist\(\)/)
  assert.match(source, /await saveProjectSettingsManually\(\)/)
})
