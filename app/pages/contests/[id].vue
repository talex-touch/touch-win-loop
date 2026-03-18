<script setup lang="ts">
import type { ApiResponse, Contest, Rubric } from '~~/shared/types/domain'

interface ContestDetail extends Contest {
  rubrics: Rubric[]
}

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()
const contestId = computed(() => {
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

const detail = ref<ContestDetail | null>(null)
const loading = ref(true)

onMounted(async () => {
  loading.value = true
  try {
    const response = await $fetch<ApiResponse<ContestDetail>>(endpoint(`/contests/${contestId.value}`))
    detail.value = response.data
  }
  catch {
    detail.value = null
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="text-xs p-2 space-y-2">
    <div class="p-2 border border-gray-300 flex items-center justify-between">
      <div class="text-sm font-semibold">
        竞赛详情
      </div>
      <button class="dense-btn" @click="navigateTo('/contests')">
        返回列表
      </button>
    </div>

    <div v-if="loading" class="p-2 border border-gray-300">
      加载中...
    </div>

    <div v-else-if="!detail" class="p-2 border border-gray-300">
      未找到该竞赛。
    </div>

    <div v-else class="space-y-2">
      <div class="p-2 border border-gray-300">
        <div class="text-sm font-semibold mb-1">
          {{ detail.name }}
        </div>
        <div class="text-[11px] text-gray-600">
          {{ detail.level }} / {{ detail.organizer }}
        </div>
        <div class="text-[11px] mt-2">
          报名：{{ detail.registrationWindow }}，截止：{{ detail.submissionDeadline }}
        </div>
      </div>

      <div class="p-2 border border-gray-300">
        <div class="font-semibold mb-1">
          赛道设置
        </div>
        <div v-for="track in detail.tracks" :key="track.id" class="mb-1 p-2 border border-gray-200">
          <div class="font-medium">
            {{ track.name }}
          </div>
          <div class="text-[11px] text-gray-600">
            {{ track.summary }}
          </div>
        </div>
      </div>

      <div class="p-2 border border-gray-300">
        <div class="font-semibold mb-1">
          评分模板
        </div>
        <div v-for="rubric in detail.rubrics" :key="rubric.id" class="mb-1 p-2 border border-gray-200">
          <div class="font-medium mb-1">
            {{ rubric.trackId }}
          </div>
          <div v-for="dimension in rubric.dimensions" :key="dimension.key" class="text-[11px]">
            {{ dimension.name }} ({{ dimension.weight }}%) - {{ dimension.description }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
