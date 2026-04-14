import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const DESIGN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDesignPanel.vue')
const DESIGN_STAGE_FILE = resolve(process.cwd(), 'app/components/workspace/design/WorkspaceDesignStage.vue')
const DESIGN_CANVAS_FILE = resolve(process.cwd(), 'app/components/workspace/design/WorkspaceDesignCanvas.client.vue')

it('设计画布已接入协作光标且缩放不再写回共享视口', async () => {
  const [mainPanelSource, designPanelSource, designStageSource, designCanvasSource] = await Promise.all([
    readFile(MAIN_PANEL_FILE, 'utf8'),
    readFile(DESIGN_PANEL_FILE, 'utf8'),
    readFile(DESIGN_STAGE_FILE, 'utf8'),
    readFile(DESIGN_CANVAS_FILE, 'utf8'),
  ])

  const designPanelTag = mainPanelSource.match(/<WorkspaceDesignPanel[\s\S]*?\/>/)?.[0] || ''
  assert.match(designPanelTag, /v-else-if="activeTabId === 'design'"/)
  assert.match(designPanelTag, /:collab-presence-cursors="collabPresenceCursors"/)
  assert.match(designPanelTag, /@update-collab-cursor="onCollabCursorUpdate"/)

  assert.match(designPanelSource, /collabPresenceCursors\?: WorkspaceCollabCursorUser\[\]/)
  assert.match(designPanelSource, /updateCollabCursor: \[value: \{ cursorX\?: number, cursorY\?: number \}\]/)
  assert.match(designPanelSource, /:remote-cursors="props\.collabPresenceCursors"/)
  assert.match(designPanelSource, /:viewport-x="stageViewportX"/)
  assert.match(designPanelSource, /:viewport-y="stageViewportY"/)
  assert.match(designPanelSource, /@update-collab-cursor="emit\('updateCollabCursor', \$event\)"/)
  assert.doesNotMatch(designPanelSource, /@update-page-viewport="updateCurrentPageViewport"/)

  assert.match(designStageSource, /remoteCursors\?: WorkspaceCollabCursorUser\[\]/)
  assert.match(designStageSource, /:remote-cursors="props\.remoteCursors"/)
  assert.match(designStageSource, /:viewport-x="props\.viewportX"/)
  assert.match(designStageSource, /:viewport-y="props\.viewportY"/)
  assert.match(designStageSource, /@update-collab-cursor="emit\('updateCollabCursor', \$event\)"/)

  assert.match(designCanvasSource, /remoteCursors\?: WorkspaceCollabCursorUser\[\]/)
  assert.match(designCanvasSource, /const remoteScreenCursors = computed<ScreenCursor/)
  assert.match(designCanvasSource, /resolveWorkspaceCollabPresenceInitial/)
  assert.match(designCanvasSource, /CURSOR_LABEL_COLLAPSE_DISTANCE = 72/)
  assert.match(
    designCanvasSource,
    /label:\s*isNearLocalPointer \|\| isNearAnotherCursor\s*\?\s*resolveWorkspaceCollabPresenceInitial\(cursor\.username\)\s*:\s*cursor\.username/,
  )
  assert.match(designCanvasSource, /\{\{ cursor\.label \}\}/)
  assert.match(designCanvasSource, /data-testid="workspace-design-collab-cursor-overlay"/)
  assert.match(designCanvasSource, /emit\("updateCollabCursor", \{/)
  assert.doesNotMatch(designCanvasSource, /emit\('update-page-viewport'/)
})
