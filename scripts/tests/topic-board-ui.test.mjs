import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')

it('新建项目流程不再预配置选题板', async () => {
  const teamSource = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.doesNotMatch(teamSource, /TOPIC_BOARD_CREATE_SEED_STORAGE_PREFIX/, 'Team 新建项目仍会触发选题板自动生成')
  assert.doesNotMatch(teamSource, /topicBoardSeed/, 'Team 新建项目仍保留选题板预配置草稿')
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
