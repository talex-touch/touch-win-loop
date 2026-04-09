<script setup lang="ts">
import type { ContestStatus } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

function splitCsv(value: string): string[] {
  return value
    .split(/[\n,，、;]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function toCsv(values: unknown): string {
  if (!Array.isArray(values))
    return ''
  return values.map(item => String(item || '').trim()).filter(Boolean).join(', ')
}

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const isEmbedMode = computed(() => {
  const value = route.query.embed
  if (Array.isArray(value))
    return value[0] === '1'
  return value === '1'
})

function withEmbed(path: string): string | { path: string, query: { embed: string } } {
  if (isEmbedMode.value)
    return { path, query: { embed: '1' } }
  return path
}

const saving = ref(false)
const errorText = ref('')
const draftText = ref('')
const draftBridge = useAdminAgentDraft()

const form = reactive<{
  name: string
  summary: string
  coverImageUrl: string
  location: string
  organizer: string
  undertaker: string
  participantRequirements: string
  teamRule: string
  awardRatio: string
  suitableMajorsCsv: string
  deliverableTypesCsv: string
  rubricId: string
  sortOrder: number
  status: ContestStatus
}>({
  name: '',
  summary: '',
  coverImageUrl: '',
  location: '',
  organizer: '',
  undertaker: '',
  participantRequirements: '',
  teamRule: '',
  awardRatio: '',
  suitableMajorsCsv: '',
  deliverableTypesCsv: '',
  rubricId: '',
  sortOrder: 0,
  status: 'draft',
})

const moduleDraft = computed(() => draftBridge.getDraft(contestId.value, 'tracks'))
const draftUpdatedAt = computed(() => {
  const value = moduleDraft.value?.updatedAt
  if (!value)
    return ''
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
})

function applyAiDraft() {
  const payload = moduleDraft.value?.payload || {}
  form.name = String(payload.name || '')
  form.summary = String(payload.summary || '')
  form.coverImageUrl = String(payload.coverImageUrl || '')
  form.location = String(payload.location || '')
  form.organizer = String(payload.organizer || '')
  form.undertaker = String(payload.undertaker || '')
  form.participantRequirements = String(payload.participantRequirements || '')
  form.teamRule = String(payload.teamRule || '')
  form.awardRatio = String(payload.awardRatio || '')
  form.suitableMajorsCsv = toCsv(payload.suitableMajors)
  form.deliverableTypesCsv = toCsv(payload.deliverableTypes)
  form.rubricId = String(payload.rubricId || '')
  form.sortOrder = Number(payload.sortOrder || 0)

  const status = String(payload.status || '').trim()
  if (status === 'draft' || status === 'published' || status === 'archived')
    form.status = status

  draftText.value = 'AI 草稿已应用到表单，请点击“保存”。'
}

function clearAiDraft() {
  draftBridge.clearDraft(contestId.value, 'tracks')
  draftText.value = ''
}

async function save() {
  if (!form.name.trim()) {
    errorText.value = '赛道名称不能为空。'
    return
  }

  saving.value = true
  errorText.value = ''
  try {
    await unsafeFetch(endpoint(`/admin/contests/${contestId.value}/tracks`), {
      method: 'POST',
      body: {
        name: form.name.trim(),
        summary: form.summary.trim(),
        coverImageUrl: form.coverImageUrl.trim(),
        location: form.location.trim(),
        organizer: form.organizer.trim(),
        undertaker: form.undertaker.trim(),
        participantRequirements: form.participantRequirements.trim(),
        teamRule: form.teamRule.trim(),
        awardRatio: form.awardRatio.trim(),
        suitableMajors: splitCsv(form.suitableMajorsCsv),
        deliverableTypes: splitCsv(form.deliverableTypesCsv),
        rubricId: form.rubricId.trim() || null,
        sortOrder: Number(form.sortOrder || 0),
        status: form.status,
      },
    })
    await navigateTo(withEmbed(`/admin/contests/${contestId.value}/tracks`))
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '新增赛道失败。')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            新增赛道
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/tracks`)">
          返回赛道列表
        </NuxtLink>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div v-if="moduleDraft" class="text-xs text-emerald-700 mb-3 p-3 border border-emerald-200 rounded bg-emerald-50">
        <p class="font-semibold">
          检测到 AI 草稿：{{ moduleDraft.title || '赛道草稿' }}
        </p>
        <p class="mt-1">
          更新时间：{{ draftUpdatedAt }}。应用后仍需手动保存。
        </p>
        <div class="mt-2 flex gap-2 items-center">
          <a-button size="mini" type="outline" @click="applyAiDraft">
            应用到表单
          </a-button>
          <a-button size="mini" status="danger" @click="clearAiDraft">
            清除草稿
          </a-button>
        </div>
      </div>

      <div class="space-y-2">
        <a-input v-model="form.name" size="small" placeholder="赛道名称" />
        <a-input v-model="form.summary" size="small" placeholder="赛道说明" />
        <a-input v-model="form.coverImageUrl" size="small" placeholder="封面图片链接" />
        <a-input v-model="form.location" size="small" placeholder="具体位置" />
        <a-input v-model="form.organizer" size="small" placeholder="主办方" />
        <a-input v-model="form.undertaker" size="small" placeholder="承办方" />
        <a-input v-model="form.participantRequirements" size="small" placeholder="参赛对象" />
        <a-input v-model="form.teamRule" size="small" placeholder="组队规则" />
        <a-input v-model="form.awardRatio" size="small" placeholder="获奖比例" />
        <a-input v-model="form.suitableMajorsCsv" size="small" placeholder="适配专业（逗号分隔）" />
        <a-input v-model="form.deliverableTypesCsv" size="small" placeholder="交付物类型（逗号分隔）" />
        <a-input v-model="form.rubricId" size="small" placeholder="rubric_id（可为空）" />
        <div class="gap-2 grid grid-cols-2">
          <a-input-number v-model="form.sortOrder" size="small" :min="0" placeholder="排序" />
          <a-select v-model="form.status" size="small" placeholder="状态">
            <a-option value="draft">
              draft
            </a-option>
            <a-option value="published">
              published
            </a-option>
            <a-option value="archived">
              archived
            </a-option>
          </a-select>
        </div>
      </div>
      <a-button type="primary" size="small" class="mt-3" :loading="saving" @click="save">
        {{ saving ? '保存中...' : '保存' }}
      </a-button>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <section v-if="draftText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ draftText }}
    </section>
  </div>
</template>
