<script setup lang="ts">
import type { ApiResponse, Contest, TopicProposal } from '~~/shared/types/domain'

definePageMeta({
  layout: 'dashboard',
})

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const contests = ref<Contest[]>([])
const contestId = ref('')
const trackId = ref('')
const major = ref('计算机')
const result = ref<TopicProposal | null>(null)

const selectedContest = computed(() => contests.value.find(contest => contest.id === contestId.value) || null)

watch(contestId, (id) => {
  const hit = contests.value.find(contest => contest.id === id)
  trackId.value = hit?.tracks[0]?.id || ''
})

onMounted(async () => {
  const response = await $fetch<ApiResponse<Contest[]>>(endpoint('/contests'))
  contests.value = response.data
  contestId.value = contests.value[0]?.id || ''
})

async function generateTopics() {
  const response = await $fetch<ApiResponse<TopicProposal>>(endpoint('/topic-proposals'), {
    method: 'POST',
    body: {
      contestId: contestId.value,
      trackId: trackId.value,
      major: major.value,
    },
  })

  result.value = response.data
}
</script>

<template>
  <div class="text-xs p-2 space-y-2">
    <div class="text-sm font-semibold p-2 border border-gray-300">
      选题建议
    </div>

    <div class="p-2 border border-gray-300 gap-2 grid grid-cols-1 md:grid-cols-3">
      <select v-model="contestId" class="dense-input">
        <option v-for="contest in contests" :key="contest.id" :value="contest.id">
          {{ contest.name }}
        </option>
      </select>
      <select v-model="trackId" class="dense-input">
        <option v-for="track in selectedContest?.tracks || []" :key="track.id" :value="track.id">
          {{ track.name }}
        </option>
      </select>
      <input v-model="major" class="dense-input" placeholder="专业">
    </div>

    <button class="dense-btn" @click="generateTopics">
      生成 3-5 个候选主题
    </button>

    <div v-if="result" class="space-y-1">
      <div v-for="item in result.proposals" :key="item.title" class="p-2 border border-gray-300">
        <div class="font-semibold">
          {{ item.title }}
        </div>
        <div class="text-[11px] text-gray-600 mt-1">
          {{ item.reason }}
        </div>
      </div>
    </div>
  </div>
</template>
