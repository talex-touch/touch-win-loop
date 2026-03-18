<script setup lang="ts">
import type { ApiResponse, Contest, ReviewReport } from '~~/shared/types/domain'

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
const reviewText = ref('')
const report = ref<ReviewReport | null>(null)

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

async function runReview() {
  const response = await $fetch<ApiResponse<ReviewReport>>(endpoint('/reviews'), {
    method: 'POST',
    body: {
      contestId: contestId.value,
      trackId: trackId.value,
      text: reviewText.value,
    },
  })
  report.value = response.data
}
</script>

<template>
  <div class="text-xs p-2 space-y-2">
    <div class="text-sm font-semibold p-2 border border-gray-300">
      作品评审与修改清单
    </div>
    <div class="p-2 border border-gray-300 gap-2 grid grid-cols-1 md:grid-cols-2">
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
    </div>
    <textarea v-model="reviewText" class="text-xs p-2 outline-none border border-gray-300 min-h-32 w-full focus:border-black" placeholder="粘贴摘要/正文/方案内容" />
    <button class="dense-btn" @click="runReview">
      生成评审报告
    </button>

    <div v-if="report" class="p-2 border border-gray-300 space-y-2">
      <div class="font-semibold">
        总分：{{ report.totalScore }}
      </div>
      <div>
        <div class="font-medium mb-1">
          最优先修改 3 件事
        </div>
        <ul class="m-0 pl-4">
          <li v-for="item in report.topPriorities" :key="item">
            {{ item }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
