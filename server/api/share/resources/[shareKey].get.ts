import { sendRedirect, setResponseStatus } from 'h3'
import { createProjectResourceAccessToken } from '~~/server/services/document/project-resource-access-token'
import { fail } from '~~/server/utils/api'
import { buildServerApiEndpoint } from '~~/server/utils/api-url'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  getActiveProjectResourceShareByKey,
  isActiveWorkspaceMember,
} from '~~/server/utils/project-resource-share-store'
import { appendQueryParam } from '~~/shared/utils/api-url'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const shareKey = String(getRouterParam(event, 'shareKey') || '').trim()

  if (!shareKey) {
    setResponseStatus(event, 400)
    return fail('缺少 shareKey。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  const share = await withClient(event, async (db) => {
    return getActiveProjectResourceShareByKey(db, { shareKey })
  })

  if (!share) {
    setResponseStatus(event, 404)
    return fail('分享链接不存在，或已失效。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40496)
  }

  if (share.visibility === 'workspace') {
    const { user } = await requireAuth(event)
    const isMember = await withClient(event, async (db) => {
      return isActiveWorkspaceMember(db, {
        workspaceId: share.workspace_id,
        userId: user.id,
      })
    })

    if (!isMember) {
      setResponseStatus(event, 403)
      return fail('当前链接仅组织内成员可访问。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40394)
    }
  }

  const signed = createProjectResourceAccessToken({
    projectId: share.project_id,
    resourceId: share.resource_id,
    kind: 'source',
  })

  const target = appendQueryParam(
    buildServerApiEndpoint(`/projects/${share.project_id}/resources/${share.resource_id}/source`, event),
    'token',
    signed.token,
  )

  return sendRedirect(event, target, 302)
})
