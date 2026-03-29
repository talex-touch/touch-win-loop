import type { FeishuIntegrationConfig } from '~~/shared/types/domain'
import process from 'node:process'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  readFeishuIntegrationConfig,
  toPublicFeishuIntegrationConfig,
} from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

type BuildValueSource = 'env' | 'runtime' | 'fallback' | 'missing'

interface FeishuIntegrationConfigView extends FeishuIntegrationConfig {
  startupEffectiveVersion: string
  startupEffectiveCommitSha: string
  startupVersionSource: BuildValueSource
  startupCommitShaSource: BuildValueSource
}

function resolveBuildValueSource(
  runtimeValue: string,
  runtimeValueFromEnv: string,
  fallbackValue: string,
): BuildValueSource {
  if (runtimeValueFromEnv)
    return 'env'
  if (runtimeValue)
    return 'runtime'
  if (fallbackValue)
    return 'fallback'
  return 'missing'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看飞书集成配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40395)
  }

  const config = await withClient(event, async (db) => {
    return readFeishuIntegrationConfig(db)
  })

  const publicConfig = toPublicFeishuIntegrationConfig(config)
  const runtimeVersion = String(runtime.build.version || '').trim()
  const runtimeCommitSha = String(runtime.build.commitSha || '').trim()
  const runtimeVersionFromEnv = String(process.env.WINLOOP_BUILD_VERSION || '').trim()
  const runtimeCommitShaFromEnv = String(process.env.WINLOOP_BUILD_COMMIT_SHA || '').trim()
  const fallbackVersion = String(publicConfig.startupFallbackVersion || '').trim()
  const fallbackCommitSha = String(publicConfig.startupFallbackCommitSha || '').trim()

  const startupVersionSource = resolveBuildValueSource(runtimeVersion, runtimeVersionFromEnv, fallbackVersion)
  const startupCommitShaSource = resolveBuildValueSource(runtimeCommitSha, runtimeCommitShaFromEnv, fallbackCommitSha)

  const payload: FeishuIntegrationConfigView = {
    ...publicConfig,
    startupEffectiveVersion: runtimeVersion || fallbackVersion,
    startupEffectiveCommitSha: runtimeCommitSha || fallbackCommitSha,
    startupVersionSource,
    startupCommitShaSource,
  }

  return ok<FeishuIntegrationConfigView>(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
