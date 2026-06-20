import {
  normalizeQueryValue as normalizeQueryParam,
  normalizeRouteParam,
  projectWorkspacePath,
  teamDetailPath,
} from '~/composables/team-ui'

export function workspaceDetailPath(workspaceId: string, projectId = ''): string {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  const normalizedProjectId = String(projectId || '').trim()
  if (normalizedWorkspaceId && normalizedProjectId)
    return projectWorkspacePath(normalizedWorkspaceId, normalizedProjectId)
  return teamDetailPath(normalizedWorkspaceId)
}

export function useWorkspaceProjectRoute() {
  const route = useRoute()

  const routeWorkspaceId = computed(() => {
    const params = route.params as Record<string, string | string[] | undefined>
    return normalizeRouteParam(params.teamId || params.workspaceId)
  })

  const routeProjectId = computed(() => {
    const params = route.params as Record<string, string | string[] | undefined>
    return normalizeRouteParam(params.projectId || '')
  })

  const highlightedProjectId = computed(() => routeProjectId.value || normalizeQueryParam(route.query.projectId))

  async function ensureCanonicalWorkspaceProjectRoute(): Promise<boolean> {
    if (!route.path.startsWith('/workspace/'))
      return false

    const params = route.params as Record<string, string | string[] | undefined>
    const workspaceId = normalizeRouteParam(params.teamId || params.workspaceId)
    const projectId = normalizeRouteParam(params.projectId)
    if (!workspaceId || !projectId)
      return false

    await navigateTo({
      path: workspaceDetailPath(workspaceId, projectId),
      query: route.query,
    }, { replace: true })
    return true
  }

  return {
    routeWorkspaceId,
    routeProjectId,
    highlightedProjectId,
    ensureCanonicalWorkspaceProjectRoute,
  }
}
