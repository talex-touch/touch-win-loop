import { expect, request as playwrightRequest, test } from '@playwright/test'

const BASE_URL = String(process.env.E2E_BASE_URL || 'http://127.0.0.1:4010').trim()
const DEFAULT_DRAWIO_EMBED_BASE_URL = 'https://embed.diagrams.net'

function resolveDrawioTestEmbedBaseUrl(value) {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue)
    return DEFAULT_DRAWIO_EMBED_BASE_URL

  try {
    const url = new URL(normalizedValue)
    url.search = ''
    url.hash = ''
    return url.toString()
  }
  catch {
    return DEFAULT_DRAWIO_EMBED_BASE_URL
  }
}

const DRAWIO_EMBED_BASE_URL = resolveDrawioTestEmbedBaseUrl(process.env.WINLOOP_PUBLIC_DRAWIO_EMBED_BASE_URL)
const DRAWIO_EMBED_ROUTE_PREFIX = (() => {
  const url = new URL(DRAWIO_EMBED_BASE_URL)
  return `${url.origin}${url.pathname}`
})()

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function routePattern(path) {
  return new RegExp(`${escapeRegExp(path)}(?:\\?.*)?$`)
}

function createSeed() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function createCredentials(prefix, seed) {
  const normalizedPrefix = String(prefix || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 12) || 'user'
  const username = `${normalizedPrefix}_${seed}`.slice(0, 30)
  return {
    username,
    password: `Pw_${seed}_123456`,
  }
}

async function readApiPayload(response, label) {
  const text = await response.text()
  let payload = null

  try {
    payload = JSON.parse(text)
  }
  catch {
    throw new Error(`${label} 返回了非 JSON 响应：${text.slice(0, 500)}`)
  }

  return {
    payload,
    text,
  }
}

async function expectApiSuccess(response, label) {
  const { payload, text } = await readApiPayload(response, label)
  expect(response.ok(), `${label} 失败：HTTP ${response.status()} ${text}`).toBeTruthy()
  expect(payload?.code, `${label} 失败：${text}`).toBe(0)
  return payload.data
}

async function createApiSession(credentials) {
  const api = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      accept: 'application/json',
    },
  })

  const auth = await expectApiSuccess(
    await api.post('/api/auth/login', {
      data: credentials,
    }),
    `登录用户 ${credentials.username}`,
  )

  return {
    api,
    auth,
  }
}

function getPersonalWorkspaceId(authPayload) {
  const workspaces = Array.isArray(authPayload?.workspaces) ? authPayload.workspaces : []
  const ownerUserId = String(authPayload?.user?.id || '').trim()

  const personal = workspaces.find(item => item?.workspace?.type === 'personal' && item?.workspace?.ownerUserId === ownerUserId)
  if (personal?.workspace?.id)
    return String(personal.workspace.id)

  return String(workspaces[0]?.workspace?.id || '')
}

async function apiPost(api, path, data, label) {
  return expectApiSuccess(
    await api.post(path, { data }),
    label,
  )
}

async function apiGet(api, path, label) {
  return expectApiSuccess(
    await api.get(path),
    label,
  )
}

async function loginViaUi(browser, credentials, redirect = '/team', options = {}) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
  })
  if (typeof options.setupContext === 'function')
    await options.setupContext(context)
  const page = await context.newPage()

  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`)
  await expect(page.getByTestId('login-page')).toBeVisible()
  await page.getByTestId('login-username-input').fill(credentials.username)
  await page.getByTestId('login-password-input').fill(credentials.password)

  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/login')),
    page.getByTestId('login-submit-button').click(),
  ])

  return {
    context,
    page,
  }
}

function projectCard(page, projectId) {
  return page.locator(`[data-testid="team-project-card"][data-project-id="${projectId}"]`)
}

function projectMemberRow(page, username) {
  return page.locator(`[data-testid="project-member-item"][data-username="${username}"]`)
}

async function openProjectCollab(page) {
  await page.getByTestId('workspace-left-rail-member-management-button').click()
  await expect(page.getByTestId('project-collab-panel')).toBeVisible()
}

async function createInviteFromProjectUi(page, inviteeUsername, role = 'viewer') {
  await openProjectCollab(page)
  await page.getByTestId('project-collab-open-invite-button').click()

  const usernameInput = page.getByTestId('project-invite-username-input')
  await expect(usernameInput).toBeVisible()
  await usernameInput.fill(inviteeUsername)
  await page.getByTestId('project-invite-role-select').selectOption(role)
  await page.getByTestId('project-invite-expiry-select').selectOption('7')
  await page.getByTestId('project-invite-submit-button').click()

  const linkNode = page.getByTestId('project-invite-link')
  await expect(linkNode).toBeVisible()

  const inviteUrl = String(await linkNode.textContent() || '').trim()
  expect(inviteUrl, '邀请链接未生成').toContain('/invite/')
  return new URL(inviteUrl, BASE_URL).pathname
}

async function createWorkflowCanvas(api, projectId, title) {
  return apiPost(api, `/api/projects/${projectId}/resources/collab`, {
    kind: 'draw',
    purpose: 'workflow',
    ensurePrimary: true,
    title,
  }, '创建流程画布')
}

function buildOkResponse(data) {
  return {
    code: 0,
    data,
  }
}

function createAiFeatureStatus(configured = true) {
  return {
    configured,
    provider: configured ? 'openai-compatible' : 'unconfigured',
    model: configured ? 'gpt-4o-mini' : '',
    reason: configured ? '' : 'AI 未配置',
  }
}

function createMockAiRuntimeStatus() {
  return {
    workspaceDialogAsk: createAiFeatureStatus(true),
    workspaceAutoOptimize: createAiFeatureStatus(true),
    workspaceIssueDiscovery: createAiFeatureStatus(true),
    documentAssist: createAiFeatureStatus(true),
    documentSummarize: createAiFeatureStatus(true),
    documentRewrite: createAiFeatureStatus(true),
    documentContinue: createAiFeatureStatus(true),
    documentExpand: createAiFeatureStatus(true),
    documentCompleteContext: createAiFeatureStatus(true),
    documentRestructure: createAiFeatureStatus(true),
    canvasGenerate: createAiFeatureStatus(true),
    canvasComplete: createAiFeatureStatus(true),
    canvasRefine: createAiFeatureStatus(true),
    defense: createAiFeatureStatus(true),
    contestFilter: createAiFeatureStatus(true),
    topicProposal: createAiFeatureStatus(true),
    projectChat: createAiFeatureStatus(true),
  }
}

function buildDrawioVertexCell(id, label, x, y, width = 220, height = 72) {
  return [
    `<mxCell id="${id}" value="${label}" style="rounded=1;whiteSpace=wrap;html=1;fontSize=14;fontColor=#0f172a;fillColor=#ffffff;strokeColor=#cbd5e1;strokeWidth=1.5;" vertex="1" parent="1">`,
    `<mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />`,
    '</mxCell>',
  ].join('')
}

function buildDrawioEdgeCell(id, source, target, label = '') {
  return [
    `<mxCell id="${id}" value="${label}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;dashed=0;strokeColor=#64748b;strokeWidth=1.5;endArrow=block;endFill=1;" edge="1" parent="1" source="${source}" target="${target}">`,
    '<mxGeometry relative="1" as="geometry" />',
    '</mxCell>',
  ].join('')
}

function buildDrawioDiagram(name, cells, id = `diagram-${name}`) {
  return [
    `<diagram id="${id}" name="${name}">`,
    '<mxGraphModel dx="1440" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1440" pageHeight="900" math="0" shadow="0">',
    '<root>',
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    ...cells,
    '</root>',
    '</mxGraphModel>',
    '</diagram>',
  ].join('')
}

function buildDrawioFile(diagrams) {
  return [
    '<mxfile host="https://embed.diagrams.net" modified="2026-04-17T00:00:00.000Z" agent="WinLoop" version="26.0.11" type="embed" compressed="false">',
    ...diagrams,
    '</mxfile>',
  ].join('')
}

function createSinglePageWorkflowXml(labels = ['流程开始', '人工确认']) {
  const cells = [
    buildDrawioVertexCell('start-node', labels[0], 160, 120),
  ]

  if (labels[1]) {
    cells.push(buildDrawioVertexCell('review-node', labels[1], 460, 120))
    cells.push(buildDrawioEdgeCell('edge-1', 'start-node', 'review-node', '进入确认'))
  }

  if (labels[2]) {
    cells.push(buildDrawioVertexCell('archive-node', labels[2], 760, 120))
    cells.push(buildDrawioEdgeCell('edge-2', 'review-node', 'archive-node', '归档'))
  }

  return buildDrawioFile([
    buildDrawioDiagram('流程画布', cells, 'workflow-page-1'),
  ])
}

function createMultiPageWorkflowXml() {
  return buildDrawioFile([
    buildDrawioDiagram('流程画布', [
      buildDrawioVertexCell('page-1-start', '主流程', 160, 120),
      buildDrawioVertexCell('page-1-review', '主流程确认', 460, 120),
      buildDrawioEdgeCell('page-1-edge', 'page-1-start', 'page-1-review', '主链路'),
    ], 'workflow-page-1'),
    buildDrawioDiagram('补充分支', [
      buildDrawioVertexCell('page-2-start', '支线开始', 160, 120),
      buildDrawioVertexCell('page-2-end', '支线结束', 460, 120),
      buildDrawioEdgeCell('page-2-edge', 'page-2-start', 'page-2-end', '支线'),
    ], 'workflow-page-2'),
  ])
}

function buildWorkflowDraftSource(template) {
  if (template === 'mindmap') {
    return {
      sourceFormat: 'markdown_outline',
      sourceText: [
        '- AgentProto 流程梳理',
        '  - AI 草案生成',
        '  - 人工确认',
        '  - 发布实施',
      ].join('\n'),
    }
  }

  if (template === 'er') {
    return {
      sourceFormat: 'ddl',
      sourceText: [
        'CREATE TABLE workflow_stage (',
        '  id BIGINT PRIMARY KEY,',
        '  name VARCHAR(64) NOT NULL',
        ');',
      ].join('\n'),
    }
  }

  if (template === 'architecture') {
    return {
      sourceFormat: 'architecture',
      sourceText: JSON.stringify({
        nodes: [
          { id: 'system', label: 'AgentProto 系统', type: 'system' },
          { id: 'review', label: '人工确认', type: 'container' },
        ],
        edges: [
          { source: 'system', target: 'review', label: '草案评审' },
        ],
      }),
    }
  }

  return {
    sourceFormat: 'mermaid',
    sourceText: [
      'flowchart LR',
      '  A[AI 草案生成] --> B[人工确认]',
      '  B --> C[发布实施]',
    ].join('\n'),
  }
}

function buildWorkspaceSseResponse(result) {
  const progressEvent = JSON.stringify({
    event: 'progress',
    data: {
      message: 'AgentProto 正在整理流程草案...',
      sessionId: result.sessionId,
    },
  })
  const doneEvent = JSON.stringify({
    event: 'done',
    data: {
      result,
    },
  })

  return [
    'event: progress',
    `data: ${progressEvent}`,
    '',
    'event: done',
    `data: ${doneEvent}`,
    '',
  ].join('\n')
}

function createDrawioStubHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>draw.io stub</title>
  </head>
  <body>
    <script>
      (() => {
        const state = {
          latestLoadPayload: null,
          loadHistory: [],
        }

        function parsePayload(raw) {
          try {
            return typeof raw === 'string' ? JSON.parse(raw) : raw
          }
          catch {
            return null
          }
        }

        window.addEventListener('message', (event) => {
          const payload = parsePayload(event.data)
          if (!payload || typeof payload !== 'object')
            return
          if (payload.action === 'load') {
            state.latestLoadPayload = payload
            state.loadHistory.push(payload)
          }
        })

        window.__emitDrawioEvent = (eventType, xml = '') => {
          const payload = { event: String(eventType || '') }
          if (xml)
            payload.xml = xml
          window.parent.postMessage(JSON.stringify(payload), '*')
        }

        window.__getLatestLoadPayload = () => state.latestLoadPayload
        window.__getLoadHistory = () => state.loadHistory.slice()

        window.setTimeout(() => {
          window.__emitDrawioEvent('init')
        }, 0)
      })()
    </script>
  </body>
</html>`
}

async function installWorkflowBrowserMocks(context) {
  const chatSessions = []
  const chatMessagesBySession = new Map()
  let sessionSequence = 0
  let messageSequence = 0
  let workflowDraftSequence = 0

  function createSession(payload = {}) {
    sessionSequence += 1
    const now = new Date().toISOString()
    const teamId = String(payload.teamId || payload.workspaceId || '')
    const workspaceId = String(payload.workspaceId || teamId || '')
    const session = {
      teamId,
      workspaceId,
      id: `workflow-session-${sessionSequence}`,
      projectId: String(payload.projectId || ''),
      mode: String(payload.mode || 'dialog_ask'),
      createdByUserId: 'e2e-user',
      title: String(payload.title || 'AgentProto 会话'),
      contestId: String(payload.contestId || ''),
      trackId: String(payload.trackId || ''),
      major: String(payload.major || ''),
      messageCount: 0,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    }
    chatSessions.unshift(session)
    chatMessagesBySession.set(session.id, [])
    return session
  }

  function appendSessionMessage(sessionId, role, content, metadata) {
    const session = chatSessions.find(item => item.id === sessionId)
    if (!session)
      return

    const nextMessages = chatMessagesBySession.get(sessionId) || []
    messageSequence += 1
    const createdAt = new Date().toISOString()
    nextMessages.push({
      id: `workflow-message-${messageSequence}`,
      sessionId,
      role,
      content,
      provider: 'unconfigured',
      model: '',
      fallbackUsed: false,
      metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
      createdByUserId: 'e2e-user',
      createdAt,
    })
    chatMessagesBySession.set(sessionId, nextMessages)
    session.messageCount = nextMessages.length
    session.lastMessageAt = createdAt
    session.updatedAt = createdAt
  }

  await context.route(new RegExp(`${escapeRegExp(DRAWIO_EMBED_ROUTE_PREFIX)}(?:\\?.*)?$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: createDrawioStubHtml(),
    })
  })

  await context.route(new RegExp(`${escapeRegExp(BASE_URL)}/api/user/ai/runtime(?:\\?.*)?$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(buildOkResponse(createMockAiRuntimeStatus())),
    })
  })

  await context.route(new RegExp(`${escapeRegExp(BASE_URL)}/api/teams/[^/]+/chat/sessions(?:\\?.*)?$`), async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const workspaceId = String(request.url().match(/\/api\/teams\/([^/]+)\/chat\/sessions/)?.[1] || '')
      const payload = {
        ...(request.postDataJSON() || {}),
        teamId: workspaceId,
        workspaceId,
      }
      const session = createSession(payload)
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(buildOkResponse(session)),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(buildOkResponse(chatSessions)),
    })
  })

  await context.route(new RegExp(`${escapeRegExp(BASE_URL)}/api/teams/[^/]+/chat/sessions/[^/]+/messages(?:\\?.*)?$`), async (route) => {
    const match = route.request().url().match(/\/chat\/sessions\/([^/]+)\/messages/)
    const sessionId = String(match?.[1] || '')
    const session = chatSessions.find(item => item.id === sessionId) || null
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(buildOkResponse({
        session,
        messages: chatMessagesBySession.get(sessionId) || [],
      })),
    })
  })

  await context.route(new RegExp(`${escapeRegExp(BASE_URL)}/api/ai/workspace/stream(?:\\?.*)?$`), async (route) => {
    const request = route.request()
    const requestBody = request.postDataJSON()
    let sessionId = String(requestBody.sessionId || chatSessions[0]?.id || '')
    if (!sessionId) {
      const session = createSession({
        teamId: requestBody.teamId || requestBody.context?.teamId,
        workspaceId: requestBody.workspaceId || requestBody.context?.workspaceId,
        projectId: requestBody.projectId || requestBody.context?.projectId,
        mode: requestBody.mode || 'dialog_ask',
        title: 'AgentProto 会话',
      })
      sessionId = session.id
    }
    const latestUserMessage = [...(requestBody.messages || [])]
      .reverse()
      .find(message => message?.role === 'user')
    const template = String(requestBody.context?.workflowTemplate || 'flowchart')
    const source = buildWorkflowDraftSource(template)
    workflowDraftSequence += 1

    const workflowDraft = {
      action: String(requestBody.context?.workflowAction || 'generate'),
      title: `AgentProto 流程草案 ${workflowDraftSequence}`,
      summary: '生成一版待确认的流程草案。',
      resourceId: String(requestBody.context?.resourceId || ''),
      resourceTitle: String(requestBody.context?.resourceTitle || ''),
      template,
      sourceFormat: source.sourceFormat,
      sourceText: source.sourceText,
      architectureView: template === 'architecture'
        ? String(requestBody.context?.workflowArchitectureView || 'system_context')
        : null,
      stylePreset: String(requestBody.context?.workflowStylePreset || 'default'),
      layoutPreset: String(requestBody.context?.workflowLayoutPreset || 'left_to_right'),
      baseWorkflowHash: String(requestBody.context?.workflowSnapshot?.hash || ''),
    }

    if (sessionId) {
      appendSessionMessage(sessionId, 'user', String(latestUserMessage?.content || '请生成流程草案。'))
      appendSessionMessage(sessionId, 'assistant', '已生成待确认的流程草案，请先预览后再决定是否应用。', {
        workflowDraft,
      })
    }

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
      },
      body: buildWorkspaceSseResponse({
        sessionId,
        assistantReply: '已生成待确认的流程草案，请先预览后再决定是否应用。',
        workflowDraft,
      }),
    })
  })

  return {
    chatSessions,
    chatMessagesBySession,
  }
}

async function waitForDrawioFrame(page) {
  await expect.poll(() => {
    return page.frames().some(frame => frame.url().startsWith(DRAWIO_EMBED_ROUTE_PREFIX))
  }).toBe(true)

  const frame = page.frames().find(item => item.url().startsWith(DRAWIO_EMBED_ROUTE_PREFIX))
  expect(frame, '未找到 draw.io iframe').toBeTruthy()
  return frame
}

async function waitForDrawioLoad(frame) {
  await expect.poll(async () => {
    return await frame.evaluate(() => {
      return Number(window.__getLoadHistory?.().length || 0)
    })
  }).toBeGreaterThan(0)
}

test.use({
  baseURL: BASE_URL,
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
})

test.describe('Team -> Project E2E smoke', () => {
  test.setTimeout(240000)

  test('主链路与 personal 规则 smoke', async ({ browser }) => {
    const seed = createSeed()
    const contexts = []
    const apiContexts = []

    try {
      const teamOwner = createCredentials('teamowner', seed)
      const teamInvitee = createCredentials('teaminvitee', seed)
      const personalOwner = createCredentials('personalowner', seed)
      const personalInvitee = createCredentials('personalmate', seed)
      const personalOverflow = createCredentials('personalover', seed)

      const teamOwnerSession = await createApiSession(teamOwner)
      apiContexts.push(teamOwnerSession.api)

      const teamPayload = await apiPost(teamOwnerSession.api, '/api/teams', {
        name: `E2E Team ${seed}`,
      }, '创建 Team')
      const teamId = String(teamPayload?.team?.id || '').trim()
      expect(teamId).not.toBe('')

      const teamProject = await apiPost(teamOwnerSession.api, '/api/projects/quick', {
        teamId,
        workspaceId: teamId,
        title: `E2E Team Project ${seed}`,
        summary: '用于 Team -> Project E2E smoke 的共享项目。',
      }, '创建 Team 项目')
      const teamProjectId = String(teamProject?.id || '').trim()
      expect(teamProjectId).not.toBe('')

      const teamInviteeSession = await createApiSession(teamInvitee)
      apiContexts.push(teamInviteeSession.api)

      const teamInvite = await apiPost(teamOwnerSession.api, `/api/teams/${teamId}/invitations`, {
        inviteeUsername: teamInvitee.username,
        role: 'member',
      }, '创建 Team 邀请')

      const teamInviteeUi = await loginViaUi(browser, teamInvitee, '/team')
      contexts.push(teamInviteeUi.context)

      await test.step('登录后 /dashboard 显示纯 Loopy 首页，且不展示悬浮入口', async () => {
        await teamInviteeUi.page.goto('/dashboard')
        await expect(teamInviteeUi.page.getByTestId('dashboard-loopy-home')).toBeVisible()
        await expect(teamInviteeUi.page.getByTestId('dashboard-loopy-session-list')).toBeVisible()
        await expect(teamInviteeUi.page.getByTestId('dashboard-loopy-messages')).toBeVisible()
        await expect(teamInviteeUi.page.getByTestId('loopy-floating-trigger')).toBeHidden()
      })

      await test.step('接受 Team 邀请后进入 dashboard，未分配项目不可见', async () => {
        await teamInviteeUi.page.goto(`/invite/${teamInvite.token}`)
        await expect(teamInviteeUi.page).toHaveURL(routePattern(`/team/${teamId}`))
        await expect(teamInviteeUi.page.getByTestId('team-dashboard-notice')).toContainText('已加入当前 Team')
        await expect(teamInviteeUi.page.getByTestId('team-dashboard-integrated-panels')).toBeVisible()
        await expect(teamInviteeUi.page.getByTestId('loopy-floating-trigger')).toBeVisible()
        await expect(projectCard(teamInviteeUi.page, teamProjectId)).toHaveCount(0)

        await teamInviteeUi.page.goto(`/projects/${teamProjectId}`)
        await expect(teamInviteeUi.page.getByText('项目不存在或加载失败。')).toBeVisible()
      })

      await test.step('dashboard 与悬浮 Loopy 共享同一批 workspace 级会话', async () => {
        await teamInviteeUi.page.goto('/dashboard')
        await expect(teamInviteeUi.page.getByTestId('dashboard-loopy-session-list')).toBeVisible()
        await teamInviteeUi.page.locator('[data-testid="dashboard-loopy-sidebar"] button').click()
        await expect(teamInviteeUi.page.locator('[data-testid="dashboard-loopy-session-list"] button').first()).toContainText('新对话')

        await teamInviteeUi.page.goto(`/team/${teamId}`)
        await teamInviteeUi.page.getByTestId('loopy-floating-trigger').click()
        await expect(teamInviteeUi.page.getByTestId('loopy-floating-panel')).toBeVisible()
        await expect(teamInviteeUi.page.locator('[data-testid="loopy-floating-panel"] select')).toContainText('新对话')
      })

      const teamProjectInvite = await apiPost(teamOwnerSession.api, `/api/projects/${teamProjectId}/invitations`, {
        inviteeUsername: teamInvitee.username,
        projectRole: 'viewer',
      }, '创建 Team 项目邀请')

      await test.step('接受项目邀请后进入项目工作区，并能从 /projects/:id 跳转进入', async () => {
        await teamInviteeUi.page.goto(`/invite/${teamProjectInvite.token}`)
        await expect(teamInviteeUi.page).toHaveURL(routePattern(`/team/${teamId}/project/${teamProjectId}`))
        await expect(teamInviteeUi.page.getByTestId('workspace-left-rail-member-management-button')).toBeVisible()
        await expect(teamInviteeUi.page.getByTestId('loopy-floating-trigger')).toBeHidden()

        await teamInviteeUi.page.goto(`/projects/${teamProjectId}`)
        await expect(teamInviteeUi.page).toHaveURL(routePattern(`/team/${teamId}/project/${teamProjectId}`))

        await teamInviteeUi.page.goto(`/team/${teamId}`)
        await expect(projectCard(teamInviteeUi.page, teamProjectId)).toHaveCount(1)
      })

      await test.step('/workspace* 全部直接 404', async () => {
        await teamInviteeUi.page.goto('/workspace')
        await expect(teamInviteeUi.page.getByText('旧的 /workspace 入口已下线，请改用 /team。')).toBeVisible()

        await teamInviteeUi.page.goto(`/workspace/${teamId}`)
        await expect(teamInviteeUi.page.getByText('旧的 /workspace/:workspaceId 入口已下线，请改用 /team/:teamId。')).toBeVisible()

        await teamInviteeUi.page.goto(`/workspace/${teamId}/project/${teamProjectId}`)
        await expect(teamInviteeUi.page.getByText('旧的 /workspace/:workspaceId/project/:projectId 入口已下线，请改用 /team/:teamId/project/:projectId。')).toBeVisible()
      })

      const teamOwnerUi = await loginViaUi(browser, teamOwner, `/team/${teamId}/project/${teamProjectId}`)
      contexts.push(teamOwnerUi.context)

      await test.step('项目成员角色修改与移除会同步影响项目可见性', async () => {
        await expect(teamOwnerUi.page).toHaveURL(routePattern(`/team/${teamId}/project/${teamProjectId}`))
        await openProjectCollab(teamOwnerUi.page)

        const inviteeRow = projectMemberRow(teamOwnerUi.page, teamInvitee.username)
        await expect(inviteeRow).toBeVisible()
        await inviteeRow.getByTestId('project-member-role-select').selectOption('editor')
        await inviteeRow.getByTestId('project-member-role-update-button').click()
        await expect(inviteeRow.getByTestId('project-member-role-summary')).toHaveText('编辑者')

        await inviteeRow.getByTestId('project-member-remove-button').click()
        await expect(inviteeRow).toHaveCount(0)

        await teamInviteeUi.page.goto(`/team/${teamId}`)
        await expect(projectCard(teamInviteeUi.page, teamProjectId)).toHaveCount(0)
      })

      await test.step('Team 创建弹窗支持仅创建且停留在当前 Team 页', async () => {
        const stayCreateTitle = `Team Stay ${seed}`
        await teamOwnerUi.page.goto(`/team/${teamId}`)

        const createButton = teamOwnerUi.page.getByTestId('team-dashboard-create-project-button')
        await expect(createButton).toBeEnabled()
        await createButton.click()

        await expect(teamOwnerUi.page.getByTestId('team-create-project-dialog')).toBeVisible()
        await teamOwnerUi.page.getByTestId('team-create-project-title-input').fill(stayCreateTitle)
        await teamOwnerUi.page.getByTestId('team-create-project-summary-input').fill('用于验证仅创建后停留在当前 Team 页。')
        await teamOwnerUi.page.getByTestId('team-create-project-next-step-button').click()
        await teamOwnerUi.page.getByTestId('team-create-project-stay-submit-button').click()

        await expect(teamOwnerUi.page).toHaveURL(routePattern(`/team/${teamId}`))
        await expect(teamOwnerUi.page.getByTestId('team-create-project-dialog')).toBeHidden()
        await expect(teamOwnerUi.page.getByText(stayCreateTitle)).toBeVisible()
      })

      const personalOwnerSession = await createApiSession(personalOwner)
      apiContexts.push(personalOwnerSession.api)
      const personalWorkspaceId = getPersonalWorkspaceId(personalOwnerSession.auth)
      expect(personalWorkspaceId).not.toBe('')

      const personalCoreProject = await apiPost(personalOwnerSession.api, '/api/projects/quick', {
        teamId: personalWorkspaceId,
        workspaceId: personalWorkspaceId,
        title: `Personal Core ${seed}`,
        summary: '用于 personal 邀请与 seat smoke 的核心项目。',
      }, '创建 personal 核心项目')
      const personalCoreProjectId = String(personalCoreProject?.id || '').trim()
      expect(personalCoreProjectId).not.toBe('')

      const personalInviteeSession = await createApiSession(personalInvitee)
      apiContexts.push(personalInviteeSession.api)

      const personalOverflowSession = await createApiSession(personalOverflow)
      apiContexts.push(personalOverflowSession.api)

      const personalOwnerUi = await loginViaUi(browser, personalOwner, `/team/${personalWorkspaceId}`)
      contexts.push(personalOwnerUi.context)

      await test.step('personal 第 2 个项目可创建，第 3 个项目被限制', async () => {
        const createButton = personalOwnerUi.page.getByTestId('team-dashboard-create-project-button')
        await expect(createButton).toBeEnabled()
        await createButton.click()

        await expect(personalOwnerUi.page.getByTestId('team-create-project-dialog')).toBeVisible()
        await personalOwnerUi.page.getByTestId('team-create-project-title-input').fill(`Personal Second ${seed}`)
        await personalOwnerUi.page.getByTestId('team-create-project-summary-input').fill('用于验证 personal 第二个项目创建成功。')
        await personalOwnerUi.page.getByTestId('team-create-project-next-step-button').click()

        await Promise.all([
          personalOwnerUi.page.waitForURL(new RegExp(`/team/${escapeRegExp(personalWorkspaceId)}/project/[^/]+(?:\\?.*)?$`)),
          personalOwnerUi.page.getByTestId('team-create-project-submit-button').click(),
        ])

        await personalOwnerUi.page.goto(`/team/${personalWorkspaceId}`)
        await expect(createButton).toBeDisabled()
        await expect(personalOwnerUi.page.getByText('当前项目台项目数量已达上限，请先扩容项目配额。')).toBeVisible()
      })

      await test.step('personal 项目可邀请协作者加入项目工作区', async () => {
        await personalOwnerUi.page.goto(`/team/${personalWorkspaceId}/project/${personalCoreProjectId}`)
        const personalInvitePath = await createInviteFromProjectUi(personalOwnerUi.page, personalInvitee.username, 'editor')

        const personalInviteeUi = await loginViaUi(browser, personalInvitee, '/team')
        contexts.push(personalInviteeUi.context)

        await personalInviteeUi.page.goto(personalInvitePath)
        await expect(personalInviteeUi.page).toHaveURL(routePattern(`/team/${personalWorkspaceId}/project/${personalCoreProjectId}`))
      })

      await test.step('personal 第 16 人加入失败', async () => {
        for (let index = 0; index < 13; index += 1) {
          const filler = createCredentials(`fill${index}`, `${seed}${index}`)
          const fillerSession = await createApiSession(filler)

          try {
            await apiPost(personalOwnerSession.api, `/api/projects/${personalCoreProjectId}/members`, {
              username: filler.username,
              role: 'viewer',
            }, `补齐 personal 项目席位 ${filler.username}`)
          }
          finally {
            await fillerSession.api.dispose()
          }
        }

        const fullSnapshot = await apiGet(
          personalOwnerSession.api,
          `/api/projects/${personalCoreProjectId}/members`,
          '读取 personal 项目成员快照',
        )
        expect(fullSnapshot?.seatQuota?.seatUsed).toBe(15)
        expect(fullSnapshot?.seatQuota?.seatLimit).toBe(15)

        await personalOwnerUi.page.goto(`/team/${personalWorkspaceId}/project/${personalCoreProjectId}`)
        const overflowInvitePath = await createInviteFromProjectUi(personalOwnerUi.page, personalOverflow.username, 'viewer')

        const overflowUi = await loginViaUi(browser, personalOverflow, '/team')
        contexts.push(overflowUi.context)

        await overflowUi.page.goto(overflowInvitePath)
        await expect(overflowUi.page.getByText('项目席位已满，请联系管理员扩容后重试。')).toBeVisible()
      })
    }
    finally {
      await Promise.allSettled(contexts.map(context => context.close()))
      await Promise.allSettled(apiContexts.map(api => api.dispose()))
    }
  })

  test('流程画布通过 draw.io postMessage 与 AgentProto workflow 草案形成稳定闭环', async ({ browser }) => {
    const seed = createSeed()
    const apiContexts = []
    const contexts = []

    try {
      const owner = createCredentials('workflowowner', seed)
      const ownerSession = await createApiSession(owner)
      apiContexts.push(ownerSession.api)

      const teamPayload = await apiPost(ownerSession.api, '/api/teams', {
        name: `Workflow Team ${seed}`,
      }, '创建 workflow Team')
      const teamId = String(teamPayload?.team?.id || '').trim()
      expect(teamId).not.toBe('')

      const projectPayload = await apiPost(ownerSession.api, '/api/projects/quick', {
        teamId,
        workspaceId: teamId,
        title: `Workflow Project ${seed}`,
        summary: '用于验证 draw.io -> workflowSnapshot -> AgentProto 草案链路。',
      }, '创建 workflow 项目')
      const projectId = String(projectPayload?.id || '').trim()
      expect(projectId).not.toBe('')

      const workflowCanvas = await createWorkflowCanvas(
        ownerSession.api,
        projectId,
        `流程画布 ${seed}`,
      )
      expect(String(workflowCanvas?.resource?.id || '').trim()).not.toBe('')

      const ownerUi = await loginViaUi(
        browser,
        owner,
        `/team/${teamId}/project/${projectId}?panel=flow`,
        {
          setupContext: async (context) => {
            await installWorkflowBrowserMocks(context)
          },
        },
      )
      contexts.push(ownerUi.context)

      const page = ownerUi.page
      const workflowToolbar = page.getByTestId('workspace-workflow-toolbar')
      const applyButtons = page.getByRole('button', { name: '应用到当前流程画布' })

      await test.step('流程画布加载后收到 draw.io init，并在 autosave 后具备可用 workflowSnapshot', async () => {
        await expect(page).toHaveURL(routePattern(`/team/${teamId}/project/${projectId}`))
        await expect(workflowToolbar).toBeVisible()

        const drawioFrame = await waitForDrawioFrame(page)
        await waitForDrawioLoad(drawioFrame)

        const initialLoad = await drawioFrame.evaluate(() => {
          return window.__getLatestLoadPayload?.() || null
        })
        expect(initialLoad?.action).toBe('load')
        expect(String(initialLoad?.xml || '')).toContain('<mxfile')

        await drawioFrame.evaluate((xml) => {
          window.__emitDrawioEvent?.('autosave', xml)
        }, createSinglePageWorkflowXml(['流程开始', '人工确认']))
        await page.waitForTimeout(520)
      })

      await test.step('AgentProto 返回 workflowDraft 后可应用，且 iframe 收到新的 load XML', async () => {
        await workflowToolbar.getByRole('button', { name: 'AI 生成' }).click()
        await expect(page.getByText('AgentProto 草案')).toBeVisible()
        await expect(applyButtons.last()).toBeEnabled()

        const drawioFrame = await waitForDrawioFrame(page)
        const loadHistoryBeforeApply = await drawioFrame.evaluate(() => {
          return Number(window.__getLoadHistory?.().length || 0)
        })

        await applyButtons.last().click()
        await expect(page.getByText('已应用')).toBeVisible()

        await expect.poll(async () => {
          return await drawioFrame.evaluate(() => Number(window.__getLoadHistory?.().length || 0))
        }).toBe(loadHistoryBeforeApply + 1)
        await expect.poll(async () => {
          return await drawioFrame.evaluate(() => String(window.__getLatestLoadPayload?.()?.xml || ''))
        }).toContain('AI 草案生成')
      })

      await test.step('重新生成未应用草案后，画布再次 autosave 会让该草案过期且不可 apply', async () => {
        await page.waitForTimeout(520)
        await workflowToolbar.getByRole('button', { name: 'AI 生成' }).click()
        await expect.poll(async () => await applyButtons.count()).toBeGreaterThan(1)
        await expect(applyButtons.last()).toBeEnabled()

        const drawioFrame = await waitForDrawioFrame(page)
        await drawioFrame.evaluate((xml) => {
          window.__emitDrawioEvent?.('autosave', xml)
        }, createSinglePageWorkflowXml(['流程开始', '审批完成', '归档完成']))
        await page.waitForTimeout(520)

        await expect(page.getByText('已过期，请重新生成')).toBeVisible()
        await expect(applyButtons.last()).toBeDisabled()
      })

      await test.step('多页流程资源仍可预览草案，但 apply 被禁用', async () => {
        const drawioFrame = await waitForDrawioFrame(page)
        await drawioFrame.evaluate((xml) => {
          window.__emitDrawioEvent?.('autosave', xml)
        }, createMultiPageWorkflowXml())
        await page.waitForTimeout(520)

        await workflowToolbar.getByRole('button', { name: 'AI 生成' }).click()
        await expect(page.getByText('多页流程资源当前仅支持预览，不支持直接应用。')).toBeVisible()
        await expect(applyButtons.last()).toBeDisabled()
      })
    }
    finally {
      await Promise.allSettled(contexts.map(context => context.close()))
      await Promise.allSettled(apiContexts.map(api => api.dispose()))
    }
  })
})
