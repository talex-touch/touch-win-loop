<script setup lang="ts">
import type { ApiResponse, AuthMeResult } from '~~/shared/types/domain'
import {
  normalizeQueryValue,
  projectWorkspacePath,
  resolveWorkspaceOptions,
  teamDashboardPath,
  teamDetailPath,
} from '~/composables/team-ui'
import { readActiveWorkspacePreference, writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

useHead({
  title: '项目台跳转中',
})

const route = useRoute()
const authApiFetch = useAuthApiFetch()

const redirecting = ref(true)
const errorText = ref('')

function buildForwardQuery(): Record<string, string> | undefined {
  const nextQuery: Record<string, string> = {}

  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'teamId' || key === 'workspaceId' || key === 'projectId')
      continue

    const normalized = normalizeQueryValue(value)
    if (normalized)
      nextQuery[key] = normalized
  }

  return Object.keys(nextQuery).length > 0 ? nextQuery : undefined
}

async function redirectToActiveTeamDashboard() {
  redirecting.value = true
  errorText.value = ''

  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    const workspaceOptions = resolveWorkspaceOptions(response.data)
    const routeTeamId = normalizeQueryValue(route.query.teamId || route.query.workspaceId)
    const storedWorkspaceId = readActiveWorkspacePreference()

    const preferredWorkspaceId = [routeTeamId, storedWorkspaceId]
      .map(item => String(item || '').trim())
      .find(item => item && workspaceOptions.some(option => option.workspace.id === item))

    const fallbackWorkspaceId = String(workspaceOptions[0]?.workspace.id || '').trim()
    const targetWorkspaceId = preferredWorkspaceId || fallbackWorkspaceId
    if (!targetWorkspaceId) {
      errorText.value = '当前账号暂无可访问项目台。'
      return
    }

    writeActiveWorkspacePreference(targetWorkspaceId)

    const legacyProjectId = normalizeQueryValue(route.query.projectId)
    const targetPath = legacyProjectId
      ? projectWorkspacePath(targetWorkspaceId, legacyProjectId)
      : teamDetailPath(targetWorkspaceId)

    await navigateTo({
      path: targetPath,
      query: buildForwardQuery(),
    }, { replace: true })
  }
  catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status)
    if (statusCode === 401) {
      await navigateTo({
        path: '/login',
        query: { redirect: route.fullPath || teamDashboardPath() },
      }, { replace: true })
      return
    }

    errorText.value = String(error?.data?.message || '项目台入口初始化失败，请稍后重试。')
  }
  finally {
    redirecting.value = false
  }
}

onMounted(() => {
  void redirectToActiveTeamDashboard()
})
</script>

<template>
  <PageShell size="auth" gap="lg">
    <PageHeader title="Team 项目台" description="正在根据当前账号上下文选择默认项目台。" />

    <SectionCard>
      <StateBlock
        :tone="redirecting ? 'loading' : (errorText ? 'error' : 'default')"
        :description="redirecting ? '正在进入当前项目台...' : '项目台入口暂不可用。'"
      >
        <p v-if="errorText" class="wl-inline-notice wl-inline-notice--error mt-4">
          {{ errorText }}
        </p>
      </StateBlock>
    </SectionCard>
  </PageShell>
</template>
