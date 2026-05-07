import type { Queryable } from '~~/server/utils/db'
import type {
  Project,
  ProjectExportArtifact,
  ProjectExportArtifactKind,
  ProjectExportBundleManifest,
  ProjectExportPdfReportPayload,
  ProjectExportProfile,
  Resource,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import { findContestById } from '~~/server/data/catalog'
import { generateProjectExportPdfBuffer } from '~~/server/services/project/project-export-pdf'
import { buildDocumentObjectKey, selectDocumentWriteStorage } from '~~/server/storage/document-storage'
import { buildServerApiEndpoint } from '~~/server/utils/api-url'
import { buildProjectKnowledgeIndexDashboard } from '~~/server/utils/project-knowledge-store'
import { listProjectMeetings } from '~~/server/utils/project-meeting-store'
import {
  createProjectUploadedResource,
  getProjectCollabSnapshot,
  listProjectResources,
} from '~~/server/utils/project-resource-store'
import { renderCompositionAssetToSvg, sceneDocumentFromUnknown } from '~~/shared/utils/scene-document'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeFileName(value: string, fallback: string): string {
  const sanitized = normalizeString(value).replace(/[\\/:*?"<>|]+/g, '-')
  return sanitized || fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function buildProjectExportTitle(project: Project): string {
  return normalizeString(project.title) || 'WinLoop 项目导出'
}

export function resolveProjectExportProfiles(input: {
  contestId?: string | null
}): ProjectExportProfile[] {
  const profiles: ProjectExportProfile[] = [
    {
      id: 'generic-contest-bundle',
      title: '通用竞赛导出包',
      contestId: null,
      summary: '面向通用竞赛场景的项目资料、知识摘要、会议纪要与设计展示导出。',
      sections: ['项目概览', '知识库摘要', '会议纪要', '设计展示'],
      artifactKinds: ['bundle', 'pdf_report', 'knowledge_summary', 'meeting_summary', 'design_export', 'project_bundle_manifest'],
    },
    {
      id: 'internet-plus-pitch-bundle',
      title: '互联网+ 路演导出包',
      contestId: 'internet-plus',
      summary: '强调商业价值、项目亮点、路演纪要与展示物料的导出配置。',
      sections: ['项目亮点', '商业价值', '路演纪要', '展示物料'],
      artifactKinds: ['bundle', 'pdf_report', 'knowledge_summary', 'meeting_summary', 'design_export', 'project_bundle_manifest'],
    },
    {
      id: 'service-outsourcing-delivery-bundle',
      title: '服务外包交付导出包',
      contestId: 'service-outsourcing',
      summary: '强调工程交付、需求理解、答辩纪要与演示设计稿的导出配置。',
      sections: ['工程概览', '交付清单', '答辩纪要', '设计演示'],
      artifactKinds: ['bundle', 'pdf_report', 'knowledge_summary', 'meeting_summary', 'design_export', 'project_bundle_manifest'],
    },
  ]

  const contestId = normalizeString(input.contestId)
  if (!contestId)
    return profiles

  return [
    ...profiles.filter(profile => normalizeString(profile.contestId) === contestId),
    ...profiles.filter(profile => !normalizeString(profile.contestId)),
  ]
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let round = 0; round < 8; round += 1)
      value = (value & 1) === 1 ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1)
    table[index] = value >>> 0
  }
  return table
}

const CRC32_TABLE = buildCrc32Table()

function calcCrc32(buffer: Buffer): number {
  let crc = 0xFFFFFFFF
  for (const byte of buffer)
    crc = (CRC32_TABLE[(crc ^ byte) & 0xFF] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function buildStoredZipArchive(files: Array<{ name: string, content: Buffer }>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8')
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content)
    const crc32 = calcCrc32(content)

    const localHeader = Buffer.alloc(30 + nameBuffer.length)
    localHeader.writeUInt32LE(0x04034B50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(crc32, 14)
    localHeader.writeUInt32LE(content.length, 18)
    localHeader.writeUInt32LE(content.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)
    nameBuffer.copy(localHeader, 30)

    const centralHeader = Buffer.alloc(46 + nameBuffer.length)
    centralHeader.writeUInt32LE(0x02014B50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc32, 16)
    centralHeader.writeUInt32LE(content.length, 20)
    centralHeader.writeUInt32LE(content.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    nameBuffer.copy(centralHeader, 46)

    localParts.push(localHeader, content)
    centralParts.push(centralHeader)
    offset += localHeader.length + content.length
  }

  const centralDirectoryOffset = offset
  const centralDirectory = Buffer.concat(centralParts)
  const ending = Buffer.alloc(22)
  ending.writeUInt32LE(0x06054B50, 0)
  ending.writeUInt16LE(0, 4)
  ending.writeUInt16LE(0, 6)
  ending.writeUInt16LE(files.length, 8)
  ending.writeUInt16LE(files.length, 10)
  ending.writeUInt32LE(centralDirectory.length, 12)
  ending.writeUInt32LE(centralDirectoryOffset, 16)
  ending.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, ending])
}

function buildKnowledgeSummaryText(dashboard: Awaited<ReturnType<typeof buildProjectKnowledgeIndexDashboard>>): string {
  const summary = dashboard.summary
  return [
    `已索引资源 ${summary.readyCount}/${summary.totalResources}，处理中 ${summary.processingCount}，待处理 ${summary.pendingCount}，失败 ${summary.failedCount}，stale ${summary.staleCount}。`,
    dashboard.sources
      .filter(source => source.status !== 'ready')
      .slice(0, 5)
      .map(source => `- ${source.resourceTitle}：${source.status}${normalizeString(source.lastError) ? `（${normalizeString(source.lastError)}）` : ''}`)
      .join('\n'),
  ].filter(Boolean).join('\n')
}

function buildMeetingSummaryText(meetings: Awaited<ReturnType<typeof listProjectMeetings>>): string {
  if (meetings.length === 0)
    return '暂无项目会议记录。'

  return meetings.map((meeting, index) => {
    return [
      `${index + 1}. ${normalizeString(meeting.title) || '未命名会议'}`,
      `   模式：${meeting.mode === 'video' ? '音视频' : '音频'} · 状态：${meeting.status}`,
      `   开始：${meeting.startedAt || '未开始'} · 结束：${meeting.endedAt || '进行中'}`,
    ].join('\n')
  }).join('\n')
}

function readDrawSnapshotSource(update: Uint8Array): string {
  const doc = new Y.Doc()
  if (update.length > 0)
    Y.applyUpdate(doc, update)
  const drawMap = doc.getMap('draw')
  const nodes = drawMap.get('nodes')
  const normalized = nodes instanceof Y.Array ? nodes.toArray() : []
  if (normalized.length === 1 && isRecord(normalized[0]))
    return JSON.stringify(normalized[0], null, 2)
  return JSON.stringify(normalized, null, 2)
}

async function resolveDesignExportSvg(db: Queryable, input: {
  projectId: string
  resources: Resource[]
  projectTitle: string
}): Promise<Buffer | null> {
  const designResource = input.resources.find((resource) => {
    const metadata = normalizeMetadata(resource.metadata)
    return resource.source === 'collab'
      && resource.resourceKind === 'draw'
      && normalizeString(metadata.collabPurpose) === 'design'
  })
  if (!designResource)
    return null

  const snapshot = await getProjectCollabSnapshot(db, {
    projectId: input.projectId,
    resourceId: designResource.id,
  })
  if (!snapshot)
    return null

  try {
    const sourceText = readDrawSnapshotSource(snapshot.update)
    const sceneDocument = sceneDocumentFromUnknown(JSON.parse(sourceText), {
      fallbackDrawMode: 'composition',
      fallbackSourceType: 'image_mockup',
    })
    const svgMarkup = renderCompositionAssetToSvg(sceneDocument, {})
    return Buffer.from(svgMarkup, 'utf8')
  }
  catch {
    const fallbackSvg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">`,
      '<rect width="1440" height="900" fill="#f8fafc"/>',
      '<rect x="72" y="72" width="1296" height="756" rx="28" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>',
      `<text x="120" y="180" font-size="48" fill="#0f172a">${normalizeString(input.projectTitle) || 'WinLoop 设计导出'}</text>`,
      `<text x="120" y="260" font-size="28" fill="#475569">设计资源存在，但当前导出回退到摘要展示图。</text>`,
      '</svg>',
    ].join('')
    return Buffer.from(fallbackSvg, 'utf8')
  }
}

async function persistArtifactResource(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    kind: ProjectExportArtifactKind
    title: string
    fileName: string
    mimeType: string
    body: Buffer
    summary: string
    profileId: string
  },
): Promise<ProjectExportArtifact> {
  const storage = await selectDocumentWriteStorage({
    incomingBytes: input.body.length,
  })
  const objectKey = buildDocumentObjectKey(`project-${input.projectId}-exports`, input.fileName)
  await storage.putObject({
    key: objectKey,
    body: input.body,
    contentType: input.mimeType,
  })

  const resource = await createProjectUploadedResource(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSize: input.body.length,
    objectKey,
    storageProvider: storage.channelId,
    title: input.title,
    summary: input.summary,
    category: 'templates',
    accessLevel: 'login_required',
    metadata: {
      exportArtifact: true,
      artifactKind: input.kind,
      exportProfileId: input.profileId,
    },
  })

  return {
    id: randomUUID(),
    kind: input.kind,
    title: input.title,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.body.length,
    resourceId: resource.id,
    objectKey,
    downloadPath: buildServerApiEndpoint(`/projects/${input.projectId}/resources/${resource.id}/file`),
  }
}

export async function buildProjectContestExportBundle(
  db: Queryable,
  input: {
    project: Project
    actorUserId: string
    profileId?: string | null
  },
): Promise<{
  manifest: ProjectExportBundleManifest
  artifacts: ProjectExportArtifact[]
}> {
  const projectTitle = buildProjectExportTitle(input.project)
  const contestId = normalizeString(input.project.contestId) || null
  const profiles = resolveProjectExportProfiles({ contestId })
  const profile = profiles.find(item => item.id === normalizeString(input.profileId)) || profiles[0]
  if (!profile)
    throw new Error('EXPORT_PROFILE_NOT_FOUND')
  const [resources, dashboard, meetings, designSvgBuffer] = await Promise.all([
    listProjectResources(db, input.project.id),
    buildProjectKnowledgeIndexDashboard(db, {
      projectId: input.project.id,
      syncSources: false,
    }),
    listProjectMeetings(db, {
      projectId: input.project.id,
      limit: 12,
    }),
    resolveDesignExportSvg(db, {
      projectId: input.project.id,
      resources: await listProjectResources(db, input.project.id),
      projectTitle,
    }),
  ])

  const knowledgeSummary = buildKnowledgeSummaryText(dashboard)
  const meetingSummary = buildMeetingSummaryText(meetings)
  const contest = contestId ? findContestById(contestId) : undefined
  const pdfPayload: ProjectExportPdfReportPayload = {
    title: `${projectTitle} · ${profile.title}`,
    summary: normalizeString(input.project.summary) || `面向 ${contest?.name || '当前竞赛'} 的结构化导出报告。`,
    sections: [
      {
        title: '项目概览',
        body: [
          `项目名称：${projectTitle}`,
          `竞赛：${contest?.name || contestId || '未绑定'}`,
          `赛道：${normalizeString(input.project.trackId) || '未绑定'}`,
          `简介：${normalizeString(input.project.summary) || '暂无项目摘要。'}`,
        ].join('\n'),
      },
      {
        title: '知识库摘要',
        body: knowledgeSummary,
      },
      {
        title: '会议纪要摘要',
        body: meetingSummary,
      },
      {
        title: '资料清单',
        body: resources.slice(0, 24).map((resource, index) => {
          return `${index + 1}. ${normalizeString(resource.title) || '未命名资源'} [${resource.source}/${resource.resourceKind}]`
        }).join('\n') || '暂无资料。',
      },
    ],
  }
  const pdfBuffer = generateProjectExportPdfBuffer(pdfPayload)

  const manifestBaseArtifacts: ProjectExportArtifact[] = [
    {
      id: randomUUID(),
      kind: 'knowledge_summary',
      title: '知识库摘要',
      fileName: 'knowledge-summary.md',
      mimeType: 'text/markdown',
      size: Buffer.byteLength(knowledgeSummary, 'utf8'),
      resourceId: null,
      objectKey: null,
      downloadPath: null,
    },
    {
      id: randomUUID(),
      kind: 'meeting_summary',
      title: '会议纪要摘要',
      fileName: 'meeting-summary.md',
      mimeType: 'text/markdown',
      size: Buffer.byteLength(meetingSummary, 'utf8'),
      resourceId: null,
      objectKey: null,
      downloadPath: null,
    },
  ]

  const designArtifact = designSvgBuffer
    ? {
        id: randomUUID(),
        kind: 'design_export' as const,
        title: '设计稿导出图',
        fileName: 'design-export.svg',
        mimeType: 'image/svg+xml',
        size: designSvgBuffer.length,
        resourceId: null,
        objectKey: null,
        downloadPath: null,
      }
    : null

  const manifest: ProjectExportBundleManifest = {
    id: randomUUID(),
    projectId: input.project.id,
    contestId,
    profile,
    generatedAt: new Date().toISOString(),
    knowledgeSummary,
    artifacts: [...manifestBaseArtifacts, ...(designArtifact ? [designArtifact] : [])],
  }

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  const zipBuffer = buildStoredZipArchive([
    { name: 'manifest.json', content: manifestBuffer },
    { name: 'knowledge/summary.md', content: Buffer.from(knowledgeSummary, 'utf8') },
    { name: 'meetings/summary.md', content: Buffer.from(meetingSummary, 'utf8') },
    { name: 'report/export-report.pdf', content: pdfBuffer },
    { name: 'project/resources.json', content: Buffer.from(JSON.stringify(resources, null, 2), 'utf8') },
    ...(designSvgBuffer
      ? [{ name: 'design/design-export.svg', content: designSvgBuffer }]
      : []),
  ])

  const persistedArtifacts: ProjectExportArtifact[] = []
  persistedArtifacts.push(await persistArtifactResource(db, {
    projectId: input.project.id,
    actorUserId: input.actorUserId,
    kind: 'bundle',
    title: `${projectTitle} · 导出包`,
    fileName: normalizeFileName(`${projectTitle}-bundle.zip`, 'winloop-project-bundle.zip'),
    mimeType: 'application/zip',
    body: zipBuffer,
    summary: `${profile.title} 已生成 ZIP 导出包。`,
    profileId: profile.id,
  }))
  persistedArtifacts.push(await persistArtifactResource(db, {
    projectId: input.project.id,
    actorUserId: input.actorUserId,
    kind: 'pdf_report',
    title: `${projectTitle} · PDF 报告`,
    fileName: normalizeFileName(`${projectTitle}-report.pdf`, 'winloop-project-report.pdf'),
    mimeType: 'application/pdf',
    body: pdfBuffer,
    summary: `${profile.title} 已生成 PDF 报告。`,
    profileId: profile.id,
  }))
  persistedArtifacts.push(await persistArtifactResource(db, {
    projectId: input.project.id,
    actorUserId: input.actorUserId,
    kind: 'project_bundle_manifest',
    title: `${projectTitle} · 导出清单`,
    fileName: normalizeFileName(`${projectTitle}-manifest.json`, 'winloop-project-manifest.json'),
    mimeType: 'application/json',
    body: manifestBuffer,
    summary: `${profile.title} 已生成 manifest 清单。`,
    profileId: profile.id,
  }))
  if (designSvgBuffer) {
    persistedArtifacts.push(await persistArtifactResource(db, {
      projectId: input.project.id,
      actorUserId: input.actorUserId,
      kind: 'design_export',
      title: `${projectTitle} · 设计稿导出图`,
      fileName: normalizeFileName(`${projectTitle}-design-export.svg`, 'winloop-design-export.svg'),
      mimeType: 'image/svg+xml',
      body: designSvgBuffer,
      summary: `${profile.title} 已生成设计稿导出图。`,
      profileId: profile.id,
    }))
  }

  manifest.artifacts = [...manifest.artifacts, ...persistedArtifacts]
  return {
    manifest,
    artifacts: manifest.artifacts,
  }
}
