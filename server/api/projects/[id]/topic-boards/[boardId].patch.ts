import type { ProjectTopicBoardPatchRequest } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { patchProjectTopicBoard } from '~~/server/utils/project-topic-board-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const boardId = String(getRouterParam(event, 'boardId') || '').trim()
  const body = (await readBody<ProjectTopicBoardPatchRequest>(event).catch(() => ({} as ProjectTopicBoardPatchRequest))) || {}

  if (!projectId || !boardId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 boardId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40084)
  }

  try {
    const board = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const patched = await patchProjectTopicBoard(db, {
        projectId,
        boardId,
        selectedCandidateId: body.selectedCandidateId,
        boardSummary: body.boardSummary,
        candidateUpdates: body.candidateUpdates,
      })

      if (!patched)
        throw new Error('PROJECT_TOPIC_BOARD_NOT_FOUND')

      return patched
    })

    return ok(board, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'PROJECT_TOPIC_BOARD_PATCH_FAILED'

    if (message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40483)
    }

    if (message === 'PROJECT_TOPIC_BOARD_NOT_FOUND' || message === 'PROJECT_TOPIC_CANDIDATE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('选题板或候选题不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40484)
    }

    throw error
  }
})
