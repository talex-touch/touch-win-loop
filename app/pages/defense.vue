<script setup lang="ts">
import type { ApiResponse, Contest, DefenseSession } from '~~/shared/types/domain'

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
const strictness = ref<'normal' | 'strict'>('normal')
const rounds = ref(3)
const session = ref<DefenseSession | null>(null)

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

async function simulateDefense() {
  const response = await $fetch<ApiResponse<DefenseSession>>(endpoint('/defense/simulate'), {
    method: 'POST',
    body: {
      contestId: contestId.value,
      trackId: trackId.value,
      strictness: strictness.value,
      rounds: rounds.value,
    },
  })
  session.value = response.data
}
</script>

<template>
  <div class="text-xs p-2 space-y-2">
    <div class="text-sm font-semibold p-2 border border-gray-300">
      模拟答辩
    </div>
    <div class="p-2 border border-gray-300 gap-2 grid grid-cols-1 md:grid-cols-4">
      <select v-model="contestId" class="dense-input md:col-span-2">
        <option v-for="contest in contests" :key="contest.id" :value="contest.id">
          {{ contest.name }}
        </option>
      </select>
      <select v-model="trackId" class="dense-input">
        <option v-for="track in selectedContest?.tracks || []" :key="track.id" :value="track.id">
          {{ track.name }}
        </option>
      </select>
      <select v-model="strictness" class="dense-input">
        <option value="normal">
          normal
        </option>
        <option value="strict">
          strict
        </option>
      </select>
    </div>
    <div class="flex gap-2 items-center">
      <label class="text-xs">轮数</label>
      <input v-model.number="rounds" type="number" min="1" max="5" class="dense-input w-18">
      <button class="dense-btn" @click="simulateDefense">
        生成答辩清单
      </button>
    </div>

    <div v-if="session" class="p-2 border border-gray-300">
      <div class="font-semibold mb-1">
        Top10 尖锐问题
      </div>
      <ul class="m-0 pl-4">
        <li v-for="question in session.topQuestions" :key="question">
          {{ question }}
        </li>
      </ul>
    </div>
  </div>
</template>
