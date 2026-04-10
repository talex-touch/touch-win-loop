<script setup lang="ts">
import type { TimelineNodeType } from '~~/shared/types/domain'

interface TrackOption {
  id: string
  name: string
}

interface TimelineFormModel {
  trackId?: string
  year: number
  nodeType: TimelineNodeType
  startAt: string
  endAt: string
  note: string
  sourceLink: string
}

const props = withDefaults(defineProps<{
  form: TimelineFormModel
  tracks?: TrackOption[]
  includeTrack?: boolean
  loading?: boolean
  saving?: boolean
  errorText?: string
  draftText?: string
  draftTitle?: string
  draftUpdatedAt?: string
}>(), {
  tracks: () => [],
  includeTrack: false,
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

    <div class="gap-2 grid grid-cols-2" :class="{ 'mt-4': draftTitle }">
      <a-select v-if="includeTrack" v-model="form.trackId" size="small" placeholder="赛道">
        <a-option v-for="item in tracks" :key="item.id" :value="item.id">
          {{ item.name }}
        </a-option>
      </a-select>
      <a-input-number v-model="form.year" size="small" :min="2000" :max="2100" placeholder="年份" />
      <a-select v-model="form.nodeType" size="small" placeholder="节点类型">
        <a-option value="registration">
          registration
        </a-option>
        <a-option value="submission">
          submission
        </a-option>
        <a-option value="preliminary">
          preliminary
        </a-option>
        <a-option value="final">
          final
        </a-option>
        <a-option value="other">
          other
        </a-option>
      </a-select>
      <a-date-picker
        v-model="form.startAt"
        size="small"
        show-time
        format="YYYY-MM-DD HH:mm"
        value-format="YYYY-MM-DDTHH:mm"
        placeholder="开始时间"
      />
      <a-date-picker
        v-model="form.endAt"
        size="small"
        show-time
        format="YYYY-MM-DD HH:mm"
        value-format="YYYY-MM-DDTHH:mm"
        placeholder="结束时间"
      />
      <a-input v-model="form.note" size="small" class="col-span-2" placeholder="备注" />
      <a-input v-model="form.sourceLink" size="small" class="col-span-2" placeholder="来源链接" />
    </div>

    <a-button type="primary" size="small" class="mt-3" :loading="saving" @click="emit('submit')">
      {{ saving ? '保存中...' : '保存' }}
    </a-button>
  </SectionCard>

  <StateBlock v-if="errorText" tone="error" :description="errorText" />
  <StateBlock v-if="draftText" tone="success" :description="draftText" />
</template>
