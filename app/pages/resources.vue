<script setup lang="ts">
import type { ApiResponse, Resource } from '~~/shared/types/domain'

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const typeFilter = ref('')
const yearFilter = ref('')
const resources = ref<Resource[]>([])

async function loadResources() {
  const response = await $fetch<ApiResponse<Resource[]>>(endpoint('/resources'), {
    query: {
      type: typeFilter.value,
      year: yearFilter.value,
    },
  })
  resources.value = response.data
}

onMounted(loadResources)
</script>

<template>
  <div class="text-xs p-2 space-y-2">
    <div class="text-sm font-semibold p-2 border border-gray-300">
      竞赛资料中心
    </div>
    <div class="p-2 border border-gray-300 gap-2 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto]">
      <input v-model="typeFilter" class="dense-input" placeholder="资料类型">
      <input v-model="yearFilter" class="dense-input" placeholder="年份，如 2025">
      <button class="dense-btn" @click="loadResources">
        筛选
      </button>
    </div>
    <div class="space-y-1">
      <div v-for="resource in resources" :key="resource.id" class="p-2 border border-gray-300">
        <div class="font-medium">
          {{ resource.title }}
        </div>
        <div class="text-[11px] text-gray-600">
          {{ resource.type }} / {{ resource.year }} / {{ resource.availability }}
        </div>
        <a :href="resource.sourceLink" target="_blank" class="text-[11px] underline">{{ resource.sourceLink }}</a>
      </div>
    </div>
  </div>
</template>
