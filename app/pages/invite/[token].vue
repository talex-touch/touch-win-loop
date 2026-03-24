<script setup lang="ts">
import type { ApiResponse, AuthMeResult, Invitation } from '~~/shared/types/domain'

definePageMeta({
  layout: false,
})

useHead({
  title: '加入 Team - WinLoop',
})

const route = useRoute()
const { endpoint } = useApiEndpoint()
const authApiFetch = useAuthApiFetch()

const loading = ref(true)
const errorText = ref('')
const acceptedInvitation = ref<Invitation | null>(null)

const targetWorkspacePath = computed(() => {
  const teamId = String(acceptedInvitation.value?.teamId || acceptedInvitation.value?.workspaceId || '').trim()
  if (!teamId)
    return '/team'
  return `/team/${teamId}`
})

function normalizeTokenParam(): string {
  const params = route.params as Record<string, string | string[] | undefined>
  const raw = params.token
  if (Array.isArray(raw))
    return String(raw[0] || '').trim()
  return String(raw || '').trim()
}

async function ensureLoggedIn(): Promise<boolean> {
  try {
    await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    return true
  }
  catch {
    await navigateTo({
      path: '/login',
      query: {
        redirect: route.fullPath || '/team',
      },
    }, { replace: true })
    return false
  }
}

async function acceptInvitationByToken() {
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
    acceptedInvitation.value = response.data.invitation
    loading.value = false
  }
  catch (error: unknown) {
    const message = String((error as { data?: { message?: string } })?.data?.message || '').trim()
    errorText.value = message || '加入 Team 失败，请确认邀请链接是否有效。'
    loading.value = false
  }
}

function openWorkspaceAfterAccept() {
  navigateTo(targetWorkspacePath.value)
}

onMounted(() => {
  void acceptInvitationByToken()
})
</script>

<template>
  <main class="p-4 bg-slate-100 flex min-h-screen items-center justify-center">
    <section class="p-6 border border-slate-200 rounded-xl bg-white max-w-md w-full space-y-4">
      <h1 class="text-xl text-slate-900 font-semibold">
        加入 Team
      </h1>

      <p v-if="loading" class="text-sm text-slate-500">
        正在验证邀请并加入 Team...
      </p>

      <template v-else-if="acceptedInvitation">
        <p class="text-sm text-emerald-700">
          邀请已接受，你已加入该 Team。
        </p>
        <p class="text-xs text-slate-500">
          角色：{{ acceptedInvitation.role }} · 邀请时间：{{ acceptedInvitation.createdAt }}
        </p>
        <button
          class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-700"
          @click="openWorkspaceAfterAccept"
        >
          打开 Team
        </button>
      </template>

      <template v-else>
        <p class="text-sm text-rose-700">
          {{ errorText || '邀请处理失败，请稍后重试。' }}
        </p>
        <button
          class="text-sm text-slate-700 font-semibold px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-100"
          @click="openWorkspaceAfterAccept"
        >
          返回工作台
        </button>
      </template>
    </section>
  </main>
</template>
