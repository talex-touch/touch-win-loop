import type { Queryable } from '~~/server/utils/db'
import type { PolicyLibraryItem, PolicyLibraryItemStatus } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface PolicyLibraryItemRow {
  id: string
  meeting_name: string
  summary: string
  conference_date: string
  importance: string
  official_material: string
  official_material_link: string
  wechat_material: string
  wechat_material_link: string
  weibo_material: string
  weibo_material_link: string
  douyin_material: string
  douyin_material_link: string
  xiaohongshu_material: string
  xiaohongshu_material_link: string
  metadata: Record<string, unknown>
  status: PolicyLibraryItemStatus
  created_at: string
  updated_at: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function mapPolicyLibraryItem(row: PolicyLibraryItemRow): PolicyLibraryItem {
  return {
    id: row.id,
    meetingName: row.meeting_name,
    summary: row.summary,
    conferenceDate: row.conference_date,
    importance: row.importance,
    officialMaterial: row.official_material,
    officialMaterialLink: row.official_material_link,
    wechatMaterial: row.wechat_material,
    wechatMaterialLink: row.wechat_material_link,
    weiboMaterial: row.weibo_material,
    weiboMaterialLink: row.weibo_material_link,
    douyinMaterial: row.douyin_material,
    douyinMaterialLink: row.douyin_material_link,
    xiaohongshuMaterial: row.xiaohongshu_material,
    xiaohongshuMaterialLink: row.xiaohongshu_material_link,
    metadata: normalizeMetadata(row.metadata),
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listPolicyLibraryItems(
  db: Queryable,
  input: {
    status?: PolicyLibraryItemStatus | ''
  } = {},
): Promise<PolicyLibraryItem[]> {
  const values: unknown[] = []
  const where: string[] = ['1=1']

  if (input.status) {
    values.push(input.status)
    where.push(`status = $${values.length}`)
  }

  const result = await db.query<PolicyLibraryItemRow>(
    `SELECT
      id,
      meeting_name,
      summary,
      conference_date,
      importance,
      official_material,
      official_material_link,
      wechat_material,
      wechat_material_link,
      weibo_material,
      weibo_material_link,
      douyin_material,
      douyin_material_link,
      xiaohongshu_material,
      xiaohongshu_material_link,
      metadata,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM policy_library_items
     WHERE ${where.join(' AND ')}
     ORDER BY updated_at DESC, created_at DESC`,
    values,
  )

  return result.rows.map(mapPolicyLibraryItem)
}

export async function getPolicyLibraryItemById(
  db: Queryable,
  policyId: string,
): Promise<PolicyLibraryItem | null> {
  const result = await db.query<PolicyLibraryItemRow>(
    `SELECT
      id,
      meeting_name,
      summary,
      conference_date,
      importance,
      official_material,
      official_material_link,
      wechat_material,
      wechat_material_link,
      weibo_material,
      weibo_material_link,
      douyin_material,
      douyin_material_link,
      xiaohongshu_material,
      xiaohongshu_material_link,
      metadata,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM policy_library_items
     WHERE id = $1
     LIMIT 1`,
    [policyId],
  )

  const row = result.rows[0]
  return row ? mapPolicyLibraryItem(row) : null
}

export async function createPolicyLibraryItem(
  db: Queryable,
  input: {
    actorUserId: string
    meetingName: string
    summary?: string
    conferenceDate?: string
    importance?: string
    officialMaterial?: string
    officialMaterialLink?: string
    wechatMaterial?: string
    wechatMaterialLink?: string
    weiboMaterial?: string
    weiboMaterialLink?: string
    douyinMaterial?: string
    douyinMaterialLink?: string
    xiaohongshuMaterial?: string
    xiaohongshuMaterialLink?: string
    metadata?: Record<string, unknown>
    status?: PolicyLibraryItemStatus
  },
): Promise<PolicyLibraryItem> {
  const id = randomUUID()
  const now = new Date().toISOString()

  await db.query(
    `INSERT INTO policy_library_items (
      id,
      meeting_name,
      summary,
      conference_date,
      importance,
      official_material,
      official_material_link,
      wechat_material,
      wechat_material_link,
      weibo_material,
      weibo_material_link,
      douyin_material,
      douyin_material_link,
      xiaohongshu_material,
      xiaohongshu_material_link,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16::JSONB, $17, $18, $18, $19, $19
    )`,
    [
      id,
      normalizeString(input.meetingName),
      normalizeString(input.summary),
      normalizeString(input.conferenceDate),
      normalizeString(input.importance),
      normalizeString(input.officialMaterial),
      normalizeString(input.officialMaterialLink),
      normalizeString(input.wechatMaterial),
      normalizeString(input.wechatMaterialLink),
      normalizeString(input.weiboMaterial),
      normalizeString(input.weiboMaterialLink),
      normalizeString(input.douyinMaterial),
      normalizeString(input.douyinMaterialLink),
      normalizeString(input.xiaohongshuMaterial),
      normalizeString(input.xiaohongshuMaterialLink),
      JSON.stringify(normalizeMetadata(input.metadata)),
      input.status || 'active',
      input.actorUserId,
      now,
    ],
  )

  return getPolicyLibraryItemById(db, id).then(item => item!)
}

export async function patchPolicyLibraryItem(
  db: Queryable,
  input: {
    actorUserId: string
    policyId: string
    patch: {
      meetingName?: string
      summary?: string
      conferenceDate?: string
      importance?: string
      officialMaterial?: string
      officialMaterialLink?: string
      wechatMaterial?: string
      wechatMaterialLink?: string
      weiboMaterial?: string
      weiboMaterialLink?: string
      douyinMaterial?: string
      douyinMaterialLink?: string
      xiaohongshuMaterial?: string
      xiaohongshuMaterialLink?: string
      metadata?: Record<string, unknown>
      status?: PolicyLibraryItemStatus
    }
  },
): Promise<PolicyLibraryItem | null> {
  const values: unknown[] = [input.policyId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.meetingName !== undefined)
    addSet('meeting_name', normalizeString(input.patch.meetingName))
  if (input.patch.summary !== undefined)
    addSet('summary', normalizeString(input.patch.summary))
  if (input.patch.conferenceDate !== undefined)
    addSet('conference_date', normalizeString(input.patch.conferenceDate))
  if (input.patch.importance !== undefined)
    addSet('importance', normalizeString(input.patch.importance))
  if (input.patch.officialMaterial !== undefined)
    addSet('official_material', normalizeString(input.patch.officialMaterial))
  if (input.patch.officialMaterialLink !== undefined)
    addSet('official_material_link', normalizeString(input.patch.officialMaterialLink))
  if (input.patch.wechatMaterial !== undefined)
    addSet('wechat_material', normalizeString(input.patch.wechatMaterial))
  if (input.patch.wechatMaterialLink !== undefined)
    addSet('wechat_material_link', normalizeString(input.patch.wechatMaterialLink))
  if (input.patch.weiboMaterial !== undefined)
    addSet('weibo_material', normalizeString(input.patch.weiboMaterial))
  if (input.patch.weiboMaterialLink !== undefined)
    addSet('weibo_material_link', normalizeString(input.patch.weiboMaterialLink))
  if (input.patch.douyinMaterial !== undefined)
    addSet('douyin_material', normalizeString(input.patch.douyinMaterial))
  if (input.patch.douyinMaterialLink !== undefined)
    addSet('douyin_material_link', normalizeString(input.patch.douyinMaterialLink))
  if (input.patch.xiaohongshuMaterial !== undefined)
    addSet('xiaohongshu_material', normalizeString(input.patch.xiaohongshuMaterial))
  if (input.patch.xiaohongshuMaterialLink !== undefined)
    addSet('xiaohongshu_material_link', normalizeString(input.patch.xiaohongshuMaterialLink))
  if (input.patch.metadata !== undefined)
    addSet('metadata', JSON.stringify(normalizeMetadata(input.patch.metadata)))
  if (input.patch.status !== undefined)
    addSet('status', input.patch.status)

  if (!sets.length)
    return getPolicyLibraryItemById(db, input.policyId)

  addSet('updated_by_user_id', input.actorUserId)
  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE policy_library_items
     SET ${sets.join(', ')}
     WHERE id = $1`,
    values,
  )

  return getPolicyLibraryItemById(db, input.policyId)
}
