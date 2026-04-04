import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')

it('项目页使用 useCollabSession 统一协作状态机', async () => {
  const source = await readFile(PROJECT_PAGE_FILE, 'utf8')
  assert.match(source, /useCollabSession\(/, '项目页未接入 useCollabSession')
  assert.match(source, /collabSession\.handleRealtimeEnvelope\(message\)/, '项目页未复用协作实时消息处理')
  assert.match(source, /collabSession\.activateRoom\(\)/, '项目页未复用协作会话激活逻辑')
  assert.doesNotMatch(source, /function startCollabSnapshotPollTimer/, '项目页仍保留旧的页面级轮询实现')
})

it('画布已升级为真实引擎组件并移除 JSON 文本输入', async () => {
  const source = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')
  assert.match(source, /<WorkspaceTldrawCanvas[\s\S]*@update:model-value="onCollabDrawModelUpdate"/, '画布未接入 WorkspaceTldrawCanvas 组件')
  assert.doesNotMatch(source, /请输入画布节点 JSON（数组）/, '画布仍暴露 JSON 文本输入入口')
  assert.match(source, /<CollabPresencePanel\s+:members="collabPresenceMembers"\s*\/>/, '在线成员区未抽离为通用组件')
})
