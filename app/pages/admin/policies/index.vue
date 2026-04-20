<script setup lang="ts">
import type { ApiResponse, PolicyLibraryItem } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

type ApiRequestError = Error & {
  data?: {
    message?: string
  }
}

function createApiRequestError(message: string): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.data = { message }
  return error
}

async function requestApi<T>(path: string, fallbackMessage = '请求失败。'): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  return payload.data
}

const loading = ref(false)
const errorText = ref('')
const items = ref<PolicyLibraryItem[]>([])

async function loadData() {
  loading.value = true
  errorText.value = ''
  try {
    items.value = await requestApi<PolicyLibraryItem[]>(
      endpoint('/admin/policies'),
      '政策库加载失败。',
    )
  }
  catch (error: any) {
    items.value = []
    errorText.value = String(error?.data?.message || '政策库加载失败。')
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
            政策库
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            查看当前已发布政策项，同时进入版本审批页处理飞书同步草稿。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <NuxtLink class="dense-btn" to="/admin/docs">
            查看教程
          </NuxtLink>
          <NuxtLink class="dense-btn" to="/admin/policies/releases">
            查看版本审批
          </NuxtLink>
        </div>
      </div>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <section class="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <p class="text-sm text-slate-900 font-semibold">
          已发布政策项
        </p>
        <button class="dense-btn" :disabled="loading" @click="loadData">
          刷新
        </button>
      </div>

      <div v-if="loading" class="p-4">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="6" />
        </a-skeleton>
      </div>

      <div v-else-if="items.length" class="divide-slate-200 divide-y">
        <div v-for="item in items" :key="item.id" class="p-4">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <div>
              <p class="text-sm text-slate-900 font-semibold">
                {{ item.meetingName }}
              </p>
              <p class="text-xs text-slate-500 mt-1">
                日期：{{ item.conferenceDate || '-' }} ｜ 重要程度：{{ item.importance || '-' }}
              </p>
            </div>
            <a-tag size="small" :color="item.status === 'active' ? 'green' : item.status === 'archived' ? 'gray' : 'gold'">
              {{ item.status }}
            </a-tag>
          </div>
          <p class="text-xs text-slate-600 mt-3">
            {{ item.summary || '暂无简介' }}
          </p>
          <div class="text-[11px] text-slate-500 mt-3 gap-2 grid md:grid-cols-2">
            <p>官网资料：{{ item.officialMaterial || '-' }}</p>
            <p>官网链接：{{ item.officialMaterialLink || '-' }}</p>
            <p>微信公众号：{{ item.wechatMaterial || '-' }}</p>
            <p>公众号链接：{{ item.wechatMaterialLink || '-' }}</p>
            <p>微博资料：{{ item.weiboMaterial || '-' }}</p>
            <p>微博链接：{{ item.weiboMaterialLink || '-' }}</p>
            <p>抖音资料：{{ item.douyinMaterial || '-' }}</p>
            <p>抖音链接：{{ item.douyinMaterialLink || '-' }}</p>
            <p>小红书资料：{{ item.xiaohongshuMaterial || '-' }}</p>
            <p>小红书链接：{{ item.xiaohongshuMaterialLink || '-' }}</p>
          </div>
        </div>
      </div>

      <a-empty v-else description="当前还没有已发布政策项" class="py-10" />
    </section>
  </div>
</template>
