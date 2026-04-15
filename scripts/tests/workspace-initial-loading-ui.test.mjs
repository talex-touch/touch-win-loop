import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const PROJECT_SIDEBAR_LAYOUT_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceSidebarLayout.ts')
const PROJECT_SHELL_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectShell.ts')
const WORKSPACE_LOADING_OVERLAY_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceShellLoadingOverlay.vue')

it('项目工作区首屏采用独立遮罩加载层，并保持主体内容先渲染', async () => {
  const [source, overlaySource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_LOADING_OVERLAY_FILE, 'utf8'),
  ])

  assert.match(source, /const workspaceShellLoading = computed\(\(\) => \{/, '项目页缺少首屏加载门禁状态')
  assert.match(source, /const workspaceShellLoadingProgress = computed\(\(\) => \{/, '项目页缺少首屏加载阶段进度')
  assert.match(source, /:aria-busy="workspaceShellLoading \? 'true' : 'false'"/, '项目页未暴露工作区加载忙碌态')
  assert.match(source, /<WorkspaceHeader/, '项目页未保留工作区主体预渲染')
  assert.match(source, /<WorkspaceStatusBar/, '项目页未保留状态栏预渲染')
  assert.match(source, /<Transition name="workspace-shell-loading-overlay">[\s\S]*<WorkspaceShellLoadingOverlay[\s\S]*v-if="workspaceShellLoading"[\s\S]*:progress="workspaceShellLoadingProgress"/, '项目页未为工作区加载遮罩接入阶段进度')
  assert.doesNotMatch(source, /workspace-preparing-overlay__label">正在准备工作区</, '项目页仍保留旧的 overlay 准备态文案')
  assert.doesNotMatch(source, /workspace-preparing-overlay__title">WinLooooop</, '项目页仍保留旧的 overlay 标题')

  assert.match(overlaySource, /label: 'WinLoop 工作区加载中'/, '独立加载遮罩缺少默认文案')
  assert.match(overlaySource, /brand: 'WinLoop'/, '独立加载遮罩缺少默认品牌字样')
  assert.match(overlaySource, /progress\?: number/, '独立加载遮罩未暴露进度输入')
  assert.match(overlaySource, /class="workspace-shell-loading-overlay"/, '独立加载遮罩缺少稳定根节点类名')
  assert.match(overlaySource, /place-items:\s*center/, '独立加载遮罩未将加载内容居中')
  assert.match(overlaySource, /z-index:\s*520/, '独立加载遮罩层级不足，无法盖住工作区角落控件')
  assert.match(overlaySource, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.64\)/, '独立加载遮罩未使用半透明白色遮罩')
  assert.match(overlaySource, /backdrop-filter:\s*blur\(10px\)/, '独立加载遮罩未对底部工作区做模糊处理')
  assert.match(overlaySource, /workspace-shell-loading-overlay__wordmark/, '独立加载遮罩缺少大字品牌层')
  assert.match(overlaySource, /workspace-shell-loading-overlay__text--fill/, '独立加载遮罩缺少填充字层')
  assert.match(overlaySource, /<svg[\s\S]*workspace-shell-loading-overlay__wordmark/, '独立加载遮罩未改为 SVG 字形层')
  assert.match(overlaySource, /clipPath id="workspace-shell-loading-wordmark-fill"/, '独立加载遮罩缺少填充裁切路径')
  assert.match(overlaySource, /clip-path="url\(#workspace-shell-loading-wordmark-fill\)"/, '独立加载遮罩未将填充字层绑定裁切路径')
  assert.match(overlaySource, /const wordmarkBaseTextRef = ref<SVGTextElement \| null>\(null\)/, '独立加载遮罩缺少文字边界引用')
  assert.match(overlaySource, /textEl\.getBBox\(\)/, '独立加载遮罩未基于实际字形边界计算填充区域')
  assert.match(overlaySource, /const progressClipY = computed\(\(\) => \(wordmarkBounds\.value\.y \+ wordmarkBounds\.value\.height\) - progressClipHeight\.value\)/, '独立加载遮罩未按字形底部向上计算填充区域')
  assert.match(overlaySource, /workspace-shell-loading-overlay__percent/, '独立加载遮罩缺少百分比读数')
  assert.doesNotMatch(overlaySource, /workspace-shell-loading-overlay__panel/, '独立加载遮罩仍保留多余卡片容器')
  assert.match(source, /:deep\(\.workspace-shell-loading-overlay-leave-active\)/, '项目页未定义加载遮罩离场过渡')
  assert.match(source, /:deep\(\.workspace-shell-loading-overlay-leave-to\)[\s\S]*backdrop-filter:\s*blur\(0px\)/, '项目页未在离场阶段先将模糊退到 0')
  assert.match(source, /transition:[\s\S]*opacity 0\.26s ease,[\s\S]*backdrop-filter 0\.18s ease/, '项目页未分离模糊与透明度过渡节奏')
})

it('项目工作区默认将左右侧边栏设为收起', async () => {
  const [layoutSource, shellSource, workspaceSource] = await Promise.all([
    readFile(PROJECT_SIDEBAR_LAYOUT_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_SHELL_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
  ])

  assert.match(layoutSource, /const leftSidebarCollapsed = ref\(true\)/, '左侧栏默认未设为收起')
  assert.match(layoutSource, /const rightSidebarUserCollapsed = ref\(true\)/, '右侧栏默认未设为收起')
  assert.match(shellSource, /leftSidebarCollapsed: true,\s+rightSidebarCollapsed: true,/, '默认工作区视图状态未将双侧边栏设为收起')
  assert.match(workspaceSource, /applySidebarLayoutState\(\{\s+leftSidebarCollapsed: true,\s+rightSidebarCollapsed: true,\s+\}\)/, '项目设置态重置时未恢复双侧边栏默认收起')
})
