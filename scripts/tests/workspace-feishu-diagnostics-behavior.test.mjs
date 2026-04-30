import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  buildWorkspaceFeishuDiagnosticSummary,
  listWorkspaceIntegrationAuditLogs,
  recordWorkspaceIntegrationAuditLog,
  sanitizeWorkspaceIntegrationAuditPayload,
} from '../../server/utils/workspace-integration-store.ts'

function createAuditInsertDb() {
  const calls = []
  return {
    calls,
    db: {
      async query(text, values = []) {
        calls.push({ text, values })
        return {
          rows: [{
            id: 'audit-1',
            workspace_id: values[1],
            provider: values[2],
            connection_id: values[3],
            actor_user_id: values[4],
            action: values[5],
            status: values[6],
            summary: values[7],
            payload: JSON.parse(values[8]),
            created_at: '2026-04-30T00:00:00.000Z',
          }],
        }
      },
    },
  }
}

describe('workspace Feishu diagnostics behavior', () => {
  it('审计 payload 会递归脱敏敏感字段并限制样本数组长度', () => {
    const payload = sanitizeWorkspaceIntegrationAuditPayload({
      tenantAccessToken: 'tenant-token-raw',
      appTicket: 'ticket-raw',
      nested: {
        clientSecret: 'secret-raw',
        diagnosticCode: 'tenant_token_failed',
      },
      diagnosticSamples: Array.from({ length: 25 }, (_, index) => ({
        index,
        accessToken: `token-${index}`,
      })),
    })

    assert.equal(payload.tenantAccessToken, '[redacted]')
    assert.equal(payload.appTicket, '[redacted]')
    assert.deepEqual(payload.nested, {
      clientSecret: '[redacted]',
      diagnosticCode: 'tenant_token_failed',
    })
    assert.equal(payload.diagnosticSamples.length, 20)
    assert.equal(payload.diagnosticSamples[0].accessToken, '[redacted]')
  })

  it('写入审计前会脱敏 payload，并返回规范化审计记录', async () => {
    const recorder = createAuditInsertDb()
    const item = await recordWorkspaceIntegrationAuditLog(recorder.db, {
      workspaceId: 'workspace-1',
      provider: 'feishu',
      connectionId: 'connection-1',
      actorUserId: 'user-1',
      action: 'feishu.token.failed',
      status: 'error',
      summary: 'token failed',
      payload: {
        tenantAccessToken: 'tenant-token-raw',
        tokenHealth: 'tenant_token_failed',
      },
    })

    assert.match(recorder.calls[0].text, /INSERT INTO workspace_integration_audit_logs/)
    assert.equal(item.workspaceId, 'workspace-1')
    assert.equal(item.provider, 'feishu')
    assert.equal(item.status, 'error')
    assert.equal(item.payload.tenantAccessToken, '[redacted]')
    assert.equal(item.payload.tokenHealth, 'tenant_token_failed')
    assert.doesNotMatch(recorder.calls[0].values[8], /tenant-token-raw/)
  })

  it('读取审计会限制 limit 并按 workspace/provider 查询', async () => {
    const calls = []
    const db = {
      async query(text, values = []) {
        calls.push({ text, values })
        return {
          rows: [{
            id: 'audit-1',
            workspace_id: 'workspace-1',
            provider: 'feishu',
            connection_id: 'connection-1',
            actor_user_id: 'user-1',
            action: 'feishu.import.completed',
            status: 'success',
            summary: 'import done',
            payload: { importedCount: 2 },
            created_at: '2026-04-30T00:00:00.000Z',
          }],
        }
      },
    }

    const items = await listWorkspaceIntegrationAuditLogs(db, {
      workspaceId: 'workspace-1',
      provider: 'feishu',
      limit: 999,
    })

    assert.equal(calls[0].values[0], 'workspace-1')
    assert.equal(calls[0].values[1], 'feishu')
    assert.equal(calls[0].values[2], 50)
    assert.equal(items[0].action, 'feishu.import.completed')
  })

  it('诊断 summary 会聚合 token、成员同步、自动登录和最近导入状态', () => {
    const summary = buildWorkspaceFeishuDiagnosticSummary({
      connected: true,
      connection: {
        id: 'connection-1',
        workspaceId: 'workspace-1',
        provider: 'feishu',
        status: 'needs_reauth',
        tenantKey: 'tenant-1',
        tenantName: 'tenant',
        externalAppId: '',
        scopes: [],
        capabilities: { tokenHealth: 'tenant_token_failed' },
        installedByUserId: null,
        authorizedByUserId: null,
        lastHealthCheckAt: null,
        lastError: 'token failed',
        disconnectedAt: null,
        createdAt: '',
        updatedAt: '',
      },
      policy: {
        id: 'policy-1',
        connectionId: 'connection-1',
        memberSyncMode: 'whitelist',
        autoLoginEnabled: true,
        defaultWorkspaceRole: 'member',
        departmentIds: [],
        userIds: [],
        groupIds: [],
        roleMappings: {},
        lastPreviewAt: '2026-04-30T00:00:00.000Z',
        lastSyncAt: '2026-04-30T00:01:00.000Z',
        lastSyncResult: {
          createCount: 2,
          updateCount: 1,
          conflictCount: 1,
          seatFailedCount: 1,
          diagnostics: [{ code: 'email_conflict', message: '邮箱冲突', count: 1 }],
          autoLogin: {
            joined: false,
            diagnostics: [{ code: 'seat_limit_exceeded', message: '席位不足', count: 1 }],
          },
        },
        createdAt: '',
        updatedAt: '',
      },
      importJobs: [{
        id: 'job-1',
        workspaceId: 'workspace-1',
        connectionId: 'connection-1',
        projectId: 'project-1',
        provider: 'feishu',
        status: 'partial_success',
        requestedByUserId: 'user-1',
        sourceCount: 3,
        importedCount: 2,
        skippedCount: 0,
        failedCount: 1,
        diagnostics: { failures: [{ token: 'doc-1', message: '失败' }] },
        startedAt: '',
        finishedAt: '',
        createdAt: '',
        updatedAt: '',
      }],
    })

    assert.equal(summary.tokenHealth, 'tenant_token_failed')
    assert.equal(summary.lastError, 'token failed')
    assert.equal(summary.memberSyncSummary.createCount, 2)
    assert.equal(summary.memberSyncSummary.diagnosticSamples[0].code, 'email_conflict')
    assert.equal(summary.autoLoginSummary.failedCount, 1)
    assert.equal(summary.importSummary.latestStatus, 'partial_success')
    assert.equal(summary.importSummary.failedCount, 1)
  })
})
