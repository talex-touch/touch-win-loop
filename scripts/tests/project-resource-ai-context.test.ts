import type { Resource } from '~~/shared/types/domain'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/platform-store', () => ({
  getVisibleProjectById: vi.fn(),
}))

vi.mock('~~/server/utils/project-resource-store', () => ({
  listProjectResources: vi.fn(),
}))

function makeResource(partial: Partial<Resource> & Pick<Resource, 'id' | 'title'>): Resource {
  return {
    id: partial.id,
    contestId: partial.contestId || '',
    projectId: partial.projectId || 'project-1',
    title: partial.title,
    type: partial.type || 'templates',
    year: partial.year || 2026,
    sourceLink: partial.sourceLink || '',
    availability: partial.availability || 'login_required',
    summary: partial.summary || '',
    copyrightNote: partial.copyrightNote || '',
    ...partial,
  }
}

describe('project resource ai context', () => {
  it('资源摘要会暴露多模态描述符供 workspace agent 选择草案工具', async () => {
    const { buildProjectResourceLocalContext } = await import('~~/server/services/ai/project-resource-context')
    const summary = buildProjectResourceLocalContext([
      makeResource({
        id: 'image-1',
        title: '首页截图',
        source: 'upload',
        metadata: {
          fileName: 'home.png',
          mimeType: 'image/png',
        },
        documentId: 'doc-1',
        previewStatus: 'succeeded',
        summary: '移动端首页视觉稿',
      }),
      makeResource({
        id: 'notes-1',
        title: '答辩纪要',
        source: 'collab',
        resourceKind: 'markdown',
        collabPurpose: 'notes',
        summary: '导师反馈和修改建议',
      }),
      makeResource({
        id: 'workflow-1',
        title: '业务流程',
        source: 'collab',
        resourceKind: 'draw',
        collabPurpose: 'workflow',
        drawMode: 'diagram',
        sceneSourceType: 'manual',
      }),
      makeResource({
        id: 'design-1',
        title: 'Mockup 设计画布',
        source: 'collab',
        resourceKind: 'draw',
        collabPurpose: 'design',
        drawMode: 'composition',
        sceneSourceType: 'image_mockup',
      }),
      makeResource({
        id: 'arrangement-1',
        title: '设备排布',
        source: 'collab',
        resourceKind: 'binary',
        metadata: {
          mimeType: 'application/vnd.winloop.device-arrangement+json',
          deviceArrangement: true,
        },
        sourceLink: '/api/projects/project-1/device-arrangements/arrangement-1',
      }),
    ], {
      contestName: '首页 设备排布 业务流程 答辩',
      limit: 8,
    })

    expect(summary).toContain('项目多模态资源摘要')
    expect(summary).toContain('media=image')
    expect(summary).toContain('图片/OCR/视觉投影候选')
    expect(summary).toContain('协作笔记/AgentDoc 文档')
    expect(summary).toContain('可生成文档草案')
    expect(summary).toContain('AgentProto workflow 画布')
    expect(summary).toContain('可生成 workflow 草案')
    expect(summary).toContain('设计画布')
    expect(summary).toContain('image_mockup')
    expect(summary).toContain('device_arrangement')
    expect(summary).toContain('可用于生成设计排布/原型草案')
    expect(summary).toContain('previewStatus=succeeded')
  })

  it('workspace agent 提示明确使用多模态描述符区分文档、workflow 与 scene 草案', async () => {
    const orchestratorSource = await readFile(
      resolve(process.cwd(), 'server/services/ai/workspace-orchestrator.ts'),
      'utf8',
    )

    expect(orchestratorSource).toMatch(/多模态资源摘要/)
    expect(orchestratorSource).toMatch(/media\/resourceKind\/collabPurpose\/drawMode\/sceneSourceType\/device_arrangement\/mockup\/previewStatus/)
    expect(orchestratorSource).toMatch(/markdown\/notes\/document 走文档草案/)
    expect(orchestratorSource).toMatch(/workflow draw 走 workflow 草案/)
    expect(orchestratorSource).toMatch(/design\/freeform\/device_arrangement\/mockup 走 scene 草案/)
    expect(orchestratorSource).toMatch(/只有 markdown\/notes\/document 文档上下文才生成 propose_document_change/)
  })
})
