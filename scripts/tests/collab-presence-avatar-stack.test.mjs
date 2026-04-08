import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const AVATAR_STACK_FILE = resolve(process.cwd(), 'app/components/workspace/collab/CollabPresenceAvatarStack.vue')
const PRESENCE_DOCK_FILE = resolve(process.cwd(), 'app/components/workspace/collab/CollabPresenceDock.vue')
const TLDRAW_CANVAS_FILE = resolve(process.cwd(), 'app/components/workspace/collab/WorkspaceTldrawCanvas.client.vue')
const PRESENCE_HELPER_FILE = resolve(process.cwd(), 'app/components/workspace/collab/presence.ts')
const USE_COLLAB_SESSION_FILE = resolve(process.cwd(), 'app/composables/useCollabSession.ts')
const USE_WORKSPACE_REALTIME_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceRealtime.ts')
const REALTIME_WS_FILE = resolve(process.cwd(), 'server/api/realtime/ws.get.ts')
const REALTIME_HUB_FILE = resolve(process.cwd(), 'server/utils/realtime-hub.ts')
const REALTIME_EVENTS_FILE = resolve(process.cwd(), 'server/utils/realtime-events.ts')
const REALTIME_PG_BUS_FILE = resolve(process.cwd(), 'server/plugins/realtime-pg-bus.ts')

it('draw 协作头部改为右上角头像栈，并复用用户级聚合数据', async () => {
  const projectPageSource = await readFile(PROJECT_PAGE_FILE, 'utf8')
  const panelSource = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')
  const avatarStackSource = await readFile(AVATAR_STACK_FILE, 'utf8')
  const presenceDockSource = await readFile(PRESENCE_DOCK_FILE, 'utf8')
  const presenceHelperSource = await readFile(PRESENCE_HELPER_FILE, 'utf8')

  assert.match(projectPageSource, /:current-user-id="me\?\.user\.id \|\| ''"/, '项目页未向主面板透传当前用户 ID')
  assert.match(projectPageSource, /:current-user-name="me\?\.user\.username \|\| ''"/, '项目页未向主面板透传当前用户名')
  assert.match(projectPageSource, /:collab-markdown-awareness="collabMarkdownAwareness"/, '项目页未向主面板透传 markdown Awareness')
  assert.match(panelSource, /import CollabPresenceAvatarStack from/, '主面板未接入头像栈组件')
  assert.match(panelSource, /import CollabPresenceDock from/, '主面板未接入底部成员栏组件')
  assert.match(panelSource, /const collabPresenceUsers = computed<WorkspaceCollabPresenceUser\[\]>\(\(\) => \{/, '主面板未聚合用户级在线成员数据')
  assert.equal((panelSource.match(/<CollabPresenceAvatarStack\s+:users="collabPresenceUsers"\s*\/>/g) || []).length, 3, 'markdown、流程画布与自由画布未同时接入头像栈组件')
  assert.match(panelSource, /<CollabPresenceDock\s+:users="collabPresenceUsers"\s*\/>/, 'markdown 底部成员栏未接入 Dock 组件')
  assert.doesNotMatch(panelSource, /v-if="hasFlowResource" class="grid grid-cols-1 h-full md:grid-cols-\[1fr,220px\]"/, '流程画布仍保留旧双列在线成员布局')
  assert.doesNotMatch(panelSource, /v-else-if="activePreviewMode === 'draw'"[\s\S]*grid grid-cols-1 h-full md:grid-cols-\[1fr,220px\]/, '自由画布仍保留旧双列在线成员布局')
  assert.doesNotMatch(panelSource, /CollabPresencePanel/, '主面板仍保留旧的右侧在线成员列组件')

  assert.match(avatarStackSource, /data-testid="collab-presence-avatar-stack"/, '头像栈组件缺少稳定测试锚点')
  assert.match(avatarStackSource, /overflowCount = computed\(\(\) => Math\.max\(0, props\.users\.length - visibleUsers\.value\.length\)\)/, '头像栈未处理超出数量折叠')
  assert.match(avatarStackSource, /user\.activityState === 'background' \? 'grayscale\(1\)' : 'none'/, '头像栈未对后台成员做灰化处理')
  assert.match(avatarStackSource, /@mouseenter="openPopover\(user\.userId, \$event\.currentTarget\)"/, '头像栈未改为 hover 打开详情')
  assert.match(avatarStackSource, /<Teleport to="body">/, '头像栈详情层未提升到 body 顶层')
  assert.doesNotMatch(avatarStackSource, /hover:-translate-y-0\.5/, '头像栈仍保留 hover 位移动效')
  assert.doesNotMatch(avatarStackSource, /rounded-full border border-white/, '状态点仍保留白色边框')

  assert.match(presenceDockSource, /data-testid="collab-presence-dock"/, '底部成员栏缺少稳定测试锚点')
  assert.match(presenceDockSource, /当前光标位置、选区范围与文本摘要会随编辑实时同步/, '底部成员栏未展示 markdown 协同说明')
  assert.match(presenceDockSource, /\{\{ selectionRangeText\(user\) \}\}/, '底部成员栏未展示选区范围')
  assert.match(presenceDockSource, /\{\{ selectionPreviewText\(user\) \}\}/, '底部成员栏未展示选中文本摘要')

  assert.match(presenceHelperSource, /export interface WorkspaceCollabPresenceUser \{/, '共享 presence 用户模型缺失')
  assert.match(presenceHelperSource, /selection\?: WorkspaceCollabSelectionSummary \| null/, '共享 presence 用户模型未扩展选区摘要')
  assert.match(presenceHelperSource, /export interface WorkspaceCollabSelectionSummary \{/, '共享选区摘要类型缺失')
  assert.match(presenceHelperSource, /export function resolveWorkspaceCollabPresenceColor/, '共享用户颜色映射缺失')
  assert.match(presenceHelperSource, /return resolveAvatarFallbackValue\(username\)/, '头像 fallback 未复用现有统一规则')
})

it('draw 协作画布展示不同用户的实时彩色鼠标', async () => {
  const projectPageSource = await readFile(PROJECT_PAGE_FILE, 'utf8')
  const panelSource = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')
  const canvasSource = await readFile(TLDRAW_CANVAS_FILE, 'utf8')
  const collabSessionSource = await readFile(USE_COLLAB_SESSION_FILE, 'utf8')
  const presenceHelperSource = await readFile(PRESENCE_HELPER_FILE, 'utf8')

  assert.match(projectPageSource, /collabSession\.updatePresenceCursor\(value\.cursorX, value\.cursorY\)/, '项目页未把画布鼠标事件回传到协作会话')
  assert.equal((panelSource.match(/:remote-cursors="collabPresenceCursors"/g) || []).length, 2, '流程画布与自由画布未同时接入远端鼠标数据')
  assert.equal((panelSource.match(/@update-collab-cursor="onCollabCursorUpdate"/g) || []).length, 2, '主面板未接收画布鼠标更新事件')
  assert.match(panelSource, /const collabPresenceCursors = computed<WorkspaceCollabCursorUser\[\]>\(\(\) => \{/, '主面板未按用户聚合远端鼠标数据')

  assert.match(canvasSource, /import type \{ WorkspaceCollabCursorUser \}/, '画布组件未声明远端鼠标类型')
  assert.match(canvasSource, /editor\.screenToPage\(\{/, '画布组件未将本地鼠标转换到画布世界坐标')
  assert.match(canvasSource, /editor\.pageToScreen\(\{/, '画布组件未将远端鼠标转换回当前视口坐标')
  assert.match(canvasSource, /data-testid="collab-cursor-overlay"/, '画布组件缺少远端鼠标叠层')
  assert.match(canvasSource, /resolveWorkspaceCollabPresenceInitial\(cursor\.username\)/, '远端鼠标未使用统一头像缩写规则')

  assert.match(collabSessionSource, /function updatePresenceCursor\(cursorX\?: number, cursorY\?: number\): void \{/, '协作会话未提供鼠标 presence 更新接口')
  assert.match(collabSessionSource, /input\.workspaceRealtime\.updatePresence\(\{\s+projectId,\s+resourceId,\s+cursorX: pendingCursor\.cursorX,\s+cursorY: pendingCursor\.cursorY,/, '协作会话未把鼠标坐标写入 realtime presence')
  assert.match(presenceHelperSource, /export interface WorkspaceCollabCursorUser \{/, '共享远端鼠标类型缺失')
})

it('presence 通路支持 activityState，并在前端按可见性同步', async () => {
  const collabSessionSource = await readFile(USE_COLLAB_SESSION_FILE, 'utf8')
  const realtimeSource = await readFile(USE_WORKSPACE_REALTIME_FILE, 'utf8')
  const wsSource = await readFile(REALTIME_WS_FILE, 'utf8')
  const hubSource = await readFile(REALTIME_HUB_FILE, 'utf8')
  const eventsSource = await readFile(REALTIME_EVENTS_FILE, 'utf8')
  const pgBusSource = await readFile(REALTIME_PG_BUS_FILE, 'utf8')

  assert.match(collabSessionSource, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/, '协作会话未监听页面可见性变化')
  assert.match(collabSessionSource, /activityState: normalizeWorkspaceCollabPresenceActivityState\(record\.activityState\)/, '协作会话未解析 activityState')
  assert.match(collabSessionSource, /input\.workspaceRealtime\.updatePresence\(\{\s+projectId,\s+resourceId,\s+activityState,\s+\}\)/, '协作会话未回传前后台状态')

  assert.match(realtimeSource, /activityState\?: 'active' \| 'background'/, '前端 realtime 客户端未扩展 activityState 类型')
  assert.match(realtimeSource, /activityState: input\.activityState === 'background' \? 'background' : 'active'/, '前端 realtime 客户端未发送 activityState')

  assert.match(wsSource, /const activityState = normalizeString\(parsedMessage\.payload\?\.activityState\) === 'background'/, 'WS 接口未读取 activityState')
  assert.match(hubSource, /activityState: 'active' \| 'background'/, 'Realtime hub presence 类型未扩展 activityState')
  assert.match(hubSource, /activityState \|\| currentPresence\?\.activityState \|\| 'active'/, 'Realtime hub 未在 presence 更新时保留活动状态')
  assert.match(eventsSource, /activityState: 'active' \| 'background'/, 'Realtime 事件 payload 未扩展 activityState')
  assert.match(pgBusSource, /activityState: normalizeString\(member\.activityState\) === 'background' \? 'background' : 'active'/, 'PG 总线未透传 activityState')
})

it('markdown 协同 presence 通路支持 awareness 快照转发', async () => {
  const collabSessionSource = await readFile(USE_COLLAB_SESSION_FILE, 'utf8')
  const realtimeSource = await readFile(USE_WORKSPACE_REALTIME_FILE, 'utf8')
  const wsSource = await readFile(REALTIME_WS_FILE, 'utf8')
  const hubSource = await readFile(REALTIME_HUB_FILE, 'utf8')
  const eventsSource = await readFile(REALTIME_EVENTS_FILE, 'utf8')
  const pgBusSource = await readFile(REALTIME_PG_BUS_FILE, 'utf8')

  assert.match(collabSessionSource, /const markdownAwareness = computed\(\(\) => \{/, '协作会话未暴露 markdown Awareness')
  assert.match(collabSessionSource, /encodeAwarenessUpdate\(awareness, changedClientIds\)/, '协作会话未编码本地 awareness 更新')
  assert.match(collabSessionSource, /applyAwarenessUpdate\(awareness, awarenessUpdate, 'remote-snapshot'\)/, '协作会话未应用远端 awareness 快照')
  assert.match(collabSessionSource, /removeAwarenessStates\(awareness, staleClientIds, 'remote-snapshot'\)/, '协作会话未清理离线成员 awareness')

  assert.match(realtimeSource, /awarenessClientId\?: number/, '前端 realtime 客户端未扩展 awarenessClientId')
  assert.match(realtimeSource, /awarenessUpdateBase64\?: string/, '前端 realtime 客户端未扩展 awarenessUpdateBase64')
  assert.match(realtimeSource, /awarenessUpdateBase64: normalizeString\(input\.awarenessUpdateBase64\) \|\| undefined/, '前端 realtime 客户端未发送 awareness 快照')

  assert.match(wsSource, /const awarenessClientId = Number\(parsedMessage\.payload\?\.awarenessClientId\)/, 'WS 接口未读取 awarenessClientId')
  assert.match(wsSource, /const awarenessUpdateBase64 = normalizeString\(parsedMessage\.payload\?\.awarenessUpdateBase64\)/, 'WS 接口未读取 awarenessUpdateBase64')
  assert.match(hubSource, /awarenessClientId\?: number/, 'Realtime hub presence 类型未扩展 awarenessClientId')
  assert.match(hubSource, /awarenessUpdateBase64\?: string/, 'Realtime hub presence 类型未扩展 awarenessUpdateBase64')
  assert.match(eventsSource, /awarenessClientId\?: number/, 'Realtime 事件 payload 未扩展 awarenessClientId')
  assert.match(eventsSource, /awarenessUpdateBase64\?: string/, 'Realtime 事件 payload 未扩展 awarenessUpdateBase64')
  assert.match(pgBusSource, /awarenessUpdateBase64: normalizeString\(member\.awarenessUpdateBase64\) \|\| undefined/, 'PG 总线未透传 awareness 快照')
})
