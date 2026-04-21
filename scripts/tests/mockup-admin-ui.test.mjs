import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const ADMIN_PAGE_FILE = resolve(
  process.cwd(),
  'app/pages/admin/mockups.vue',
)
const ADMIN_CANVAS_LIBRARY_PAGE_FILE = resolve(
  process.cwd(),
  'app/pages/admin/canvas-library.vue',
)
const ADMIN_MOCKUP_COMPONENT_FILE = resolve(
  process.cwd(),
  'app/components/admin/canvas-library/AdminCanvasLibraryMockupModelsManager.vue',
)
const ADMIN_MOCKUP_VARIANT_DELETE_API_FILE = resolve(
  process.cwd(),
  'server/api/admin/mockups/models/[id]/variants/[slotKey].delete.ts',
)
const MOCKUP_DEVICE_STORE_FILE = resolve(
  process.cwd(),
  'server/utils/mockup-device-store.ts',
)
const ADMIN_SUBNAV_FILE = resolve(
  process.cwd(),
  'app/components/admin/AdminSubnav.vue',
)
const DESIGN_PANEL_FILE = resolve(
  process.cwd(),
  'app/components/workspace/WorkspaceDesignPanel.vue',
)
const DESIGN_INSPECTOR_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignInspector.vue',
)
const DESIGN_STAGE_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignStage.vue',
)
const MOCKUP_MODELS_API_PATTERN = /['"]\/admin\/mockups\/models['"]/
const DEVICE_SHELL_KIND_CHECK_PATTERN = /item\.assetKind !== ['"]device_shell['"]/
const DEVICE_SHELL_BINDING_ERROR_PATTERN = /throw new Error\(['"]素材图必须选择已发布的 `device_shell` 素材。['"]\)/
const MOCKUPS_TAB_QUERY_PATTERN = /tab:\s*['"]mockups['"]/

it('mockup 型号已并入画布资源库，并保留兼容路由跳转', async () => {
  const [adminPageSource, adminCanvasLibraryPageSource, adminMockupComponentSource, adminSubnavSource] = await Promise.all([
    readFile(ADMIN_PAGE_FILE, 'utf8'),
    readFile(ADMIN_CANVAS_LIBRARY_PAGE_FILE, 'utf8'),
    readFile(ADMIN_MOCKUP_COMPONENT_FILE, 'utf8'),
    readFile(ADMIN_SUBNAV_FILE, 'utf8'),
  ])

  assert.doesNotMatch(adminSubnavSource, /to: '\/admin\/mockups'/, 'Admin 导航不应再保留独立 Mockup 专项入口')
  assert.match(adminCanvasLibraryPageSource, /Mockup 型号/, '画布资源库页缺少 Mockup 型号 tab')
  assert.match(adminMockupComponentSource, MOCKUP_MODELS_API_PATTERN, 'Mockup 型号管理未接入型号目录接口')
  assert.match(adminMockupComponentSource, /新增变体/, 'Mockup 型号管理缺少新增变体入口')
  assert.match(adminMockupComponentSource, /allow-create/, '品牌输入未支持主流品牌可选且可手填')
  assert.match(adminMockupComponentSource, /上传型号预览图/, 'Mockup 型号管理缺少型号预览图上传入口')
  assert.match(adminMockupComponentSource, /预览图由管理员手动上传/, 'Mockup 型号管理未将预览图定义为手动上传')
  assert.match(adminMockupComponentSource, /屏幕宽（px）/, 'Mockup 型号表单缺少屏幕宽 label')
  assert.match(adminMockupComponentSource, /屏幕高（px）/, 'Mockup 型号表单缺少屏幕高 label')
  assert.match(adminMockupComponentSource, /选择素材图（device_shell）/, 'Mockup 型号管理缺少变体素材图配置')
  assert.match(adminMockupComponentSource, /快速上传素材图/, 'Mockup 型号管理缺少变体素材图快速上传入口')
  assert.match(adminMockupComponentSource, /上传预览图/, 'Mockup 型号管理缺少变体预览图上传入口')
  assert.match(adminMockupComponentSource, /型号预设/, 'Mockup 型号管理缺少型号预设入口')
  assert.match(adminMockupComponentSource, /尺寸预设/, 'Mockup 型号管理缺少尺寸预设入口')
  assert.match(adminMockupComponentSource, /请确认型号尺寸/, '创建型号前缺少尺寸确认弹层')
  assert.match(adminMockupComponentSource, /确认删除该展示变体吗/, '展示变体缺少删除确认')
  assert.match(adminMockupComponentSource, DEVICE_SHELL_KIND_CHECK_PATTERN, 'Mockup 型号管理未限制正式壳资产来源')
  assert.match(adminMockupComponentSource, DEVICE_SHELL_BINDING_ERROR_PATTERN, 'Mockup 型号管理缺少正式壳资产校验')
  assert.match(adminMockupComponentSource, /去素材列表/, 'Mockup 型号管理缺少跳转回素材列表入口')
  assert.match(adminMockupComponentSource, /Message\.success/, 'Mockup 型号管理成功提示未改为 Message')
  assert.match(adminMockupComponentSource, /Message\.error/, 'Mockup 型号管理错误提示未改为 Message')
  assert.match(adminMockupComponentSource, /data-index="modelName"/, 'Mockup 型号列表缺少可渲染的 data-index 列定义')
  assert.match(adminMockupComponentSource, /<a-table[\s\S]*<template #columns>/, 'Mockup 型号表格未通过 columns slot 注册列定义')
  assert.match(adminMockupComponentSource, /v-model="variantTitleDrafts\[scope\.record\.slotKey\]"/, '展示变体标题未改为本地 draft 驱动')
  assert.match(adminMockupComponentSource, /const variantCreateVisible = ref\(false\)/, '展示变体新增流程未切换为显式命名态')
  assert.match(adminMockupComponentSource, /v-model="variantCreateDraft"/, '展示变体新增流程缺少标题输入草稿')
  assert.match(adminMockupComponentSource, /startAddVariant\(\)/, '展示变体新增入口未先进入命名态')
  assert.match(adminMockupComponentSource, /function normalizeVariantTitleInput/, '展示变体新增与改名未复用统一标题归一化逻辑')
  assert.match(adminMockupComponentSource, /title: nextTitle/, '展示变体新增未直接以输入标题创建')
  assert.doesNotMatch(adminMockupComponentSource, /:model-value="scope\.record\.title"/, '展示变体标题仍是只读绑定，无法输入')
  assert.doesNotMatch(adminMockupComponentSource, /#cell="\{ record \}"/, 'Mockup 型号表格不应继续使用 record 解构 cell slot')
  assert.doesNotMatch(adminMockupComponentSource, /placeholder="标题"/, '创建型号表单不应再暴露标题字段')
  assert.doesNotMatch(adminMockupComponentSource, /placeholder="slug（可选）"/, '创建型号表单不应再暴露 slug 字段')
  assert.doesNotMatch(adminMockupComponentSource, /placeholder="sortOrder"/, 'Mockup 型号表单不应再暴露 sortOrder 字段')
  assert.doesNotMatch(adminMockupComponentSource, /不指定默认 variant/, 'Mockup 型号表单不应再暴露默认 variant 字段')
  assert.doesNotMatch(adminMockupComponentSource, /选择型号预览图/, '型号预览图不应再通过下拉选择')
  assert.doesNotMatch(adminMockupComponentSource, /选择预览图（image\/svg）/, '变体预览图不应再通过下拉选择')
  assert.doesNotMatch(adminMockupComponentSource, /<a-alert v-if="errorText"/, 'Mockup 型号管理不应继续使用页面级错误 Alert')
  assert.doesNotMatch(adminMockupComponentSource, /<a-alert v-if="successText"/, 'Mockup 型号管理不应继续使用页面级成功 Alert')
  assert.doesNotMatch(adminMockupComponentSource, /每个型号需要预览图，每个变体需要素材图和预览图/, 'Mockup 型号页顶部不应再保留冗余说明文案')
  assert.doesNotMatch(adminMockupComponentSource, /可按需新增多个展示变体/, 'Mockup 变体弹窗不应再保留冗余说明文案')
  assert.doesNotMatch(adminMockupComponentSource, /素材图仅允许绑定已发布的 `device_shell`/, 'Mockup 变体弹窗不应再保留顶部 Alert 说明')
  assert.match(adminPageSource, /navigateTo\(/, '旧 Mockup 路由缺少兼容跳转')
  assert.match(adminPageSource, MOCKUPS_TAB_QUERY_PATTERN, '旧 Mockup 路由未跳到画布资源库的 mockups tab')
})

it('mockup 变体删除后端会清理默认变体并收紧顺序', async () => {
  const [deleteApiSource, storeSource] = await Promise.all([
    readFile(ADMIN_MOCKUP_VARIANT_DELETE_API_FILE, 'utf8'),
    readFile(MOCKUP_DEVICE_STORE_FILE, 'utf8'),
  ])

  assert.match(deleteApiSource, /deleteMockupDeviceVariant/, 'Mockup 变体删除接口未接入 store 删除逻辑')
  assert.match(deleteApiSource, /当前用户无权删除 Mockup 变体/, 'Mockup 变体删除接口缺少写权限校验提示')
  assert.match(storeSource, /DELETE FROM mockup_device_variants/, 'Mockup 变体删除未真正删除变体记录')
  assert.match(storeSource, /default_variant_slot_key = CASE/, '删除变体后未清理默认变体引用')
  assert.match(storeSource, /ROW_NUMBER\(\) OVER \(ORDER BY sort_order ASC, slot_key ASC\) - 1/, '删除变体后未重新压紧 sort_order')
})

it('设计画布已接入 mockup 整体拖动与屏幕构图编辑态', async () => {
  const [designPanelSource, inspectorSource, stageSource] = await Promise.all([
    readFile(DESIGN_PANEL_FILE, 'utf8'),
    readFile(DESIGN_INSPECTOR_FILE, 'utf8'),
    readFile(DESIGN_STAGE_FILE, 'utf8'),
  ])

  assert.match(inspectorSource, /调整屏幕内容/, 'Inspector 缺少进入屏幕构图编辑态入口')
  assert.match(inspectorSource, /重置构图/, 'Inspector 缺少构图重置动作')
  assert.match(inspectorSource, /screenTransform/, 'Inspector 未接入 screenTransform 控件')
  assert.match(stageSource, /'edit-mockup-screen'/, 'Stage 未暴露进入 mockup 内部编辑态事件')
  assert.match(stageSource, /'update-mockup-screen-transform'/, 'Stage 未暴露 mockup 屏幕偏移更新事件')
  assert.match(stageSource, /mockupScreenEditingFrameId/, 'Stage 未接入 mockup 内部编辑态 frameId')
  assert.match(designPanelSource, /@edit-mockup-screen="mockupScreenEditingFrameId = \$event\.frameId"/, '设计面板未接住 mockup 内部编辑事件')
  assert.match(designPanelSource, /@update-mockup-screen-transform="/, '设计面板未接住 mockup 屏幕拖动更新')
  assert.match(designPanelSource, /scale: Number\(targetFrame\.metadata\?\.device\?\.screenTransform\?\.scale \|\| 1\)/, '设计面板更新 screenTransform 时未保留 scale')
})
