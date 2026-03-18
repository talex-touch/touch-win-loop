<script setup lang="ts">
import type { ApiResponse, Contest } from '~~/shared/types/domain'

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const contests = ref<Contest[]>([])
const loading = ref(true)

onMounted(async () => {
  loading.value = true
  try {
    const response = await $fetch<ApiResponse<Contest[]>>(endpoint('/contests'))
    contests.value = response.data
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="text-xs p-2">
    <div class="text-sm font-semibold mb-2 p-2 border border-gray-300">
      竞赛总库
    </div>
    <div v-if="loading" class="p-2 border border-gray-300">
      加载中...
    </div>
    <div v-else class="space-y-1">
      <NuxtLink
        v-for="contest in contests"
        :key="contest.id"
        :to="`/contests/${contest.id}`"
        class="p-2 border border-gray-300 block hover:border-black"
      >
        <div class="font-medium">
          {{ contest.name }}
        </div>
        <div class="text-[11px] text-gray-600">
          {{ contest.level }} / {{ contest.organizer }}
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
