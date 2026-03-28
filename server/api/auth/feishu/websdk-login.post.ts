import type { AuthLoginResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { loginByFeishuOAuthCode, resolveFeishuLoginErrorInfo } from '~~/server/services/feishu/login-flow'
import { fail, ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

interface WebSdkLoginBody {
  code?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const body = await readBody<WebSdkLoginBody>(event).catch(() => ({} as WebSdkLoginBody))
  const code = String(body?.code || '').trim()

  if (!code) {
    setResponseStatus(event, 400)
    return fail('code 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  try {
    const loginResult = await loginByFeishuOAuthCode(event, code)
    return ok<AuthLoginResult>(loginResult, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    const info = resolveFeishuLoginErrorInfo(error)
    if (info.code === 'FEISHU_INTEGRATION_DISABLED' || info.code === 'FEISHU_APP_CONFIG_INCOMPLETE') {
      setResponseStatus(event, 400)
    }
    else if (info.code === 'USER_DISABLED') {
      setResponseStatus(event, 403)
    }
    else if (info.code === 'FEISHU_IDENTITY_ALREADY_BOUND_OTHER_USER' || info.code === 'FEISHU_USER_ALREADY_BOUND_OTHER_IDENTITY') {
      setResponseStatus(event, 409)
    }
    else {
      setResponseStatus(event, 401)
    }

    return fail(info.message, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40102)
  }
})
