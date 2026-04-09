<script setup lang="ts">
type DashboardOverviewNoticeTone = 'success' | 'warning'
type DashboardOverviewStatTone = 'neutral' | 'warning' | 'success'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  summaryText?: string
  summaryStats?: Array<{
    label: string
    value: string
    tone?: DashboardOverviewStatTone
  }>
  noticeText?: string
  noticeTone?: DashboardOverviewNoticeTone
  loading?: boolean
  errorText?: string
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  primaryActionLabel?: string
  primaryActionDisabled?: boolean
  primaryActionHintText?: string
  primaryActionTestId?: string
  emptyActionTestId?: string
  overviewSectionTestId?: string
  noticeTestId?: string
  loadingKeyPrefix?: string
  loadingCardCount?: number
}>(), {
  description: '',
  summaryText: '',
  summaryStats: () => [],
  noticeText: '',
  noticeTone: 'warning',
  loading: false,
  errorText: '',
  empty: false,
  emptyTitle: '暂无内容',
  emptyDescription: '',
  primaryActionLabel: '',
  primaryActionDisabled: false,
  primaryActionHintText: '',
  primaryActionTestId: 'dashboard-overview-primary-action',
  emptyActionTestId: 'dashboard-overview-empty-action',
  overviewSectionTestId: 'dashboard-overview-header',
  noticeTestId: 'dashboard-overview-notice',
  loadingKeyPrefix: 'dashboard-overview-skeleton',
  loadingCardCount: 6,
})

const emit = defineEmits<{
  (event: 'primaryAction'): void
  (event: 'retry'): void
}>()

const slots = useSlots()

const hasHeaderActions = computed(() => {
  return Boolean(slots['header-actions']) || Boolean(props.primaryActionLabel)
})

const hasSummary = computed(() => {
  return Boolean(slots.summary) || Boolean(props.summaryText) || props.summaryStats.length > 0
})

const hasLead = computed(() => Boolean(slots.lead))
const hasAside = computed(() => Boolean(slots.aside))

const noticeClass = computed(() => {
  if (props.noticeTone === 'success')
    return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  return 'text-amber-700 border-amber-200 bg-amber-50'
})

function summaryStatClass(tone: DashboardOverviewStatTone | undefined) {
  if (tone === 'warning')
    return 'border-amber-200 bg-amber-50 text-amber-700'
  if (tone === 'success')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}
</script>

<template>
  <div class="space-y-6">
    <section
      class="p-6 border border-slate-200 rounded-2xl bg-white"
      :data-testid="overviewSectionTestId"
    >
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 class="text-2xl text-slate-900 font-bold">
            {{ title }}
          </h2>
          <p v-if="description" class="text-sm text-slate-500 mt-1">
            {{ description }}
          </p>
        </div>

        <div
          v-if="hasHeaderActions"
          class="flex flex-wrap gap-3 items-center justify-end"
        >
          <slot name="header-actions">
            <button
              v-if="primaryActionLabel"
              :data-testid="primaryActionTestId"
              class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="primaryActionDisabled"
              type="button"
              @click="emit('primaryAction')"
            >
              {{ primaryActionLabel }}
            </button>
          </slot>
        </div>
      </div>

      <div v-if="hasSummary" class="mt-4 space-y-3">
        <slot name="summary">
          <p v-if="summaryText" class="text-xs text-slate-500">
            {{ summaryText }}
          </p>

          <div v-if="summaryStats.length > 0" class="gap-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <article
              v-for="item in summaryStats"
              :key="item.label"
              class="p-4 border rounded-xl"
              :class="summaryStatClass(item.tone)"
            >
              <p class="text-[11px] font-medium opacity-80">
                {{ item.label }}
              </p>
              <p class="text-sm leading-6 font-semibold mt-2">
                {{ item.value }}
              </p>
            </article>
          </div>
        </slot>

        <p v-if="primaryActionHintText" class="text-xs text-amber-600">
          {{ primaryActionHintText }}
        </p>
      </div>

      <p v-else-if="primaryActionHintText" class="text-xs text-amber-600 mt-4">
        {{ primaryActionHintText }}
      </p>
    </section>

    <section
      v-if="noticeText"
      class="text-sm p-4 border rounded-xl"
      :class="noticeClass"
      :data-testid="noticeTestId"
    >
      {{ noticeText }}
    </section>

    <section v-if="hasLead">
      <slot name="lead" />
    </section>

    <section v-if="loading" class="gap-4 grid grid-cols-1 xl:grid-cols-2">
      <div
        v-for="index in loadingCardCount"
        :key="`${loadingKeyPrefix}-${index}`"
        class="p-5 border border-slate-200 rounded-xl bg-white animate-pulse"
      >
        <div class="rounded bg-slate-200 h-5 w-1/2" />
        <div class="mt-3 rounded bg-slate-100 h-4 w-2/3" />
        <div class="mt-2 rounded bg-slate-100 h-4 w-1/3" />
      </div>
    </section>

    <section v-else-if="errorText" class="p-5 border border-rose-200 rounded-xl bg-rose-50">
      <p class="text-sm text-rose-700">
        {{ errorText }}
      </p>
      <button
        class="text-sm text-rose-700 font-semibold mt-3 px-3 py-1.5 border border-rose-300 rounded hover:bg-rose-100"
        type="button"
        @click="emit('retry')"
      >
        重新加载
      </button>
    </section>

    <section v-else-if="empty" class="p-8 text-center border border-slate-300 rounded-2xl border-dashed bg-white">
      <h3 class="text-lg text-slate-900 font-semibold">
        {{ emptyTitle }}
      </h3>
      <p v-if="emptyDescription" class="text-sm text-slate-500 mt-2">
        {{ emptyDescription }}
      </p>
      <button
        v-if="primaryActionLabel"
        :data-testid="emptyActionTestId"
        class="text-sm text-white font-semibold mt-4 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="primaryActionDisabled"
        type="button"
        @click="emit('primaryAction')"
      >
        {{ primaryActionLabel }}
      </button>
    </section>

    <div v-else-if="hasAside" class="gap-8 grid grid-cols-12">
      <div class="col-span-12 space-y-8 lg:col-span-8">
        <slot />
      </div>
      <div class="col-span-12 lg:col-span-4">
        <slot name="aside" />
      </div>
    </div>

    <section v-else>
      <slot />
    </section>
  </div>
</template>
