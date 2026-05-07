import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const UI_CONTEXT_MENU_FILE = resolve(process.cwd(), 'app/components/ui/UiContextMenu.vue')
const UI_PRIMITIVES_FILE = resolve(process.cwd(), 'app/assets/styles/ui-primitives.css')

it('工作区上下文菜单接入团队与个人显示偏好的字体和间距预设', async () => {
  const [pageSource, menuSource, styleSource] = await Promise.all([
    readFile(PROJECT_PAGE_FILE, 'utf8'),
    readFile(UI_CONTEXT_MENU_FILE, 'utf8'),
    readFile(UI_PRIMITIVES_FILE, 'utf8'),
  ])

  assert.match(menuSource, /fontSizePreset\?: WorkspaceFontSizePreset \| ''/, 'UiContextMenu 缺少字体档位入参')
  assert.match(menuSource, /spacingPreset\?: WorkspaceTabSpacingPreset \| ''/, 'UiContextMenu 缺少间距档位入参')
  assert.match(menuSource, /const hasCheckedItems = computed\(\(\) => \{/, 'UiContextMenu 缺少勾选态菜单项布局支持')
  assert.match(menuSource, /:role="typeof item\.checked === 'boolean' \? 'menuitemcheckbox' : 'menuitem'"/, 'UiContextMenu 未为勾选项补充 menuitemcheckbox 语义')
  assert.match(menuSource, /wl-context-menu__check-slot/, 'UiContextMenu 缺少勾选态占位节点')
  assert.match(menuSource, /--wl-context-menu-item-min-height/, 'UiContextMenu 未输出菜单项高度变量')
  assert.match(menuSource, /--wl-context-menu-label-size/, 'UiContextMenu 未输出菜单字号变量')

  assert.match(styleSource, /min-width:\s*var\(--wl-context-menu-min-width,\s*228px\);/, '上下文菜单容器宽度仍未接入变量')
  assert.match(styleSource, /min-height:\s*var\(--wl-context-menu-item-min-height,\s*44px\);/, '上下文菜单项高度仍未接入变量')
  assert.match(styleSource, /padding:\s*0\s+var\(--wl-context-menu-item-padding-x,\s*14px\);/, '上下文菜单项横向内边距仍未接入变量')
  assert.match(styleSource, /font-size:\s*var\(--wl-context-menu-label-size,\s*var\(--wl-text-body\)\);/, '上下文菜单项字号仍未接入变量')
  assert.match(styleSource, /\.wl-context-menu__check-slot,\s*\.wl-context-menu__icon-slot \{/, '上下文菜单缺少勾选与图标统一占位样式')

  assert.match(pageSource, /:font-size-preset="workspaceEffectiveFontSizePreset"/, '项目页未向 UiContextMenu 透传有效字体档位')
  assert.match(pageSource, /:spacing-preset="workspaceEffectiveTabSpacingPreset"/, '项目页未向 UiContextMenu 透传有效间距档位')
  assert.doesNotMatch(pageSource, /buildWorkspaceDisplayPreferenceEntryItems\(\)/, '项目页不应在统一右键菜单里注入显示偏好入口')
  assert.doesNotMatch(pageSource, /openWorkspaceDisplayFontSizeContextMenu\(/, '项目页不应为统一右键菜单挂载字体大小二级菜单')
  assert.doesNotMatch(pageSource, /openWorkspaceDisplaySpacingContextMenu\(/, '项目页不应为统一右键菜单挂载边距设置二级菜单')
  assert.doesNotMatch(pageSource, /buildWorkspaceContextMenuRequest\(request: ContextMenuRequest\)/, '项目页不应在统一右键菜单入口中二次改写请求')
})
