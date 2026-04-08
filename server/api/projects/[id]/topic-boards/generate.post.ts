import type { AiTopicProposalRequest, ProjectTopicBoardGenerateRequest } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { executeTopicProposal } from '~~/server/services/ai/topic-proposal-service'
import { buildTopicBoardPromptMessage, normalizeTopicBoardInput } from '~~/server/services/ai/topic-board-logic'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { createProjectTopicBoardWithCandidates } from '~~/server/utils/project-topic-board-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const body = (await readBody<ProjectTopicBoardGenerateRequest>(event).catch(() => ({ input: undefined as never }))) as Partial<ProjectTopicBoardGenerateRequest>

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40082)
  }

  try {
    const project = await withTransaction(event, async (db) => {
      const visible = await getVisibleProjectById(db, user, projectId)
      if (!visible)
        throw new Error('PROJECT_NOT_FOUND')
      return visible
    })

    const boardInput = normalizeTopicBoardInput({
      ...body.input,
      contestId: body.input?.contestId || project.contestId,
      trackId: body.input?.trackId || project.trackId,
      major: body.input?.major || '',
      candidateCount: body.input?.candidateCount || 3,
      source: body.input?.source || 'workspace_dashboard',
    })

    if (!boardInput.contestId || !boardInput.trackId) {
      setResponseStatus(event, 400)
      return fail('生成选题板前需要先锁定竞赛与赛道。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40083)
    }

    const workspaceId = String(project.workspaceId || project.teamId || '').trim()
    if (!workspaceId) {
      setResponseStatus(event, 400)
      return fail('project 缺少 workspaceId。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40085)
    }

    const request: AiTopicProposalRequest = {
      teamId: workspaceId,
      workspaceId,
      messages: [
        {
          role: 'user',
          content: buildTopicBoardPromptMessage(boardInput),
        },
      ],
      topK: boardInput.candidateCount,
      context: {
        teamId: workspaceId,
        workspaceId,
        projectId: project.id,
        contestId: boardInput.contestId,
        trackId: boardInput.trackId,
        major: boardInput.major,
        discipline: boardInput.discipline,
        topicType: boardInput.topicType,
        expectedDifficulty: boardInput.expectedDifficulty,
        keywords: boardInput.keywords,
        teamSkillTags: boardInput.teamSkillTags,
      },
    }

    const response = await executeTopicProposal(event, {
      user,
      request,
    })

    const board = await withTransaction(event, async (db) => {
      return createProjectTopicBoardWithCandidates(db, {
        workspaceId,
        projectId: project.id,
        contestId: boardInput.contestId,
        trackId: boardInput.trackId,
        boardInput,
        teamSkillProfile: response.result.teamSkillProfile,
        compareMatrix: response.result.compareMatrix,
        boardSummary: response.result.boardSummary,
        selectedCandidateId: response.result.selectedCandidateId,
        sessionId: response.result.sessionId,
        createdByUserId: user.id,
        candidates: response.result.proposals,
      })
    })

    return ok({
      ...board,
      sessionId: response.result.sessionId,
    }, response.meta)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'PROJECT_TOPIC_BOARD_GENERATE_FAILED'

    if (message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40482)
    }

    if (message === 'TOPIC_PROPOSAL_FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权使用该空间。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40382)
    }

    if (message === 'TOPIC_PROPOSAL_QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return fail('Team AI 额度不足，请扩容或等待重置。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 42982)
    }

    if (message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40482)
    }

    throw error
  }
})
