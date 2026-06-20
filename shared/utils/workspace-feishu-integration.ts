export type WorkspaceFeishuExternalSourceType = 'feishu_doc' | 'feishu_wiki' | 'feishu_drive_file' | 'feishu_bitable'
export type WorkspaceFeishuAssignableRole = 'admin' | 'manager' | 'member'

export interface WorkspaceFeishuSyncPolicyPatchInput {
  /** @deprecated Workspace connectors no longer control platform login. */
  autoLoginEnabled?: unknown
  defaultWorkspaceRole?: unknown
  departmentIds?: unknown
  userIds?: unknown
  groupIds?: unknown
  roleMappings?: unknown
}

export interface NormalizedWorkspaceFeishuSyncPolicyPatch {
  /** @deprecated Kept for response compatibility; PATCH handlers ignore incoming values. */
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

export interface WorkspaceFeishuParsedSourceInput extends WorkspaceFeishuImportSourceInput {
  parseStatus: 'matched' | 'unsupported' | 'invalid'
  parseMessage: string
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

function normalizeFeishuImportUrl(rawUrl: unknown): URL | null {
  const value = normalizeString(rawUrl)
  if (!value)
    return null
  try {
    return new URL(value)
  }
  catch {
    try {
      return new URL(`https://${value}`)
    }
    catch {
      return null
    }
  }
}

function readFirstSearchParam(url: URL, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeString(url.searchParams.get(key))
    if (value)
      return value
  }
  return ''
}

function sanitizeFeishuPathToken(value: string): string {
  return normalizeString(value)
    .replace(/[?#].*$/g, '')
    .replace(/^\/+|\/+$/g, '')
}

function readPathTokenAfter(pathSegments: string[], markers: string[]): string {
  for (const marker of markers) {
    const index = pathSegments.findIndex(segment => segment.toLowerCase() === marker)
    if (index >= 0) {
      const token = sanitizeFeishuPathToken(pathSegments[index + 1] || '')
      if (token)
        return token
    }
  }
  return ''
}

function buildParsedSource(input: {
  type: WorkspaceFeishuExternalSourceType
  token: string
  originalUrl: string
  title?: string
  fileName?: string
  mimeType?: string
  metadata?: Record<string, unknown>
}): WorkspaceFeishuParsedSourceInput {
  return {
    type: input.type,
    token: input.token,
    title: normalizeString(input.title) || input.token,
    originalUrl: input.originalUrl,
    fileName: normalizeString(input.fileName),
    mimeType: normalizeString(input.mimeType),
    metadata: normalizeRecord(input.metadata),
    parseStatus: 'matched',
    parseMessage: '',
  }
}

export function parseWorkspaceFeishuSourceUrl(rawUrl: unknown): WorkspaceFeishuParsedSourceInput {
  const originalUrl = normalizeString(rawUrl)
  const url = normalizeFeishuImportUrl(originalUrl)
  if (!url) {
    return {
      token: '',
      title: '',
      originalUrl,
      metadata: {},
      parseStatus: 'invalid',
      parseMessage: '请输入有效的飞书链接。',
    }
  }

  const pathSegments = url.pathname
    .split('/')
    .map(segment => sanitizeFeishuPathToken(decodeURIComponent(segment)))
    .filter(Boolean)
  const tableId = readFirstSearchParam(url, ['table', 'table_id', 'tableId'])
  const viewId = readFirstSearchParam(url, ['view', 'view_id', 'viewId'])

  const bitableToken = readPathTokenAfter(pathSegments, ['base', 'bitable'])
  if (bitableToken) {
    return buildParsedSource({
      type: 'feishu_bitable',
      token: bitableToken,
      originalUrl: url.toString(),
      metadata: {
        appToken: bitableToken,
        tableId,
        viewId,
      },
    })
  }

  const wikiToken = readPathTokenAfter(pathSegments, ['wiki'])
  if (wikiToken) {
    return buildParsedSource({
      type: 'feishu_wiki',
      token: wikiToken,
      originalUrl: url.toString(),
    })
  }

  const driveFileToken = readPathTokenAfter(pathSegments, ['file'])
  if (driveFileToken) {
    return buildParsedSource({
      type: 'feishu_drive_file',
      token: driveFileToken,
      originalUrl: url.toString(),
    })
  }

  const docToken = readPathTokenAfter(pathSegments, ['docx', 'docs', 'doc'])
  if (docToken) {
    return buildParsedSource({
      type: 'feishu_doc',
      token: docToken,
      originalUrl: url.toString(),
    })
  }

  return {
    token: '',
    title: '',
    originalUrl: url.toString(),
    metadata: {},
    parseStatus: 'unsupported',
    parseMessage: '暂不支持该飞书链接类型。',
  }
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
    autoLoginEnabled: false,
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
