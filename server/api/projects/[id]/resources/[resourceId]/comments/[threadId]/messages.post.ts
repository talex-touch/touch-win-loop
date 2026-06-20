import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { appendProjectResourceCommentMessage } from '~~/server/utils/project-resource-comment-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const threadId = String(getRouterParam(event, 'threadId') || '').trim()
  const requestBody = await readBody<{ body?: string }>(event).catch(() => ({} as { body?: string }))

  if (!projectId || !resourceId || !threadId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId、resourceId 或 threadId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  try {
    const thread = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      return appendProjectResourceCommentMessage(db, {
        projectId,
        resourceId,
        threadId,
        actorUserId: user.id,
        body: normalizeString(requestBody.body),
      })
    })

    return ok({ thread }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40495)
    }

    if (error instanceof Error && error.message === 'COMMENT_BODY_REQUIRED') {
      setResponseStatus(event, 400)
      return fail('回复内容不能为空。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40096)
    }

    if (error instanceof Error && (error.message === 'RESOURCE_NOT_FOUND' || error.message === 'COMMENT_THREAD_NOT_FOUND')) {
      setResponseStatus(event, 404)
      return fail('评论线程不存在，或当前资源不是 markdown 协作文档。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40496)
    }

    throw error
  }
})
