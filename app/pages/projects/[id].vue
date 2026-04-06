<script setup lang="ts">
import type { ApiResponse, Project } from '~~/shared/types/domain'
import { projectWorkspacePath, teamDashboardPath } from '~/composables/team-ui'

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()
const dashboardPath = teamDashboardPath()
const projectId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  if (Array.isArray(value))
    return value[0] ?? ''
  return value ?? ''
})

const loading = ref(true)
const errorText = ref('')

async function loadProject() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Project>>(endpoint(`/projects/${projectId.value}`))
    const project = response.data
    const teamId = String(project.teamId || project.workspaceId || '').trim()

    if (!teamId) {
      errorText.value = '项目未绑定 Team，暂时无法打开项目工作区。'
      return
    }

    await navigateTo(projectWorkspacePath(teamId, project.id), { replace: true })
  }
  catch (error: any) {
    if (Number(error?.statusCode || error?.response?.status) === 401) {
      await navigateTo({
        path: '/login',
        query: { redirect: route.fullPath || `/projects/${projectId.value}` },
      })
      return
    }
    errorText.value = '项目不存在或加载失败。'
  }
  finally {
    loading.value = false
  }
}

onMounted(loadProject)
</script>

<template>
  <main class="p-6 flex min-h-[40vh] items-center justify-center">
    <section class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center space-y-3">
      <p class="text-sm text-slate-500">
        {{ loading ? '正在进入项目工作区...' : '项目工作区暂不可用。' }}
      </p>
      <p v-if="errorText" class="text-sm text-rose-600">
        {{ errorText }}
      </p>
      <button
        v-if="!loading"
        class="inline-flex items-center justify-center rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        type="button"
        @click="navigateTo(dashboardPath)"
      >
        返回 Team 项目台
      </button>
    </section>
  </main>
</template>
