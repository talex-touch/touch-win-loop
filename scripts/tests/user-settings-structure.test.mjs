import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const USER_SETTINGS_DIALOG_FILE = resolve(process.cwd(), 'app/components/UserSettingsDialog.vue')
const USER_WORKSPACE_OVERVIEW_FILE = resolve(process.cwd(), 'app/composables/useUserWorkspaceOverview.ts')
const USER_AI_USAGE_FILE = resolve(process.cwd(), 'app/composables/useUserAiUsage.ts')
const USER_WORKSPACE_MEMBERSHIP_FILE = resolve(process.cwd(), 'app/composables/useUserWorkspaceMembership.ts')
const USER_AUTH_BINDINGS_FILE = resolve(process.cwd(), 'app/composables/useUserAuthBindings.ts')
const USER_SESSION_HISTORY_FILE = resolve(process.cwd(), 'app/composables/useUserSessionHistory.ts')

it('用户设置弹窗已拆成 shell + panel + composable 结构', async () => {
  const [
    dialogSource,
    overviewSource,
    aiUsageSource,
    membershipSource,
    authBindingsSource,
    sessionHistorySource,
  ] = await Promise.all([
    readFile(USER_SETTINGS_DIALOG_FILE, 'utf8'),
    readFile(USER_WORKSPACE_OVERVIEW_FILE, 'utf8'),
    readFile(USER_AI_USAGE_FILE, 'utf8'),
    readFile(USER_WORKSPACE_MEMBERSHIP_FILE, 'utf8'),
    readFile(USER_AUTH_BINDINGS_FILE, 'utf8'),
    readFile(USER_SESSION_HISTORY_FILE, 'utf8'),
  ])

  assert.match(dialogSource, /from '~\/composables\/useUserWorkspaceOverview'/, '用户设置弹窗未接入 workspace overview composable')
  assert.match(dialogSource, /from '~\/composables\/useUserAiUsage'/, '用户设置弹窗未接入 AI usage composable')
  assert.match(dialogSource, /from '~\/composables\/useUserWorkspaceMembership'/, '用户设置弹窗未接入成员管理 composable')
  assert.match(dialogSource, /from '~\/composables\/useUserAuthBindings'/, '用户设置弹窗未接入账号绑定 composable')
  assert.match(dialogSource, /from '~\/composables\/useUserSessionHistory'/, '用户设置弹窗未接入登录历史 composable')

  assert.match(dialogSource, /<UserSettingsShell\b/, '用户设置弹窗未复用 UserSettingsShell')
  assert.match(dialogSource, /<UserSettingsProfilePanel\b/, '用户设置弹窗未复用个人资料 panel')
  assert.match(dialogSource, /<UserSettingsWorkspaceOverviewPanel\b/, '用户设置弹窗未复用 workspace overview panel')
  assert.match(dialogSource, /<UserSettingsAiUsagePanel\b/, '用户设置弹窗未复用 AI usage panel')
  assert.match(dialogSource, /<UserSettingsMembersPanel\b/, '用户设置弹窗未复用成员 panel')
  assert.match(dialogSource, /<UserSettingsBindingsPanel\b/, '用户设置弹窗未复用绑定 panel')
  assert.match(dialogSource, /<UserSettingsLoginHistoryPanel\b/, '用户设置弹窗未复用登录历史 panel')
  assert.match(dialogSource, /<UserSettingsAuditPanel\b/, '用户设置弹窗未复用审计 panel')

  assert.doesNotMatch(dialogSource, /class="user-settings-member-list"/, '用户设置弹窗仍内联成员列表')
  assert.doesNotMatch(dialogSource, /class="user-settings-record-list"/, '用户设置弹窗仍内联邀请/记录列表')
  assert.doesNotMatch(dialogSource, /class="user-settings-usage-list"/, '用户设置弹窗仍内联 AI usage 列表')
  assert.doesNotMatch(dialogSource, /function loadWorkspaceMemberManagement\(/, '用户设置弹窗仍内联成员拉取逻辑')
  assert.doesNotMatch(dialogSource, /function loadWorkspaceAiUsage\(/, '用户设置弹窗仍内联 AI usage 拉取逻辑')
  assert.doesNotMatch(dialogSource, /function loadFeishuBindStatus\(/, '用户设置弹窗仍内联绑定状态拉取逻辑')
  assert.doesNotMatch(dialogSource, /function loadAuthSessions\(/, '用户设置弹窗仍内联登录历史拉取逻辑')

  assert.match(overviewSource, /export function useUserWorkspaceOverview\(/, '缺少 workspace overview composable')
  assert.match(aiUsageSource, /export function useUserAiUsage\(/, '缺少 AI usage composable')
  assert.match(membershipSource, /export function useUserWorkspaceMembership\(/, '缺少 workspace membership composable')
  assert.match(authBindingsSource, /export function useUserAuthBindings\(/, '缺少 auth bindings composable')
  assert.match(sessionHistorySource, /export function useUserSessionHistory\(/, '缺少 session history composable')
})
