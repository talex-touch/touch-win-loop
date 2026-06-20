<script setup lang="ts">
import type { FeishuAuthAuditItem } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  feishuAudits?: FeishuAuthAuditItem[]
  feishuAuditLoading?: boolean
  formatAuditAction: (action: FeishuAuthAuditItem['action']) => string
  formatDateTime: (value: string) => string
}>(), {
  feishuAudits: () => [],
  feishuAuditLoading: false,
})

const emit = defineEmits<{
  loadFeishuAudits: []
}>()
</script>

<template>
  <div class="user-settings-panel">
    <div class="user-settings-row">
      <div class="user-settings-row__heading">
        <p class="user-settings-row__title">
          绑定相关记录
        </p>
        <p class="user-settings-row__desc">
          当前仅展示飞书绑定与解绑的最近操作记录。
        </p>
      </div>
      <div class="user-settings-row__content">
        <div class="flex flex-wrap gap-2 justify-end">
          <button class="user-settings-btn" :disabled="props.feishuAuditLoading" @click="emit('loadFeishuAudits')">
            {{ props.feishuAuditLoading ? '加载中...' : '刷新' }}
          </button>
        </div>
        <div v-if="!props.feishuAudits.length" class="user-settings-empty">
          暂无绑定/解绑记录
        </div>
        <div v-else class="w-full space-y-3">
          <div
            v-for="item in props.feishuAudits"
            :key="item.id"
            class="py-4 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between last:border-b-0"
          >
            <span class="user-settings-name">{{ props.formatAuditAction(item.action) }}</span>
            <span class="user-settings-meta user-settings-meta--mono">{{ props.formatDateTime(item.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
