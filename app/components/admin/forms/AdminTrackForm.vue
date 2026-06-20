<script setup lang="ts">
import type { ContestStatus } from '~~/shared/types/domain'

interface TrackFormModel {
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
}

withDefaults(defineProps<{
  form: TrackFormModel
  loading?: boolean
  saving?: boolean
  errorText?: string
  draftText?: string
  draftTitle?: string
  draftUpdatedAt?: string
}>(), {
  loading: false,
  saving: false,
  errorText: '',
  draftText: '',
  draftTitle: '',
  draftUpdatedAt: '',
})

const emit = defineEmits<{
  (event: 'submit'): void
  (event: 'applyDraft'): void
  (event: 'clearDraft'): void
}>()
</script>

<template>
  <SectionCard v-if="loading">
    <a-skeleton :animation="true">
      <a-skeleton-line :rows="6" />
    </a-skeleton>
  </SectionCard>

  <SectionCard v-else>
    <AdminDraftNotice
      v-if="draftTitle"
      :title="draftTitle"
      :updated-at="draftUpdatedAt"
      @apply="emit('applyDraft')"
      @clear="emit('clearDraft')"
    />

    <div class="space-y-2" :class="{ 'mt-4': draftTitle }">
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

    <a-button type="primary" size="small" class="mt-3" :loading="saving" @click="emit('submit')">
      {{ saving ? '保存中...' : '保存' }}
    </a-button>
  </SectionCard>

  <StateBlock v-if="errorText" tone="error" :description="errorText" />
  <StateBlock v-if="draftText" tone="success" :description="draftText" />
</template>
