import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const SMALL_TEXT_RE = /text-\[(?:10|11)px\]/
const SMALL_FONT_RE = /font-size:\s*(?:10|11)px/
const INTER_FONT_RE = /fonts\.googleapis\.com\/css2\?[^"'`\n]*Inter/i
const FONT_FAMILY_RE = /font-family\s*:/
const HEX_COLOR_RE = /#[0-9a-f]{3,8}\b/i

const SMALL_TEXT_GUARD_FILES = [
  'app/components/ui/PageShell.vue',
  'app/components/ui/PageHeader.vue',
  'app/components/ui/SectionCard.vue',
  'app/components/ui/StateBlock.vue',
  'app/components/ui/ActionBar.vue',
  'app/components/ui/FilterBar.vue',
  'app/components/ui/PillTabs.vue',
  'app/components/ui/UiContextMenu.vue',
  'app/components/admin/AdminDraftNotice.vue',
  'app/components/admin/forms/AdminTrackForm.vue',
  'app/components/admin/forms/AdminTimelineForm.vue',
  'app/components/admin/forms/AdminRubricForm.vue',
  'app/components/admin/forms/AdminResourceForm.vue',
  'app/pages/admin/contests/[id]/tracks/new.vue',
  'app/pages/admin/contests/[id]/tracks/[trackId]/edit.vue',
  'app/pages/admin/contests/[id]/timelines/new.vue',
  'app/pages/admin/contests/[id]/timelines/[timelineId]/edit.vue',
  'app/pages/admin/contests/[id]/track-timelines/new.vue',
  'app/pages/admin/contests/[id]/track-timelines/[timelineId]/edit.vue',
  'app/pages/admin/contests/[id]/rubrics/new.vue',
  'app/pages/admin/contests/[id]/rubrics/[rubricId]/edit.vue',
  'app/pages/admin/contests/[id]/resources/index.vue',
  'app/pages/admin/contests/[id]/resources/new.vue',
  'app/pages/admin/contests/[id]/resources/[resourceId]/edit.vue',
  'app/pages/login.vue',
  'app/pages/invite/[token].vue',
  'app/pages/projects/[id].vue',
  'app/pages/[...all].vue',
  'app/pages/team/index.vue',
  'app/pages/team/[teamId]/index.vue',
  'app/pages/hi/[id].vue',
  'app/components/team/TeamProjectDetailDialog.vue',
  'app/components/team/TeamProjectProfileDialog.vue',
  'app/components/team/TeamProjectMembersDialog.vue',
  'app/components/UserSettingsDialog.vue',
  'app/components/user-settings/UserSettingsShell.vue',
  'app/components/user-settings/UserSettingsProfilePanel.vue',
  'app/components/user-settings/UserSettingsWorkspaceOverviewPanel.vue',
  'app/components/user-settings/UserSettingsAiUsagePanel.vue',
  'app/components/user-settings/UserSettingsMembersPanel.vue',
  'app/components/user-settings/UserSettingsBindingsPanel.vue',
  'app/components/user-settings/UserSettingsLoginHistoryPanel.vue',
  'app/components/user-settings/UserSettingsAuditPanel.vue',
  'app/components/workspace/WorkspaceTabContextMenu.vue',
  'app/components/workspace/WorkspaceTabStrip.vue',
  'app/components/workspace/WorkspaceMembersTab.vue',
  'app/components/workspace/WorkspaceProjectSettingsTab.vue',
  'app/components/workspace/WorkspaceResourcePreviewTab.vue',
  'app/components/workspace/WorkspaceLeftSidebar.vue',
  'app/components/workspace/WorkspaceResourceManagerPanel.vue',
  'app/components/workspace/WorkspaceAnalysisPanel.vue',
  'app/components/workspace/WorkspaceProjectConfigPanel.vue',
  'app/components/workspace/WorkspaceIssuePanel.vue',
  'app/components/workspace/WorkspaceAssistantMessageContent.vue',
  'app/components/workspace/WorkspaceChatMarkdown.vue',
  'app/components/workspace/design/WorkspaceDesignInspector.vue',
  'app/components/workspace/collab/WorkspaceDrawioCanvas.client.vue',
  'app/components/workspace/collab/WorkspaceTldrawCanvas.client.vue',
  'app/components/editor/RichTextEditor.vue',
]

const FONT_GUARD_FILES = [
  'app/layouts/dashboard.vue',
  'app/layouts/admin.vue',
  'app/layouts/home.vue',
  'app/pages/team/[teamId]/project/[projectId].vue',
  'app/pages/login.vue',
  'app/pages/invite/[token].vue',
  'app/pages/projects/[id].vue',
  'app/pages/[...all].vue',
  'app/components/UserSettingsDialog.vue',
]

const HEX_GUARD_FILES = [
  'app/components/ui/PageShell.vue',
  'app/components/ui/PageHeader.vue',
  'app/components/ui/SectionCard.vue',
  'app/components/ui/StateBlock.vue',
  'app/components/ui/ActionBar.vue',
  'app/components/ui/FilterBar.vue',
  'app/components/ui/PillTabs.vue',
  'app/components/ui/UiContextMenu.vue',
  'app/components/admin/AdminDraftNotice.vue',
  'app/components/admin/forms/AdminTrackForm.vue',
  'app/components/admin/forms/AdminTimelineForm.vue',
  'app/components/admin/forms/AdminRubricForm.vue',
  'app/components/admin/forms/AdminResourceForm.vue',
  'app/pages/admin/contests/[id]/resources/index.vue',
  'app/pages/admin/contests/[id]/resources/new.vue',
  'app/pages/admin/contests/[id]/resources/[resourceId]/edit.vue',
  'app/components/team/TeamProjectDetailDialog.vue',
  'app/components/team/TeamProjectProfileDialog.vue',
  'app/components/team/TeamProjectMembersDialog.vue',
  'app/assets/styles/user-settings.css',
  'app/components/UserSettingsDialog.vue',
  'app/components/user-settings/UserSettingsShell.vue',
  'app/components/user-settings/UserSettingsProfilePanel.vue',
  'app/components/user-settings/UserSettingsWorkspaceOverviewPanel.vue',
  'app/components/user-settings/UserSettingsAiUsagePanel.vue',
  'app/components/user-settings/UserSettingsMembersPanel.vue',
  'app/components/user-settings/UserSettingsBindingsPanel.vue',
  'app/components/user-settings/UserSettingsLoginHistoryPanel.vue',
  'app/components/user-settings/UserSettingsAuditPanel.vue',
  'app/components/workspace/WorkspaceTabContextMenu.vue',
  'app/components/workspace/WorkspaceTabStrip.vue',
  'app/components/workspace/WorkspaceMembersTab.vue',
  'app/components/workspace/WorkspaceProjectSettingsTab.vue',
  'app/components/workspace/WorkspaceResourcePreviewTab.vue',
  'app/components/workspace/WorkspaceLeftSidebar.vue',
  'app/components/workspace/WorkspaceResourceManagerPanel.vue',
  'app/components/workspace/WorkspaceAnalysisPanel.vue',
  'app/components/workspace/WorkspaceProjectConfigPanel.vue',
  'app/components/workspace/WorkspaceIssuePanel.vue',
]

async function readProjectFile(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

it('统一样式基座接管的页面与组件不再新增 10px / 11px 裸字号', async () => {
  const sources = await Promise.all(SMALL_TEXT_GUARD_FILES.map(async file => [file, await readProjectFile(file)]))

  for (const [file, source] of sources) {
    assert.doesNotMatch(source, SMALL_TEXT_RE, `${file} 仍包含 text-[10px]/text-[11px]`)
    assert.doesNotMatch(source, SMALL_FONT_RE, `${file} 仍包含 font-size: 10px/11px`)
  }
})

it('统一样式基座接管的布局与页面不再注入 Inter 或页面级字体覆盖', async () => {
  const sources = await Promise.all(FONT_GUARD_FILES.map(async file => [file, await readProjectFile(file)]))

  for (const [file, source] of sources) {
    assert.doesNotMatch(source, INTER_FONT_RE, `${file} 仍在注入 Inter 字体`)
    assert.doesNotMatch(source, FONT_FAMILY_RE, `${file} 仍保留页面级 font-family 覆盖`)
  }
})

it('统一样式基座接管的 primitive 与 admin 资源页不再散落裸 hex 色值', async () => {
  const sources = await Promise.all(HEX_GUARD_FILES.map(async file => [file, await readProjectFile(file)]))

  for (const [file, source] of sources) {
    assert.doesNotMatch(source, HEX_COLOR_RE, `${file} 仍包含裸 hex 颜色`)
  }
})

it('用户设置共享样式维持紧凑字号与密度基线', async () => {
  const source = await readProjectFile('app/assets/styles/user-settings.css')

  assert.doesNotMatch(source, /var\(--wl-text-display\)/, 'user-settings.css 不应再使用 display 级别字号')
  assert.match(source, /\.user-settings-row__title\s*\{[\s\S]*?font-size: var\(--wl-text-body\);/, '用户设置 row title 未回调到 body 级字号')
  assert.match(source, /\.user-settings-section-title\s*\{[\s\S]*?font-size: var\(--wl-text-body\);/, '用户设置 section title 未回调到 body 级字号')
  assert.match(source, /\.user-settings-copy\s*\{[\s\S]*?font-size: var\(--wl-text-body-sm\);/, '用户设置说明文字未回调到 body-sm 级字号')
  assert.match(source, /\.user-settings-meta\s*\{[\s\S]*?font-size: var\(--wl-text-caption\);/, '用户设置次级信息未回调到 caption 级字号')
})
