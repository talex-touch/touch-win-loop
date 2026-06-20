<script setup lang="ts">
const { endpoint } = useApiEndpoint()
const pageviewData = ref<{ pageview: number, startAt: number } | null>(null)
const pageviewUrl = import.meta.server
  ? new URL(String(endpoint('/pageview')), useRequestURL()).toString()
  : String(endpoint('/pageview'))

pageviewData.value = await fetch(pageviewUrl)
  .then(response => response.json())
  .catch(() => null) as { pageview: number, startAt: number } | null

const time = useTimeAgo(() => pageviewData.value?.startAt || 0)
</script>

<template>
  <div text-gray:80>
    <span text-gray font-500>{{ pageviewData?.pageview }}</span>
    page views since
    <span text-gray>{{ time }}</span>
  </div>
</template>
