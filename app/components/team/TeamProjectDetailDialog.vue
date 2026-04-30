<script setup lang="ts">
import type { Project } from '~~/shared/types/domain'
import type { TeamProjectCardItem } from '~/composables/team-ui'

const props = withDefaults(defineProps<{
  visible?: boolean
  project?: Project | null
  projectCard?: TeamProjectCardItem | null
  detailRows?: Array<{ label: string, value: string }>
}>(), {
  visible: false,
  project: null,
  projectCard: null,
  detailRows: () => [],
})

const emit = defineEmits<{
  close: []
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
    title="详细信息"
    data-testid="team-project-detail-modal"
    width="620px"
    :footer="false"
    :esc-to-close="true"
    :mask-closable="true"
    @cancel="emit('close')"
  >
    <div class="space-y-4">
      <ProjectDisplayPreviewCard
        :title="project?.title || '项目信息'"
        :summary="project?.summary || project?.problemStatement || '当前项目暂无补充说明。'"
        :icon="projectCard?.displayIcon || 'folder'"
        :monogram="projectCard?.displayMonogram || 'P'"
        :accent="{
          solid: projectCard?.accentSolid || '#5b82f6',
          soft: projectCard?.accentSoft || '#f5f9ff',
          border: projectCard?.accentBorder || '#dce8ff',
          text: projectCard?.accentText || '#365fd6',
        }"
        compact
      />

      <a-descriptions :column="1" bordered size="small">
        <a-descriptions-item v-for="item in detailRows" :key="item.label" :label="item.label">
          <span class="text-xs text-slate-700 break-all">{{ item.value }}</span>
        </a-descriptions-item>
      </a-descriptions>

      <div class="flex justify-end">
        <a-button size="small" @click="emit('close')">
          关闭
        </a-button>
      </div>
    </div>
  </a-modal>
</template>
