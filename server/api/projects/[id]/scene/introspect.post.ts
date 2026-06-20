import { setResponseStatus } from 'h3'
import { introspectDatabase } from '~~/server/services/scene/data-source-connectors'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

interface SceneIntrospectBody {
  dialect?: 'postgres' | 'mysql'
  connectionString?: string
  schemaNames?: string[]
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSchemaNames(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => normalizeString(item))
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = await readBody<SceneIntrospectBody>(event).catch(() => ({} as SceneIntrospectBody))
  const dialect = normalizeString(body?.dialect).toLowerCase() === 'mysql' ? 'mysql' : 'postgres'
  const connectionString = normalizeString(body?.connectionString)
  const schemaNames = normalizeSchemaNames(body?.schemaNames)

  if (!projectId || !connectionString) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 connectionString。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40120)
  }

  try {
    await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')
    })

    const result = await introspectDatabase({
      connectionString,
      dialect,
      schemaNames,
    })

    return ok({
      schemaModel: result.schemaModel,
      sceneDocument: result.sceneDocument,
      warnings: result.warnings || [],
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
      return fail('当前用户无权执行数据库结构导入。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40320)
    }

    if (error instanceof Error && error.message === 'MYSQL_INTROSPECTION_NOT_SUPPORTED_YET') {
      setResponseStatus(event, 400)
      return fail('MySQL introspection 暂未开放，本期仅支持 Postgres 只读 metadata introspection。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40020)
    }

    if (error instanceof Error) {
      setResponseStatus(event, 400)
      return fail(error.message || '数据库结构导入失败，请检查连接串和 schema 配置。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40021)
    }

    throw error
  }
})
