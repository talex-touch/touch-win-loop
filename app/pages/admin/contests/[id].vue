<script setup lang="ts">
import type { ApiResponse, ContestDetailPayload, PublishCheckResult } from '~~/shared/types/domain'

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

const isWorkspaceRoute = computed(() => {
  if (!contestId.value)
    return false
  const normalized = route.path.replace(/\/+$/, '')
  return normalized === `/admin/contests/${contestId.value}`
})

const loading = ref(false)
const actionLoading = ref(false)
const moduleDialogVisible = ref(false)
const moduleIframeLoading = ref(false)
const activeModuleKey = ref('')
const errorText = ref('')
const successText = ref('')
const detail = ref<ContestDetailPayload | null>(null)
const publishCheck = ref<PublishCheckResult | null>(null)

const moduleEntries = computed(() => {
  const contest = detail.value?.contest
  const timelineCount = detail.value?.timelines.length || 0
  const rubricCount = detail.value?.rubrics.length || 0
  const resourceCount = (detail.value?.resourceStats || []).reduce((sum, item) => sum + Number(item.count || 0), 0)
  const trackCount = contest?.tracks.length || 0

  return [
    {
      key: 'overview',
      label: '基础信息',
      desc: '名称、主办方、参赛对象、FAQ 等',
      to: `/admin/contests/${contestId.value}/overview/edit`,
      stat: contest?.summary ? '已录入' : '待完善',
    },
    {
      key: 'tracks',
      label: '赛道管理',
      desc: '赛道列表、交付物、适配专业',
      to: `/admin/contests/${contestId.value}/tracks`,
      stat: `${trackCount} 条`,
    },
    {
      key: 'timelines',
      label: '时间节点',
      desc: '报名/提交/初赛/决赛节点',
      to: `/admin/contests/${contestId.value}/timelines`,
      stat: `${timelineCount} 条`,
    },
    {
      key: 'rubrics',
      label: '评分规则',
      desc: '维度、权重/要点、版本管理',
      to: `/admin/contests/${contestId.value}/rubrics`,
      stat: `${rubricCount} 条`,
    },
    {
      key: 'resources',
      label: '资料入口',
      desc: '竞赛资料分类录入与维护',
      to: `/admin/contests/${contestId.value}/resources`,
      stat: `${resourceCount} 条`,
    },
  ]
})

const activeModuleEntry = computed(() => {
  return moduleEntries.value.find(item => item.key === activeModuleKey.value) || null
})

const activeModuleIframeSrc = computed(() => {
  if (!activeModuleEntry.value)
    return ''
  return `${activeModuleEntry.value.to}?embed=1`
})

function openModuleDialog(moduleKey: string) {
  const target = moduleEntries.value.find(item => item.key === moduleKey)
  if (!target)
    return
  activeModuleKey.value = moduleKey
  moduleIframeLoading.value = true
  moduleDialogVisible.value = true
}

function onModuleFrameLoad() {
  moduleIframeLoading.value = false
}

function closeModuleDialog() {
  moduleDialogVisible.value = false
}

async function loadData() {
  if (!contestId.value)
    return
  loading.value = true
  errorText.value = ''
  try {
    const [detailRes, checkRes] = await Promise.all([
      $fetch<ApiResponse<ContestDetailPayload>>(endpoint(`/contests/${contestId.value}`)),
      $fetch<ApiResponse<PublishCheckResult>>(endpoint(`/admin/contests/${contestId.value}/publish-check`)),
    ])
    detail.value = detailRes.data
    publishCheck.value = checkRes.data
  }
  catch (error: any) {
    detail.value = null
    publishCheck.value = null
    errorText.value = String(error?.data?.message || '数据加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function publishContest() {
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId.value}/publish`), { method: 'POST' })
    successText.value = '赛事已发布。'
    await loadData()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '发布失败。')
  }
  finally {
    actionLoading.value = false
  }
}

async function archiveContest() {
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId.value}/archive`), { method: 'POST' })
    successText.value = '赛事已下架。'
    await loadData()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '下架失败。')
  }
  finally {
    actionLoading.value = false
  }
}

async function bootstrapWorkspacePage() {
  await loadData()

  const moduleParam = route.query.module
  const moduleKey = Array.isArray(moduleParam) ? (moduleParam[0] || '') : (moduleParam || '')
  if (moduleKey)
    openModuleDialog(moduleKey)
}

watch(isWorkspaceRoute, async (value) => {
  if (!value)
    return
  await bootstrapWorkspacePage()
}, { immediate: true })
</script>

<template>
  <NuxtPage v-if="!isWorkspaceRoute" />
  <div v-else class="space-y-4">
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">
            竞赛工作区
          </h1>
          <p class="mt-1 text-xs text-slate-500">
            赛事 ID：{{ contestId }}，按模块弹窗编辑并手动保存。
          </p>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink class="dense-btn" to="/admin/contests">
            返回赛事列表
          </NuxtLink>
          <button class="dense-btn" :disabled="actionLoading" @click="publishContest">
            发布
          </button>
          <button class="dense-btn" :disabled="actionLoading" @click="archiveContest">
            下架
          </button>
        </div>
      </div>
    </section>

    <section v-if="loading" class="rounded-lg border border-slate-200 bg-white p-4">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <template v-else-if="detail && publishCheck">
      <section class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-slate-900">
          发布预检
        </h2>
        <p class="mt-2 text-xs text-slate-600">
          完成度：{{ publishCheck.completion }}% ｜ 结果：{{ publishCheck.canPublish ? '可发布' : '存在阻断项' }}
        </p>
        <div v-if="publishCheck.blockers.length > 0" class="mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <p class="font-semibold">
            阻断项
          </p>
          <p v-for="item in publishCheck.blockers" :key="item.code" class="mt-1">
            · {{ item.message }}
          </p>
        </div>
        <div v-if="publishCheck.warnings.length > 0" class="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <p class="font-semibold">
            提示项
          </p>
          <p v-for="item in publishCheck.warnings" :key="item.code" class="mt-1">
            · {{ item.message }}
          </p>
        </div>
      </section>

      <section class="rounded-lg border border-slate-200 bg-white p-3">
        <a-list
          :data="moduleEntries"
          :grid-props="{ xs: 1, sm: 2, md: 2, lg: 3, xl: 3, gutter: 12 }"
          size="small"
        >
          <template #item="{ item }">
            <a-list-item>
              <div class="h-full rounded border border-slate-200 bg-white p-4">
                <h3 class="text-sm font-semibold text-slate-900">
                  {{ item.label }}
                </h3>
                <p class="mt-1 text-xs text-slate-500">
                  {{ item.desc }}
                </p>
                <p class="mt-2 text-xs text-slate-700">
                  状态：{{ item.stat }}
                </p>
                <button class="dense-btn mt-3 inline-flex" @click="openModuleDialog(item.key)">
                  编辑
                </button>
              </div>
            </a-list-item>
          </template>
        </a-list>
      </section>
    </template>

    <section v-if="errorText" class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
      {{ errorText }}
    </section>

    <section v-if="successText" class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
      {{ successText }}
    </section>

    <a-modal
      v-model:visible="moduleDialogVisible"
      :footer="false"
      :title="activeModuleEntry ? `模块编辑：${activeModuleEntry.label}` : '模块编辑'"
      width="1200px"
      @cancel="closeModuleDialog"
    >
      <div class="module-frame-wrap">
        <div v-if="moduleIframeLoading" class="module-frame-skeleton">
          <a-skeleton :animation="true">
            <a-skeleton-line :rows="10" />
          </a-skeleton>
        </div>
        <iframe
          v-if="activeModuleEntry"
          :src="activeModuleIframeSrc"
          class="module-frame"
          @load="onModuleFrameLoad"
        />
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.module-frame-wrap {
  position: relative;
  min-height: 72vh;
}

.module-frame-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #fff;
  padding: 12px;
}

.module-frame {
  width: 100%;
  height: 72vh;
  border: none;
  background: #f4f6f8;
}
</style>
