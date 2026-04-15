import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { publishMockupDeviceModel } from '~~/server/utils/mockup-device-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canWrite = user.isPlatformAdmin || await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权发布 Mockup 型号。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40608)
  }

  const modelId = normalizeString(getRouterParam(event, 'id'))
  const detail = await withTransaction(event, async (db) => {
    return publishMockupDeviceModel(db, {
      modelId,
      actorUserId: user.id,
    })
  }).catch((error) => {
    if (!(error instanceof Error))
      throw error
    if (error.message === 'MOCKUP_DEVICE_MODEL_NOT_FOUND')
      return { error: 'not_found' as const }
    if (
      error.message === 'MOCKUP_MODEL_NO_ENABLED_VARIANTS'
      || error.message === 'MOCKUP_VARIANT_SHELL_REQUIRED'
      || error.message === 'MOCKUP_VARIANT_SHELL_NOT_PUBLISHED'
      || error.message === 'MOCKUP_DEVICE_DEFAULT_VARIANT_INVALID'
    ) {
      return { error: error.message as 'MOCKUP_MODEL_NO_ENABLED_VARIANTS' | 'MOCKUP_VARIANT_SHELL_REQUIRED' | 'MOCKUP_VARIANT_SHELL_NOT_PUBLISHED' | 'MOCKUP_DEVICE_DEFAULT_VARIANT_INVALID' }
    }
    throw error
  })

  if (detail && 'error' in detail) {
    if (detail.error === 'not_found') {
      setResponseStatus(event, 404)
      return fail('Mockup 型号不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40609)
    }

    setResponseStatus(event, 400)
    const messageMap: Record<string, string> = {
      MOCKUP_MODEL_NO_ENABLED_VARIANTS: '至少需要 1 个启用的变体才能发布。',
      MOCKUP_VARIANT_SHELL_REQUIRED: '启用中的变体必须绑定已发布壳素材。',
      MOCKUP_VARIANT_SHELL_NOT_PUBLISHED: '绑定的壳素材版本未发布，无法发布型号。',
      MOCKUP_DEVICE_DEFAULT_VARIANT_INVALID: '默认变体无效，必须指向启用中的变体。',
    }
    return fail(messageMap[detail.error] || 'Mockup 型号发布校验失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40610)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
