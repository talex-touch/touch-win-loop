<script setup lang="ts">
import type { ApiResponse, AuthSessionProbeResult, Invitation } from '~~/shared/types/domain'
import { normalizeRouteParam, projectWorkspacePath, teamDashboardPath, teamDetailPath } from '~/composables/team-ui'
import { writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'
import { logAuthProbeDegraded, resolveAuthDisplayMessage, resolveAuthRequestErrorInfo } from '~/utils/auth-request'

definePageMeta({
  layout: false,
})

useHead({
  title: '加入项目协作 - WinLoop',
})

const route = useRoute()
const { endpoint } = useApiEndpoint()
const authApiFetch = useAuthApiFetch()

const loading = ref(true)
const errorText = ref('')
const hasAuthenticatedSession = ref(false)

const fallbackActionLabel = computed(() => {
  return hasAuthenticatedSession.value ? '返回 Team 项目台' : '前往登录'
})

async function detectAuthenticatedSession(): Promise<boolean> {
  try {
    await authApiFetch<ApiResponse<AuthSessionProbeResult>>('/auth/session')
    hasAuthenticatedSession.value = true
    return true
  }
  catch (error) {
    const info = resolveAuthRequestErrorInfo(error)
    if (info.isUnauthorized) {
      hasAuthenticatedSession.value = false
      return false
    }

    hasAuthenticatedSession.value = info.isForbidden
    if (!info.isForbidden) {
      logAuthProbeDegraded({
        context: 'invite-page',
        route: route.fullPath || '/invite',
        error,
      })
    }
    errorText.value = resolveAuthDisplayMessage(error, '登录态校验失败，请稍后重试。')
    return false
  }
}

async function ensureLoggedIn(): Promise<boolean> {
  errorText.value = ''
  const hasSession = await detectAuthenticatedSession()
  if (hasSession)
    return true

  if (errorText.value) {
    loading.value = false
    return false
  }

  await navigateTo({
    path: '/login',
    query: {
      redirect: route.fullPath || teamDashboardPath(),
    },
  }, { replace: true })
  return false
}

function normalizeTokenParam(): string {
  const params = route.params as Record<string, string | string[] | undefined>
  return normalizeRouteParam(params.token)
}

async function openJoinedDestination(invitation: Invitation) {
  const workspaceId = String(invitation.teamId || invitation.workspaceId || '').trim()
  if (!workspaceId)
    throw new Error('TEAM_ID_MISSING')

  const projectId = String(invitation.projectId || '').trim()

  writeActiveWorkspacePreference(workspaceId)
  await navigateTo({
    path: projectId ? projectWorkspacePath(workspaceId, projectId) : teamDetailPath(workspaceId),
    query: {
      joined: '1',
    },
  }, { replace: true })
}

function resolveInvitationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'TEAM_ID_MISSING')
    return '邀请已接受，但未解析到 Team，请返回项目台后重试。'

  const message = String((error as { data?: { message?: string } })?.data?.message || '').trim()
  return message || '加入项目协作失败，请确认邀请链接是否有效。'
}

async function openFallbackAction() {
  if (hasAuthenticatedSession.value) {
    await navigateTo(teamDashboardPath())
    return
  }

  await navigateTo('/login')
}

async function acceptInvitationByToken() {
  await detectAuthenticatedSession()

  const token = normalizeTokenParam()
  if (!token) {
    errorText.value = '邀请链接无效：缺少 token。'
    loading.value = false
    return
  }

  const hasLogin = await ensureLoggedIn()
  if (!hasLogin)
    return

  try {
    const response = await unsafeFetch<ApiResponse<{ invitation: Invitation }>>(endpoint(`/invitations/${encodeURIComponent(token)}/accept`), {
      method: 'POST',
    })
    await openJoinedDestination(response.data.invitation)
  }
  catch (error: unknown) {
    hasAuthenticatedSession.value = true
    errorText.value = resolveInvitationErrorMessage(error)
    loading.value = false
  }
}

onMounted(() => {
  void acceptInvitationByToken()
})
</script>

<template>
  <div class="wl-auth-shell">
    <PageShell size="auth" gap="lg">
      <PageHeader title="加入项目协作" description="正在验证邀请并准备跳转到对应项目台。" />

      <SectionCard>
        <StateBlock
          v-if="loading"
          tone="loading"
          description="正在验证邀请并加入项目协作..."
        />

        <StateBlock
          v-else
          tone="error"
          :description="errorText || '邀请处理失败，请稍后重试。'"
        >
          <ActionBar class="mt-4">
            <button
              class="dense-btn"
              type="button"
              @click="openFallbackAction"
            >
              {{ fallbackActionLabel }}
            </button>
          </ActionBar>
        </StateBlock>
      </SectionCard>
    </PageShell>
  </div>
</template>
