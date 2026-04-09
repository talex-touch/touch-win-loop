<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface ResourceAdminOverviewRow {
  contestId: string
  contestName: string
  totalResources: number
  analyzedResources: number
  reviewResources: number
  suggestedInvalidResources: number
  suggestedArchiveResources: number
  avgQualityScore: number
  avgValueScore: number
  avgHotScore: number
  pendingTasks: number
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const errorText = ref('')
const rows = ref<ResourceAdminOverviewRow[]>([])

const summary = computed(() => {
  return {
    contests: rows.value.length,
    totalResources: rows.value.reduce((sum, item) => sum + item.totalResources, 0),
    reviewResources: rows.value.reduce((sum, item) => sum + item.reviewResources, 0),
    pendingTasks: rows.value.reduce((sum, item) => sum + item.pendingTasks, 0),
  }
})

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<ResourceAdminOverviewRow[]>>(endpoint('/admin/resources'))
    rows.value = response.data
  }
  catch (error: any) {
    rows.value = []
    errorText.value = String(error?.data?.message || '资源治理总览加载失败。')
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <h1 class="text-lg text-slate-900 font-semibold">
        跨竞赛资源治理总览
      </h1>
      <p class="text-xs text-slate-500 mt-1">
        平台级入口只做统计与跳转，具体治理动作仍回到竞赛工作台执行。
      </p>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <template v-else>
      <section class="gap-3 grid md:grid-cols-4">
        <article class="p-3 border border-slate-200 rounded-lg bg-white">
          <p class="text-xs text-slate-500">
            覆盖竞赛
          </p>
          <p class="text-xl text-slate-900 font-semibold mt-2">
            {{ summary.contests }}
          </p>
        </article>
        <article class="p-3 border border-slate-200 rounded-lg bg-white">
          <p class="text-xs text-slate-500">
            总资源量
          </p>
          <p class="text-xl text-slate-900 font-semibold mt-2">
            {{ summary.totalResources }}
          </p>
        </article>
        <article class="p-3 border border-slate-200 rounded-lg bg-white">
          <p class="text-xs text-slate-500">
            待复核资源
          </p>
          <p class="text-xl text-amber-600 font-semibold mt-2">
            {{ summary.reviewResources }}
          </p>
        </article>
        <article class="p-3 border border-slate-200 rounded-lg bg-white">
          <p class="text-xs text-slate-500">
            待执行任务
          </p>
          <p class="text-xl text-slate-900 font-semibold mt-2">
            {{ summary.pendingTasks }}
          </p>
        </article>
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-left text-slate-500 border-b border-slate-200">
                <th class="py-2 pr-3">
                  竞赛
                </th>
                <th class="py-2 pr-3">
                  总资源
                </th>
                <th class="py-2 pr-3">
                  已分析
                </th>
                <th class="py-2 pr-3">
                  待复核
                </th>
                <th class="py-2 pr-3">
                  建议下架
                </th>
                <th class="py-2 pr-3">
                  建议归档
                </th>
                <th class="py-2 pr-3">
                  质量均分
                </th>
                <th class="py-2 pr-3">
                  热度均分
                </th>
                <th class="py-2 pr-3">
                  任务
                </th>
                <th class="py-2">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.contestId" class="border-b border-slate-100">
                <td class="py-3 pr-3">
                  <div>
                    <p class="text-slate-900 font-medium">
                      {{ row.contestName }}
                    </p>
                    <p class="text-[11px] text-slate-500 mt-1">
                      {{ row.contestId }}
                    </p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  {{ row.totalResources }}
                </td>
                <td class="py-3 pr-3">
                  {{ row.analyzedResources }}
                </td>
                <td class="py-3 pr-3 text-amber-600">
                  {{ row.reviewResources }}
                </td>
                <td class="py-3 pr-3 text-rose-600">
                  {{ row.suggestedInvalidResources }}
                </td>
                <td class="py-3 pr-3 text-slate-600">
                  {{ row.suggestedArchiveResources }}
                </td>
                <td class="py-3 pr-3">
                  {{ row.avgQualityScore }}
                </td>
                <td class="py-3 pr-3">
                  {{ row.avgHotScore }}
                </td>
                <td class="py-3 pr-3">
                  {{ row.pendingTasks }}
                </td>
                <td class="py-3">
                  <NuxtLink class="dense-btn" :to="`/admin/contests/${row.contestId}/knowledge`">
                    进入治理
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
