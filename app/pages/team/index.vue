<script setup lang="ts">
import { workspaceDashboardPath } from '~/composables/team-ui'

const route = useRoute()

await navigateTo({
  path: workspaceDashboardPath(),
  query: route.query,
}, { replace: true })
</script>

<template>
  <div class="hidden" />
</template>
