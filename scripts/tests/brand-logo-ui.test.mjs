import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const BRAND_LOGO_FILE = resolve(process.cwd(), 'app/components/brand/BrandLogo.vue')
const BRAND_CONSTANTS_FILE = resolve(process.cwd(), 'app/constants/brand-logo.ts')
const WINLOOP_TEXT_LOGO_FILE = resolve(process.cwd(), 'app/components/WinLoopTextLogo.vue')
const LOGO_PREVIEW_PAGE_FILE = resolve(process.cwd(), 'app/pages/test/logo.vue')
const NUXT_CONFIG_FILE = resolve(process.cwd(), 'nuxt.config.ts')
const APP_FILE = resolve(process.cwd(), 'app/app.vue')
const DASHBOARD_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/dashboard/DashboardSidebar.vue')
const DASHBOARD_WORKSPACE_FILE = resolve(process.cwd(), 'app/composables/useDashboardWorkspace.ts')
const WORKSPACE_SWITCH_ENTRY_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceSwitchEntry.vue')
const WORKSPACE_HEADER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceHeader.vue')
const WORKSPACE_DASHBOARD_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDashboardTab.vue')
const FAVICON_SVG_FILE = resolve(process.cwd(), 'public/favicon.svg')

it('共享品牌组件提供 mark / lockup / animated 三种品牌表达能力', async () => {
  const [brandLogoSource, brandConstantsSource, textLogoSource] = await Promise.all([
    readFile(BRAND_LOGO_FILE, 'utf8'),
    readFile(BRAND_CONSTANTS_FILE, 'utf8'),
    readFile(WINLOOP_TEXT_LOGO_FILE, 'utf8'),
  ])

  assert.match(brandLogoSource, /variant\?: 'mark' \| 'lockup'/, 'BrandLogo 未声明 mark \/ lockup 变体')
  assert.match(brandLogoSource, /tone\?: 'brand' \| 'white'/, 'BrandLogo 未声明品牌色 \/ 白色两套 tone')
  assert.match(brandLogoSource, /animated\?: boolean/, 'BrandLogo 未声明 animated 入参')
  assert.match(brandLogoSource, /WINLOOP_BRAND_MARK_PATHS/, 'BrandLogo 未接入共享 mark path 数据')
  assert.match(brandLogoSource, /WINLOOP_BRAND_WORDMARK_PATHS/, 'BrandLogo 未接入共享字标 path 数据')
  assert.match(brandLogoSource, /data-animated="props\.animated \? 'true' : 'false'"/, 'BrandLogo 未将动画态暴露给样式层')
  assert.match(brandLogoSource, /resolveMarkTraceStyle\(\s*index: number,\s*tone: 'primary' \| 'accent'/, 'BrandLogo 未按黑色与蓝色分离 mark 描边时序')
  assert.match(brandLogoSource, /resolveWordmarkTraceStyle\(index: number\)/, 'BrandLogo 未为字标提供独立描边时序')
  assert.match(brandLogoSource, /winloop-brand__trace-path/, 'BrandLogo 未渲染描边动画路径层')
  assert.match(brandLogoSource, /winloop-brand-trace-draw/, 'BrandLogo 未提供描边动画关键帧')
  assert.match(brandLogoSource, /winloop-brand-fill-reveal/, 'BrandLogo 未提供填充渐显关键帧')
  assert.match(brandLogoSource, /2680 \+ \(index \* 40\)/, 'BrandLogo 未将字标放在 mark 动画之后演绎')
  assert.match(brandLogoSource, /isPrimary \? 0 : 1380/, 'BrandLogo 未让黑色 mark 先于蓝色 mark 演绎')
  assert.match(brandLogoSource, /animation: winloop-brand-trace-draw var\(--winloop-brand-trace-duration\) ease-out 1 both;/, 'BrandLogo 描边动画未改为单次播放')
  assert.match(brandLogoSource, /winloop-brand__trace-path--wordmark/, 'BrandLogo 未让字标走一次性描边演绎')
  assert.match(brandConstantsSource, /WINLOOP_BRAND_MARK_PATHS/, '品牌常量文件缺少 mark path 定义')
  assert.match(brandConstantsSource, /WINLOOP_BRAND_WORDMARK_PATHS/, '品牌常量文件缺少 wordmark path 定义')
  assert.match(textLogoSource, /<BrandLogo variant="lockup"/, 'WinLoopTextLogo 未退化为 BrandLogo 兼容包装层')
})

it('/test/logo 页面稳定展示三种品牌预览形态', async () => {
  const source = await readFile(LOGO_PREVIEW_PAGE_FILE, 'utf8')

  assert.match(source, /data-testid="logo-preview-page"/, 'logo 预览页缺少稳定根节点锚点')
  assert.match(source, /data-testid="`logo-preview-\$\{item\.id\}`"/, 'logo 预览页未为三种变体输出稳定测试锚点')
  assert.match(source, /title:\s*'logo'/, 'logo 预览页缺少纯 logo 预览块')
  assert.match(source, /title:\s*'logo\+text'/, 'logo 预览页缺少 logo\+text 预览块')
  assert.match(source, /title:\s*'logo\+animation'/, 'logo 预览页缺少 logo\+animation 预览块')
  assert.match(source, /:animated="item\.animated"/, 'logo 预览页未向 BrandLogo 透传动效开关')
})

it('dashboard 与项目台品牌入口全部切换到统一品牌图形', async () => {
  const [dashboardSidebarSource, dashboardWorkspaceSource, workspaceSwitchSource, workspaceHeaderSource, workspaceDashboardTabSource] = await Promise.all([
    readFile(DASHBOARD_SIDEBAR_FILE, 'utf8'),
    readFile(DASHBOARD_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_SWITCH_ENTRY_FILE, 'utf8'),
    readFile(WORKSPACE_HEADER_FILE, 'utf8'),
    readFile(WORKSPACE_DASHBOARD_TAB_FILE, 'utf8'),
  ])

  assert.match(dashboardSidebarSource, /<BrandLogo variant="mark" class="dashboard-sidebar__brand-mark"/, 'DashboardSidebar 顶部品牌区未改用共享 mark')
  assert.match(dashboardSidebarSource, /dashboard-sidebar__brand-title/, 'DashboardSidebar 顶部品牌区缺少独立品牌标题')
  assert.match(dashboardSidebarSource, /isBrandIcon\(item\.icon\)/, 'DashboardSidebar 未对品牌图标做统一渲染分支')
  assert.match(dashboardWorkspaceSource, /icon:\s*'brand-mark'/, 'dashboard 菜单未把首页入口切到统一品牌图形')
  assert.match(workspaceSwitchSource, /props\.icon === 'brand-mark'/, 'WorkspaceSwitchEntry 未支持品牌图标入口')
  assert.match(workspaceHeaderSource, /<BrandLogo variant="mark"/, 'WorkspaceHeader 面包屑前导图标未改为品牌图形')
  assert.match(workspaceDashboardTabSource, /<BrandLogo variant="mark"/, 'WorkspaceDashboardTab 标题图标未改为品牌图形')
})

it('favicon 链路改为静态品牌资源，运行时不再注入旧 data uri 图标', async () => {
  const [nuxtConfigSource, appSource, faviconSvgSource] = await Promise.all([
    readFile(NUXT_CONFIG_FILE, 'utf8'),
    readFile(APP_FILE, 'utf8'),
    readFile(FAVICON_SVG_FILE, 'utf8'),
  ])

  assert.match(nuxtConfigSource, /href:\s*'\/favicon\.svg'/, 'nuxt 配置未指向新的 favicon.svg')
  assert.doesNotMatch(appSource, /createIconLogoFaviconHref/, 'app.vue 仍在运行时注入旧 data uri favicon')
  assert.match(faviconSvgSource, /fill="#2563EB"/, 'favicon.svg 未使用品牌蓝底')
  assert.match(faviconSvgSource, /fill="#FFFFFF"/, 'favicon.svg 未使用白色 logo')
})
