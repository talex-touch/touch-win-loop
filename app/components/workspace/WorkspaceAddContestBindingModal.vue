<script setup lang="ts">
import type { Contest, Track } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  visible?: boolean
  projectSettingsContestOptions?: Contest[]
  projectSettingsAddContestCandidates?: Contest[]
  projectSettingsAddContestModalTrackOptions?: Track[]
  projectSettingsAddContestModalContestId?: string
  projectSettingsAddContestModalTrackId?: string
}>(), {
  visible: false,
  projectSettingsContestOptions: () => [],
  projectSettingsAddContestCandidates: () => [],
  projectSettingsAddContestModalTrackOptions: () => [],
  projectSettingsAddContestModalContestId: '',
  projectSettingsAddContestModalTrackId: '',
})

const emit = defineEmits<{
  close: []
  openContestCatalogPage: []
  requestProjectSettingsContestReload: []
  updateProjectSettingsAddContestModalContestId: [value: string]
  updateProjectSettingsAddContestModalTrackId: [value: string]
  confirmProjectSettingsAddContestModal: []
}>()

const modelVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value)
      emit('close')
  },
})
</script>

<template>
  <a-modal
    v-model:visible="modelVisible"
    title="添加竞赛绑定"
    width="520px"
    :footer="false"
    :esc-to-close="true"
    :mask-closable="true"
    @cancel="emit('close')"
  >
    <div class="space-y-3">
      <p class="text-xs text-slate-500">
        先选择竞赛和赛道，再确认添加到当前项目绑定列表。
      </p>

      <template v-if="props.projectSettingsContestOptions.length === 0">
        <a-alert type="warning">
          当前暂无可用竞赛，请先刷新竞赛列表。
        </a-alert>
        <div class="flex gap-2 justify-end">
          <a-button size="small" @click="emit('close')">
            关闭
          </a-button>
          <a-button size="small" type="outline" @click="emit('openContestCatalogPage')">
            查看竞赛列表
          </a-button>
          <a-button size="small" type="primary" @click="emit('requestProjectSettingsContestReload')">
            刷新竞赛列表
          </a-button>
        </div>
      </template>

      <template v-else-if="props.projectSettingsAddContestCandidates.length === 0">
        <a-alert type="info">
          当前可用竞赛都已完成绑定，无需重复添加。
        </a-alert>
        <div class="flex justify-end">
          <a-button size="small" @click="emit('close')">
            知道了
          </a-button>
        </div>
      </template>

      <template v-else>
        <label class="text-xs text-slate-600 block">
          <span class="mb-1 block">竞赛</span>
          <a-select
            :model-value="props.projectSettingsAddContestModalContestId"
            class="w-full"
            size="small"
            placeholder="请选择竞赛"
            @update:model-value="emit('updateProjectSettingsAddContestModalContestId', String($event || ''))"
          >
            <a-option v-for="contest in props.projectSettingsAddContestCandidates" :key="contest.id" :value="contest.id">
              {{ contest.name }}
            </a-option>
          </a-select>
        </label>

        <label class="text-xs text-slate-600 block">
          <span class="mb-1 block">赛道</span>
          <a-select
            :model-value="props.projectSettingsAddContestModalTrackId"
            class="w-full"
            size="small"
            placeholder="请选择赛道"
            @update:model-value="emit('updateProjectSettingsAddContestModalTrackId', String($event || ''))"
          >
            <a-option v-for="track in props.projectSettingsAddContestModalTrackOptions" :key="track.id" :value="track.id">
              {{ track.name }}
            </a-option>
          </a-select>
        </label>

        <div class="flex gap-2 justify-end">
          <a-button size="small" @click="emit('close')">
            取消
          </a-button>
          <a-button
            size="small"
            type="primary"
            :disabled="!props.projectSettingsAddContestModalContestId || !props.projectSettingsAddContestModalTrackId"
            @click="emit('confirmProjectSettingsAddContestModal')"
          >
            确认添加
          </a-button>
        </div>
      </template>
    </div>
  </a-modal>
</template>
