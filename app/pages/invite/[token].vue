<script setup lang="ts">
import type { ApiResponse, AuthMeResult, Invitation } from '~~/shared/types/domain'
import { normalizeRouteParam, projectWorkspacePath, teamDashboardPath, teamDetailPath } from '~/composables/team-ui'
import { writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

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
    await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    hasAuthenticatedSession.value = true
    return true
  }
  catch {
    hasAuthenticatedSession.value = false
    return false
  }
}

async function ensureLoggedIn(): Promise<boolean> {
  const hasSession = await detectAuthenticatedSession()
  if (hasSession)
    return true

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
    const response = await $fetch<ApiResponse<{ invitation: Invitation }>>(endpoint(`/invitations/${encodeURIComponent(token)}/accept`), {
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
  <main class="p-4 bg-slate-100 flex min-h-screen items-center justify-center">
    <section class="p-6 border border-slate-200 rounded-xl bg-white max-w-md w-full space-y-4">
      <h1 class="text-xl text-slate-900 font-semibold">
        加入项目协作
      </h1>

      <p v-if="loading" class="text-sm text-slate-500">
        正在验证邀请并加入项目协作...
      </p>

      <template v-else>
        <p class="text-sm text-rose-700">
          {{ errorText || '邀请处理失败，请稍后重试。' }}
        </p>
        <button
          class="text-sm text-slate-700 font-semibold px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-100"
          @click="openFallbackAction"
        >
          {{ fallbackActionLabel }}
        </button>
      </template>
    </section>
  </main>
</template>
