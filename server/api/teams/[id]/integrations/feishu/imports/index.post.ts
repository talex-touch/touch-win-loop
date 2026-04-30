import type { Resource, WorkspaceFeishuImportRequest } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { getWorkspaceFeishuMarketplaceTenantAccessToken } from '~~/server/services/feishu/workspace-auth'
import { resolveWorkspaceFeishuImportSource } from '~~/server/services/feishu/workspace-import'
import { buildDocumentObjectKey, getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'
import { buildProjectResourceSignedUrls } from '~~/server/utils/project-resource-access-url'
import { createProjectPreviewDocumentWithTask } from '~~/server/utils/project-resource-document-store'
import {
  createProjectExternalBinaryResource,
  createProjectExternalMarkdownResource,
} from '~~/server/utils/project-resource-store'
import {
  createWorkspaceFeishuImportJob,
  findWorkspaceExternalResourceRef,
  finishWorkspaceFeishuImportJob,
  getFeishuWorkspaceIntegrationSnapshot,
  markFeishuWorkspaceConnectionTokenHealth,
  recordWorkspaceFeishuImportResource,
  recordWorkspaceIntegrationAuditLog,
} from '~~/server/utils/workspace-integration-store'
import { normalizeWorkspaceFeishuImportSources } from '~~/shared/utils/workspace-feishu-integration'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return String(error.message || '导入失败').trim() || '导入失败'
  return String(error || '导入失败').trim() || '导入失败'
}

function toTokenHealth(error: unknown): 'missing_app_ticket' | 'missing_tenant_key' | 'tenant_token_failed' {
  const message = error instanceof Error ? error.message : String(error || '')
  if (message === 'FEISHU_MARKETPLACE_APP_TICKET_MISSING')
    return 'missing_app_ticket'
  if (message === 'FEISHU_WORKSPACE_TENANT_KEY_MISSING')
    return 'missing_tenant_key'
  return 'tenant_token_failed'
}

function decorateExternalBinaryResource(input: {
  projectId: string
  resource: Resource
  document: Awaited<ReturnType<typeof createProjectPreviewDocumentWithTask>>['document']
}): Resource {
  const signedUrls = buildProjectResourceSignedUrls({
    projectId: input.projectId,
    resourceId: input.resource.id,
  })
  return {
    ...input.resource,
    resourceKind: 'binary',
    documentId: input.document.id,
    previewStatus: input.document.previewStatus,
    previewProgressPercent: input.document.previewProgressPercent,
    previewEtaSeconds: input.document.previewEtaSeconds,
    previewError: input.document.previewError || undefined,
    previewUrl: signedUrls.previewUrl,
    previewUrlExpiresAt: signedUrls.previewUrlExpiresAt,
    sourceDownloadUrl: signedUrls.sourceDownloadUrl,
    sourceDownloadUrlExpiresAt: signedUrls.sourceDownloadUrlExpiresAt,
    sourceLink: signedUrls.sourceDownloadUrl,
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<WorkspaceFeishuImportRequest>(event)
  const projectId = String(body?.projectId || '').trim()
  const sources = normalizeWorkspaceFeishuImportSources(body?.sources || [])

  if (!workspaceId || !projectId || !sources.length) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId、projectId 或飞书导入源。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40102)
  }

  try {
    const preflight = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      const projectWorkspaceId = String(project?.workspaceId || project?.teamId || '').trim()
      if (!project || projectWorkspaceId !== workspaceId)
        throw new Error('PROJECT_NOT_FOUND')

      const canManageProject = await teamCanManageProject(db, user, projectId)
      if (!canManageProject)
        throw new Error('FORBIDDEN')

      const snapshot = await getFeishuWorkspaceIntegrationSnapshot(db, workspaceId)
      if (!snapshot.connected || !snapshot.connection)
        throw new Error('WORKSPACE_FEISHU_NOT_CONNECTED')

      const job = await createWorkspaceFeishuImportJob(db, {
        workspaceId,
        connectionId: snapshot.connection.id,
        projectId,
        requestedByUserId: user.id,
        sourceCount: sources.length,
      })

      const platformConfig = await readFeishuIntegrationConfig(db)

      return {
        snapshot,
        job,
        platformConfig,
      }
    })

    let tenantAccessToken = ''
    let tenantTokenError = ''
    let tenantTokenHealth: 'missing_app_ticket' | 'missing_tenant_key' | 'tenant_token_failed' = 'tenant_token_failed'
    if (sources.some(source => !source.content)) {
      try {
        tenantAccessToken = await getWorkspaceFeishuMarketplaceTenantAccessToken({
          config: preflight.platformConfig,
          connection: preflight.snapshot.connection,
        })
      }
      catch (error) {
        tenantTokenError = toErrorMessage(error)
        tenantTokenHealth = toTokenHealth(error)
        await withTransaction(event, async (db) => {
          await markFeishuWorkspaceConnectionTokenHealth(db, {
            workspaceId,
            status: 'needs_reauth',
            tokenHealth: tenantTokenHealth,
            lastError: tenantTokenError,
            actorUserId: user.id,
          })
        })
      }
    }

    const storage = getDocumentStorage()
    const resources: Resource[] = []
    let importedCount = 0
    let skippedCount = 0
    let failedCount = 0
    const diagnostics: Array<{ token: string, message: string }> = []

    for (const source of sources) {
      let objectKeyToCleanup = ''
      try {
        if (!source.content && tenantTokenError)
          throw new Error(tenantTokenError)

        const resolved = await resolveWorkspaceFeishuImportSource({
          tenantAccessToken,
          source,
        })
        const existingRef = await withTransaction(event, async (db) => {
          return findWorkspaceExternalResourceRef(db, {
            connectionId: preflight.snapshot.connection!.id,
            projectId,
            externalType: source.type,
            externalToken: source.token,
          })
        })

        if (existingRef?.sourceHash === resolved.sourceHash && existingRef.resourceId) {
          skippedCount += 1
          continue
        }

        if (resolved.kind === 'binary') {
          const objectKey = buildDocumentObjectKey(`project-${projectId}`, resolved.fileName)
          objectKeyToCleanup = objectKey
          await storage.putObject({
            key: objectKey,
            body: resolved.buffer,
            contentType: resolved.mimeType,
          })

          const resource = await withTransaction(event, async (db) => {
            const createdResource = await createProjectExternalBinaryResource(db, {
              projectId,
              actorUserId: user.id,
              fileName: resolved.fileName,
              mimeType: resolved.mimeType,
              fileSize: resolved.buffer.length,
              objectKey,
              storageProvider: storage.provider,
              title: resolved.title,
              summary: '',
              accessLevel: 'login_required',
              category: 'templates',
              existingResourceId: existingRef?.resourceId || null,
              metadata: {
                provider: 'feishu',
                sourceToken: source.token,
                sourceType: source.type,
                sourceHash: resolved.sourceHash,
                importJobId: preflight.job.id,
                originalUrl: resolved.originalUrl,
                versionHash: source.versionHash,
                updatedAt: source.updatedAt,
                ...resolved.metadata,
              },
            })

            const createdDocument = await createProjectPreviewDocumentWithTask(db, {
              projectId,
              projectResourceId: createdResource.id,
              sourceObjectKey: objectKey,
              sourceStorageProvider: storage.provider,
              sourceFileName: resolved.fileName,
              sourceMimeType: resolved.mimeType,
              sourceFileSize: resolved.buffer.length,
              actorUserId: user.id,
            })

            const decorated = decorateExternalBinaryResource({
              projectId,
              resource: createdResource,
              document: createdDocument.document,
            })

            await recordWorkspaceFeishuImportResource(db, {
              workspaceId,
              connectionId: preflight.snapshot.connection!.id,
              projectId,
              importJobId: preflight.job.id,
              source: resolved.source,
              sourceHash: resolved.sourceHash,
              resource: decorated,
              actorUserId: user.id,
              metadata: {
                sourceType: source.type,
                sourceTitle: resolved.title,
                resourceKind: 'binary',
              },
            })
            return decorated
          })

          objectKeyToCleanup = ''
          resources.push(resource)
          importedCount += 1
          continue
        }

        const resource = await withTransaction(event, async (db) => {
          const createdResource = await createProjectExternalMarkdownResource(db, {
            projectId,
            actorUserId: user.id,
            title: resolved.title,
            content: resolved.markdown,
            sourceLink: resolved.originalUrl,
            summary: resolved.summary,
            accessLevel: 'login_required',
            category: 'templates',
            existingResourceId: existingRef?.resourceId || null,
            metadata: {
              provider: 'feishu',
              sourceToken: source.token,
              sourceType: source.type,
              sourceHash: resolved.sourceHash,
              importJobId: preflight.job.id,
              originalUrl: resolved.originalUrl,
              versionHash: source.versionHash,
              updatedAt: source.updatedAt,
              ...resolved.metadata,
            },
          })

          await recordWorkspaceFeishuImportResource(db, {
            workspaceId,
            connectionId: preflight.snapshot.connection!.id,
            projectId,
            importJobId: preflight.job.id,
            source: resolved.source,
            sourceHash: resolved.sourceHash,
            resource: createdResource,
            actorUserId: user.id,
            metadata: {
              sourceType: source.type,
              sourceTitle: resolved.title,
              resourceKind: 'markdown',
            },
          })
          return createdResource
        })

        resources.push(resource)
        importedCount += 1
      }
      catch (error) {
        if (objectKeyToCleanup)
          await storage.deleteObject(objectKeyToCleanup).catch(() => undefined)
        failedCount += 1
        diagnostics.push({
          token: source.token,
          message: toErrorMessage(error),
        })
      }
    }

    const finishedJob = await withTransaction(event, async (db) => {
      const finishedJob = await finishWorkspaceFeishuImportJob(db, {
        jobId: preflight.job.id,
        status: failedCount > 0
          ? importedCount > 0
            ? 'partial_success'
            : 'failed'
          : 'succeeded',
        importedCount,
        skippedCount,
        failedCount,
        diagnostics: {
          failures: diagnostics,
        },
      })
      await recordWorkspaceIntegrationAuditLog(db, {
        workspaceId,
        provider: 'feishu',
        connectionId: preflight.snapshot.connection?.id || null,
        actorUserId: user.id,
        action: 'feishu.import.completed',
        status: failedCount > 0
          ? importedCount > 0
            ? 'warning'
            : 'error'
          : 'success',
        summary: `飞书资源导入完成：成功 ${importedCount}，跳过 ${skippedCount}，失败 ${failedCount}。`,
        payload: {
          projectId,
          jobId: preflight.job.id,
          sourceCount: sources.length,
          importedCount,
          skippedCount,
          failedCount,
          diagnosticSamples: diagnostics.slice(0, 5),
        },
      })
      return finishedJob
    })

    const data = {
      job: finishedJob || preflight.job,
      resources,
    }

    return ok(data, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('项目不存在或不属于当前工作空间。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40402)
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权向该项目导入飞书资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40403)
    }
    if (error instanceof Error && error.message === 'WORKSPACE_FEISHU_NOT_CONNECTED') {
      setResponseStatus(event, 409)
      return fail('当前工作空间尚未连接飞书。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40902)
    }
    throw error
  }
})
