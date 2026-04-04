import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_FILE = resolve(process.cwd(), 'shared/types/domain.ts')
const RESOURCE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')
const COLLAB_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/collab.post.ts')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')

it('协作资源模型暴露 collabPurpose 顶层字段，并在服务端实现 workflow 唯一画布', async () => {
  const domainSource = await readFile(DOMAIN_FILE, 'utf8')
  const storeSource = await readFile(RESOURCE_STORE_FILE, 'utf8')
  const apiSource = await readFile(COLLAB_API_FILE, 'utf8')

  assert.match(domainSource, /export type CollabPurpose = 'workflow' \| 'freeform' \| 'notes'/, '共享类型未定义协作用途枚举')
  assert.match(domainSource, /collabPurpose\?: CollabPurpose/, 'Resource 未暴露顶层 collabPurpose 字段')

  assert.match(storeSource, /export async function ensureProjectWorkflowCanvas\(/, '资源存储层未提供唯一主流程画布 helper')
  assert.match(storeSource, /collabPurpose: purpose/, '协作资源创建时未写入 collabPurpose 元数据')
  assert.match(storeSource, /COALESCE\(pr\.metadata->>'collabPurpose', ''\) = 'workflow'/, 'workflow 画布复用逻辑未按 collabPurpose 查询')

  assert.match(apiSource, /purpose\?: CollabPurpose/, '协作资源创建接口未接收 purpose 参数')
  assert.match(apiSource, /purpose === 'workflow'\s*\?\s*await ensureProjectWorkflowCanvas/, 'workflow 入口未复用唯一流程画布 helper')
})

it('项目页从流程入口打开 workflow 画布，而不是继续依赖静态流程 checklist', async () => {
  const pageSource = await readFile(PROJECT_PAGE_FILE, 'utf8')
  const panelSource = await readFile(MAIN_PANEL_FILE, 'utf8')

  assert.match(pageSource, /purpose:\s*'workflow'/, '项目页打开流程入口时未声明 workflow 用途')
  assert.match(pageSource, /statusLine\.value = '已打开流程画布，可继续协作梳理项目流程。'/, '流程入口成功文案未切换到流程画布')
  assert.match(pageSource, /const flowResourceId = ref\(''\)/, '项目页未维护独立的流程画布资源状态')

  assert.match(panelSource, /title: '流程画布'/, '固定 flow tab 标题未切换为流程画布')
  assert.match(panelSource, /v-else-if="activeTabId === 'flow'"/, '主面板缺少 flow tab 渲染分支')
  assert.match(panelSource, /<WorkspaceTldrawCanvas[\s\S]*workspace-flow-/, 'flow tab 未渲染真实画布引擎')
  assert.doesNotMatch(panelSource, /赛题确认/, 'flow tab 仍残留旧的静态 checklist 内容')
})

it('左侧资源入口与资源命名统一为协作文档 / 自由画布 / 流程画布', async () => {
  const leftSidebarSource = await readFile(LEFT_SIDEBAR_FILE, 'utf8')
  const storeSource = await readFile(RESOURCE_STORE_FILE, 'utf8')

  assert.match(leftSidebarSource, /新建协作文档/, '左侧菜单缺少协作文档入口')
  assert.match(leftSidebarSource, /新建自由画布/, '左侧菜单缺少自由画布入口')
  assert.doesNotMatch(leftSidebarSource, /新建无边画布/, '左侧菜单仍保留无边画布旧称')

  assert.match(storeSource, /return '流程画布'/, 'workflow 资源默认命名未收敛到流程画布')
  assert.match(storeSource, /return '自由画布'/, 'freeform 资源默认命名未收敛到自由画布')
})
