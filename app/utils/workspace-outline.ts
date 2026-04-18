import type {
  CompositionModel,
  DesignDocumentV1,
  DesignElementModel,
  DesignFrameModel,
  ProjectOutlineNode,
  WorkflowSnapshot,
  WorkflowSnapshotGroup,
  WorkflowSnapshotNode,
} from '~~/shared/types/domain'
import type { ProjectUploadTask } from '~/types/project-upload'
import type { CollabMarkdownHeadingAnchorItem } from '~/utils/collab-markdown-navigation'
import {
  designDocumentFromUnknown,
  parseDesignDocumentString,
  sceneDocumentToDesignDocument,
} from '~~/shared/utils/design-document'
import {
  parseSceneDocumentString,
  resolveCompositionElementsForFrame,
} from '~~/shared/utils/scene-document'
import { resolveProjectUploadTaskStatusText } from '~/utils/project-upload'

export type WorkspaceOutlineSurface = 'none' | 'notes' | 'design' | 'workflow' | 'project'

export type WorkspaceOutlineNodeKind =
  | 'heading'
  | 'page'
  | 'frame'
  | 'element'
  | 'asset_group'
  | 'asset'
  | 'workflow_page'
  | 'workflow_group'
  | 'workflow_node'
  | 'project_outline'
  | 'upload_task'

export interface WorkspaceOutlineLocator {
  surface: WorkspaceOutlineSurface
  kind: WorkspaceOutlineNodeKind
  resourceId?: string
  anchorId?: string
  pageId?: string
  frameId?: string
  elementId?: string
  assetId?: string
  workflowPageId?: string
  workflowGroupId?: string
  workflowNodeId?: string
  projectOutlineId?: string
  uploadSessionId?: string
}

export interface WorkspaceOutlineNode {
  id: string
  kind: WorkspaceOutlineNodeKind
  label: string
  depth: number
  meta?: string
  locator: WorkspaceOutlineLocator
  children: WorkspaceOutlineNode[]
  statusText?: string
  progressPercent?: number
}

export interface WorkspaceOutlineSection {
  id: 'current_content' | 'project_structure'
  title: string
  surface: WorkspaceOutlineSurface
  loading: boolean
  emptyText: string
  items: WorkspaceOutlineNode[]
}

export interface WorkspaceOutlineRow {
  id: string
  sectionId: WorkspaceOutlineSection['id']
  sectionTitle: string
  node: WorkspaceOutlineNode
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toCompositionModel(document: DesignDocumentV1): CompositionModel {
  return {
    kind: 'composition',
    templateKey: normalizeString(document.templateKey) || 'device-showcase',
    pages: document.pages || [],
    currentPageId: normalizeString(document.currentPageId),
    frames: document.frames || [],
    elements: document.elements || [],
    assets: document.assets || [],
    slots: document.slots,
    themeTokens: document.themeTokens,
    layoutRules: document.layoutRules,
    allowedBlocks: document.allowedBlocks,
    exportPresets: document.exportPresets,
    aspectRatio: document.aspectRatio,
    deviceFramePresetKey: document.deviceFramePresetKey,
    blocks: document.blocks,
    metadata: document.metadata,
  }
}

function normalizeOutlineText(value: unknown, fallback: string): string {
  return normalizeString(value).replace(/\s+/g, ' ') || fallback
}

function sortByGeometry<T extends { x?: number, y?: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const topGap = Number(left.y || 0) - Number(right.y || 0)
    if (topGap !== 0)
      return topGap
    const leftGap = Number(left.x || 0) - Number(right.x || 0)
    if (leftGap !== 0)
      return leftGap
    return 0
  })
}

function sortDesignFrames(frames: DesignFrameModel[], orderedFrameIds: string[]): DesignFrameModel[] {
  const frameOrder = new Map(orderedFrameIds.map((id, index) => [normalizeString(id), index]))
  return [...frames].sort((left, right) => {
    const leftIndex = frameOrder.get(normalizeString(left.id))
    const rightIndex = frameOrder.get(normalizeString(right.id))
    if (leftIndex !== undefined && rightIndex !== undefined && leftIndex !== rightIndex)
      return leftIndex - rightIndex
    if (leftIndex !== undefined)
      return -1
    if (rightIndex !== undefined)
      return 1
    return Number(left.y || 0) - Number(right.y || 0) || Number(left.x || 0) - Number(right.x || 0)
  })
}

function resolveDesignElementDisplayName(element?: DesignElementModel | null): string {
  const explicitName = normalizeString(element?.metadata?.name)
  if (explicitName)
    return explicitName

  const text = normalizeString(element?.text)
  if (text)
    return text

  const shapeKind = normalizeString(element?.shapeKind)
  if (shapeKind)
    return shapeKind

  return normalizeString(element?.type) || '未命名元素'
}

function resolveDesignFrameMeta(frame: DesignFrameModel): string {
  return [
    normalizeString(frame.kind) || 'frame',
    `${Math.round(Number(frame.width || 0))} × ${Math.round(Number(frame.height || 0))}`,
  ].filter(Boolean).join(' · ')
}

function resolveDesignAssetMeta(asset: DesignDocumentV1['assets'][number]): string {
  const sizeChunks: string[] = []
  if (Number.isFinite(Number(asset.width)) && Number(asset.width) > 0)
    sizeChunks.push(String(Math.round(Number(asset.width))))
  if (Number.isFinite(Number(asset.height)) && Number(asset.height) > 0)
    sizeChunks.push(String(Math.round(Number(asset.height))))

  return [
    normalizeString(asset.mimeType),
    sizeChunks.length === 2 ? `${sizeChunks.join(' × ')}` : '',
  ].filter(Boolean).join(' · ')
}

function buildDesignElementTreeNodes(input: {
  resourceId: string
  pageId: string
  frameId: string
  elements: DesignElementModel[]
  depth: number
}): WorkspaceOutlineNode[] {
  const nodeMap = new Map(input.elements.map(element => [normalizeString(element.id), element]))
  const childrenByParentId = new Map<string, DesignElementModel[]>()

  for (const element of input.elements) {
    const parentId = normalizeString(element.parentId)
    const groupKey = parentId && nodeMap.has(parentId) ? parentId : '__root__'
    const bucket = childrenByParentId.get(groupKey) || []
    bucket.push(element)
    childrenByParentId.set(groupKey, bucket)
  }

  const sortElements = (items: DesignElementModel[]) => {
    return [...items].sort((left, right) => {
      const zGap = Number(left.zIndex || 0) - Number(right.zIndex || 0)
      if (zGap !== 0)
        return zGap
      const topGap = Number(left.y || 0) - Number(right.y || 0)
      if (topGap !== 0)
        return topGap
      return Number(left.x || 0) - Number(right.x || 0)
    })
  }

  const visit = (parentId: string, depth: number): WorkspaceOutlineNode[] => {
    return sortElements(childrenByParentId.get(parentId) || []).map((element) => {
      const elementId = normalizeString(element.id)
      return {
        id: `design-element:${elementId}`,
        kind: 'element',
        label: resolveDesignElementDisplayName(element),
        depth,
        meta: normalizeString(element.type),
        locator: {
          surface: 'design',
          kind: 'element',
          resourceId: input.resourceId,
          pageId: input.pageId,
          frameId: input.frameId,
          elementId,
        },
        children: visit(elementId, depth + 1),
      }
    })
  }

  return visit('__root__', input.depth)
}

function buildMarkdownTreeFromHeadings(input: {
  resourceId: string
  headings: CollabMarkdownHeadingAnchorItem[]
}): WorkspaceOutlineNode[] {
  const roots: WorkspaceOutlineNode[] = []
  const stack: WorkspaceOutlineNode[] = []

  input.headings.forEach((heading, index) => {
    const depth = Math.max(0, Number(heading.level || 1) - 1)
    const node: WorkspaceOutlineNode = {
      id: normalizeString(heading.anchorId) || `heading:${index + 1}`,
      kind: 'heading',
      label: normalizeOutlineText(heading.text, `标题 ${index + 1}`),
      depth,
      locator: {
        surface: 'notes',
        kind: 'heading',
        resourceId: normalizeString(input.resourceId),
        anchorId: normalizeString(heading.anchorId),
      },
      children: [],
    }

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth)
      stack.pop()

    const parent = stack[stack.length - 1] || null
    if (parent)
      parent.children.push(node)
    else
      roots.push(node)

    stack.push(node)
  })

  return roots
}

function buildProjectOutlineTreeNodes(nodes: ProjectOutlineNode[], parentOrders: number[] = [], depth = 0): WorkspaceOutlineNode[] {
  return [...nodes]
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    .flatMap((node) => {
      const title = normalizeString(node.title)
      if (!title)
        return []

      const order = Math.max(1, Number(node.order || 1))
      const numberChain = [...parentOrders, order]
      const sourceCount = Array.isArray(node.sourceResourceIds) ? node.sourceResourceIds.length : 0
      return [{
        id: `project-outline:${normalizeString(node.id) || numberChain.join('.')}`,
        kind: 'project_outline',
        label: `${numberChain.join('.')} ${title}`,
        depth,
        meta: sourceCount > 0 ? `${sourceCount} 个来源` : undefined,
        locator: {
          surface: 'project',
          kind: 'project_outline',
          projectOutlineId: normalizeString(node.id) || numberChain.join('.'),
          resourceId: normalizeString(node.sourceResourceIds?.[0]),
        },
        children: buildProjectOutlineTreeNodes(node.children || [], numberChain, depth + 1),
      } satisfies WorkspaceOutlineNode]
    })
}

function buildUploadOutlineNodes(tasks: ProjectUploadTask[]): WorkspaceOutlineNode[] {
  return tasks.map(task => ({
    id: `upload-outline:${normalizeString(task.sessionId) || normalizeString(task.fileName)}`,
    kind: 'upload_task',
    label: normalizeString(task.fileName) || '未命名上传任务',
    depth: 0,
    locator: {
      surface: 'project',
      kind: 'upload_task',
      uploadSessionId: normalizeString(task.sessionId),
    },
    children: [],
    statusText: resolveProjectUploadTaskStatusText(task.status, task.needsFileRebind),
    progressPercent: task.status === 'finalizing'
      ? 100
      : Math.max(0, Math.min(100, Number(task.progressPercent || 0))),
  }))
}

function resolveWorkflowPageMeta(page: WorkflowSnapshot['pages'][number]): string {
  return [
    page.groupCount > 0 ? `${page.groupCount} 组` : '',
    page.nodeCount > 0 ? `${page.nodeCount} 节点` : '',
    page.edgeCount > 0 ? `${page.edgeCount} 连线` : '',
  ].filter(Boolean).join(' · ')
}

function resolveWorkflowGroupMeta(group: WorkflowSnapshotGroup): string {
  const childCount = Array.isArray(group.childNodeIds) ? group.childNodeIds.length : 0
  return [
    normalizeString(group.layoutKind),
    childCount > 0 ? `${childCount} 节点` : '',
  ].filter(Boolean).join(' · ')
}

function resolveWorkflowNodeMeta(node: WorkflowSnapshotNode): string {
  return normalizeString(node.shape)
}

function sortWorkflowGroups(groups: WorkflowSnapshotGroup[]): WorkflowSnapshotGroup[] {
  return sortByGeometry(groups)
}

function sortWorkflowNodes(nodes: WorkflowSnapshotNode[]): WorkflowSnapshotNode[] {
  return [...sortByGeometry(nodes)].sort((left, right) => {
    const topGap = Number(left.y || 0) - Number(right.y || 0)
    if (topGap !== 0)
      return topGap
    const leftGap = Number(left.x || 0) - Number(right.x || 0)
    if (leftGap !== 0)
      return leftGap
    return normalizeString(left.label || left.id).localeCompare(normalizeString(right.label || right.id))
  })
}

export function parseWorkspaceOutlineDesignDocument(rawValue: string): DesignDocumentV1 | null {
  const normalized = normalizeString(rawValue)
  if (!normalized)
    return null

  const parsedDesignDocument = parseDesignDocumentString(normalized)
  if (parsedDesignDocument)
    return designDocumentFromUnknown(parsedDesignDocument)

  const parsedSceneDocument = parseSceneDocumentString(normalized, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
  if (
    parsedSceneDocument.drawMode !== 'composition'
    || parsedSceneDocument.sourceModel.kind !== 'composition'
    || Boolean(parsedSceneDocument.metadata?.migratedFromLegacyDraw)
  ) {
    return null
  }

  return sceneDocumentToDesignDocument(parsedSceneDocument)
}

export function buildMarkdownWorkspaceOutlineNodes(input: {
  resourceId: string
  headings: CollabMarkdownHeadingAnchorItem[]
}): WorkspaceOutlineNode[] {
  return buildMarkdownTreeFromHeadings(input)
}

export function buildProjectWorkspaceOutlineNodes(input: {
  projectOutline: ProjectOutlineNode[]
  uploadTasks?: ProjectUploadTask[]
}): WorkspaceOutlineNode[] {
  const uploadNodes = buildUploadOutlineNodes(input.uploadTasks || [])
  const projectNodes = buildProjectOutlineTreeNodes(input.projectOutline || [])
  return [...uploadNodes, ...projectNodes]
}

export function buildDesignWorkspaceOutlineNodes(input: {
  resourceId: string
  document: DesignDocumentV1
}): WorkspaceOutlineNode[] {
  const resourceId = normalizeString(input.resourceId)
  const document = designDocumentFromUnknown(input.document)
  const composition = toCompositionModel(document)
  const framesByPageId = new Map<string, DesignFrameModel[]>()

  for (const frame of document.frames || []) {
    const pageId = normalizeString(frame.pageId)
    const bucket = framesByPageId.get(pageId) || []
    bucket.push(frame)
    framesByPageId.set(pageId, bucket)
  }

  const pageNodes: WorkspaceOutlineNode[] = (document.pages || []).map((page) => {
    const pageId = normalizeString(page.id)
    const pageFrames = sortDesignFrames(framesByPageId.get(pageId) || [], page.frameIds || [])
    const frameNodes = pageFrames.map((frame) => {
      const frameId = normalizeString(frame.id)
      const elements = resolveCompositionElementsForFrame(composition, frameId)
      return {
        id: `design-frame:${frameId}`,
        kind: 'frame',
        label: normalizeOutlineText(frame.name, '未命名 Frame'),
        depth: 1,
        meta: resolveDesignFrameMeta(frame),
        locator: {
          surface: 'design',
          kind: 'frame',
          resourceId,
          pageId,
          frameId,
        },
        children: buildDesignElementTreeNodes({
          resourceId,
          pageId,
          frameId,
          elements,
          depth: 2,
        }),
      } satisfies WorkspaceOutlineNode
    })

    return {
      id: `design-page:${pageId}`,
      kind: 'page',
      label: normalizeOutlineText(page.name, '未命名 Page'),
      depth: 0,
      meta: `${pageFrames.length} frame`,
      locator: {
        surface: 'design',
        kind: 'page',
        resourceId,
        pageId,
      },
      children: frameNodes,
    } satisfies WorkspaceOutlineNode
  })

  const assetChildren = (document.assets || []).map((asset) => {
    const assetId = normalizeString(asset.id)
    return {
      id: `design-asset:${assetId}`,
      kind: 'asset',
      label: normalizeOutlineText(asset.name, '未命名资源'),
      depth: 1,
      meta: resolveDesignAssetMeta(asset),
      locator: {
        surface: 'design',
        kind: 'asset',
        resourceId,
        assetId,
      },
      children: [],
    } satisfies WorkspaceOutlineNode
  })

  if (assetChildren.length > 0) {
    pageNodes.push({
      id: 'design-asset-group:assets',
      kind: 'asset_group',
      label: 'Assets',
      depth: 0,
      meta: `${assetChildren.length} 项`,
      locator: {
        surface: 'design',
        kind: 'asset_group',
        resourceId,
      },
      children: assetChildren,
    })
  }

  return pageNodes
}

export function buildWorkflowWorkspaceOutlineNodes(input: {
  resourceId: string
  snapshot: WorkflowSnapshot
}): WorkspaceOutlineNode[] {
  const resourceId = normalizeString(input.resourceId)
  return (input.snapshot.pages || []).map((page) => {
    const pageId = normalizeString(page.id)
    const nodeMap = new Map((page.nodes || []).map(node => [normalizeString(node.id), node]))
    const groupNodes = sortWorkflowGroups(page.groups || []).map((group) => {
      const childNodes = sortWorkflowNodes(
        (group.childNodeIds || [])
          .map(childId => nodeMap.get(normalizeString(childId)))
          .filter(Boolean) as WorkflowSnapshotNode[],
      ).map(node => ({
        id: `workflow-node:${pageId}:${normalizeString(node.id)}`,
        kind: 'workflow_node',
        label: normalizeOutlineText(node.label, normalizeString(node.id) || '未命名节点'),
        depth: 2,
        meta: resolveWorkflowNodeMeta(node) || undefined,
        locator: {
          surface: 'workflow',
          kind: 'workflow_node',
          resourceId,
          workflowPageId: pageId,
          workflowNodeId: normalizeString(node.id),
        },
        children: [],
      } satisfies WorkspaceOutlineNode))

      return {
        id: `workflow-group:${pageId}:${normalizeString(group.id)}`,
        kind: 'workflow_group',
        label: normalizeOutlineText(group.label, normalizeString(group.id) || '未命名分组'),
        depth: 1,
        meta: resolveWorkflowGroupMeta(group) || undefined,
        locator: {
          surface: 'workflow',
          kind: 'workflow_group',
          resourceId,
          workflowPageId: pageId,
          workflowGroupId: normalizeString(group.id),
        },
        children: childNodes,
      } satisfies WorkspaceOutlineNode
    })

    const groupedNodeIdSet = new Set((page.groups || []).flatMap(group => (group.childNodeIds || []).map(item => normalizeString(item))))
    const standaloneNodes = sortWorkflowNodes(
      (page.nodes || []).filter(node => !groupedNodeIdSet.has(normalizeString(node.id))),
    ).map(node => ({
      id: `workflow-node:${pageId}:${normalizeString(node.id)}`,
      kind: 'workflow_node',
      label: normalizeOutlineText(node.label, normalizeString(node.id) || '未命名节点'),
      depth: 1,
      meta: resolveWorkflowNodeMeta(node) || undefined,
      locator: {
        surface: 'workflow',
        kind: 'workflow_node',
        resourceId,
        workflowPageId: pageId,
        workflowNodeId: normalizeString(node.id),
      },
      children: [],
    } satisfies WorkspaceOutlineNode))

    return {
      id: `workflow-page:${pageId}`,
      kind: 'workflow_page',
      label: normalizeOutlineText(page.name, '未命名页面'),
      depth: 0,
      meta: resolveWorkflowPageMeta(page) || undefined,
      locator: {
        surface: 'workflow',
        kind: 'workflow_page',
        resourceId,
        workflowPageId: pageId,
      },
      children: [...groupNodes, ...standaloneNodes],
    } satisfies WorkspaceOutlineNode
  })
}

export function flattenWorkspaceOutlineRows(
  sections: WorkspaceOutlineSection[],
): WorkspaceOutlineRow[] {
  const rows: WorkspaceOutlineRow[] = []

  const visit = (section: WorkspaceOutlineSection, nodes: WorkspaceOutlineNode[]) => {
    for (const node of nodes) {
      rows.push({
        id: `${section.id}:${node.id}`,
        sectionId: section.id,
        sectionTitle: section.title,
        node,
      })
      if (node.children.length > 0)
        visit(section, node.children)
    }
  }

  for (const section of sections)
    visit(section, section.items || [])

  return rows
}
