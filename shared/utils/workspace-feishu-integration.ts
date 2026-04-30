export type WorkspaceFeishuExternalSourceType = 'feishu_doc' | 'feishu_wiki' | 'feishu_drive_file' | 'feishu_bitable'
export type WorkspaceFeishuAssignableRole = 'admin' | 'manager' | 'member'

export interface WorkspaceFeishuSyncPolicyPatchInput {
  autoLoginEnabled?: unknown
  defaultWorkspaceRole?: unknown
  departmentIds?: unknown
  userIds?: unknown
  groupIds?: unknown
  roleMappings?: unknown
}

export interface NormalizedWorkspaceFeishuSyncPolicyPatch {
  autoLoginEnabled: boolean
  defaultWorkspaceRole: WorkspaceFeishuAssignableRole
  departmentIds: string[]
  userIds: string[]
  groupIds: string[]
  roleMappings: Record<string, Exclude<WorkspaceFeishuAssignableRole, 'member'> | 'member'>
}

export interface WorkspaceFeishuImportSourceInput {
  type?: unknown
  token?: unknown
  title?: unknown
  content?: unknown
  originalUrl?: unknown
  versionHash?: unknown
  updatedAt?: unknown
  mimeType?: unknown
  fileName?: unknown
  metadata?: unknown
}

export interface NormalizedWorkspaceFeishuImportSource {
  type: WorkspaceFeishuExternalSourceType
  token: string
  title: string
  content: string
  originalUrl: string
  versionHash: string
  updatedAt: string
  mimeType: string
  fileName: string
  metadata: Record<string, unknown>
}

const SOURCE_TYPE_LABELS: Record<WorkspaceFeishuExternalSourceType, string> = {
  feishu_doc: '飞书文档',
  feishu_wiki: '飞书 Wiki',
  feishu_drive_file: '飞书云盘文件',
  feishu_bitable: '飞书多维表',
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeStringList(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const seen = new Set<string>()
  const items: string[] = []
  for (const rawItem of rawItems) {
    const item = normalizeString(rawItem)
    if (!item || seen.has(item))
      continue
    seen.add(item)
    items.push(item)
  }
  return items
}

function normalizeAssignableRole(value: unknown, fallback: WorkspaceFeishuAssignableRole): WorkspaceFeishuAssignableRole {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'admin' || normalized === 'manager' || normalized === 'member')
    return normalized
  return fallback
}

function normalizeSourceType(value: unknown): WorkspaceFeishuExternalSourceType | '' {
  const normalized = normalizeString(value).toLowerCase()
  if (
    normalized === 'feishu_doc'
    || normalized === 'feishu_wiki'
    || normalized === 'feishu_drive_file'
    || normalized === 'feishu_bitable'
  ) {
    return normalized
  }
  return ''
}

function stableHash(input: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function normalizeWorkspaceFeishuSyncPolicyPatch(
  input: WorkspaceFeishuSyncPolicyPatchInput,
): NormalizedWorkspaceFeishuSyncPolicyPatch {
  const rawMappings = normalizeRecord(input.roleMappings)
  const roleMappings: NormalizedWorkspaceFeishuSyncPolicyPatch['roleMappings'] = {}
  for (const [rawKey, rawRole] of Object.entries(rawMappings)) {
    const key = normalizeString(rawKey)
    const role = normalizeAssignableRole(rawRole, 'member')
    if (!key || role === 'member')
      continue
    roleMappings[key] = role
  }

  return {
    autoLoginEnabled: input.autoLoginEnabled !== false,
    defaultWorkspaceRole: 'member',
    departmentIds: normalizeStringList(input.departmentIds),
    userIds: normalizeStringList(input.userIds),
    groupIds: normalizeStringList(input.groupIds),
    roleMappings,
  }
}

export function normalizeWorkspaceFeishuImportSources(
  input: WorkspaceFeishuImportSourceInput[],
): NormalizedWorkspaceFeishuImportSource[] {
  const result: NormalizedWorkspaceFeishuImportSource[] = []
  const seen = new Set<string>()
  for (const rawSource of Array.isArray(input) ? input : []) {
    const type = normalizeSourceType(rawSource.type)
    const token = normalizeString(rawSource.token)
    if (!type || !token)
      continue
    const dedupeKey = `${type}:${token}`
    if (seen.has(dedupeKey))
      continue
    seen.add(dedupeKey)

    const title = normalizeString(rawSource.title)
    result.push({
      type,
      token,
      title: title || token,
      content: normalizeString(rawSource.content),
      originalUrl: normalizeString(rawSource.originalUrl),
      versionHash: normalizeString(rawSource.versionHash),
      updatedAt: normalizeString(rawSource.updatedAt),
      mimeType: normalizeString(rawSource.mimeType),
      fileName: normalizeString(rawSource.fileName),
      metadata: normalizeRecord(rawSource.metadata),
    })
  }
  return result
}

export function buildWorkspaceFeishuSourceHash(source: NormalizedWorkspaceFeishuImportSource): string {
  const version = source.versionHash || source.updatedAt || stableHash(source.content || source.originalUrl)
  return stableHash(`${source.type}\n${source.token}\n${version}`)
}

export function formatWorkspaceFeishuResourceTitle(source: NormalizedWorkspaceFeishuImportSource): string {
  const title = normalizeString(source.title) || normalizeString(source.fileName) || source.token
  return title || SOURCE_TYPE_LABELS[source.type]
}

export function buildWorkspaceFeishuImportedMarkdown(source: NormalizedWorkspaceFeishuImportSource): string {
  const title = formatWorkspaceFeishuResourceTitle(source)
  const label = SOURCE_TYPE_LABELS[source.type]
  const updatedAt = normalizeString(source.updatedAt)
  const originalUrl = normalizeString(source.originalUrl)
  const body = normalizeString(source.content) || '_暂无可导入文本内容。_'
  const metadataLines = [
    `来源：${label}`,
    originalUrl ? `原始链接：${originalUrl}` : '',
    updatedAt ? `更新时间：${updatedAt}` : '',
  ].filter(Boolean)

  return [
    `# ${title}`,
    '',
    ...metadataLines,
    '',
    '---',
    '',
    body,
    '',
  ].join('\n')
}
