import type { ApiResponse } from '~~/shared/types/domain'
import type { ProjectCompetitionLoopPayload } from '~~/shared/types/project-competition-loop'
import { resolveAuthDisplayMessage } from '~/utils/auth-request'

export function useProjectCompetitionLoop() {
  const authApiFetch = useAuthApiFetch()
  const payload = ref<ProjectCompetitionLoopPayload | null>(null)
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref('')

  async function load(projectId: string) {
    const normalizedProjectId = String(projectId || '').trim()
    if (!normalizedProjectId) {
      payload.value = null
      error.value = ''
      return null
    }

    loading.value = true
    error.value = ''
    try {
      const response = await authApiFetch<ApiResponse<ProjectCompetitionLoopPayload>>(`/projects/${normalizedProjectId}/competition-loop`)
      payload.value = response.data
      return response.data
    }
    catch (requestError) {
      error.value = resolveAuthDisplayMessage(requestError, '项目参赛主链加载失败。')
      payload.value = null
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function refresh(projectId: string) {
    const normalizedProjectId = String(projectId || '').trim()
    if (!normalizedProjectId)
      return null

    refreshing.value = true
    error.value = ''
    try {
      const response = await authApiFetch<ApiResponse<ProjectCompetitionLoopPayload>>(`/projects/${normalizedProjectId}/competition-loop/refresh`, {
        method: 'POST',
      })
      payload.value = response.data
      return response.data
    }
    catch (requestError) {
      error.value = resolveAuthDisplayMessage(requestError, '项目参赛主链刷新失败。')
      return null
    }
    finally {
      refreshing.value = false
    }
  }

  return {
    payload,
    loading,
    refreshing,
    error,
    load,
    refresh,
  }
}
