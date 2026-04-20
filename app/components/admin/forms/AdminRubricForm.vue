<script setup lang="ts">
import type { ContestStatus, RubricScoringMode } from '~~/shared/types/domain'

interface TrackOption {
  id: string
  name: string
}

interface RubricDimensionInput {
  key: string
  name: string
  weightText: string
  description: string
  scoringPoint: string
  deductionPoint: string
  evidenceRequirement: string
}

interface RubricFormModel {
  trackId: string
  scoringMode: RubricScoringMode
  version: number
  status: ContestStatus
  scoringPointsText: string
  deductionItemsText: string
  evidenceRequirementsText: string
}

withDefaults(defineProps<{
  form: RubricFormModel
  dimensions: RubricDimensionInput[]
  tracks?: TrackOption[]
  loading?: boolean
  saving?: boolean
  errorText?: string
  draftText?: string
  draftTitle?: string
  draftUpdatedAt?: string
}>(), {
  tracks: () => [],
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
  (event: 'addDimension'): void
  (event: 'removeDimension', index: number): void
}>()
</script>

<template>
  <SectionCard v-if="loading">
    <a-skeleton :animation="true">
      <a-skeleton-line :rows="6" />
    </a-skeleton>
  </SectionCard>

  <SectionCard v-else>
    <div class="space-y-3">
      <AdminDraftNotice
        v-if="draftTitle"
        :title="draftTitle"
        :updated-at="draftUpdatedAt"
        @apply="emit('applyDraft')"
        @clear="emit('clearDraft')"
      />

      <div class="gap-2 grid md:grid-cols-4" :class="{ 'mt-4': draftTitle }">
        <a-select v-model="form.trackId" size="small" placeholder="请选择赛道">
          <a-option value="">
            请选择赛道
          </a-option>
          <a-option v-for="item in tracks" :key="item.id" :value="item.id">
            {{ item.name }}
          </a-option>
        </a-select>
        <a-select v-model="form.scoringMode" size="small" placeholder="评分模式">
          <a-option value="weighted">
            weighted
          </a-option>
          <a-option value="checklist">
            checklist
          </a-option>
        </a-select>
        <a-input-number v-model="form.version" size="small" :min="1" :max="999" placeholder="版本" />
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

      <div class="gap-2 grid md:grid-cols-3">
        <a-textarea
          v-model="form.scoringPointsText"
          :auto-size="{ minRows: 3, maxRows: 5 }"
          placeholder="评分要点（逗号或换行分隔）"
        />
        <a-textarea
          v-model="form.deductionItemsText"
          :auto-size="{ minRows: 3, maxRows: 5 }"
          placeholder="扣分项（逗号或换行分隔）"
        />
        <a-textarea
          v-model="form.evidenceRequirementsText"
          :auto-size="{ minRows: 3, maxRows: 5 }"
          placeholder="佐证要求（逗号或换行分隔）"
        />
      </div>

      <div class="p-3 border border-slate-200 rounded">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-xs text-slate-700 font-semibold">
            评分维度表（{{ form.scoringMode }}）
          </p>
          <a-button size="mini" type="outline" @click="emit('addDimension')">
            新增维度
          </a-button>
        </div>
        <div class="overflow-x-auto">
          <table class="text-xs min-w-[980px] w-full">
            <thead>
              <tr class="text-slate-600 text-left border-b border-slate-200 bg-slate-50">
                <th class="px-2 py-2">
                  名称
                </th>
                <th class="px-2 py-2">
                  权重
                </th>
                <th class="px-2 py-2">
                  说明
                </th>
                <th class="px-2 py-2">
                  评分点
                </th>
                <th class="px-2 py-2">
                  扣分点
                </th>
                <th class="px-2 py-2">
                  佐证要求
                </th>
                <th class="px-2 py-2">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in dimensions" :key="`${item.key}-${index}`" class="border-b border-slate-100">
                <td class="px-2 py-2">
                  <a-input v-model="item.name" size="small" placeholder="维度名称" />
                </td>
                <td class="px-2 py-2">
                  <a-input
                    v-model="item.weightText"
                    size="small"
                    :placeholder="form.scoringMode === 'weighted' ? '必填' : '可空'"
                  />
                </td>
                <td class="px-2 py-2">
                  <a-input v-model="item.description" size="small" placeholder="说明" />
                </td>
                <td class="px-2 py-2">
                  <a-input v-model="item.scoringPoint" size="small" placeholder="评分点" />
                </td>
                <td class="px-2 py-2">
                  <a-input v-model="item.deductionPoint" size="small" placeholder="扣分点" />
                </td>
                <td class="px-2 py-2">
                  <a-input v-model="item.evidenceRequirement" size="small" placeholder="佐证要求" />
                </td>
                <td class="px-2 py-2">
                  <a-button size="mini" status="danger" @click="emit('removeDimension', index)">
                    删除
                  </a-button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <a-button type="primary" size="small" :loading="saving" @click="emit('submit')">
        {{ saving ? '保存中...' : '保存' }}
      </a-button>
    </div>
  </SectionCard>

  <StateBlock v-if="errorText" tone="error" :description="errorText" />
  <StateBlock v-if="draftText" tone="success" :description="draftText" />
</template>
