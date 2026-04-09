import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DASHBOARD_LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/dashboard.vue')
const LOOPY_FLOATING_FILE = resolve(process.cwd(), 'app/components/loopy/LoopyFloatingEntry.vue')

it('dashboard layout 仅在指定业务页显示 Loopy 悬浮入口，并用 v-show 保留面板状态', async () => {
  const source = await readFile(DASHBOARD_LAYOUT_FILE, 'utf8')

  assert.match(source, /const showLoopyFloating = computed\(\(\) => \{/, 'dashboard layout 缺少 Loopy 悬浮入口显示逻辑')
  assert.match(source, /if \(normalizedPath === '\/dashboard'\)\s+return false/, 'dashboard layout 未排除 /dashboard')
  assert.match(source, /if \(\/\^\\\/team\\\/\[\^\/\]\+\\\/project\\\/\[\^\/\]\+\$\/\.test\(normalizedPath\)\)\s+return false/, 'dashboard layout 未排除 /team/:teamId/project/:projectId')
  assert.match(source, /if \(\/\^\\\/team\\\/\[\^\/\]\+\$\/\.test\(normalizedPath\)\)\s+return true/, 'dashboard layout 未包含 /team/:teamId')
  assert.match(source, /if \(normalizedPath === '\/contests' \|\| normalizedPath\.startsWith\('\/contests\/'\)\)\s+return true/, 'dashboard layout 未包含 /contests')
  assert.match(source, /if \(normalizedPath === '\/resources' \|\| normalizedPath\.startsWith\('\/resources\/'\)\)\s+return true/, 'dashboard layout 未包含 /resources')
  assert.match(source, /if \(normalizedPath === '\/admin' \|\| normalizedPath\.startsWith\('\/admin\/'\)\)\s+return true/, 'dashboard layout 未包含 /admin/**')
  assert.match(source, /<LoopyFloatingEntry[\s\S]*v-show="showLoopyFloating"/, 'dashboard layout 未挂载 Loopy 悬浮入口或未使用 v-show')
})

it('loopy 悬浮面板保留只读问答形态，并统一走工作空间级消息记录', async () => {
  const source = await readFile(LOOPY_FLOATING_FILE, 'utf8')

  assert.match(source, /data-testid="loopy-floating-trigger"/, 'Loopy 悬浮面板缺少悬浮触发器')
  assert.match(source, /data-testid="loopy-floating-panel"/, 'Loopy 悬浮面板缺少面板测试标记')
  assert.match(source, /会话/, 'Loopy 悬浮面板缺少 workspace 级会话切换区')
  assert.match(source, /await syncLoopyWorkspace\(nextWorkspaceId\)/, 'Loopy 悬浮面板未按工作空间同步会话')
  assert.match(source, /loopy-floating-send/, 'Loopy 悬浮面板缺少发送按钮测试标记')
  assert.doesNotMatch(source, /项目上下文/, 'Loopy 悬浮面板仍保留项目选择器')
  assert.doesNotMatch(source, /当前页面需要先选择一个项目/, 'Loopy 悬浮面板仍保留项目必选提示')
  assert.doesNotMatch(source, /changeLoopyProject|loopySelectedProjectId|loopyProjects|requireProjectForSend/, 'Loopy 悬浮面板仍残留项目级会话逻辑')
  assert.doesNotMatch(source, /auto_optimize|issue_discovery|defense/, 'Loopy 悬浮面板意外暴露了写入型 AI 模式')
})
