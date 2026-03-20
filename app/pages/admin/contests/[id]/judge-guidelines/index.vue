<script setup lang="ts">
import type { ApiResponse, Resource, ResourceCategory } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const loading = ref(false)
const errorText = ref('')
const resources = ref<Resource[]>([])

const sections: Array<{ category: ResourceCategory, title: string, desc: string }> = [
  { category: 'track_details', title: '赛道详解', desc: '补充赛道拆解、推荐方向、常见误区。' },
  { category: 'judge_guidelines', title: '评委补充细则', desc: '除 Rubric 外的打分口径与评审偏好说明。' },
  { category: 'submission_examples', title: '材料示例', desc: '高分样例、模板映射、提交参考。' },
]

function listByCategory(category: ResourceCategory): Resource[] {
  return resources.value.filter(item => item.category === category)
}

async function loadData() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Resource[]>>(endpoint(`/admin/contests/${contestId.value}/resources`))
    resources.value = response.data
  }
  catch (error: any) {
    resources.value = []
    errorText.value = String(error?.data?.message || '赛道详解/细则加载失败。')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            赛道详解与评委细则
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            聚合展示 track_details / judge_guidelines / submission_examples
          </p>
        </div>
        <NuxtLink class="dense-btn" :to="`/admin/contests/${contestId}/resources`">
          进入资料管理
        </NuxtLink>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else class="space-y-3">
      <article
        v-for="section in sections"
        :key="section.category"
        class="p-4 border border-slate-200 rounded-lg bg-white"
      >
        <h2 class="text-sm text-slate-900 font-semibold">
          {{ section.title }}
        </h2>
        <p class="text-xs text-slate-500 mt-1">
          {{ section.desc }}
        </p>

        <div v-if="listByCategory(section.category).length === 0" class="text-sm text-slate-500 mt-2">
          暂无条目，请在资料管理中新增该分类内容。
        </div>
        <div v-else class="mt-3 space-y-2">
          <div
            v-for="item in listByCategory(section.category)"
            :key="item.id"
            class="p-3 border border-slate-200 rounded"
          >
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <p class="text-xs text-slate-900 font-semibold">
                {{ item.title }}
              </p>
              <NuxtLink class="dense-btn" :to="`/admin/contests/${contestId}/resources/${item.id}/edit`">
                编辑
              </NuxtLink>
            </div>
            <p class="text-xs text-slate-700 mt-2 whitespace-pre-wrap">
              {{ item.content || item.summary || '暂无内容。' }}
            </p>
          </div>
        </div>
      </article>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
  </div>
</template>
