<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  updatedAt?: string
  description?: string
}>(), {
  updatedAt: '',
  description: '',
})

const emit = defineEmits<{
  (event: 'apply'): void
  (event: 'clear'): void
}>()
</script>

<template>
  <div class="wl-inline-notice wl-inline-notice--success">
    <p class="font-semibold m-0">
      检测到 AI 草稿：{{ title }}
    </p>
    <p class="m-0 mt-2">
      更新时间：{{ updatedAt || '刚刚' }}。{{ description || '应用后仍需手动保存。' }}
    </p>
    <ActionBar class="mt-3">
      <a-button size="mini" type="outline" @click="emit('apply')">
        应用到表单
      </a-button>
      <a-button size="mini" status="danger" @click="emit('clear')">
        清除草稿
      </a-button>
    </ActionBar>
  </div>
</template>
