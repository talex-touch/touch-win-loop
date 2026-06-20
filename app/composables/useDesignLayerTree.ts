import type { ComputedRef } from 'vue'
import type {
  DesignElementModel,
  DesignFrameModel,
  DesignPageModel,
} from '~~/shared/types/domain'
import { computed } from 'vue'

export type DesignLayerTreeNodeType = 'page' | 'page_root_group' | 'frame' | 'frame_children_group' | 'element'

export interface DesignLayerTreeNode {
  id: string
  type: DesignLayerTreeNodeType
  label: string
  pageId: string
  frameId?: string
  elementId?: string
  locked?: boolean
  hidden?: boolean
  children?: DesignLayerTreeNode[]
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolveElementLabel(element: DesignElementModel): string {
  const explicitName = normalizeString(element.metadata?.name)
  if (explicitName)
    return explicitName
  if (normalizeString(element.text))
    return normalizeString(element.text).replace(/\s+/g, ' ').slice(0, 48)
  if (element.type === 'shape' && normalizeString(element.shapeKind))
    return normalizeString(element.shapeKind)
  return element.type
}

function buildElementTreeNodes(input: {
  elements: DesignElementModel[]
  pageId: string
  frameId?: string
}): DesignLayerTreeNode[] {
  const elementIdSet = new Set(
    input.elements
      .map(element => normalizeString(element.id))
      .filter(Boolean),
  )
  const childrenByParentId = new Map<string, DesignElementModel[]>()
  const rootElements: DesignElementModel[] = []

  for (const element of input.elements) {
    const parentId = normalizeString(element.parentId)
    if (parentId && elementIdSet.has(parentId)) {
      const siblings = childrenByParentId.get(parentId) || []
      siblings.push(element)
      childrenByParentId.set(parentId, siblings)
      continue
    }
    rootElements.push(element)
  }

  function resolveElementNode(
    element: DesignElementModel,
    ancestorIds: Set<string> = new Set(),
  ): DesignLayerTreeNode {
    const normalizedElementId = normalizeString(element.id)
    const nextAncestorIds = new Set(ancestorIds)
    nextAncestorIds.add(normalizedElementId)
    const childElements = (childrenByParentId.get(normalizedElementId) || [])
      .filter(child => !nextAncestorIds.has(normalizeString(child.id)))

    return {
      id: `element:${normalizedElementId}`,
      type: 'element',
      label: resolveElementLabel(element),
      pageId: input.pageId,
      frameId: input.frameId,
      elementId: normalizedElementId,
      locked: element.locked,
      hidden: element.hidden,
      children: childElements.length
        ? childElements.map(child => resolveElementNode(child, nextAncestorIds))
        : [],
    }
  }

  return rootElements.map(element => resolveElementNode(element))
}

export function useDesignLayerTree(input: {
  page: ComputedRef<DesignPageModel | null>
  frames: ComputedRef<DesignFrameModel[]>
  pageRootElements: ComputedRef<DesignElementModel[]>
  resolveFrameElements: (frame: DesignFrameModel) => DesignElementModel[]
}) {
  const tree = computed<DesignLayerTreeNode[]>(() => {
    const page = input.page.value
    if (!page)
      return []

    const frameNodes = input.frames.value.map((frame) => {
      const frameChildren = buildElementTreeNodes({
        elements: input.resolveFrameElements(frame),
        pageId: frame.pageId,
        frameId: frame.id,
      })
      return {
        id: `frame:${frame.id}`,
        type: 'frame',
        label: frame.name,
        pageId: frame.pageId,
        frameId: frame.id,
        locked: frame.locked,
        children: frameChildren,
      } satisfies DesignLayerTreeNode
    })

    const pageRootElements = buildElementTreeNodes({
      elements: input.pageRootElements.value,
      pageId: page.id,
    })

    return [
      {
        id: `page:${page.id}`,
        type: 'page',
        label: page.name,
        pageId: page.id,
        children: [
          ...(pageRootElements.length
            ? [
                {
                  id: `page-root:${page.id}`,
                  type: 'page_root_group',
                  label: '页面元素',
                  pageId: page.id,
                  children: pageRootElements,
                } satisfies DesignLayerTreeNode,
              ]
            : []),
          ...frameNodes,
        ],
      },
    ]
  })

  return {
    tree,
  }
}
