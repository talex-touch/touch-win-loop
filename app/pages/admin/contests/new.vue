<script setup lang="ts">
import type { ApiResponse, Contest, ContestLevel, ContestVisibility } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const saving = ref(false)
const errorText = ref('')

const form = reactive<{
  name: string
  level: ContestLevel
  officialUrl: string
  organizer: string
  coOrganizer: string
  visibility: ContestVisibility
}>({
  name: '',
  level: 'national',
  officialUrl: '',
  organizer: '',
  coOrganizer: '',
  visibility: 'internal',
})

async function createContest() {
  if (!form.name.trim() || !form.officialUrl.trim()) {
    errorText.value = '请至少填写赛事名称与官网链接。'
    return
  }

  saving.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Contest>>(endpoint('/admin/contests'), {
      method: 'POST',
      body: {
        name: form.name.trim(),
        level: form.level,
        officialUrl: form.officialUrl.trim(),
        organizer: form.organizer.trim(),
        coOrganizer: form.coOrganizer.trim(),
        visibility: form.visibility,
      },
    })
    await navigateTo(`/admin/contests/${response.data.id}`)
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '创建赛事失败。')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">
            新建赛事（阶段一）
          </h1>
          <p class="mt-1 text-xs text-slate-500">
            先创建竞赛骨架，再进入工作区补全赛道、时间轴、评分和资料。
          </p>
        </div>
        <NuxtLink class="dense-btn" to="/admin/contests">
          返回赛事列表
        </NuxtLink>
      </div>
    </section>

    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="grid gap-2 md:grid-cols-2">
        <a-input v-model="form.name" size="small" placeholder="赛事名称（必填）" />
        <a-select v-model="form.level" size="small" placeholder="级别">
          <a-option value="national">
            国家级
          </a-option>
          <a-option value="provincial">
            省级
          </a-option>
          <a-option value="school">
            校级
          </a-option>
          <a-option value="industry">
            行业级
          </a-option>
        </a-select>
        <a-input v-model="form.officialUrl" size="small" class="md:col-span-2" placeholder="官网链接（必填）" />
        <a-input v-model="form.organizer" size="small" class="md:col-span-2" placeholder="主办方（支持多个，逗号分隔）" />
        <a-input v-model="form.coOrganizer" size="small" class="md:col-span-2" placeholder="承办/协办单位（可选，逗号分隔）" />
        <a-select v-model="form.visibility" size="small" placeholder="可见性">
          <a-option value="internal">
            internal
          </a-option>
          <a-option value="public">
            public
          </a-option>
        </a-select>
      </div>
      <a-button type="primary" size="small" class="mt-3" :loading="saving" @click="createContest">
        {{ saving ? '创建中...' : '创建并进入工作区' }}
      </a-button>
    </section>

    <section v-if="errorText" class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
      {{ errorText }}
    </section>
  </div>
</template>
