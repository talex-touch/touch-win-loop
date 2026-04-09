<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import { resolveWorkspaceOptions } from '~/composables/team-ui'

definePageMeta({
  layout: 'admin',
})

const authApiFetch = useAuthApiFetch()

const loading = ref(true)
const errorText = ref('')
const successText = ref('')
const submitting = ref(false)
const workspaceOptions = ref<WorkspaceWithQuota[]>([])

const form = reactive({
  scope: 'global' as 'global' | 'workspace',
  workspaceId: '',
  title: '',
  summary: '',
  body: '',
  actionUrl: '',
  effectiveAt: '',
  expiresAt: '',
})

async function loadContext() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    workspaceOptions.value = resolveWorkspaceOptions(response.data)
  }
  catch (error: any) {
    workspaceOptions.value = []
    errorText.value = String(error?.data?.message || '通知管理初始化失败。')
  }
  finally {
    loading.value = false
  }
}

async function submitForm() {
  submitting.value = true
  successText.value = ''
  errorText.value = ''

  try {
    const response = await authApiFetch<ApiResponse<{ deliveredCount: number }>>('/admin/notifications', {
      method: 'POST',
      body: {
        scope: form.scope,
        workspaceId: form.scope === 'workspace' ? form.workspaceId : undefined,
        title: form.title,
        summary: form.summary,
        body: form.body,
        actionUrl: form.actionUrl || undefined,
        effectiveAt: form.effectiveAt || undefined,
        expiresAt: form.expiresAt || undefined,
      },
    })
    successText.value = `平台通知已发布，落库 ${response.data.deliveredCount} 条。`
    form.title = ''
    form.summary = ''
    form.body = ''
    form.actionUrl = ''
    form.effectiveAt = ''
    form.expiresAt = ''
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '平台通知发布失败。')
  }
  finally {
    submitting.value = false
  }
}

onMounted(loadContext)
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <h1 class="text-[13px] text-slate-900 tracking-tight font-bold uppercase">
        通知管理
      </h1>
      <p class="text-[11px] text-slate-500 mt-1">
        以平台级收件箱为目标，按全局或指定 workspace 下发通知。
      </p>
    </section>

    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else class="border border-slate-200 bg-white overflow-hidden">
      <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
        Publish Notification
      </div>

      <form class="p-3 gap-3 grid md:grid-cols-2" @submit.prevent="submitForm">
        <label class="block">
          <span class="text-[11px] text-slate-600 mb-1 block">受众范围</span>
          <select v-model="form.scope" class="text-[12px] px-2 py-2 border border-slate-200 rounded bg-white w-full">
            <option value="global">
              全局
            </option>
            <option value="workspace">
              单 workspace
            </option>
          </select>
        </label>

        <label v-if="form.scope === 'workspace'" class="block">
          <span class="text-[11px] text-slate-600 mb-1 block">目标 workspace</span>
          <select v-model="form.workspaceId" class="text-[12px] px-2 py-2 border border-slate-200 rounded bg-white w-full">
            <option value="">
              请选择
            </option>
            <option v-for="item in workspaceOptions" :key="item.workspace.id" :value="item.workspace.id">
              {{ item.workspace.name }}
            </option>
          </select>
        </label>

        <label class="block md:col-span-2">
          <span class="text-[11px] text-slate-600 mb-1 block">标题</span>
          <input v-model="form.title" class="text-[12px] px-2 py-2 border border-slate-200 rounded bg-white w-full" maxlength="80">
        </label>

        <label class="block md:col-span-2">
          <span class="text-[11px] text-slate-600 mb-1 block">摘要</span>
          <input v-model="form.summary" class="text-[12px] px-2 py-2 border border-slate-200 rounded bg-white w-full" maxlength="160">
        </label>

        <label class="block md:col-span-2">
          <span class="text-[11px] text-slate-600 mb-1 block">正文</span>
          <textarea
            v-model="form.body"
            class="text-[12px] px-2 py-2 border border-slate-200 rounded bg-white min-h-[140px] w-full"
          />
        </label>

        <label class="block">
          <span class="text-[11px] text-slate-600 mb-1 block">生效时间</span>
          <input v-model="form.effectiveAt" type="datetime-local" class="text-[12px] px-2 py-2 border border-slate-200 rounded bg-white w-full">
        </label>

        <label class="block">
          <span class="text-[11px] text-slate-600 mb-1 block">失效时间</span>
          <input v-model="form.expiresAt" type="datetime-local" class="text-[12px] px-2 py-2 border border-slate-200 rounded bg-white w-full">
        </label>

        <label class="block md:col-span-2">
          <span class="text-[11px] text-slate-600 mb-1 block">跳转链接（可选）</span>
          <input v-model="form.actionUrl" class="text-[12px] px-2 py-2 border border-slate-200 rounded bg-white w-full" placeholder="/admin/contests">
        </label>

        <div class="flex gap-2 items-center md:col-span-2">
          <button
            type="submit"
            class="text-[12px] text-white font-semibold px-3 py-2 rounded bg-slate-900 disabled:opacity-60"
            :disabled="submitting"
          >
            {{ submitting ? '发布中...' : '发布平台通知' }}
          </button>
          <p v-if="successText" class="text-[11px] text-emerald-700 m-0">
            {{ successText }}
          </p>
          <p v-if="errorText" class="text-[11px] text-rose-600 m-0">
            {{ errorText }}
          </p>
        </div>
      </form>
    </section>
  </div>
</template>
