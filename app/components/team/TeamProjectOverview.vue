<script setup lang="ts">
import type { TeamProjectCardItem } from '~/composables/team-ui'
import { formatDateTime } from '~/composables/team-ui'

const props = withDefaults(defineProps<{
  title: string
  description: string
  summaryText: string
  actionLabel?: string
  actionDisabled?: boolean
  noticeText?: string
  noticeTone?: 'success' | 'warning'
  loading?: boolean
  errorText?: string
  emptyTitle: string
  emptyDescription?: string
  projects?: TeamProjectCardItem[]
  showTeamMeta?: boolean
  loadingKeyPrefix?: string
}>(), {
  actionLabel: '新建项目',
  actionDisabled: false,
  noticeText: '',
  noticeTone: 'warning',
  loading: false,
  errorText: '',
  emptyDescription: '',
  projects: () => [],
  showTeamMeta: false,
  loadingKeyPrefix: 'team-project',
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
</script>

<template>
  <div class="space-y-6">
    <section class="p-6 border border-slate-200 rounded-2xl bg-white">
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
          class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="actionDisabled"
          @click="emit('action')"
        >
          {{ actionLabel }}
        </button>
      </div>

      <p class="text-xs text-slate-500 mt-4">
        {{ summaryText }}
      </p>
    </section>

    <section
      v-if="noticeText"
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

    <section v-else-if="projects.length === 0" class="p-8 text-center border border-slate-300 rounded-2xl border-dashed bg-white">
      <h3 class="text-lg text-slate-900 font-semibold">
        {{ emptyTitle }}
      </h3>
      <p v-if="emptyDescription" class="text-sm text-slate-500 mt-2">
        {{ emptyDescription }}
      </p>
      <button
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

        <p class="text-xs text-slate-500 mt-2">
          最近更新：{{ formatDateTime(project.updatedAt) }}
        </p>
      </button>
    </section>
  </div>
</template>
