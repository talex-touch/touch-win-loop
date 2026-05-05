<script setup lang="ts">
import type { TimeMode } from '~/utils/time-format'
import { formatAbsoluteDateTime, formatRelativeTime, parseTimeValue } from '~/utils/time-format'

const props = withDefaults(defineProps<{
  value?: string | null
  mode?: TimeMode
}>(), {
  value: '',
  mode: 'relative',
})

const now = ref(Date.now())
let refreshTimer: ReturnType<typeof setInterval> | null = null

const parsedTime = computed(() => parseTimeValue(props.value))
const absoluteText = computed(() => {
  if (!parsedTime.value)
    return String(props.value || '') || '-'
  return formatAbsoluteDateTime(parsedTime.value)
})
const displayText = computed(() => {
  if (!parsedTime.value)
    return String(props.value || '') || '-'
  if (props.mode === 'absolute')
    return absoluteText.value
  return formatRelativeTime(parsedTime.value, now.value)
})
const dateTimeValue = computed(() => parsedTime.value?.toISOString())

onMounted(() => {
  refreshTimer = setInterval(() => {
    now.value = Date.now()
  }, 60000)
})

onBeforeUnmount(() => {
  if (refreshTimer)
    clearInterval(refreshTimer)
})
</script>

<template>
  <time class="wl-time" :datetime="dateTimeValue" :title="absoluteText">
    {{ displayText }}
  </time>
</template>

<style scoped>
.wl-time {
  white-space: nowrap;
}
</style>
