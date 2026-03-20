import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createContestSyncSource } from '~~/server/utils/contest-sync-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateSyncSourceBody {
  name?: string
  sourceUrl?: string
  isActive?: boolean
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<CreateSyncSourceBody>(event)

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增同步数据源。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40392)
  }

  const source = await withTransaction(event, async (db) => {
    return createContestSyncSource(db, {
      name: String(body?.name || ''),
      sourceUrl: String(body?.sourceUrl || ''),
      actorUserId: user.id,
      isActive: body?.isActive !== false,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'SOURCE_NAME_REQUIRED') {
      setResponseStatus(event, 400)
      return 'SOURCE_NAME_REQUIRED'
    }
    if (error instanceof Error && error.message === 'SOURCE_URL_REQUIRED') {
      setResponseStatus(event, 400)
      return 'SOURCE_URL_REQUIRED'
    }
    if (error instanceof Error && error.message === 'SOURCE_URL_INVALID') {
      setResponseStatus(event, 400)
      return 'SOURCE_URL_INVALID'
    }
    throw error
  })

  if (source === 'SOURCE_NAME_REQUIRED') {
    return fail('name 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  if (source === 'SOURCE_URL_REQUIRED') {
    return fail('sourceUrl 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  if (source === 'SOURCE_URL_INVALID') {
    return fail('sourceUrl 非法，仅支持 http/https。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40094)
  }

  return ok(source, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
