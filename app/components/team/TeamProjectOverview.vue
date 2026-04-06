<script setup lang="ts">
import type { TeamProjectCardItem } from '~/composables/team-ui'
import { formatDateTime } from '~/composables/team-ui'

type WorkspaceSummaryStatTone = 'neutral' | 'warning' | 'success'

const props = withDefaults(defineProps<{
  title: string
  description: string
  summaryText: string
  actionLabel?: string
  actionDisabled?: boolean
  actionHintText?: string
  noticeText?: string
  noticeTone?: 'success' | 'warning'
  loading?: boolean
  errorText?: string
  emptyTitle: string
  emptyDescription?: string
  projects?: TeamProjectCardItem[]
  showTeamMeta?: boolean
  loadingKeyPrefix?: string
  summaryStats?: Array<{
    label: string
    value: string
    tone?: WorkspaceSummaryStatTone
  }>
}>(), {
  actionLabel: '新建项目',
  actionDisabled: false,
  actionHintText: '',
  noticeText: '',
  noticeTone: 'warning',
  loading: false,
  errorText: '',
  emptyDescription: '',
  projects: () => [],
  showTeamMeta: false,
  loadingKeyPrefix: 'team-project',
  summaryStats: () => [],
})

const emit = defineEmits<{
  (event: 'action'): void
  (event: 'retry'): void
  (event: 'openProject', project: TeamProjectCardItem): void
}>()

const noticeClass = computed(() => {
  if (props.noticeTone === 'success')
    return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  return 'text-amber-700 border-amber-200 bg-amber-50'
})

function openProject(project: TeamProjectCardItem) {
  emit('openProject', project)
}

function summaryStatClass(tone: WorkspaceSummaryStatTone | undefined) {
  if (tone === 'warning')
    return 'border-amber-200 bg-amber-50 text-amber-700'
  if (tone === 'success')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}
</script>

<template>
  <div class="space-y-6">
    <section class="p-6 border border-slate-200 rounded-2xl bg-white" data-testid="team-dashboard-overview">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 class="text-2xl text-slate-900 font-bold">
            {{ title }}
          </h2>
          <p class="text-sm text-slate-500 mt-1">
            {{ description }}
          </p>
        </div>

        <button
          data-testid="team-dashboard-create-project-button"
          class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="actionDisabled"
          @click="emit('action')"
        >
          {{ actionLabel }}
        </button>
      </div>

      <div class="mt-4 space-y-3">
        <p class="text-xs text-slate-500">
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

        <p v-if="actionHintText" class="text-xs text-amber-600">
          {{ actionHintText }}
        </p>
      </div>
    </section>

    <section
      v-if="noticeText"
      data-testid="team-dashboard-notice"
      class="text-sm p-4 border rounded-xl"
      :class="noticeClass"
    >
      {{ noticeText }}
    </section>

    <section v-if="loading" class="gap-4 grid grid-cols-1 xl:grid-cols-2">
      <div
        v-for="index in 6"
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
      <button class="text-sm text-rose-700 font-semibold mt-3 px-3 py-1.5 border border-rose-300 rounded hover:bg-rose-100" @click="emit('retry')">
        重新加载
      </button>
    </section>

    <section v-else-if="projects.length === 0" class="p-8 text-center border border-slate-300 rounded-2xl border-dashed bg-white" data-testid="team-dashboard-empty-state">
      <h3 class="text-lg text-slate-900 font-semibold">
        {{ emptyTitle }}
      </h3>
      <p v-if="emptyDescription" class="text-sm text-slate-500 mt-2">
        {{ emptyDescription }}
      </p>
      <button
        data-testid="team-dashboard-empty-create-project-button"
        class="text-sm text-white font-semibold mt-4 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="actionDisabled"
        @click="emit('action')"
      >
        {{ actionLabel }}
      </button>
    </section>

    <section v-else class="gap-4 grid grid-cols-1 xl:grid-cols-2">
      <button
        v-for="project in projects"
        :key="project.id"
        data-testid="team-project-card"
        :data-project-id="project.id"
        class="p-5 text-left border border-slate-200 rounded-xl bg-white transition-all hover:border-blue-200 hover:shadow-sm"
        type="button"
        @click="openProject(project)"
      >
        <div class="flex gap-2 items-center justify-between">
          <h3 class="text-base text-slate-900 font-semibold pr-3 truncate">
            {{ project.title }}
          </h3>
          <span class="text-[10px] text-slate-600 font-semibold px-2 py-1 rounded-full bg-slate-100 shrink-0">
            {{ project.status }}
          </span>
        </div>

        <p
          v-if="showTeamMeta"
          class="text-xs text-slate-600 mt-3 flex flex-wrap gap-2 items-center"
        >
          <span v-if="project.teamName" class="text-blue-700 font-semibold px-2 py-1 rounded bg-blue-50">
            {{ project.teamName }}
          </span>
          <span v-if="project.teamType" class="text-slate-400">{{ project.teamType }}</span>
          <span v-if="project.source" class="text-slate-400">source={{ project.source }}</span>
          <span v-if="project.contestNames.length > 0" class="text-slate-400">
            关联竞赛 {{ project.contestNames.length }} 个
          </span>
        </p>

        <p class="text-xs text-slate-500 mt-3 truncate">
          简介：{{ project.summary }}
        </p>

        <p v-if="project.contestNames.length > 0" class="text-xs text-slate-500 mt-2 truncate">
          竞赛：{{ project.contestNames.join(' / ') }}
        </p>

        <p
          v-if="project.projectSeatLimit"
          class="text-xs text-slate-500 mt-2"
        >
          项目席位：{{ project.projectSeatUsed }}/{{ project.projectSeatLimit }}，剩余 {{ project.projectSeatRemaining }}
        </p>

        <p class="text-xs text-slate-500 mt-2">
          最近更新：{{ formatDateTime(project.updatedAt) }}
        </p>
      </button>
    </section>
  </div>
</template>
