import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')

it('项目页为工作台切换建立独立状态机，并按固定顺序计算轮播方向', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /type WorkbenchSwitchPhase = 'idle' \| 'loading' \| 'animating'/, '项目页缺少工作台切换阶段类型')
  assert.match(source, /type WorkbenchSceneTransitionName = 'workspace-workbench-scene-forward' \| 'workspace-workbench-scene-backward'/, '项目页缺少工作台场景过渡类型')
  assert.match(source, /const WORKBENCH_MODE_ORDER: WorkspaceWorkbenchMode\[\] = \['project', 'defense', 'final_review'\]/, '项目页未固定工作台切换顺序')
  assert.match(source, /const displayedWorkbenchMode = ref<WorkspaceWorkbenchMode>\(workbenchMode\.value\)/, '项目页缺少当前显示中的工作台场景状态')
  assert.match(source, /const workbenchSwitchPhase = ref<WorkbenchSwitchPhase>\('idle'\)/, '项目页缺少工作台切换阶段状态')
  assert.match(source, /const workbenchSwitchTargetMode = ref<WorkspaceWorkbenchMode \| ''>\(''\)/, '项目页缺少工作台切换目标状态')
  assert.match(source, /const workbenchSwitchProgress = ref\(0\)/, '项目页缺少工作台切换本地进度状态')
  assert.match(source, /const workbenchSceneTransitionName = ref<WorkbenchSceneTransitionName>\('workspace-workbench-scene-forward'\)/, '项目页缺少工作台场景方向状态')
  assert.match(source, /function resolveWorkbenchModeOrderIndex\(mode: WorkspaceWorkbenchMode\): number \{[\s\S]*WORKBENCH_MODE_ORDER\.indexOf\(mode\)/, '项目页缺少工作台顺序索引解析')
  assert.match(source, /function resolveWorkbenchSceneTransitionDirection\([\s\S]*return resolveWorkbenchModeOrderIndex\(nextMode\) >= resolveWorkbenchModeOrderIndex\(currentMode\)\s+\? 'workspace-workbench-scene-forward'\s+: 'workspace-workbench-scene-backward'/, '项目页未基于固定顺序推导轮播方向')
})

it('updateWorkbenchMode 先走 WinLoop 加载，再执行整屏场景轮播，并在切换中屏蔽重复请求', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const match = source.match(/async function updateWorkbenchMode\(nextMode: WorkspaceWorkbenchMode\) \{([\s\S]*?)\n\}\n\nfunction updateWorkspaceAiMode/)

  assert.ok(match, '项目页缺少可断言的 updateWorkbenchMode 函数体')
  const body = match[1]

  assert.match(body, /if \(workbenchSwitchPhase\.value !== 'idle'\)\s+return/, '工作台切换中未屏蔽重复请求')
  assert.match(body, /if \(nextMode === workbenchMode\.value\)\s+return/, '工作台切到当前模式时未提前返回')
  assert.match(body, /workbenchSwitchTargetMode\.value = nextMode/, '工作台切换未记录目标模式')
  assert.match(body, /workbenchSceneTransitionName\.value = resolveWorkbenchSceneTransitionDirection\(displayedWorkbenchMode\.value, nextMode\)/, '工作台切换前未先计算轮播方向')
  assert.match(body, /await runWorkbenchSwitchLoadingSequence\(\)/, '工作台切换未先进入 WinLoop 加载阶段')
  assert.match(body, /workbenchSwitchPhase\.value = 'animating'/, '工作台切换未在加载后进入动画阶段')
  assert.match(body, /const sceneTransitionPromise = waitForWorkbenchSceneTransitionEnd\(\)/, '工作台切换未等待场景轮播结束')
  assert.match(body, /displayedWorkbenchMode\.value = nextMode/, '工作台切换未在动画阶段切换渲染场景')
  assert.match(body, /await nextTick\(\)/, '工作台切换未等待场景渲染落地')
  assert.match(body, /await sceneTransitionPromise/, '工作台切换未等待整段轮播完成')
  assert.match(body, /workbenchSwitchPhase\.value = 'idle'/, '工作台切换结束后未恢复 idle')
  assert.match(body, /workbenchSwitchTargetMode\.value = ''/, '工作台切换结束后未清空目标模式')
  assert.match(body, /workbenchSwitchProgress\.value = 0/, '工作台切换结束后未重置本地进度')
  assert.match(source, /const workbenchSwitchLoading = computed\(\(\) => workbenchSwitchPhase\.value === 'loading'\)/, '项目页缺少工作台切换加载态')
  assert.match(source, /const workbenchSwitching = computed\(\(\) => workbenchSwitchPhase\.value !== 'idle'\)/, '项目页缺少工作台切换中态')
  assert.match(source, /watch\(workbenchMode, \(next, previous\) => \{[\s\S]*if \(workbenchSwitchPhase\.value !== 'idle' \|\| workbenchSwitchTargetMode\.value\)\s+return[\s\S]*displayedWorkbenchMode\.value = next/, '项目页未在非切换期回填显示中的工作台场景')
})

it('工作台切换遮罩复用 WorkspaceShellLoadingOverlay，并按固定节奏推进本地 WinLoop 进度', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /async function runWorkbenchSwitchLoadingSequence\(\): Promise<void> \{[\s\S]*workbenchSwitchPhase\.value = 'loading'[\s\S]*workbenchSwitchProgress\.value = 12[\s\S]*await waitForWorkbenchDelay\(90\)[\s\S]*workbenchSwitchProgress\.value = 38[\s\S]*await waitForWorkbenchDelay\(140\)[\s\S]*workbenchSwitchProgress\.value = 72[\s\S]*await waitForWorkbenchDelay\(130\)[\s\S]*workbenchSwitchProgress\.value = 100[\s\S]*await waitForWorkbenchDelay\(60\)/, '工作台切换 WinLoop 进度节奏与方案不一致')
  assert.match(source, /<Transition name="workspace-scene-loading-overlay">[\s\S]*<WorkspaceShellLoadingOverlay[\s\S]*v-if="workbenchSwitchLoading"[\s\S]*:progress="workbenchSwitchProgress"/, '工作台切换未在场景容器内复用 WinLoop 加载遮罩')
  assert.match(source, /function clearWorkbenchSwitchDelays\(\): void \{[\s\S]*activeWorkbenchSwitchDelayIds\.forEach\(timeoutId => clearTimeout\(timeoutId\)\)/, '项目页缺少工作台切换延时清理逻辑')
  assert.match(source, /function waitForWorkbenchDelay\(durationMs: number\): Promise<void> \{/, '项目页缺少工作台切换节奏等待函数')
})

it('轮播只作用于工作台内容区，头部和状态栏固定，且支持 reduced motion 降级', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /<WorkspaceHeader[\s\S]*\/>\s*<section[\s\S]*data-testid="workspace-scene-shell"/, '头部未固定在场景轮播容器外')
  assert.match(source, /<\/section>\s*<WorkspaceStatusBar/, '状态栏未固定在场景轮播容器外')
  assert.match(source, /<Transition[\s\S]*:name="workbenchSceneTransitionName"[\s\S]*mode="out-in"[\s\S]*@after-enter="handleWorkbenchSceneTransitionAfterEnter"/, '工作台场景未接入统一的 out-in 轮播过渡')
  assert.match(source, /class="workspace-workbench-scene workspace-layout flex flex-1 min-h-0 items-stretch overflow-hidden xl:flex-row"/, '研发\/答辩场景根节点未挂上统一轮播类名')
  assert.match(source, /class="workspace-workbench-scene workspace-final-review-shell flex flex-1 min-h-0 overflow-hidden"/, '终审场景根节点未挂上统一轮播类名')
  assert.match(source, /\.workspace-scene-shell\s*\{[\s\S]*isolation:\s*isolate/, '工作台场景壳子缺少隔离层')
  assert.match(source, /\.workspace-workbench-scene-forward-enter-from\s*\{[\s\S]*transform:\s*translateX\(100%\)/, '正向轮播缺少新场景从右侧进入的定义')
  assert.match(source, /\.workspace-workbench-scene-forward-leave-to\s*\{[\s\S]*transform:\s*translateX\(-100%\)/, '正向轮播缺少旧场景向左退出的定义')
  assert.match(source, /\.workspace-workbench-scene-backward-enter-from\s*\{[\s\S]*transform:\s*translateX\(-100%\)/, '反向轮播缺少新场景从左侧进入的定义')
  assert.match(source, /\.workspace-workbench-scene-backward-leave-to\s*\{[\s\S]*transform:\s*translateX\(100%\)/, '反向轮播缺少旧场景向右退出的定义')
  assert.match(source, /\.workspace-workbench-scene-forward-enter-active,[\s\S]*transform 0\.32s cubic-bezier\(0\.22, 1, 0\.36, 1\)/, '轮播过渡时长或 easing 与方案不一致')
  assert.match(source, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*opacity 0\.16s ease,[\s\S]*transform 0\.16s ease[\s\S]*opacity: 0[\s\S]*transform: translateX\(0\)/, '项目页未在 reduced motion 下退化为淡切')
  assert.match(source, /onMounted\(async \(\) => \{[\s\S]*window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/, '项目页未监听 reduced motion 偏好')
  assert.match(source, /if \(reducedMotionMediaQuery\) \{[\s\S]*removeEventListener\('change', handleReducedMotionPreferenceChange\)|removeListener\(handleReducedMotionPreferenceChange\)/, '项目页卸载时未清理 reduced motion 监听')
})
