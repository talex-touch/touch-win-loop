import type { Queryable } from '~~/server/utils/db'
import { setResponseStatus } from 'h3'
import { buildContestDefensePersonaDrafts } from '~~/server/services/ai/defense-context'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import {
  buildDefensePersonaImportDraftsFromPresets,
  listDefensePersonaPresetsByContestExternalId,
  pickDefensePersonaPresetsForImport,
} from '~~/server/utils/defense-persona-preset-store'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getFeishuExternalRefByEntityId } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  createProjectDefensePersona,
  listProjectDefensePersonas,
  patchProjectDefensePersona,
} from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

interface ImportDefensePersonaBody {
  contestId?: string
  trackId?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

async function loadPersonaImportDrafts(input: {
  db: Queryable
  contestId: string
  trackId: string
  includeInternal: boolean
}) {
  const contestRef = await getFeishuExternalRefByEntityId(input.db, {
    scope: 'contest',
    entityId: input.contestId,
  })
  const contestExternalId = normalizeString(contestRef?.externalId)
  const trackExternalId = input.trackId
    ? normalizeString((await getFeishuExternalRefByEntityId(input.db, {
        scope: 'track',
        entityId: input.trackId,
      }))?.externalId)
    : ''

  if (contestExternalId) {
    const presetCandidates = await listDefensePersonaPresetsByContestExternalId(input.db, {
      contestExternalId,
    })
    const matchedPresets = pickDefensePersonaPresetsForImport({
      presets: presetCandidates,
      trackExternalId,
    })
    if (matchedPresets.length > 0) {
      return buildDefensePersonaImportDraftsFromPresets({
        presets: matchedPresets,
        sourceContestId: input.contestId,
        sourceTrackId: input.trackId || null,
      })
    }
  }

  return buildContestDefensePersonaDrafts(input.db, {
    contestId: input.contestId,
    trackId: input.trackId,
    includeInternal: input.includeInternal,
  })
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = await readBody<ImportDefensePersonaBody>(event).catch(() => ({} as ImportDefensePersonaBody))
  const contestId = normalizeString(body?.contestId)
  const trackId = normalizeString(body?.trackId)

  if (!projectId || !contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  try {
    const payload = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      const drafts = await loadPersonaImportDrafts({
        db,
        contestId,
        trackId,
        includeInternal,
      })
      if (drafts.length === 0)
        throw new Error('CONTEST_NOT_FOUND')

      const existing = await listProjectDefensePersonas(db, { projectId })
      const existingByTemplate = new Map(
        existing
          .filter(item => item.sourceTemplateKey)
          .map(item => [item.sourceTemplateKey!, item]),
      )
      const changed = []

      for (const draft of drafts) {
        const matched = existingByTemplate.get(draft.sourceTemplateKey || '')
        if (matched && matched.isCustomized)
          continue

        if (matched) {
          const patched = await patchProjectDefensePersona(db, {
            projectId,
            personaId: matched.id,
            actorUserId: user.id,
            patch: {
              judgeType: draft.judgeType,
              name: draft.name,
              summary: draft.summary,
              systemPrompt: draft.systemPrompt,
              focusAreas: draft.focusAreas,
              scoringRubric: draft.scoringRubric,
              enabled: draft.enabled,
              sortOrder: draft.sortOrder,
              isCustomized: false,
              sourceContestId: draft.sourceContestId,
              sourceTrackId: draft.sourceTrackId,
              sourceTemplateKey: draft.sourceTemplateKey,
            },
          })
          if (patched)
            changed.push(patched)
          continue
        }

        changed.push(await createProjectDefensePersona(db, {
          projectId,
          sourceContestId: draft.sourceContestId,
          sourceTrackId: draft.sourceTrackId,
          sourceTemplateKey: draft.sourceTemplateKey,
          judgeType: draft.judgeType,
          name: draft.name,
          summary: draft.summary,
          systemPrompt: draft.systemPrompt,
          focusAreas: draft.focusAreas,
          scoringRubric: draft.scoringRubric,
          enabled: draft.enabled,
          sortOrder: draft.sortOrder,
          isCustomized: false,
          actorUserId: user.id,
        }))
      }

      return {
        items: await listProjectDefensePersonas(db, { projectId }),
        changed,
      }
    })

    return ok(payload, {
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
      return fail('当前用户无权导入项目答辩人设。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40397)
    }
    if (error instanceof Error && error.message === 'CONTEST_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('未找到对应竞赛配置，无法导入答辩人设。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40497)
    }
    throw error
  }
})
