import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const SHARED_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const INTERNAL_TYPES_FILE = resolve(process.cwd(), 'internal/shared-types/domain-legacy.ts')
const STORE_FILE = resolve(process.cwd(), 'server/utils/workspace-integration-store.ts')
const INSTALL_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/install-session.post.ts')
const CLAIM_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/claim.post.ts')
const DIRECTORY_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/directory/search.get.ts')
const MEMBER_PREVIEW_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/member-sync/preview.post.ts')
const MEMBER_RUN_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/member-sync/run.post.ts')
const IMPORTS_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/imports/index.post.ts')
const AUDITS_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/audits.get.ts')
const PANEL_FILE = resolve(process.cwd(), 'app/components/user-settings/UserSettingsThirdPartyPlatformsPanel.vue')
const PACKAGE_FILE = resolve(process.cwd(), 'package.json')
const SMOKE_FILE = resolve(process.cwd(), 'scripts/workspace-feishu-diagnostics-smoke.mjs')

describe('workspace Feishu production diagnostics contracts', () => {
  it('adds workspace integration audit schema and typed diagnostic summary', async () => {
    const [schemaSource, sharedTypes, internalTypes, storeSource] = await Promise.all([
      readFile(SCHEMA_FILE, 'utf8'),
      readFile(SHARED_TYPES_FILE, 'utf8'),
      readFile(INTERNAL_TYPES_FILE, 'utf8'),
      readFile(STORE_FILE, 'utf8'),
    ])

    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS workspace_integration_audit_logs/, '缺少 workspace 集成审计表')
    assert.match(schemaSource, /workspace_id TEXT NOT NULL REFERENCES workspaces\(id\)/, '审计表必须关联 workspace')
    assert.match(schemaSource, /action TEXT NOT NULL/, '审计表缺少 action')
    assert.match(schemaSource, /status TEXT NOT NULL/, '审计表缺少 status')
    assert.match(schemaSource, /summary TEXT NOT NULL DEFAULT ''/, '审计表缺少 summary')
    assert.match(schemaSource, /payload JSONB NOT NULL DEFAULT '\{\}'::JSONB/, '审计表缺少 payload')
    assert.match(schemaSource, /idx_workspace_integration_audit_logs_workspace_provider_created/, '审计表缺少 workspace/provider/created 索引')

    for (const source of [sharedTypes, internalTypes]) {
      assert.match(source, /export interface WorkspaceIntegrationAuditLog/, '缺少审计日志类型')
      assert.match(source, /export interface WorkspaceFeishuIntegrationDiagnosticSummary/, '缺少诊断 summary 类型')
      assert.match(source, /auditLogs: WorkspaceIntegrationAuditLog\[\]/, 'snapshot 缺少 auditLogs')
      assert.match(source, /diagnosticSummary: WorkspaceFeishuIntegrationDiagnosticSummary/, 'snapshot 缺少 diagnosticSummary')
    }

    assert.match(storeSource, /export async function recordWorkspaceIntegrationAuditLog/, '缺少审计写入 helper')
    assert.match(storeSource, /export async function listWorkspaceIntegrationAuditLogs/, '缺少审计读取 helper')
    assert.match(storeSource, /export function buildWorkspaceFeishuDiagnosticSummary/, '缺少飞书诊断 summary helper')
    assert.match(storeSource, /\[redacted\]/, 'workspace 审计 payload 必须脱敏敏感字段')
  })

  it('records Feishu production diagnostics across critical flows', async () => {
    const sources = await Promise.all([
      INSTALL_API_FILE,
      CLAIM_API_FILE,
      DIRECTORY_API_FILE,
      MEMBER_PREVIEW_API_FILE,
      MEMBER_RUN_API_FILE,
      IMPORTS_API_FILE,
      STORE_FILE,
    ].map(file => readFile(file, 'utf8')))
    const combined = sources.join('\n')

    for (const action of [
      'feishu.install_session.created',
      'feishu.claim.connected',
      'feishu.token.failed',
      'feishu.directory.failed',
      'feishu.member_sync.previewed',
      'feishu.member_sync.completed',
      'feishu.import.completed',
      'feishu.auto_login.checked',
    ]) {
      assert.match(combined, new RegExp(action), `缺少审计动作 ${action}`)
    }

    assert.match(combined, /recordWorkspaceIntegrationAuditLog/, '关键 Feishu 流程未写 workspace 审计')
    assert.match(combined, /sanitizeWorkspaceIntegrationAuditPayload/, '审计 payload 必须脱敏')
    assert.match(combined, /diagnostics\.slice\(0, 5\)|diagnosticSamples/, '审计必须限制诊断样本数量')
  })

  it('exposes audits API and third-party diagnostics panel', async () => {
    const [auditsApiSource, panelSource] = await Promise.all([
      readFile(AUDITS_API_FILE, 'utf8'),
      readFile(PANEL_FILE, 'utf8'),
    ])

    assert.match(auditsApiSource, /teamHasWorkspaceRoles/, 'audits API 必须限制 owner/admin')
    assert.match(auditsApiSource, /listWorkspaceIntegrationAuditLogs/, 'audits API 未读取 workspace 审计日志')
    assert.match(auditsApiSource, /limit/, 'audits API 必须支持 limit')

    assert.match(panelSource, /健康诊断/, '第三方平台面板缺少健康诊断区')
    assert.match(panelSource, /最近同步/, '第三方平台面板缺少最近同步区')
    assert.match(panelSource, /审计日志/, '第三方平台面板缺少审计日志区')
    assert.match(panelSource, /diagnosticSummary/, '第三方平台面板未消费诊断 summary')
    assert.match(panelSource, /auditLogs/, '第三方平台面板未展示审计日志')
    assert.match(panelSource, /autoLoginSummary/, '第三方平台面板未展示自动登录结果')
  })

  it('provides a real-browser Feishu diagnostics smoke entry', async () => {
    const [packageSource, smokeSource] = await Promise.all([
      readFile(PACKAGE_FILE, 'utf8'),
      readFile(SMOKE_FILE, 'utf8'),
    ])

    assert.match(packageSource, /"smoke:feishu-diagnostics":\s*"node \.\/scripts\/workspace-feishu-diagnostics-smoke\.mjs"/, 'package.json 缺少飞书诊断 smoke 命令')
    assert.match(smokeSource, /button\[title="个人设置"\]/, 'smoke 未验证共享设置入口')
    assert.match(smokeSource, /button\.user-settings-tab[\s\S]*第三方平台/, 'smoke 未进入第三方平台 tab')
    assert.match(smokeSource, /user-settings-third-party-platforms-panel/, 'smoke 未验证第三方平台面板')
    assert.match(smokeSource, /健康诊断[\s\S]*最近同步[\s\S]*自动登录[\s\S]*审计日志/, 'smoke 未覆盖诊断核心区域')
    assert.match(smokeSource, /\/api\/teams\/\$\{workspaceId\}\/integrations\/feishu/, 'smoke 未验证飞书 snapshot API')
    assert.match(smokeSource, /diagnosticSummary[\s\S]*memberSyncSummary[\s\S]*autoLoginSummary[\s\S]*auditLogs/, 'smoke 未断言 snapshot 诊断字段')
  })
})
