import type { Ref } from 'vue'
import type {
  CompositionModel,
  DesignElementModel,
  DesignFrameModel,
  DesignPageModel,
  SceneDocument,
} from '~~/shared/types/domain'
import { computed } from 'vue'
import {
  canDesignFrameContainElements,
  resolveCompositionElementsForPage,
  resolveDesignFrameEditableElements,
} from '~~/shared/utils/scene-document'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function cloneDesignElement(element: DesignElementModel): DesignElementModel {
  return {
    ...element,
    points: element.points ? element.points.map(point => ({ ...point })) : undefined,
    style: element.style ? { ...element.style } : undefined,
    metadata: element.metadata ? { ...element.metadata } : undefined,
  }
}

function dedupeDesignElements(elements: DesignElementModel[]): DesignElementModel[] {
  const elementMap = new Map<string, DesignElementModel>()
  for (const element of elements) {
    const elementId = normalizeString(element.id)
    if (!elementId)
      continue
    elementMap.set(elementId, element)
  }
  return [...elementMap.values()]
}

export interface DesignSelectionState {
  frameIds: Ref<string[]>
  primaryFrameId: Ref<string>
  elementIds: Ref<string[]>
  primaryElementId: Ref<string>
}

export interface DesignViewportState {
  x: Ref<number>
  y: Ref<number>
  zoom: Ref<number>
}

export function useDesignEditorState(input: {
  draftDocument: Ref<SceneDocument>
  selection: DesignSelectionState
  viewport: DesignViewportState
}) {
  const composition = computed<CompositionModel>(() => {
    return input.draftDocument.value.sourceModel.kind === 'composition'
      ? input.draftDocument.value.sourceModel
      : {
          kind: 'composition',
          templateKey: 'device-showcase',
          pages: [],
          currentPageId: '',
          frames: [],
          elements: [],
          assets: [],
        }
  })

  const pages = computed<DesignPageModel[]>(() => composition.value.pages || [])
  const currentPage = computed<DesignPageModel | null>(() => {
    return pages.value.find(page => normalizeString(page.id) === normalizeString(composition.value.currentPageId)) || pages.value[0] || null
  })
  const currentPageFrames = computed<DesignFrameModel[]>(() => {
    return (composition.value.frames || []).filter(frame => normalizeString(frame.pageId) === normalizeString(currentPage.value?.id))
  })
  const selectedFrames = computed<DesignFrameModel[]>(() => {
    const selectedIdSet = new Set(input.selection.frameIds.value.map(item => normalizeString(item)).filter(Boolean))
    return currentPageFrames.value.filter(frame => selectedIdSet.has(frame.id))
  })
  const selectedFrame = computed<DesignFrameModel | null>(() => {
    return selectedFrames.value.find(frame => frame.id === normalizeString(input.selection.primaryFrameId.value)) || selectedFrames.value[0] || null
  })
  const pageRootElements = computed<DesignElementModel[]>(() => {
    if (!currentPage.value)
      return []
    return resolveCompositionElementsForPage(composition.value, currentPage.value.id).map(cloneDesignElement)
  })
  const selectedFrameElements = computed<DesignElementModel[]>(() => {
    if (!selectedFrame.value)
      return []
    return resolveDesignFrameEditableElements(composition.value, selectedFrame.value).map(cloneDesignElement)
  })
  const allPageElements = computed<DesignElementModel[]>(() => {
    const frameElements = currentPageFrames.value.flatMap((frame) => {
      return resolveDesignFrameEditableElements(composition.value, frame).map(cloneDesignElement)
    })
    return dedupeDesignElements([...pageRootElements.value, ...frameElements])
  })
  const selectedElements = computed<DesignElementModel[]>(() => {
    const selectedIdSet = new Set(input.selection.elementIds.value.map(item => normalizeString(item)).filter(Boolean))
    return allPageElements.value.filter(element => selectedIdSet.has(element.id))
  })
  const selectedElement = computed<DesignElementModel | null>(() => {
    return selectedElements.value.find(element => element.id === normalizeString(input.selection.primaryElementId.value)) || selectedElements.value[0] || null
  })
  const activeContainerFrame = computed<DesignFrameModel | null>(() => {
    return canDesignFrameContainElements(selectedFrame.value) ? selectedFrame.value : null
  })
  const editorSnapshot = computed(() => {
    return {
      pageId: currentPage.value?.id || '',
      frameId: selectedFrame.value?.id || '',
      elementId: selectedElement.value?.id || '',
      viewport: {
        x: input.viewport.x.value,
        y: input.viewport.y.value,
        zoom: input.viewport.zoom.value,
      },
    }
  })

  return {
    composition,
    pages,
    currentPage,
    currentPageFrames,
    pageRootElements,
    allPageElements,
    selectedFrames,
    selectedFrame,
    selectedFrameElements,
    selectedElements,
    selectedElement,
    activeContainerFrame,
    editorSnapshot,
  }
}
