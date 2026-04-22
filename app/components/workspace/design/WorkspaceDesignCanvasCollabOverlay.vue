<script setup lang="ts">
const props = withDefaults(defineProps<{
  cursors?: Array<{
    userId: string
    username: string
    label: string
    colorToken: string
    screenX: number
    screenY: number
  }>
}>(), {
  cursors: () => [],
})
</script>

<template>
  <div
    v-for="cursor in props.cursors"
    :key="`${cursor.userId}:${cursor.username}`"
    class="pointer-events-none left-0 top-0 absolute z-20"
    data-testid="workspace-design-canvaskit-collab-cursor"
    :style="{ transform: `translate(${cursor.screenX}px, ${cursor.screenY}px)` }"
  >
    <div class="relative -translate-x-[3px] -translate-y-[3px]">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M2 1.5L13 9L8 10.4L9.6 15.5L7.2 16.2L5.6 11.1L2 15.3V1.5Z"
          :fill="cursor.colorToken"
          stroke="white"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
      </svg>
      <div
        class="mt-1 inline-flex max-w-[160px] items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
        :style="{ backgroundColor: cursor.colorToken }"
      >
        {{ cursor.label }}
      </div>
    </div>
  </div>
</template>
