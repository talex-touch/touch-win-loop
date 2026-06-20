import type {
  ProjectOutlineSnapshot,
  ProjectResourceShare,
  Resource,
  ResourcePreviewStatus,
} from '~~/shared/types/domain'
import { ref } from 'vue'

export type WorkspacePreviewMode = 'binary' | 'markdown' | 'draw'

export interface ResourcePreviewStatusPayload {
  documentId: string
  status: ResourcePreviewStatus
  stage: ResourcePreviewStatus
  progressPercent: number
  etaSeconds: number
  queuePosition: number
  attempt: number
  error: string
  previewUrl: string
  previewUrlExpiresAt: string
  sourceDownloadUrl: string
  sourceDownloadUrlExpiresAt: string
}

export function useWorkspaceProjectResources() {
  const resources = ref<Resource[]>([])
  const recycleResources = ref<Resource[]>([])
  const resourceLibrary = ref<Resource[]>([])
  const projectResourceShares = ref<ProjectResourceShare[]>([])
  const projectOutlineSnapshot = ref<ProjectOutlineSnapshot | null>(null)

  const flowResourceId = ref('')
  const previewResourceId = ref('')
  const collabBindingResourceId = ref('')
  const closingPreviewResourceId = ref('')

  const previewStatusLoading = ref(false)
  const previewStatusPayload = ref<ResourcePreviewStatusPayload | null>(null)
  const previewMode = ref<WorkspacePreviewMode>('binary')
  const markdownDerivedTitleMap = ref<Record<string, string>>({})

  const resourcesLoading = ref(false)
  const resourceLibraryLoading = ref(false)
  const projectOutlineLoading = ref(false)
  const projectOutlineFirstLoaded = ref(false)
  const projectResourceSharesLoading = ref(false)
  const resourceMutating = ref(false)

  return {
    resources,
    recycleResources,
    resourceLibrary,
    projectResourceShares,
    projectOutlineSnapshot,
    flowResourceId,
    previewResourceId,
    collabBindingResourceId,
    closingPreviewResourceId,
    previewStatusLoading,
    previewStatusPayload,
    previewMode,
    markdownDerivedTitleMap,
    resourcesLoading,
    resourceLibraryLoading,
    projectOutlineLoading,
    projectOutlineFirstLoaded,
    projectResourceSharesLoading,
    resourceMutating,
  }
}
