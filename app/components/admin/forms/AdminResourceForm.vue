<script setup lang="ts">
import type {
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
} from '~~/shared/types/domain'
import type { AdminResourceCategoryOption } from '~/utils/admin-resource-form'

interface ResourceFormModel {
  category: ResourceCategory
  title: string
  year: number
  url: string
  accessLevel: ResourceAvailability
  sourceType: string
  summary: string
  content: string
  metadataText: string
  copyrightNote: string
  status: ResourceStatus
}

interface ResourceDocumentInfo {
  parseStatus: string
  pageCount?: number | null
  parserProvider?: string | null
  parserModel?: string | null
  parseError?: string | null
  previewUrl: string
}

interface SelectedDocumentFile {
  name: string
  sizeKb: number
}

const props = withDefaults(defineProps<{
  form: ResourceFormModel
  categoryOptions: AdminResourceCategoryOption[]
  loading?: boolean
  saving?: boolean
  errorText?: string
  draftText?: string
  draftTitle?: string
  draftUpdatedAt?: string
  createMode?: 'manual' | 'pdf'
  showCreateMode?: boolean
  selectedFile?: SelectedDocumentFile | null
  documentInfo?: ResourceDocumentInfo | null
  reparseLoading?: boolean
  submitLabel?: string
  savingLabel?: string
}>(), {
  loading: false,
  saving: false,
  errorText: '',
  draftText: '',
  draftTitle: '',
  draftUpdatedAt: '',
  createMode: 'manual',
  showCreateMode: false,
  selectedFile: null,
  documentInfo: null,
  reparseLoading: false,
  submitLabel: '保存',
  savingLabel: '保存中...',
})

const emit = defineEmits<{
  (event: 'submit'): void
  (event: 'applyDraft'): void
  (event: 'clearDraft'): void
  (event: 'update:createMode', value: 'manual' | 'pdf'): void
  (event: 'selectFile', payload: Event): void
  (event: 'reparse'): void
}>()

const createModeItems = [
  { key: 'manual', label: '结构化录入' },
  { key: 'pdf', label: '文档上传解析' },
]

const manualMode = computed(() => !props.showCreateMode || props.createMode === 'manual')
const currentActionLabel = computed(() => props.saving ? props.savingLabel : props.submitLabel)

function handleModeSelect(key: string) {
  if (key === 'manual' || key === 'pdf')
    emit('update:createMode', key)
}
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

    <div class="space-y-4" :class="{ 'mt-4': draftTitle }">
      <PillTabs
        v-if="showCreateMode"
        :items="createModeItems"
        :active-key="createMode"
        @select="handleModeSelect"
      />

      <div v-if="documentInfo" class="wl-inline-notice">
        <div class="flex flex-wrap gap-3 items-start justify-between">
          <div class="space-y-2">
            <p class="font-semibold m-0">
              文档状态：{{ documentInfo.parseStatus }}
            </p>
            <p class="m-0">
              页数：{{ documentInfo.pageCount || '-' }}；解析模型：{{ documentInfo.parserProvider || '-' }} / {{ documentInfo.parserModel || '-' }}
            </p>
            <p v-if="documentInfo.parseError" class="text-rose-600 m-0">
              错误：{{ documentInfo.parseError }}
            </p>
          </div>

          <ActionBar>
            <a
              :href="documentInfo.previewUrl"
              target="_blank"
              class="dense-btn"
            >
              预览 PDF
            </a>
            <slot name="documentActions" />
            <a-button size="small" :loading="reparseLoading" @click="emit('reparse')">
              {{ reparseLoading ? '提交中...' : '重试解析' }}
            </a-button>
          </ActionBar>
        </div>
      </div>

      <div v-if="showCreateMode && createMode === 'pdf'" class="space-y-2">
        <label class="wl-text-meta font-semibold block">文档文件</label>
        <input
          type="file"
          accept="application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          class="dense-input w-full block"
          @change="emit('selectFile', $event)"
        >
        <p class="wl-text-meta m-0">
          {{ selectedFile ? `已选择：${selectedFile.name} (${selectedFile.sizeKb} KB)` : '请上传 PDF/DOC/DOCX。' }}
        </p>
      </div>

      <div class="gap-2 grid md:grid-cols-3">
        <a-select v-model="form.category" size="small" placeholder="分类">
          <a-option v-for="item in categoryOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </a-option>
        </a-select>
        <a-input v-model="form.title" size="small" placeholder="标题" />
        <a-input-number v-model="form.year" size="small" :min="2000" :max="2100" placeholder="年份" />
        <a-input
          v-if="manualMode"
          v-model="form.url"
          size="small"
          :class="{ 'md:col-span-3': !showCreateMode }"
          placeholder="链接 URL（可留空）"
        />
        <a-select v-model="form.accessLevel" size="small" placeholder="可访问性">
          <a-option value="public">
            public
          </a-option>
          <a-option value="login_required">
            login_required
          </a-option>
          <a-option value="unavailable">
            unavailable
          </a-option>
        </a-select>
        <a-input v-model="form.sourceType" size="small" placeholder="来源类型（如 manual / upload-document）" />
        <a-select v-model="form.status" size="small" placeholder="状态">
          <a-option value="active">
            active
          </a-option>
          <a-option value="pending_verify">
            pending_verify
          </a-option>
          <a-option value="invalid">
            invalid
          </a-option>
          <a-option value="archived">
            archived
          </a-option>
        </a-select>
      </div>

      <a-textarea
        v-model="form.summary"
        :auto-size="{ minRows: 3, maxRows: 5 }"
        placeholder="摘要"
      />
      <a-textarea
        v-if="manualMode"
        v-model="form.content"
        :auto-size="{ minRows: 6, maxRows: 12 }"
        placeholder="正文内容（内部知识条目可直接填写）"
      />
      <a-textarea
        v-if="manualMode"
        v-model="form.metadataText"
        :auto-size="{ minRows: 4, maxRows: 8 }"
        placeholder="metadata JSON（例如 AI 提示词目标、作用域、优先级）"
      />
      <a-textarea
        v-model="form.copyrightNote"
        :auto-size="{ minRows: 3, maxRows: 5 }"
        placeholder="版权说明"
      />

      <a-button type="primary" size="small" :loading="saving" @click="emit('submit')">
        {{ currentActionLabel }}
      </a-button>
    </div>
  </SectionCard>

  <StateBlock v-if="errorText" tone="error" :description="errorText" />
  <StateBlock v-if="draftText" tone="success" :description="draftText" />
</template>
