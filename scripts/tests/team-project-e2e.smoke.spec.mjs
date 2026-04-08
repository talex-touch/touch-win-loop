import { expect, request as playwrightRequest, test } from '@playwright/test'

const BASE_URL = String(process.env.E2E_BASE_URL || 'http://127.0.0.1:4010')

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

async function loginViaUi(browser, credentials, redirect = '/team') {
  const context = await browser.newContext({
    baseURL: BASE_URL,
  })
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
})
