import type { Buffer } from 'node:buffer'
import type { FeishuBitableRecord } from '~~/server/services/feishu/client'
import type { NormalizedWorkspaceFeishuImportSource } from '~~/shared/utils/workspace-feishu-integration'
import { createHash } from 'node:crypto'
import {
  downloadFeishuDriveMedia,
  getFeishuDocxRawContent,
  getFeishuWikiNodeInfo,
  listFeishuBitableRecords,
} from '~~/server/services/feishu/client'
import {
  buildWorkspaceFeishuImportedMarkdown,
  buildWorkspaceFeishuSourceHash,
  formatWorkspaceFeishuResourceTitle,
} from '~~/shared/utils/workspace-feishu-integration'

export type WorkspaceFeishuResolvedImportSource
  = | {
    kind: 'markdown'
    source: NormalizedWorkspaceFeishuImportSource
    title: string
    markdown: string
    summary: string
    sourceHash: string
    originalUrl: string
    metadata: Record<string, unknown>
  }
  | {
    kind: 'binary'
    source: NormalizedWorkspaceFeishuImportSource
    title: string
    fileName: string
    mimeType: string
    buffer: Buffer
    sourceHash: string
    originalUrl: string
    metadata: Record<string, unknown>
  }

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function withContent(
  source: NormalizedWorkspaceFeishuImportSource,
  content: string,
  metadata?: Record<string, unknown>,
): NormalizedWorkspaceFeishuImportSource {
  return {
    ...source,
    content,
    versionHash: source.versionHash || hashText(content),
    metadata: {
      ...source.metadata,
      ...normalizeRecord(metadata),
    },
  }
}

function buildMarkdownResult(
  source: NormalizedWorkspaceFeishuImportSource,
  content: string,
  metadata?: Record<string, unknown>,
): WorkspaceFeishuResolvedImportSource {
  const resolvedSource = withContent(source, content, metadata)
  const markdown = buildWorkspaceFeishuImportedMarkdown(resolvedSource)
  return {
    kind: 'markdown',
    source: resolvedSource,
    title: formatWorkspaceFeishuResourceTitle(resolvedSource),
    markdown,
    summary: content.slice(0, 200),
    sourceHash: buildWorkspaceFeishuSourceHash(resolvedSource),
    originalUrl: resolvedSource.originalUrl,
    metadata: {
      ...resolvedSource.metadata,
      contentHash: hashText(content),
    },
  }
}

function parseBitableLocator(source: NormalizedWorkspaceFeishuImportSource): {
  appToken: string
  tableId: string
  viewId: string
} {
  const metadata = normalizeRecord(source.metadata)
  const tokenParts = source.token.split(':').map(normalizeString).filter(Boolean)
  return {
    appToken: normalizeString(metadata.appToken) || tokenParts[0] || source.token,
    tableId: normalizeString(metadata.tableId) || tokenParts[1] || '',
    viewId: normalizeString(metadata.viewId) || tokenParts[2] || '',
  }
}

function stringifyBitableFieldValue(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (Array.isArray(value)) {
    return value
      .map(item => stringifyBitableFieldValue(item))
      .filter(Boolean)
      .join('、')
  }
  const record = normalizeRecord(value)
  const text = normalizeString(record.text)
    || normalizeString(record.name)
    || normalizeString(record.link)
    || normalizeString(record.url)
    || normalizeString(record.file_token)
  return text || JSON.stringify(record)
}

function buildBitableMarkdown(records: FeishuBitableRecord[]): string {
  if (records.length === 0)
    return '_暂无记录。_'

  const fieldNames = [...new Set(records.flatMap(record => Object.keys(record.fields || {})))].slice(0, 30)
  if (fieldNames.length === 0) {
    return records
      .map(record => `- ${record.recordId}`)
      .join('\n')
  }

  const header = ['record_id', ...fieldNames]
  const rows = records.map(record => [
    record.recordId,
    ...fieldNames.map(fieldName => stringifyBitableFieldValue(record.fields?.[fieldName]).replace(/\n+/g, ' ')),
  ])
  const escapeCell = (value: string) => normalizeString(value).replace(/\|/g, '\\|')
  return [
    `| ${header.map(escapeCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n')
}

function parseContentDispositionFileName(contentDisposition: string): string {
  const value = normalizeString(contentDisposition)
  if (!value)
    return ''

  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    }
    catch {
      return encoded
    }
  }

  const quoted = value.match(/filename="([^"]+)"/i)?.[1]
  if (quoted)
    return quoted
  return value.match(/filename=([^;]+)/i)?.[1] || ''
}

function assertTenantToken(tenantAccessToken: string): void {
  if (!normalizeString(tenantAccessToken))
    throw new Error('FEISHU_TENANT_TOKEN_REQUIRED')
}

async function resolveDocxImportSource(input: {
  tenantAccessToken: string
  source: NormalizedWorkspaceFeishuImportSource
  documentId: string
  metadata?: Record<string, unknown>
}): Promise<WorkspaceFeishuResolvedImportSource> {
  assertTenantToken(input.tenantAccessToken)
  const content = await getFeishuDocxRawContent({
    tenantAccessToken: input.tenantAccessToken,
    documentId: input.documentId,
  })
  return buildMarkdownResult(input.source, content, {
    ...normalizeRecord(input.metadata),
    documentId: input.documentId,
  })
}

async function resolveBitableImportSource(input: {
  tenantAccessToken: string
  source: NormalizedWorkspaceFeishuImportSource
  locator?: { appToken: string, tableId: string, viewId?: string }
}): Promise<WorkspaceFeishuResolvedImportSource> {
  assertTenantToken(input.tenantAccessToken)
  const locator = input.locator || parseBitableLocator(input.source)
  if (!locator.appToken || !locator.tableId)
    throw new Error('FEISHU_BITABLE_LOCATOR_REQUIRED')

  const records = await listFeishuBitableRecords({
    tenantAccessToken: input.tenantAccessToken,
    appToken: locator.appToken,
    tableId: locator.tableId,
    viewId: locator.viewId,
  })
  return buildMarkdownResult(input.source, buildBitableMarkdown(records), {
    appToken: locator.appToken,
    tableId: locator.tableId,
    viewId: normalizeString(locator.viewId),
    recordCount: records.length,
  })
}

export async function resolveWorkspaceFeishuImportSource(input: {
  tenantAccessToken: string
  source: NormalizedWorkspaceFeishuImportSource
}): Promise<WorkspaceFeishuResolvedImportSource> {
  const source = input.source
  if (source.content)
    return buildMarkdownResult(source, source.content)

  if (source.type === 'feishu_drive_file') {
    assertTenantToken(input.tenantAccessToken)
    const media = await downloadFeishuDriveMedia({
      tenantAccessToken: input.tenantAccessToken,
      fileToken: source.token,
    })
    const fileName = normalizeString(source.fileName)
      || parseContentDispositionFileName(media.contentDisposition)
      || source.token
    const mimeType = normalizeString(source.mimeType) || media.contentType || 'application/octet-stream'
    const sourceHash = buildWorkspaceFeishuSourceHash({
      ...source,
      versionHash: source.versionHash || hashBuffer(media.buffer),
    })
    return {
      kind: 'binary',
      source,
      title: formatWorkspaceFeishuResourceTitle({
        ...source,
        fileName,
      }),
      fileName,
      mimeType,
      buffer: media.buffer,
      sourceHash,
      originalUrl: source.originalUrl,
      metadata: {
        ...source.metadata,
        fileName,
        mimeType,
        fileSize: media.buffer.length,
        contentHash: hashBuffer(media.buffer),
      },
    }
  }

  if (source.type === 'feishu_bitable')
    return resolveBitableImportSource({ tenantAccessToken: input.tenantAccessToken, source })

  if (source.type === 'feishu_wiki') {
    assertTenantToken(input.tenantAccessToken)
    const node = await getFeishuWikiNodeInfo({
      tenantAccessToken: input.tenantAccessToken,
      token: source.token,
    })
    if (!node?.objToken)
      throw new Error('FEISHU_WIKI_NODE_NOT_FOUND')
    const objType = normalizeString(node.objType).toLowerCase()
    if (objType === 'bitable' || objType === 'base') {
      const metadata = normalizeRecord(source.metadata)
      return resolveBitableImportSource({
        tenantAccessToken: input.tenantAccessToken,
        source,
        locator: {
          appToken: node.objToken,
          tableId: normalizeString(metadata.tableId),
          viewId: normalizeString(metadata.viewId),
        },
      })
    }
    return resolveDocxImportSource({
      tenantAccessToken: input.tenantAccessToken,
      source,
      documentId: node.objToken,
      metadata: {
        wikiToken: source.token,
        wikiObjType: node.objType,
      },
    })
  }

  return resolveDocxImportSource({
    tenantAccessToken: input.tenantAccessToken,
    source,
    documentId: source.token,
  })
}
