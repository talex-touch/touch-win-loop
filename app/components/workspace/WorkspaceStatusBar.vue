<script setup lang="ts">
import { formatFileSize } from '~~/shared/constants/project-resource-upload'

const props = withDefaults(defineProps<{
  statusLine?: string
  loading?: boolean
  aiReady?: boolean
  aiModelLabel?: string
  tokenBalance?: number
  projectStorageUsedBytes?: number
  projectStorageLimitBytes?: number
  line?: number
  column?: number
}>(), {
  statusLine: '',
  loading: false,
  aiReady: true,
  aiModelLabel: '由后端配置',
  tokenBalance: 0,
  projectStorageUsedBytes: 0,
  projectStorageLimitBytes: 0,
  line: 12,
  column: 45,
})

const IMPORTANT_STATUS_KEYWORDS = ['失败', '错误', '冲突', '请先', '缺失', '无权', '异常', '告警', '重试', '未清除']
const GB_BYTES = 1024 * 1024 * 1024

const visibleStatusLine = computed(() => {
  const text = String(props.statusLine || '').trim()
  if (!text)
    return ''

  if (IMPORTANT_STATUS_KEYWORDS.some(keyword => text.includes(keyword)))
    return text

  return ''
})

const normalizedStorageUsedBytes = computed(() => {
  const used = Number(props.projectStorageUsedBytes || 0)
  if (!Number.isFinite(used) || used < 0)
    return 0
  return used
})

const normalizedStorageLimitBytes = computed(() => {
  const limit = Number(props.projectStorageLimitBytes || 0)
  if (!Number.isFinite(limit) || limit <= 0)
    return 0
  return limit
})

const storageUsageRatio = computed(() => {
  if (normalizedStorageLimitBytes.value <= 0)
    return 0
  return Math.min(1, normalizedStorageUsedBytes.value / normalizedStorageLimitBytes.value)
})

const storageUsagePercent = computed(() => storageUsageRatio.value * 100)
const storageUsagePercentText = computed(() => `${storageUsagePercent.value.toFixed(2)}%`)

const storageTooltipText = computed(() => {
  const usedGb = normalizedStorageUsedBytes.value / GB_BYTES
  const limitGb = normalizedStorageLimitBytes.value / GB_BYTES
  return `${usedGb.toFixed(2)}GB / ${limitGb.toFixed(2)}GB ${storageUsagePercentText.value}`
})

const storageBarClass = computed(() => {
  if (storageUsagePercent.value >= 90)
    return 'workspace-status-storage--danger'
  if (storageUsagePercent.value >= 75)
    return 'workspace-status-storage--warn'
  return 'workspace-status-storage--safe'
})
</script>

<template>
  <footer class="px-3 border-t border-slate-200 bg-white flex shrink-0 h-6 items-center justify-between">
    <div class="text-[10px] text-slate-500 font-medium flex gap-4 min-w-0 items-center">
      <div class="flex gap-1 items-center">
        <span class="material-symbols-outlined text-[12px] text-blue-600">cloud_done</span>
        <span>已同步至云端</span>
      </div>
      <div class="gap-1 hidden items-center md:flex">
        <span class="material-symbols-outlined text-[12px]">code</span>
        <span>UTF-8</span>
      </div>
      <div class="max-w-72 truncate">
        <span v-if="loading" class="align-middle rounded bg-slate-200 h-2.5 w-28 inline-block animate-pulse" />
        <span v-else>{{ visibleStatusLine || '系统就绪' }}</span>
      </div>
      <div class="flex gap-1 items-center">
        <span class="rounded-full bg-green-500 h-1.5 w-1.5" />
        <span>AI运行状态</span>
      </div>
      <div class="gap-2 hidden items-center md:flex">
        <span>模型: {{ aiModelLabel }}</span>
        <span>Token: {{ tokenBalance.toLocaleString('zh-CN') }}</span>
      </div>
      <div class="workspace-status-storage" :class="storageBarClass">
        <div class="workspace-status-storage__summary">
          <span>项目容量</span>
          <span>{{ formatFileSize(projectStorageUsedBytes) }} / {{ formatFileSize(projectStorageLimitBytes) }}</span>
        </div>
        <div
          class="workspace-status-storage__track"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="Number(storageUsagePercent.toFixed(2))"
        >
          <span class="workspace-status-storage__fill" :style="{ width: `${storageUsagePercent.toFixed(2)}%` }" />
        </div>
        <div class="workspace-status-storage__tooltip">
          {{ storageTooltipText }}
        </div>
      </div>
    </div>
    <div class="text-[10px] text-slate-500 font-medium gap-4 hidden items-center md:flex">
      <span>行 {{ line }}, 列 {{ column }}</span>
      <span>Space: 4</span>
      <span class="font-bold" :class="aiReady ? 'text-blue-600' : 'text-amber-600'">
        {{ aiReady ? 'Analysis Ready' : 'AI Working' }}
      </span>
    </div>
  </footer>
</template>

<style scoped>
.workspace-status-storage {
  position: relative;
  width: 170px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: default;
}

.workspace-status-storage__summary {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  line-height: 1;
}

.workspace-status-storage__summary span {
  white-space: nowrap;
}

.workspace-status-storage__track {
  height: 4px;
  border-radius: 999px;
  background: #d8e2f4;
  overflow: hidden;
}

.workspace-status-storage__fill {
  display: block;
  height: 100%;
  width: 0%;
  border-radius: 999px;
  transition: width 0.25s ease;
}

.workspace-status-storage--safe .workspace-status-storage__fill {
  background: linear-gradient(90deg, #3f80ff, #53b6ff);
}

.workspace-status-storage--warn .workspace-status-storage__fill {
  background: linear-gradient(90deg, #f6a11a, #ffcc5b);
}

.workspace-status-storage--danger .workspace-status-storage__fill {
  background: linear-gradient(90deg, #ef5a5a, #ff8b8b);
}

.workspace-status-storage__tooltip {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  border: 1px solid #d5deed;
  border-radius: 6px;
  background: #ffffff;
  padding: 4px 8px;
  color: #4b5f83;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 8px 20px rgba(32, 53, 89, 0.12);
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.workspace-status-storage:hover .workspace-status-storage__tooltip {
  opacity: 1;
  transform: translateY(0);
}
</style>
