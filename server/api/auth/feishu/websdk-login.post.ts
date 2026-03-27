import type { AuthLoginResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { loginByFeishuOAuthCode } from '~~/server/services/feishu/login-flow'
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
    const message = error instanceof Error ? error.message : '飞书自动登录失败。'
    if (message === 'FEISHU_INTEGRATION_DISABLED' || message === 'FEISHU_APP_CONFIG_INCOMPLETE') {
      setResponseStatus(event, 400)
    }
    else if (message === 'USER_DISABLED') {
      setResponseStatus(event, 403)
    }
    else {
      setResponseStatus(event, 401)
    }

    return fail(message, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40102)
  }
})
