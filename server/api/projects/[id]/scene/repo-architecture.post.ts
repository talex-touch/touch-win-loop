import { setResponseStatus } from 'h3'
import { scanRepoArchitecture } from '~~/server/services/scene/data-source-connectors'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40130)
  }

  try {
    await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')
    })

    const result = await scanRepoArchitecture()

    return ok({
      architectureModel: result.architectureModel,
      sceneDocument: result.sceneDocument,
      warnings: result.warnings || [],
      workspaceName: result.workspaceName,
      packageManifestCount: result.packageManifestCount,
      workspacePatterns: result.workspacePatterns,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权执行仓库结构导入。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40330)
    }

    if (error instanceof Error && error.message === 'REPO_ARCHITECTURE_MANIFESTS_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('当前服务端工作区未扫描到可用的 package.json / workspace manifests。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40430)
    }

    if (error instanceof Error) {
      setResponseStatus(event, 400)
      return fail(error.message || '仓库结构导入失败，请检查当前服务端工作区。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40030)
    }

    throw error
  }
})
