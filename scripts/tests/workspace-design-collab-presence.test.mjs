import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const DESIGN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDesignPanel.vue')
const DESIGN_CANVASKIT_BRIDGE_FILE = resolve(process.cwd(), 'app/components/workspace/design/WorkspaceDesignCanvasKitBridge.client.vue')
const DESIGN_CANVASKIT_HOST_FILE = resolve(process.cwd(), 'app/components/workspace/design/WorkspaceDesignCanvasKitHost.client.vue')

it('设计画布已接入协作光标且缩放不再写回共享视口', async () => {
  const [mainPanelSource, designPanelSource, bridgeSource, hostSource] = await Promise.all([
    readFile(MAIN_PANEL_FILE, 'utf8'),
    readFile(DESIGN_PANEL_FILE, 'utf8'),
    readFile(DESIGN_CANVASKIT_BRIDGE_FILE, 'utf8'),
    readFile(DESIGN_CANVASKIT_HOST_FILE, 'utf8'),
  ])

  const designPanelTag = mainPanelSource.match(/<WorkspaceDesignPanel[\s\S]*?\/>/)?.[0] || ''
  assert.match(designPanelTag, /v-else-if="isActiveDesignResource"/)
  assert.match(designPanelTag, /:design-resource-id="activeDesignResourceId"/)
  assert.match(designPanelTag, /:collab-presence-cursors="collabPresenceCursors"/)
  assert.match(designPanelTag, /@update-collab-cursor="onCollabCursorUpdate"/)

  assert.match(designPanelSource, /collabPresenceCursors\?: WorkspaceCollabCursorUser\[\]/)
  assert.match(designPanelSource, /updateCollabCursor: \[value: \{ cursorX\?: number, cursorY\?: number \}\]/)
  assert.match(designPanelSource, /:remote-cursors="props\.collabPresenceCursors"/)
  assert.match(designPanelSource, /:viewport-x="stageViewportX"/)
  assert.match(designPanelSource, /:viewport-y="stageViewportY"/)
  assert.match(designPanelSource, /@update-collab-cursor="emit\('updateCollabCursor', \$event\)"/)
  assert.doesNotMatch(designPanelSource, /@update-page-viewport="updateCurrentPageViewport"/)

  assert.match(bridgeSource, /remoteCursors\?: WorkspaceCollabCursorUser\[\]/)
  assert.match(bridgeSource, /:remote-cursors="props\.remoteCursors"/)
  assert.match(bridgeSource, /:viewport-x="props\.viewportX"/)
  assert.match(bridgeSource, /:viewport-y="props\.viewportY"/)
  assert.match(bridgeSource, /@update-collab-cursor="emit\('updateCollabCursor', \$event\)"/)

  assert.match(hostSource, /remoteCursors\?: WorkspaceCollabCursorUser\[\]/)
  assert.match(hostSource, /const remoteScreenCursors = computed<RemoteScreenCursor/)
  assert.match(hostSource, /resolveWorkspaceCollabPresenceInitial/)
  assert.match(hostSource, /CURSOR_LABEL_COLLAPSE_DISTANCE = 72/)
  assert.match(
    hostSource,
    /label:\s*isNearLocalPointer \|\| isNearAnotherCursor\s*\?\s*resolveWorkspaceCollabPresenceInitial\(cursor\.username\)\s*:\s*cursor\.username/,
  )
  assert.match(hostSource, /<WorkspaceDesignCanvasCollabOverlay :cursors="remoteScreenCursors" \/>/)
  assert.match(hostSource, /emit\('updateCollabCursor', \{/)
  assert.doesNotMatch(hostSource, /emit\('update-page-viewport'/)
})
