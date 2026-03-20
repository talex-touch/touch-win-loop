<script setup lang="ts">
import type { ApiResponse, Project } from '~~/shared/types/domain'

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()
const projectId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  if (Array.isArray(value))
    return value[0] ?? ''
  return value ?? ''
})

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const project = ref<Project | null>(null)
const loading = ref(true)
const errorText = ref('')

async function loadProject() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Project>>(endpoint(`/projects/${projectId.value}`))
    project.value = response.data
  }
  catch (error: any) {
    if (Number(error?.statusCode || error?.response?.status) === 401) {
      await navigateTo('/login')
      return
    }
    errorText.value = '项目不存在或加载失败。'
    project.value = null
  }
  finally {
    loading.value = false
  }
}

onMounted(loadProject)
</script>

<template>
  <div class="text-xs p-2 space-y-2">
    <div class="p-2 border border-gray-300 flex items-center justify-between">
      <div class="text-sm font-semibold">
        项目详情
      </div>
      <button class="dense-btn" @click="navigateTo('/workspace')">
        返回工作台
      </button>
    </div>

    <div v-if="loading" class="p-2 border border-gray-300 space-y-2 animate-pulse">
      <div class="h-4 w-1/3 rounded bg-gray-200" />
      <div class="h-3 w-2/3 rounded bg-gray-200" />
      <div class="h-3 w-full rounded bg-gray-200" />
      <div class="h-3 w-11/12 rounded bg-gray-200" />
    </div>

    <div v-else-if="errorText" class="text-gray-700 p-2 border border-gray-300">
      {{ errorText }}
    </div>

    <div v-else-if="project" class="p-2 border border-gray-300 space-y-2">
      <div class="text-sm font-semibold">
        {{ project.title }}
      </div>
      <div class="text-[11px] text-gray-600">
        source={{ project.source }} / status={{ project.status }} / updated={{ project.updatedAt }}
      </div>
      <div>
        <div class="font-medium mb-1">
          问题定义
        </div>
        <div class="whitespace-pre-wrap">
          {{ project.problemStatement }}
        </div>
      </div>
      <div>
        <div class="font-medium mb-1">
          创新点
        </div>
        <ul class="m-0 pl-4">
          <li v-for="item in project.innovationPoints" :key="item">
            {{ item }}
          </li>
        </ul>
      </div>
      <div>
        <div class="font-medium mb-1">
          技术路线
        </div>
        <ul class="m-0 pl-4">
          <li v-for="item in project.techRouteSteps" :key="item">
            {{ item }}
          </li>
        </ul>
      </div>
      <div>
        <div class="font-medium mb-1">
          交付物
        </div>
        <ul class="m-0 pl-4">
          <li v-for="item in project.deliverables" :key="item">
            {{ item }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
