<script setup lang="ts">
const { endpoint } = useApiEndpoint()
const { data } = await useFetch<{ pageview: number, startAt: number }>(endpoint('/pageview'))

const time = useTimeAgo(() => data.value?.startAt || 0)
</script>

<template>
  <div text-gray:80>
    <span text-gray font-500>{{ data?.pageview }}</span>
    page views since
    <span text-gray>{{ time }}</span>
  </div>
</template>
