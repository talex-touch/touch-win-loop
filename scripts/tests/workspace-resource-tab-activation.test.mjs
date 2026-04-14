import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_MAIN_TABS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceMainTabs.ts')

it('重新点击已打开资源标签时仅激活标签，不重复触发资源加载', async () => {
  const [workspaceSource, tabsComposableSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_TABS_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(tabsComposableSource, /function activateTab\(tabId: WorkspaceMainTabId\): void \{[\s\S]*emitActivatePreviewResource\(target\.resourceId\)/, 'tabs composable 未在资源标签激活时上抛激活事件')
  assert.match(workspaceSource, /async function activateProjectResourceTab\(resourceId: string\): Promise<void> \{/, '项目页缺少资源标签激活处理器')
  assert.match(workspaceSource, /const target = await resolveProjectResourceOpenTarget\(targetResourceId\)/, '资源标签激活前未统一解析真实打开目标')
  assert.match(workspaceSource, /previewResourceId\.value = target\.resourceId/, '资源标签激活时未同步当前预览资源 ID')
  assert.match(workspaceSource, /if \(target\.surface === 'flow'\) \{[\s\S]*await openProjectCollabResource\(target\.resourceId, undefined, \{[\s\S]*surface: target\.surface/, '流程画布标签激活未重定向到 fixed tab')
  assert.doesNotMatch(workspaceSource, /const fixedTabId = target\.surface === 'design' \? 'design' : 'flow'/, '设计资源标签仍在回退到 fixed design tab')
  assert.match(workspaceSource, /if \(activeMainTabId\.value === targetTabId\)\s+return/, '重新点击当前资源标签时仍会继续执行加载链路')
  assert.doesNotMatch(workspaceSource, /async function activateProjectResourceTab\(resourceId: string\): Promise<void> \{[\s\S]*await openProjectResourcePreview\(targetResourceId, \{ openTab: false \}\)/, '资源标签激活仍会重新走 openProjectResourcePreview')
  assert.match(workspaceSource, /options\.forceReload !== true[\s\S]*previewResourceId\.value === resolvedResourceId[\s\S]*activeMainTabId\.value === targetTabId[\s\S]*return/, '资源预览打开链路缺少同资源复用守卫')
})
