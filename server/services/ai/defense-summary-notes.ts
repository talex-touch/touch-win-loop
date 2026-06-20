import type { Queryable } from '~~/server/utils/db'
import * as projectResourceStore from '~~/server/utils/project-resource-store'

interface DefenseSummaryNotesRow {
  id: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export async function ensureProjectDefenseSummaryNotesResource(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
  },
): Promise<string> {
  const existing = await db.query<DefenseSummaryNotesRow>(
    `SELECT id
     FROM project_resources
     WHERE project_id = $1
       AND status = 'active'
       AND source = 'collab'
       AND resource_kind = 'markdown'
       AND COALESCE(metadata->>'defenseSummaryNotes', '') = 'true'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.projectId],
  )

  const existingId = normalizeString(existing.rows[0]?.id)
  if (existingId)
    return existingId

  const created = await projectResourceStore.createProjectCollabResource(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    kind: 'markdown',
    purpose: 'notes',
    title: '模拟答辩总结',
    summary: 'Loopy 模拟答辩自动生成的总结文档。',
    category: 'templates',
    metadata: {
      defenseSummaryNotes: true,
    },
  })

  return created.resource.id
}

export async function syncProjectDefenseSummaryNotes(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    resourceId?: string | null
    markdown: string
  },
): Promise<string> {
  const resourceId = normalizeString(input.resourceId) || await ensureProjectDefenseSummaryNotesResource(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
  })

  await projectResourceStore.overwriteProjectMarkdownCollabResource(db, {
    projectId: input.projectId,
    resourceId,
    actorUserId: input.actorUserId,
    markdown: input.markdown,
  })

  return resourceId
}
