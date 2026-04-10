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
    const response = await unsafeFetch<ApiResponse<Project>>(endpoint(`/projects/${projectId.value}`))
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
  <PageShell size="auth" gap="lg">
    <PageHeader title="项目跳转" description="正在定位项目所属 Team 并进入对应工作区。" />

    <SectionCard>
      <StateBlock
        :tone="loading ? 'loading' : (errorText ? 'error' : 'default')"
        :description="loading ? '正在进入项目工作区...' : '项目工作区暂不可用。'"
      >
        <p v-if="errorText" class="wl-inline-notice wl-inline-notice--error mt-4">
          {{ errorText }}
        </p>
        <ActionBar v-if="!loading" class="mt-4">
          <button
            class="dense-btn"
            type="button"
            @click="navigateTo(dashboardPath)"
          >
            返回 Team 项目台
          </button>
        </ActionBar>
      </StateBlock>
    </SectionCard>
  </PageShell>
</template>
