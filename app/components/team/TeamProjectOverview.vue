<script setup lang="ts">
import type { TeamProjectCardItem } from '~/composables/team-ui'
import {
  formatPreciseDateTime,
  formatRelativeUpdatedAt,
} from '~/composables/team-ui'

withDefaults(defineProps<{
  projects?: TeamProjectCardItem[]
  showTeamMeta?: boolean
  canManageActions?: boolean
}>(), {
  projects: () => [],
  showTeamMeta: false,
  canManageActions: false,
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

function visibleMemberPreview(project: TeamProjectCardItem) {
  return project.memberPreview.slice(0, 4)
}
</script>

<template>
  <section
    v-if="projects.length === 0"
    data-testid="team-project-empty-state"
    class="p-4 border border-slate-200 rounded-xl border-dashed bg-white"
  >
    <div class="flex gap-3 items-start">
      <div class="text-slate-500 rounded-xl bg-slate-100 flex shrink-0 h-10 w-10 items-center justify-center">
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
      class="border rounded-xl bg-white relative overflow-hidden"
      :style="{
        borderColor: project.accentBorder,
        background: `linear-gradient(135deg, ${project.accentSoft} 0%, #ffffff 70%, ${project.accentSoft} 100%)`,
      }"
    >
      <div
        class="rounded-full h-20 w-20 right-[-10px] top-[-26px] absolute"
        :style="{
          background: `radial-gradient(circle, ${project.accentBorder} 0%, transparent 72%)`,
          opacity: 0.34,
        }"
      />
      <div class="p-3.5 relative">
        <button class="text-left w-full block" type="button" @click="openProject(project)">
          <div class="flex gap-3 items-start justify-between">
            <div class="flex gap-3 min-w-0 items-start">
              <div
                data-testid="team-project-icon-badge"
                class="rounded-xl flex shrink-0 h-9 w-9 items-center justify-center"
                :style="{
                  color: project.accentText,
                  backgroundColor: project.accentSoft,
                }"
              >
                <span class="material-symbols-outlined text-[20px]">{{ project.displayIcon }}</span>
              </div>

              <div class="min-w-0">
                <div class="flex flex-wrap gap-2 items-center">
                  <h3 class="text-sm text-slate-900 font-semibold truncate">
                    {{ project.title }}
                  </h3>
                </div>
              </div>
            </div>

            <span
              class="text-[10px] font-semibold px-2 py-1 border rounded-full shrink-0"
              :class="statusBadgeClass(project.status)"
              :style="{
                marginTop: '1px',
              }"
            >
              {{ project.status }}
            </span>
          </div>

          <p class="text-xs text-slate-600 mt-3 line-clamp-2">
            {{ project.summary || '待补充项目摘要' }}
          </p>

          <div
            v-if="showTeamMeta"
            class="mt-3 flex flex-wrap gap-2 items-center"
          >
            <span
              v-if="project.teamName && showTeamMeta"
              class="text-[10px] font-semibold px-2 py-1 rounded-full"
              :style="{
                color: project.accentText,
                backgroundColor: project.accentSoft,
              }"
            >
              {{ project.teamName }}
            </span>
            <span
              v-if="project.teamType && showTeamMeta"
              class="text-[10px] text-slate-500 font-medium px-2 py-1 rounded-full bg-white/80"
            >
              {{ project.teamType }}
            </span>
            <span
              v-if="project.source && showTeamMeta"
              class="text-[10px] text-slate-500 font-medium px-2 py-1 rounded-full bg-white/80"
            >
              {{ project.source }}
            </span>
          </div>
        </button>

        <div class="mt-3 pt-2.5 border-t border-white/80 flex gap-2 items-center justify-between">
          <div class="flex flex-1 flex-wrap gap-2 min-w-0 items-center">
            <a-trigger trigger="hover" position="bl">
              <button
                data-testid="team-project-member-summary-trigger"
                class="text-[11px] text-slate-600 px-2 py-1.5 rounded-md bg-white/80 flex gap-2 min-w-0 transition-colors items-center hover:bg-white"
                type="button"
              >
                <span data-testid="team-project-member-avatar-stack" class="flex items-center">
                  <template v-for="(member, index) in visibleMemberPreview(project)" :key="`${project.id}-${member.userId}`">
                    <span
                      class="text-[10px] text-slate-700 font-semibold border border-white rounded-full bg-slate-200 flex shrink-0 h-6 w-6 items-center justify-center overflow-hidden"
                      :class="index === 0 ? '' : '-ml-2'"
                      :style="{
                        backgroundColor: member.avatarUrl ? '#e2e8f0' : project.accentSoft,
                        color: member.avatarUrl ? '#475569' : project.accentText,
                      }"
                    >
                      <img
                        v-if="member.avatarUrl"
                        :src="member.avatarUrl"
                        :alt="member.username"
                        class="h-full w-full object-cover"
                      >
                      <span v-else>{{ member.avatarFallback }}</span>
                    </span>
                  </template>
                  <span
                    v-if="project.memberCount > 4"
                    class="text-[10px] text-white font-semibold px-1 border border-white rounded-full bg-slate-900 flex shrink-0 h-6 min-w-6 items-center justify-center -ml-2"
                  >
                    +{{ project.memberCount - 4 }}
                  </span>
                </span>
                <span class="truncate">{{ project.seatSummaryText }}</span>
              </button>

              <template #content>
                <div
                  data-testid="team-project-member-summary-popover"
                  class="p-3 border border-slate-200 rounded-xl bg-white w-72 shadow-sm"
                >
                  <div class="text-xs text-slate-900 font-semibold">
                    项目席位
                  </div>
                  <div class="text-[11px] text-slate-500 mt-1">
                    {{ project.seatSummaryText }}
                  </div>
                  <div v-if="project.memberPreview.length > 0" class="mt-3 space-y-2">
                    <div
                      v-for="member in project.memberPreview"
                      :key="`${project.id}-member-${member.userId}`"
                      class="flex gap-2 items-center justify-between"
                    >
                      <div class="flex gap-2 min-w-0 items-center">
                        <span
                          class="text-[10px] text-slate-700 font-semibold rounded-full bg-slate-200 flex shrink-0 h-7 w-7 items-center justify-center overflow-hidden"
                          :style="{
                            backgroundColor: member.avatarUrl ? '#e2e8f0' : project.accentSoft,
                            color: member.avatarUrl ? '#475569' : project.accentText,
                          }"
                        >
                          <img
                            v-if="member.avatarUrl"
                            :src="member.avatarUrl"
                            :alt="member.username"
                            class="h-full w-full object-cover"
                          >
                          <span v-else>{{ member.avatarFallback }}</span>
                        </span>
                        <span class="text-[12px] text-slate-700 truncate">{{ member.username }}</span>
                      </div>
                      <span class="text-[11px] text-slate-500 shrink-0">{{ member.roleLabel }}</span>
                    </div>
                  </div>
                  <div v-else class="text-[11px] text-slate-400 mt-3">
                    暂无席位成员
                  </div>
                </div>
              </template>
            </a-trigger>

            <a-trigger trigger="hover" position="bottom">
              <button
                data-testid="team-project-contest-summary-trigger"
                class="text-[11px] text-slate-600 px-2 py-1.5 rounded-md bg-white/80 flex gap-1 max-w-full min-w-0 transition-colors items-center hover:bg-white"
                type="button"
              >
                <span class="truncate">{{ project.contestSummary }}</span>
              </button>

              <template #content>
                <div
                  data-testid="team-project-contest-summary-popover"
                  class="p-3 border border-slate-200 rounded-xl bg-white w-72 shadow-sm"
                >
                  <div class="text-xs text-slate-900 font-semibold">
                    绑定比赛
                  </div>
                  <div v-if="project.contestNames.length > 0" class="mt-3 space-y-2">
                    <div
                      v-for="contestName in project.contestNames"
                      :key="`${project.id}-contest-${contestName}`"
                      class="text-[12px] text-slate-700 px-3 py-2 rounded-xl bg-slate-50"
                    >
                      {{ contestName }}
                    </div>
                  </div>
                  <div v-else class="text-[11px] text-slate-400 mt-3">
                    暂未绑定比赛
                  </div>
                </div>
              </template>
            </a-trigger>
          </div>

          <div class="flex shrink-0 gap-1 items-center">
            <a-trigger trigger="hover" position="bottom">
              <button
                data-testid="team-project-updated-at-trigger"
                class="text-[11px] text-slate-400 px-2 py-1.5 transition-colors hover:text-slate-500"
                type="button"
              >
                {{ formatRelativeUpdatedAt(project.updatedAt) }}
              </button>

              <template #content>
                <div
                  data-testid="team-project-updated-at-popover"
                  class="p-3 border border-slate-200 rounded-xl bg-white shadow-sm"
                >
                  <div class="text-xs text-slate-900 font-semibold">
                    最后更新时间
                  </div>
                  <div class="text-[11px] text-slate-500 mt-1">
                    {{ formatPreciseDateTime(project.updatedAt) }}
                  </div>
                </div>
              </template>
            </a-trigger>

            <a-trigger
              trigger="click"
              position="bl"
              :popup-visible="isActionMenuVisible(project.id)"
              @popup-visible-change="setActionMenuVisible(project.id, $event)"
            >
              <button
                data-testid="team-project-action-trigger"
                class="text-slate-400 rounded-full flex shrink-0 h-8 w-8 items-center justify-center"
                type="button"
                @click.stop
              >
                <span class="material-symbols-outlined text-[18px]">more_horiz</span>
              </button>

              <template #content>
                <div class="p-2 border border-slate-200 rounded-xl bg-white w-44">
                  <button
                    class="text-[12px] text-slate-700 px-3 py-2 text-left rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
                    type="button"
                    @click.stop="triggerProjectAction(project, 'details')"
                  >
                    <span class="material-symbols-outlined text-[16px]">open_in_new</span>
                    <span>详细信息</span>
                  </button>
                  <button
                    class="text-[12px] px-3 py-2 text-left rounded-xl flex gap-2 w-full items-center"
                    :class="canManageActions ? 'text-slate-700 transition-colors hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed'"
                    type="button"
                    :disabled="!canManageActions"
                    @click.stop="triggerProjectAction(project, 'settings')"
                  >
                    <span class="material-symbols-outlined text-[16px]">settings</span>
                    <span>项目设置</span>
                  </button>
                  <button
                    class="text-[12px] px-3 py-2 text-left rounded-xl flex gap-2 w-full items-center"
                    :class="canManageActions ? 'text-slate-700 transition-colors hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed'"
                    type="button"
                    :disabled="!canManageActions"
                    @click.stop="triggerProjectAction(project, 'members')"
                  >
                    <span class="material-symbols-outlined text-[16px]">group</span>
                    <span>成员管理</span>
                  </button>
                  <div class="mt-1 pt-1 border-t border-slate-100">
                    <button
                      class="text-[12px] px-3 py-2 text-left rounded-xl flex gap-2 w-full items-center"
                      :class="canManageActions ? 'text-rose-600 transition-colors hover:bg-rose-50' : 'text-slate-300 cursor-not-allowed'"
                      type="button"
                      :disabled="!canManageActions"
                      @click.stop="triggerProjectAction(project, 'archive')"
                    >
                      <span class="material-symbols-outlined text-[16px]">archive</span>
                      <span>归档</span>
                    </button>
                  </div>
                </div>
              </template>
            </a-trigger>
          </div>
        </div>
      </div>
    </article>
  </section>
</template>
