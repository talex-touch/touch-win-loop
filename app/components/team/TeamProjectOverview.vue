<script setup lang="ts">
import type { TeamProjectCardItem } from '~/composables/team-ui'
import { formatDateTime } from '~/composables/team-ui'

withDefaults(defineProps<{
  projects?: TeamProjectCardItem[]
  showTeamMeta?: boolean
}>(), {
  projects: () => [],
  showTeamMeta: false,
})

const emit = defineEmits<{
  (event: 'openProject', project: TeamProjectCardItem): void
  (event: 'projectAction', payload: {
    action: 'archive' | 'details' | 'members' | 'settings'
    project: TeamProjectCardItem
  }): void
}>()

const actionMenuProjectId = ref('')

function openProject(project: TeamProjectCardItem) {
  emit('openProject', project)
}

function setActionMenuVisible(projectId: string, visible: boolean) {
  actionMenuProjectId.value = visible ? projectId : ''
}

function isActionMenuVisible(projectId: string): boolean {
  return actionMenuProjectId.value === projectId
}

function triggerProjectAction(
  project: TeamProjectCardItem,
  action: 'archive' | 'details' | 'members' | 'settings',
) {
  actionMenuProjectId.value = ''
  emit('projectAction', { action, project })
}

function statusBadgeClass(status: string): string {
  if (status === 'active')
    return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  if (status === 'archived')
    return 'text-slate-500 border-slate-200 bg-slate-100'
  return 'text-amber-700 border-amber-200 bg-amber-50'
}
</script>

<template>
  <section
    v-if="projects.length === 0"
    data-testid="team-project-empty-state"
    class="p-5 border border-slate-200 rounded-2xl border-dashed bg-white"
  >
    <div class="flex gap-3 items-start">
      <div class="text-slate-500 rounded-2xl bg-slate-100 flex shrink-0 h-11 w-11 items-center justify-center">
        <span class="material-symbols-outlined text-[20px]">inventory_2</span>
      </div>
      <div>
        <h3 class="text-sm text-slate-900 font-semibold">
          当前项目台暂无你可见的项目
        </h3>
        <p class="text-xs text-slate-500 mt-1">
          如需加入项目，请联系 Team 管理者分配；如果你有权限，也可以直接使用右上角入口创建项目。
        </p>
      </div>
    </div>
  </section>

  <section v-else class="gap-4 grid grid-cols-1 xl:grid-cols-2">
    <article
      v-for="project in projects"
      :key="project.id"
      data-testid="team-project-card"
      :data-project-id="project.id"
      class="group relative overflow-hidden rounded-2xl border bg-white transition-all hover:-translate-y-0.5 hover:shadow-md"
      :style="{
        borderColor: project.accentBorder,
        background: `linear-gradient(135deg, ${project.accentSoft} 0%, #ffffff 70%, ${project.accentSoft} 100%)`,
      }"
    >
      <div
        class="absolute right-[-12px] top-[-30px] h-24 w-24 rounded-full transition-transform duration-300 group-hover:scale-105"
        :style="{
          background: `radial-gradient(circle, ${project.accentBorder} 0%, transparent 72%)`,
          opacity: 0.42,
        }"
      />
      <div class="relative p-5">
        <button class="block w-full text-left" type="button" @click="openProject(project)">
          <div class="flex gap-3 items-start justify-between">
            <div class="flex min-w-0 items-start gap-3">
              <div
                data-testid="team-project-icon-badge"
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm"
                :style="{
                  color: project.accentText,
                  backgroundColor: project.accentSoft,
                  borderColor: project.accentBorder,
                }"
              >
                <span class="material-symbols-outlined text-[22px]">{{ project.displayIcon }}</span>
              </div>

              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-base text-slate-900 font-semibold">
                    {{ project.title }}
                  </h3>
                  <span
                    class="shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold"
                    :class="statusBadgeClass(project.status)"
                  >
                    {{ project.status }}
                  </span>
                </div>

                <p class="mt-1 line-clamp-2 text-xs text-slate-600">
                  {{ project.summary || '待补充项目摘要' }}
                </p>
              </div>
            </div>

            <div
              class="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
              :style="{
                color: project.accentText,
                backgroundColor: project.accentSoft,
              }"
            >
              {{ project.displayMonogram }}
            </div>
          </div>

          <div
            v-if="showTeamMeta || project.contestNames.length > 0"
            class="mt-4 flex flex-wrap items-center gap-2"
          >
            <span
              v-if="project.teamName && showTeamMeta"
              class="rounded-full px-2 py-1 text-[10px] font-semibold"
              :style="{
                color: project.accentText,
                backgroundColor: project.accentSoft,
              }"
            >
              {{ project.teamName }}
            </span>
            <span
              v-if="project.teamType && showTeamMeta"
              class="rounded-full bg-white/80 px-2 py-1 text-[10px] text-slate-500 font-medium"
            >
              {{ project.teamType }}
            </span>
            <span
              v-if="project.source && showTeamMeta"
              class="rounded-full bg-white/80 px-2 py-1 text-[10px] text-slate-500 font-medium"
            >
              {{ project.source }}
            </span>
            <span
              v-for="contestName in project.contestNames.slice(0, 2)"
              :key="`${project.id}-${contestName}`"
              class="rounded-full bg-white/85 px-2 py-1 text-[10px] text-slate-600 font-medium"
            >
              {{ contestName }}
            </span>
            <span
              v-if="project.contestNames.length > 2"
              class="rounded-full bg-white/80 px-2 py-1 text-[10px] text-slate-500 font-medium"
            >
              +{{ project.contestNames.length - 2 }} 个竞赛
            </span>
          </div>

          <div
            v-if="project.projectSeatLimit"
            class="mt-4 rounded-xl border bg-white/70 p-3"
            :style="{ borderColor: project.accentBorder }"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-[11px] text-slate-600 font-medium">
                项目席位
              </p>
              <p class="text-[11px] text-slate-700 font-semibold">
                {{ project.projectSeatUsed }}/{{ project.projectSeatLimit }}
              </p>
            </div>
            <div data-testid="team-project-seat-bar" class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/70">
              <div
                class="h-full rounded-full transition-all duration-300"
                :style="{
                  width: `${project.seatProgressPercent || 0}%`,
                  backgroundColor: project.accentSolid,
                }"
              />
            </div>
            <div class="mt-2 flex items-center justify-between gap-2">
              <p class="text-[11px] text-slate-500">
                剩余 {{ project.projectSeatRemaining }} 个席位
              </p>
              <p class="text-[11px] text-slate-500">
                占用 {{ project.seatProgressPercent || 0 }}%
              </p>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between gap-2">
            <p class="text-[11px] text-slate-500">
              最近更新：{{ formatDateTime(project.updatedAt) }}
            </p>
            <p
              v-if="project.contestNames.length > 0"
              class="max-w-full truncate text-[11px] text-slate-500"
            >
              {{ project.contestNames.join(' / ') }}
            </p>
          </div>
        </button>

        <div class="mt-3 flex items-center justify-end">
          <a-trigger
            trigger="click"
            position="bl"
            :popup-visible="isActionMenuVisible(project.id)"
            @popup-visible-change="setActionMenuVisible(project.id, $event)"
          >
            <button
              data-testid="team-project-action-trigger"
              class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
              type="button"
              @click.stop
            >
              <span class="material-symbols-outlined text-[18px]">more_horiz</span>
            </button>

            <template #content>
              <div class="w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
                <button
                  class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                  type="button"
                  @click.stop="triggerProjectAction(project, 'details')"
                >
                  <span class="material-symbols-outlined text-[16px]">open_in_new</span>
                  <span>详细信息</span>
                </button>
                <button
                  class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                  type="button"
                  @click.stop="triggerProjectAction(project, 'settings')"
                >
                  <span class="material-symbols-outlined text-[16px]">settings</span>
                  <span>项目设置</span>
                </button>
                <button
                  class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                  type="button"
                  @click.stop="triggerProjectAction(project, 'members')"
                >
                  <span class="material-symbols-outlined text-[16px]">group</span>
                  <span>成员管理</span>
                </button>
                <button
                  class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-rose-600 transition-colors hover:bg-rose-50"
                  type="button"
                  @click.stop="triggerProjectAction(project, 'archive')"
                >
                  <span class="material-symbols-outlined text-[16px]">archive</span>
                  <span>归档</span>
                </button>
              </div>
            </template>
          </a-trigger>
        </div>
      </div>
    </article>
  </section>
</template>
