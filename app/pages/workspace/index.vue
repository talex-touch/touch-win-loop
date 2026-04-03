<script setup lang="ts">
import type { ApiResponse, AuthMeResult } from '~~/shared/types/domain'
import { readActiveWorkspacePreference, writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'
import {
  normalizeQueryValue,
  resolveWorkspaceOptions,
  workspaceDashboardPath,
  workspaceDetailPath,
  workspaceProjectPath,
} from '~/composables/team-ui'

useHead({
  title: '工作空间跳转中',
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

async function redirectToActiveWorkspace() {
  redirecting.value = true
  errorText.value = ''

  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    const workspaceOptions = resolveWorkspaceOptions(response.data)
    const routeWorkspaceId = normalizeQueryValue(route.query.workspaceId || route.query.teamId)
    const storedWorkspaceId = readActiveWorkspacePreference()

    const preferredWorkspaceId = [routeWorkspaceId, storedWorkspaceId]
      .map(item => String(item || '').trim())
      .find(item => item && workspaceOptions.some(option => option.workspace.id === item))

    const fallbackWorkspaceId = String(workspaceOptions[0]?.workspace.id || '').trim()
    const targetWorkspaceId = preferredWorkspaceId || fallbackWorkspaceId
    if (!targetWorkspaceId) {
      errorText.value = '当前账号暂无可访问工作空间。'
      return
    }

    writeActiveWorkspacePreference(targetWorkspaceId)

    const legacyProjectId = normalizeQueryValue(route.query.projectId)
    const targetPath = legacyProjectId
      ? workspaceProjectPath(targetWorkspaceId, legacyProjectId)
      : workspaceDetailPath(targetWorkspaceId)

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
        query: { redirect: route.fullPath || workspaceDashboardPath() },
      }, { replace: true })
      return
    }

    errorText.value = String(error?.data?.message || '工作空间入口初始化失败，请稍后重试。')
  }
  finally {
    redirecting.value = false
  }
}

onMounted(() => {
  void redirectToActiveWorkspace()
})
</script>

<template>
  <main class="p-6 flex min-h-[40vh] items-center justify-center">
    <section class="text-center space-y-3">
      <p class="text-sm text-slate-500">
        {{ redirecting ? '正在进入当前工作空间...' : '工作空间入口暂不可用。' }}
      </p>
      <p v-if="errorText" class="text-sm text-rose-600">
        {{ errorText }}
      </p>
    </section>
  </main>
</template>
