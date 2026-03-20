import type { ResourceCategory } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { ensureContestLibrarySeeded } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface ResourceOverviewRow {
  contest_id: string
  contest_name: string
  category: ResourceCategory
  total_count: string
  invalid_count: string
  pending_verify_count: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权访问资料管理。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40393)
  }

  const resources = await withClient(event, async (db) => {
    await ensureContestLibrarySeeded(db, user.id)

    const result = await db.query<ResourceOverviewRow>(
      `SELECT
        c.id AS contest_id,
        c.name AS contest_name,
        r.category,
        COUNT(r.id)::TEXT AS total_count,
        COUNT(r.id) FILTER (WHERE r.status = 'invalid')::TEXT AS invalid_count,
        COUNT(r.id) FILTER (WHERE r.status = 'pending_verify')::TEXT AS pending_verify_count
       FROM contests c
       JOIN contest_resources r ON r.contest_id = c.id
       GROUP BY c.id, c.name, r.category
       ORDER BY c.updated_at DESC, total_count DESC`,
    )

    return result.rows.map(row => ({
      contestId: row.contest_id,
      contestName: row.contest_name,
      category: row.category,
      count: Number(row.total_count || '0'),
      invalidCount: Number(row.invalid_count || '0'),
      pendingVerifyCount: Number(row.pending_verify_count || '0'),
    }))
  })

  return ok(resources, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
