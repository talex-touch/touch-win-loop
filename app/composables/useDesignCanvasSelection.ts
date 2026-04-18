import type {
  DesignElementModel,
  DesignFrameModel,
} from '~~/shared/types/domain'
import type { ComputedRef } from 'vue'
import { computed, ref, watch } from 'vue'

export type DesignCanvasSelectionScope = 'none' | 'frame' | 'element'

export interface DesignCanvasSelectionState {
  scope: DesignCanvasSelectionScope
  editingFrameId: string
  displayFrameId: string
  frameIds: string[]
  primaryFrameId: string
  elementIds: string[]
  primaryElementId: string
}

export interface DesignCanvasInteractionContext {
  effectiveTool: 'select' | 'hand' | 'pencil' | 'rectangle' | 'ellipse' | 'arrow' | 'text'
  isTemporaryHandActive: boolean
  isDeepSelectModifierPressed: boolean
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeIdentifierList(values: string[], availableIds: Set<string>): string[] {
  const nextIds: string[] = []
  const seenIds = new Set<string>()
  for (const value of values) {
    const normalized = normalizeString(value)
    if (!normalized || !availableIds.has(normalized) || seenIds.has(normalized))
      continue
    seenIds.add(normalized)
    nextIds.push(normalized)
  }
  return nextIds
}

export function createEmptyDesignCanvasSelectionState(): DesignCanvasSelectionState {
  return {
    scope: 'none',
    editingFrameId: '',
    displayFrameId: '',
    frameIds: [],
    primaryFrameId: '',
    elementIds: [],
    primaryElementId: '',
  }
}

export function useDesignCanvasSelection(input: {
  frames: ComputedRef<DesignFrameModel[]>
  elements: ComputedRef<DesignElementModel[]>
}) {
  const state = ref<DesignCanvasSelectionState>(createEmptyDesignCanvasSelectionState())

  const frameIdSet = computed(() => {
    return new Set(input.frames.value.map(frame => normalizeString(frame.id)).filter(Boolean))
  })
  const elementMap = computed(() => {
    return new Map(
      input.elements.value
        .map(element => [normalizeString(element.id), element] as const)
        .filter(([elementId]) => Boolean(elementId)),
    )
  })

  function normalizeState(value: Partial<DesignCanvasSelectionState> | DesignCanvasSelectionState): DesignCanvasSelectionState {
    const nextFrameIds = normalizeIdentifierList(value.frameIds || [], frameIdSet.value)
    let nextEditingFrameId = frameIdSet.value.has(normalizeString(value.editingFrameId))
      ? normalizeString(value.editingFrameId)
      : ''
    let nextDisplayFrameId = frameIdSet.value.has(normalizeString(value.displayFrameId))
      ? normalizeString(value.displayFrameId)
      : ''
    let nextElementIds = normalizeIdentifierList(value.elementIds || [], new Set(elementMap.value.keys()))

    if (nextEditingFrameId) {
      const scopedElementIds = nextElementIds.filter((elementId) => {
        return normalizeString(elementMap.value.get(elementId)?.frameId) === nextEditingFrameId
      })
      if (scopedElementIds.length > 0) {
        nextElementIds = scopedElementIds
      }
      else if (nextElementIds.length > 0) {
        nextEditingFrameId = ''
        nextDisplayFrameId = ''
      }
    }

    if (nextElementIds.length > 0) {
      const primaryElementId = nextElementIds.includes(normalizeString(value.primaryElementId))
        ? normalizeString(value.primaryElementId)
        : nextElementIds[0] || ''
      return {
        scope: 'element',
        editingFrameId: nextEditingFrameId || normalizeString(elementMap.value.get(primaryElementId)?.frameId),
        displayFrameId: nextDisplayFrameId || nextEditingFrameId || normalizeString(elementMap.value.get(primaryElementId)?.frameId),
        frameIds: [],
        primaryFrameId: '',
        elementIds: nextElementIds,
        primaryElementId,
      }
    }

    if (nextFrameIds.length > 0) {
      const primaryFrameId = nextFrameIds.includes(normalizeString(value.primaryFrameId))
        ? normalizeString(value.primaryFrameId)
        : nextFrameIds[0] || ''
      return {
        scope: 'frame',
        editingFrameId: '',
        displayFrameId: '',
        frameIds: nextFrameIds,
        primaryFrameId,
        elementIds: [],
        primaryElementId: '',
      }
    }

    return {
      scope: 'none',
      editingFrameId: nextEditingFrameId,
      displayFrameId: nextDisplayFrameId,
      frameIds: [],
      primaryFrameId: '',
      elementIds: [],
      primaryElementId: '',
    }
  }

  function replaceSelection(nextState: Partial<DesignCanvasSelectionState> | DesignCanvasSelectionState): void {
    state.value = normalizeState(nextState)
  }

  function clearSelection(options: { preserveEditingFrameId?: boolean } = {}): void {
    replaceSelection({
      scope: 'none',
      editingFrameId: options.preserveEditingFrameId ? state.value.editingFrameId : '',
      displayFrameId: options.preserveEditingFrameId ? state.value.displayFrameId : '',
      frameIds: [],
      primaryFrameId: '',
      elementIds: [],
      primaryElementId: '',
    })
  }

  function setFrameSelection(frameIds: string[], options: {
    primaryFrameId?: string
  } = {}): void {
    replaceSelection({
      scope: frameIds.length > 0 ? 'frame' : 'none',
      editingFrameId: '',
      displayFrameId: '',
      frameIds,
      primaryFrameId: options.primaryFrameId || '',
      elementIds: [],
      primaryElementId: '',
    })
  }

  function setElementSelection(elementIds: string[], options: {
    primaryElementId?: string
    editingFrameId?: string
    displayFrameId?: string
  } = {}): void {
    replaceSelection({
      scope: elementIds.length > 0 ? 'element' : 'none',
      editingFrameId: options.editingFrameId ?? state.value.editingFrameId,
      displayFrameId: options.displayFrameId ?? options.editingFrameId ?? state.value.displayFrameId,
      frameIds: [],
      primaryFrameId: '',
      elementIds,
      primaryElementId: options.primaryElementId || '',
    })
  }

  function enterFrameEditing(frameId: string, options: { preserveFrameSelection?: boolean } = {}): void {
    const normalizedFrameId = normalizeString(frameId)
    if (!frameIdSet.value.has(normalizedFrameId))
      return
    replaceSelection({
      scope: options.preserveFrameSelection ? 'frame' : 'none',
      editingFrameId: normalizedFrameId,
      displayFrameId: normalizedFrameId,
      frameIds: options.preserveFrameSelection ? [normalizedFrameId] : [],
      primaryFrameId: options.preserveFrameSelection ? normalizedFrameId : '',
      elementIds: [],
      primaryElementId: '',
    })
  }

  function exitFrameEditing(options: { fallbackToFrame?: boolean } = {}): void {
    const normalizedFrameId = normalizeString(state.value.editingFrameId)
    if (!normalizedFrameId) {
      clearSelection()
      return
    }
    if (options.fallbackToFrame !== false && frameIdSet.value.has(normalizedFrameId)) {
      setFrameSelection([normalizedFrameId], {
        primaryFrameId: normalizedFrameId,
      })
      return
    }
    clearSelection()
  }

  watch(
    [frameIdSet, elementMap],
    () => {
      replaceSelection(state.value)
    },
    { immediate: true },
  )

  const selectedFrameIds = computed(() => state.value.frameIds)
  const selectedFrameId = computed(() => state.value.primaryFrameId)
  const selectedElementIds = computed(() => state.value.elementIds)
  const selectedElementId = computed(() => state.value.primaryElementId)

  return {
    state,
    selectedFrameIds,
    selectedFrameId,
    selectedElementIds,
    selectedElementId,
    replaceSelection,
    clearSelection,
    setFrameSelection,
    setElementSelection,
    enterFrameEditing,
    exitFrameEditing,
  }
}
