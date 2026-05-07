import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const EXPORT_SERVICE_FILE = resolve(process.cwd(), 'server/services/project/project-contest-export.ts')
const EXPORT_PDF_FILE = resolve(process.cwd(), 'server/services/project/project-export-pdf.ts')
const EXPORT_ROUTE_FILE = resolve(process.cwd(), 'server/api/projects/[id]/exports/contest-bundle.post.ts')

it('竞赛化导出补齐 profile、artifact manifest、结构化 PDF 与真实导出路由', async () => {
  await access(EXPORT_SERVICE_FILE)
  await access(EXPORT_PDF_FILE)
  await access(EXPORT_ROUTE_FILE)

  const [typesSource, exportSource, pdfSource, routeSource] = await Promise.all([
    readFile(DOMAIN_TYPES_FILE, 'utf8'),
    readFile(EXPORT_SERVICE_FILE, 'utf8'),
    readFile(EXPORT_PDF_FILE, 'utf8'),
    readFile(EXPORT_ROUTE_FILE, 'utf8'),
  ])

  assert.match(typesSource, /export type ProjectExportArtifactKind[\s\S]*'bundle'[\s\S]*'pdf_report'[\s\S]*'knowledge_summary'[\s\S]*'meeting_summary'[\s\S]*'design_export'[\s\S]*'project_bundle_manifest'/, '共享类型缺少导出 artifact kind 枚举')
  assert.match(typesSource, /export interface ProjectExportProfile \{[\s\S]*id: string[\s\S]*contestId\?: string \| null[\s\S]*sections: string\[\][\s\S]*artifactKinds: ProjectExportArtifactKind\[\][\s\S]*\}/, '共享类型缺少导出 profile')
  assert.match(typesSource, /export interface ProjectExportArtifact \{[\s\S]*kind: ProjectExportArtifactKind[\s\S]*resourceId\?: string \| null[\s\S]*objectKey\?: string \| null[\s\S]*downloadPath\?: string \| null[\s\S]*\}/, '共享类型缺少导出 artifact')
  assert.match(typesSource, /export interface ProjectExportBundleManifest \{[\s\S]*profile: ProjectExportProfile[\s\S]*artifacts: ProjectExportArtifact\[\][\s\S]*knowledgeSummary: string[\s\S]*\}/, '共享类型缺少 bundle manifest')
  assert.match(typesSource, /export interface ProjectExportPdfReportPayload \{[\s\S]*title: string[\s\S]*summary: string[\s\S]*sections: Array<\{ title: string, body: string \}>[\s\S]*\}/, '共享类型缺少 PDF report payload')

  assert.match(exportSource, /export function resolveProjectExportProfiles\(/, '导出服务缺少 profile 解析')
  assert.match(exportSource, /function buildStoredZipArchive\(files: Array<\{ name: string, content: Buffer \}>\): Buffer \{/, '导出服务缺少真实 bundle zip 生成器')
  assert.match(exportSource, /export async function buildProjectContestExportBundle\(/, '导出服务缺少竞赛 bundle 构建入口')
  assert.match(exportSource, /await storage\.putObject\(/, '导出服务未把产物写入对象存储')
  assert.match(exportSource, /createProjectUploadedResource\(db, \{[\s\S]*artifactKind: input\.kind/, '导出服务未通过统一 helper 落项目资源')
  assert.match(exportSource, /kind: 'bundle'/, '导出服务未构建 bundle artifact')
  assert.match(exportSource, /kind: 'pdf_report'/, '导出服务未构建 PDF 报告 artifact')
  assert.match(exportSource, /manifest: ProjectExportBundleManifest/, '导出服务未生成统一 manifest')

  assert.match(pdfSource, /export function generateProjectExportPdfBuffer\(payload: ProjectExportPdfReportPayload\): Buffer \{/, 'PDF 服务缺少结构化渲染入口')
  assert.match(pdfSource, /STSong-Light/, 'PDF 服务未使用可渲染中文的内置字体')
  assert.match(pdfSource, /UniGB-UCS2-H/, 'PDF 服务未声明中文编码映射')
  assert.match(pdfSource, /%PDF-1\.4/, 'PDF 服务未输出真实 PDF 头')

  assert.match(routeSource, /endpoint.*contest-bundle/, '导出路由未绑定竞赛 bundle 接口')
  assert.match(routeSource, /buildProjectContestExportBundle\(/, '导出路由未调用导出服务')
  assert.match(routeSource, /return ok\(\{[\s\S]*manifest:[\s\S]*artifacts:[\s\S]*\}/, '导出路由未返回 manifest 与 artifacts')
})
