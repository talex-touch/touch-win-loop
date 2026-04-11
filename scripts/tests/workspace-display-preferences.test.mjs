import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_FILE = resolve(process.cwd(), 'shared/types/domain.ts')
const DB_FILE = resolve(process.cwd(), 'server/utils/db.ts')
const STORE_FILE = resolve(process.cwd(), 'server/utils/workspace-display-preference-store.ts')
const USER_GET_API_FILE = resolve(process.cwd(), 'server/api/user/workspace-display-preferences.get.ts')
const USER_PATCH_API_FILE = resolve(process.cwd(), 'server/api/user/workspace-display-preferences.patch.ts')
const WORKSPACE_GET_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/workspace-display-preferences.get.ts')
const WORKSPACE_USER_PATCH_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/workspace-display-preferences/user.patch.ts')
const WORKSPACE_DEFAULT_PATCH_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/workspace-display-preferences/default.patch.ts')
const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const USER_SETTINGS_DIALOG_FILE = resolve(process.cwd(), 'app/components/UserSettingsDialog.vue')
const APP_FILE = resolve(process.cwd(), 'app/app.vue')
const COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceDisplayPreferences.ts')

it('工作区显示偏好共享类型、存储表与后端优先级链已落地', async () => {
  const [domainSource, dbSource, storeSource] = await Promise.all([
    readFile(DOMAIN_FILE, 'utf8'),
    readFile(DB_FILE, 'utf8'),
    readFile(STORE_FILE, 'utf8'),
  ])

  assert.match(domainSource, /export type WorkspaceFontSizePreset = 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'/, '缺少字体大小五档预设类型')
  assert.match(domainSource, /export type WorkspaceTabSpacingPreset = 'compact' \| 'default' \| 'relaxed'/, '缺少标签边距预设类型')
  assert.match(domainSource, /export type WorkspaceDisplayPreferenceSource = 'workspace_override' \| 'user_default' \| 'team_default' \| 'system_default'/, '缺少显示偏好来源类型')
  assert.match(domainSource, /tabSpacingPreset\?: WorkspaceTabSpacingPreset \| null/, '显示偏好缺少标签边距字段')
  assert.match(domainSource, /tabSpacingPreset: WorkspaceDisplayPreferenceSource/, '显示偏好来源缺少标签边距来源字段')
  assert.match(domainSource, /export interface WorkspaceDisplayPreferenceSnapshot \{[\s\S]*userDefault: WorkspaceDisplayPreferences \| null[\s\S]*teamDefault: WorkspaceDisplayPreferences \| null[\s\S]*workspaceOverride: WorkspaceDisplayPreferences \| null[\s\S]*effective: WorkspaceDisplayPreferences[\s\S]*sources: WorkspaceDisplayPreferenceSources[\s\S]*canManageTeamDefault: boolean[\s\S]*\}/, '缺少工作区显示偏好快照结构')

  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS user_workspace_display_defaults \(/, '缺少个人全局默认表')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS workspace_display_defaults \(/, '缺少团队默认表')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS user_workspace_display_overrides \(/, '缺少工作区个人覆盖表')
  assert.match(dbSource, /preferences JSONB NOT NULL/, '显示偏好表未统一使用 JSONB 存储')
  assert.match(dbSource, /idx_user_workspace_display_overrides_workspace_user/, '缺少工作区个人覆盖索引')

  assert.match(storeSource, /function resolveEffectiveWorkspaceDisplayPreferences\(/, '后端未提供统一解析函数')
  assert.match(storeSource, /function resolveWorkspaceDisplayPreferenceValue<.*WorkspaceFontSizePreset \| WorkspaceTabSpacingPreset>/, '后端未抽出显示偏好字段解析逻辑')
  assert.match(storeSource, /if \(input\.workspaceOverride\) \{[\s\S]*source: 'workspace_override'/, '显示偏好优先级未优先使用工作区个人覆盖')
  assert.match(storeSource, /workspaceOverride: input\.workspaceOverride\?\.fontSizePreset/, '字号解析未透传工作区个人覆盖字段')
  assert.match(storeSource, /workspaceOverride: input\.workspaceOverride\?\.tabSpacingPreset/, '标签边距解析未透传工作区个人覆盖字段')
  assert.match(storeSource, /sources: \{[\s\S]*fontSizePreset: fontSizePreset\.source,[\s\S]*tabSpacingPreset: tabSpacingPreset\.source,[\s\S]*\}/, '显示偏好来源快照未包含字号和标签边距双字段')
  assert.match(storeSource, /fontSizePreset: 'md',[\s\S]*tabSpacingPreset: 'default'/, '系统默认缺少字号和标签边距双字段')
  assert.match(storeSource, /if \(context\.workspace\.type !== 'team'\)\s+throw new Error\('TEAM_WORKSPACE_DISPLAY_DEFAULT_UNSUPPORTED'\)/, 'personal workspace 未拒绝团队默认写入')
  assert.match(storeSource, /const userDefault = await loadUserWorkspaceDisplayDefaultsRow\(db, user\.id\)\s+const rawTeamDefault = await loadWorkspaceDisplayDefaultsRow\(db, workspaceId\)\s+const workspaceOverride = await loadUserWorkspaceDisplayOverrideRow\(db, user\.id, workspaceId\)/, '工作区显示偏好快照仍在单连接上下文里并发查询')
  assert.match(storeSource, /DELETE FROM user_workspace_display_defaults/, '个人全局默认未支持清空')
  assert.match(storeSource, /DELETE FROM workspace_display_defaults/, '团队默认未支持清空')
  assert.match(storeSource, /DELETE FROM user_workspace_display_overrides/, '工作区个人覆盖未支持清空')
})

it('工作区显示偏好接口与前端 composable 已接入', async () => {
  const [
    userGetApiSource,
    userPatchApiSource,
    workspaceGetApiSource,
    workspaceUserPatchApiSource,
    workspaceDefaultPatchApiSource,
    composableSource,
  ] = await Promise.all([
    readFile(USER_GET_API_FILE, 'utf8'),
    readFile(USER_PATCH_API_FILE, 'utf8'),
    readFile(WORKSPACE_GET_API_FILE, 'utf8'),
    readFile(WORKSPACE_USER_PATCH_API_FILE, 'utf8'),
    readFile(WORKSPACE_DEFAULT_PATCH_API_FILE, 'utf8'),
    readFile(COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(userGetApiSource, /getUserWorkspaceDisplayDefaults/, '缺少个人全局默认 GET 接口实现')
  assert.match(userPatchApiSource, /patchUserWorkspaceDisplayDefaults/, '缺少个人全局默认 PATCH 接口实现')
  assert.match(workspaceGetApiSource, /getWorkspaceDisplayPreferenceSnapshot/, '缺少工作区偏好快照 GET 接口实现')
  assert.match(workspaceUserPatchApiSource, /patchUserWorkspaceDisplayOverride/, '缺少工作区个人覆盖 PATCH 接口实现')
  assert.match(workspaceDefaultPatchApiSource, /patchWorkspaceDisplayDefault/, '缺少团队默认 PATCH 接口实现')
  assert.match(workspaceDefaultPatchApiSource, /TEAM_WORKSPACE_DISPLAY_DEFAULT_UNSUPPORTED/, '团队默认接口未处理 personal workspace 拒绝逻辑')

  assert.match(composableSource, /WORKSPACE_FONT_SIZE_PRESET_OPTIONS/, '前端 composable 缺少字体大小选项')
  assert.match(composableSource, /WORKSPACE_TAB_SPACING_PRESET_OPTIONS/, '前端 composable 缺少标签边距选项')
  assert.match(composableSource, /更小/, '前端 composable 缺少中文档位文案')
  assert.match(composableSource, /偏大/, '前端 composable 缺少中文档位文案')
  assert.match(composableSource, /紧凑/, '前端 composable 缺少标签边距中文档位文案')
  assert.match(composableSource, /normalizeWorkspaceTabSpacingDraft/, '前端 composable 缺少标签边距草稿归一化')
  assert.match(composableSource, /endpoint\('\/user\/workspace-display-preferences'\)/, '前端 composable 未接入个人全局默认接口')
  assert.match(composableSource, /endpoint\(`\/teams\/\$\{workspaceId\}\/workspace-display-preferences`\)/, '前端 composable 未接入工作区偏好快照接口')
  assert.match(composableSource, /endpoint\(`\/teams\/\$\{workspaceId\}\/workspace-display-preferences\/user`\)/, '前端 composable 未接入工作区个人覆盖接口')
  assert.match(composableSource, /endpoint\(`\/teams\/\$\{workspaceId\}\/workspace-display-preferences\/default`\)/, '前端 composable 未接入团队默认接口')
})

it('个人设置弹窗与项目工作区 Settings 已出现显示偏好入口', async () => {
  const [dialogSource, panelSource] = await Promise.all([
    readFile(USER_SETTINGS_DIALOG_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
  ])

  assert.match(dialogSource, /type UserSettingsTabId = 'profile' \| 'displayPreferences'/, '个人设置弹窗未新增显示偏好 tab id')
  assert.match(dialogSource, /label: '显示偏好'/, '个人设置弹窗未新增显示偏好导航项')
  assert.match(dialogSource, /user-settings-display-preferences-tab/, '个人设置弹窗缺少显示偏好稳定测试标识')
  assert.match(dialogSource, /data-testid="user-settings-display-preferences-panel"/, '个人设置弹窗缺少显示偏好面板稳定测试标识')
  assert.match(dialogSource, /data-testid="user-settings-display-font-size-select"/, '个人设置弹窗缺少字体大小选择器测试标识')
  assert.match(dialogSource, /data-testid="user-settings-display-tab-spacing-select"/, '个人设置弹窗缺少标签边距选择器测试标识')
  assert.match(dialogSource, /系统默认固定为 md \/ 默认边距/, '个人设置弹窗未展示系统默认说明')
  assert.match(dialogSource, /saveUserWorkspaceDisplayPreferences/, '个人设置弹窗未接入个人全局默认保存逻辑')

  assert.match(panelSource, /type WorkspaceSettingsSecondaryTabId = 'project' \| 'myDisplay' \| 'teamDefault'/, '项目工作区 Settings 未拆出二级 tab')
  assert.match(panelSource, /label: '个人设置'/, '项目工作区 Settings 未改为“个人设置”tab')
  assert.match(panelSource, /workspace-settings-tab-myDisplay/, '项目工作区 Settings 缺少“我的显示”测试标识')
  assert.match(panelSource, /data-testid="workspace-display-user-font-size-select"/, '项目工作区“我的显示”缺少字体大小选择器')
  assert.match(panelSource, /data-testid="workspace-display-user-tab-spacing-select"/, '项目工作区“我的显示”缺少标签边距选择器')
  assert.match(panelSource, /userWorkspaceDisplaySliderProgress/, '项目工作区“个人设置”未将字体大小恢复为 slider 预览')
  assert.match(panelSource, /updateUserWorkspaceDisplayFontSizeDraft/, '项目工作区“个人设置”缺少字体大小 slider 更新逻辑')
  assert.match(panelSource, /userWorkspaceDisplayTabSpacingSliderProgress/, '项目工作区“个人设置”未将标签边距改成 slider 预览')
  assert.match(panelSource, /updateUserWorkspaceDisplayTabSpacingDraft/, '项目工作区“个人设置”缺少标签边距 slider 更新逻辑')
  assert.match(panelSource, /workspace-display-slider-shell/, '项目工作区“个人设置”未恢复横向 slider 样式壳层')
  assert.match(panelSource, /resolveWorkspaceDisplaySliderStopLeft/, '项目工作区“个人设置”缺少 slider stop 定位逻辑')
  assert.match(panelSource, /data-testid="workspace-display-recommended-tag"/, '项目工作区“个人设置”未展示推荐 tag')
  assert.match(panelSource, /workspace-display-slider-label__tooltip/, '项目工作区“个人设置”未渲染推荐 tooltip')
  assert.match(panelSource, /项目工作区推荐/, '项目工作区“个人设置”未提供推荐 tooltip 文案')
  assert.match(panelSource, /紧凑档会压缩顶部标签页的横向边距和最小宽度/, '项目工作区“个人设置”缺少标签边距说明')
  assert.match(panelSource, /还原为工作区推荐设置/, '项目工作区“个人设置”未提供恢复推荐设置入口')
  assert.match(panelSource, /saveWorkspaceDisplayUserOverride/, '项目工作区“我的显示”未接保存事件')
  assert.match(panelSource, /保存个人设置/, '项目工作区“个人设置”未更新保存按钮文案')
})

it('项目工作区根节点已绑定生效字号，且样式仅在工作区作用域内覆盖', async () => {
  const [workspaceSource, appSource, panelSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(APP_FILE, 'utf8'),
    readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /class="workspace-shell wl-workspace-font-scope/, '项目工作区根节点未挂载工作区字体作用域 class')
  assert.match(workspaceSource, /:data-workspace-font-size="workspaceEffectiveFontSizePreset"/, '项目工作区根节点未绑定当前生效字号标识')
  assert.match(workspaceSource, /const workspaceEffectiveTabSpacingPreset = computed<WorkspaceTabSpacingPreset>\(\(\) => \{[\s\S]*tabSpacingPreset/, '项目工作区未抽出生效标签边距状态')
  assert.match(workspaceSource, /:tab-spacing-preset="workspaceEffectiveTabSpacingPreset"/, '项目工作区未向左栏透传生效标签边距')
  assert.match(workspaceSource, /:workspace-display-preferences="workspaceDisplayPreferenceSnapshot"/, '项目工作区未透传显示偏好快照到主面板')
  assert.match(workspaceSource, /:workspace-display-preferences-loading="workspaceDisplayPreferenceLoading"/, '项目工作区未透传显示偏好加载状态')
  assert.match(workspaceSource, /@save-workspace-display-user-override="saveWorkspaceDisplayUserOverride"/, '项目工作区未接“我的显示”保存事件')
  assert.match(workspaceSource, /@save-workspace-display-team-default="saveWorkspaceDisplayTeamDefault"/, '项目工作区未接“团队默认”保存事件')
  assert.match(workspaceSource, /tabSpacingPreset: payload\.tabSpacingPreset/, '项目工作区未透传标签边距保存字段')
  assert.match(workspaceSource, /loadWorkspaceDisplayPreferenceSnapshot\(\)/, '项目工作区未在初始化时拉取显示偏好快照')

  assert.match(appSource, /\.wl-workspace-font-scope \{[\s\S]*--wl-ws-font-scale: 1/, '全局样式缺少工作区字体作用域变量')
  assert.match(appSource, /\.wl-workspace-font-scope\[data-workspace-font-size='xl'\]/, '全局样式缺少字号档位映射')
  assert.match(appSource, /\.wl-workspace-font-scope :is\(\.text-\\\[11px\\\], \.text-xs\):not\(\.material-symbols-outlined\)/, '全局样式未覆盖项目工作区常见字号 utility')
  assert.match(appSource, /\.wl-workspace-font-scope \.workspace-tree-item__label/, '全局样式未覆盖左侧栏字号')
  assert.match(appSource, /\.wl-workspace-font-scope \.workspace-upload-tray__title/, '全局样式未覆盖状态栏字号')
  assert.match(appSource, /\.wl-workspace-font-scope \.meeting-btn/, '全局样式未覆盖会议面板字号')
  assert.doesNotMatch(appSource, /(^|[^-])\.text-xs \{/, '全局样式不应无作用域重写全站字号 utility')
  assert.match(panelSource, /workspaceMainTabLayoutStyle/, '项目主面板未根据显示偏好计算标签边距样式')
  assert.match(panelSource, /workspace-main-tab-min-width/, '项目主面板未为标签边距预设提供最小宽度变量')
  assert.match(panelSource, /workspace-main-tab-trigger-gap/, '项目主面板未恢复标签触发区间距变量')
  assert.match(panelSource, /workspace-main-tab-close-padding/, '项目主面板未恢复标签关闭按钮间距变量')
  assert.match(panelSource, /workspace-main-breadcrumb-padding-x/, '项目主面板未恢复 breadcrumb 横向间距变量')
  assert.match(panelSource, /workspace-main-breadcrumb-padding-y/, '项目主面板未恢复 breadcrumb 纵向间距变量')
})
