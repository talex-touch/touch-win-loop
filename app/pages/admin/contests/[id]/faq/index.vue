<script setup lang="ts">
import type { ApiResponse, ContestDetailPayload, ContestFaqItem } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const successText = ref('')
const faqItems = ref<ContestFaqItem[]>([])

function addFaqItem() {
  faqItems.value = [...faqItems.value, { question: '', answer: '', sortOrder: faqItems.value.length }]
}

function removeFaqItem(index: number) {
  faqItems.value = faqItems.value.filter((_, idx) => idx !== index)
}

async function loadData() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<ContestDetailPayload>>(endpoint(`/contests/${contestId.value}`))
    faqItems.value = (response.data.contest.faqItems || []).length > 0
      ? [...(response.data.contest.faqItems || [])]
      : [{ question: '', answer: '', sortOrder: 0 }]
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || 'FAQ 加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId.value}`), {
      method: 'PATCH',
      body: {
        faqItems: faqItems.value
          .map((item, index) => ({
            question: String(item.question || '').trim(),
            answer: String(item.answer || '').trim(),
            sortOrder: index,
          }))
          .filter(item => item.question || item.answer),
      },
    })
    successText.value = 'FAQ 已保存。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || 'FAQ 保存失败。')
  }
  finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-4">
    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <section v-else class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex items-center justify-between">
        <p class="text-xs text-slate-700 font-semibold">
          结构化 FAQ
        </p>
        <div class="flex gap-2 items-center">
          <a-button size="mini" type="outline" @click="addFaqItem">
            新增 FAQ
          </a-button>
          <a-button type="primary" size="mini" :loading="saving" @click="save">
            保存 FAQ
          </a-button>
        </div>
      </div>

      <div class="mt-3 space-y-2">
        <div
          v-for="(item, index) in faqItems"
          :key="`faq-${index}`"
          class="p-2 border border-slate-200 rounded"
        >
          <a-input v-model="item.question" size="small" placeholder="问题" />
          <a-textarea
            v-model="item.answer"
            class="mt-2"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            placeholder="答案"
          />
          <a-button size="mini" status="danger" class="mt-2" @click="removeFaqItem(index)">
            删除
          </a-button>
        </div>
      </div>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
    <section v-if="successText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ successText }}
    </section>
  </div>
</template>
