<script setup lang="ts">
import type { ApiResponse, Contest, ContestLevel } from '~~/shared/types/domain'

definePageMeta({
  layout: 'dashboard',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(false)
const contests = ref<Contest[]>([])
const search = ref('')
const discipline = ref('')
const level = ref<ContestLevel | ''>('')
const deliverableType = ref('')
const timelineStatus = ref('')
const sort = ref('composite')

const statusOptions = [
  { label: '全部时间状态', value: '' },
  { label: '报名中', value: 'registration_open' },
  { label: '即将截止', value: 'upcoming_deadline' },
  { label: '已结束', value: 'ended' },
]

const levelOptions: Array<{ label: string, value: ContestLevel | '' }> = [
  { label: '全部级别', value: '' },
  { label: '国家级', value: 'national' },
  { label: '省级', value: 'provincial' },
  { label: '校级', value: 'school' },
  { label: '行业级', value: 'industry' },
]

async function loadContests() {
  loading.value = true
  try {
    const response = await unsafeFetch(endpoint('/contests'), {
      query: {
        q: search.value,
        discipline: discipline.value,
        level: level.value,
        deliverableType: deliverableType.value,
        timelineStatus: timelineStatus.value,
        sort: sort.value,
        page: 1,
        pageSize: 50,
      },
    }) as ApiResponse<Contest[]>
    contests.value = response.data
  }
  finally {
    loading.value = false
  }
}

onMounted(loadContests)
</script>

<template>
  <div class="mx-auto p-4 max-w-6xl space-y-4">
    <div class="flex flex-col gap-1">
      <h1 class="text-xl text-slate-900 font-semibold">
        竞赛总库
      </h1>
      <p class="text-sm text-slate-500">
        支持按学科、级别、交付物和时间状态快速筛选。
      </p>
    </div>

    <div class="p-3 border border-slate-200 rounded-lg bg-white gap-2 grid grid-cols-1 lg:grid-cols-6 md:grid-cols-3">
      <input
        v-model="search"
        class="dense-input lg:col-span-2"
        placeholder="搜索竞赛名称/主办方/关键词"
      >
      <input
        v-model="discipline"
        class="dense-input"
        placeholder="学科门类"
      >
      <select v-model="level" class="dense-input">
        <option v-for="item in levelOptions" :key="item.label" :value="item.value">
          {{ item.label }}
        </option>
      </select>
      <input
        v-model="deliverableType"
        class="dense-input"
        placeholder="交付物类型"
      >
      <select v-model="timelineStatus" class="dense-input">
        <option v-for="item in statusOptions" :key="item.label" :value="item.value">
          {{ item.label }}
        </option>
      </select>
      <select v-model="sort" class="dense-input">
        <option value="composite">
          综合排序
        </option>
        <option value="hot">
          热度优先
        </option>
        <option value="deadline">
          时间临近
        </option>
      </select>
      <button class="dense-btn" @click="loadContests">
        应用筛选
      </button>
    </div>

    <div v-if="loading" class="gap-3 grid grid-cols-1 md:grid-cols-2">
      <article
        v-for="index in 6"
        :key="`contest-skeleton-${index}`"
        class="p-4 border border-slate-200 rounded-lg bg-white animate-pulse"
      >
        <div class="flex gap-2 items-start justify-between">
          <div class="rounded bg-slate-200 h-4 w-2/3" />
          <div class="rounded bg-slate-200 h-5 w-14" />
        </div>
        <div class="mt-3 rounded bg-slate-200 h-3 w-1/2" />
        <div class="mt-3 space-y-2">
          <div class="rounded bg-slate-200 h-3 w-11/12" />
          <div class="rounded bg-slate-200 h-3 w-9/12" />
        </div>
      </article>
    </div>

    <div v-else class="gap-3 grid grid-cols-1 md:grid-cols-2">
      <NuxtLink
        v-for="contest in contests"
        :key="contest.id"
        :to="`/contests/${contest.id}`"
        class="p-4 border border-slate-200 rounded-lg bg-white transition hover:border-slate-400"
      >
        <div class="flex gap-2 items-start justify-between">
          <h2 class="text-base text-slate-900 leading-snug font-semibold">
            {{ contest.name }}
          </h2>
          <span class="text-xs text-slate-600 px-2 py-1 rounded bg-slate-100 whitespace-nowrap">{{ contest.level }}</span>
        </div>
        <p class="text-sm text-slate-600 mt-2">
          主办方：{{ contest.organizer || '待补充' }}
        </p>
        <div class="text-xs text-slate-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <span>报名窗口：{{ contest.registrationWindow || '待补充' }}</span>
          <span>提交截止：{{ contest.submissionDeadline || '待补充' }}</span>
          <span>赛道数：{{ contest.tracks.length }}</span>
        </div>
      </NuxtLink>

      <div v-if="contests.length === 0" class="text-sm text-slate-500 p-6 text-center border border-slate-300 rounded-lg border-dashed bg-white md:col-span-2">
        当前筛选条件下暂无赛事
      </div>
    </div>
  </div>
</template>
