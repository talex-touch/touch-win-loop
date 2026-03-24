<script setup lang="ts">
const route = useRoute()

function normalizeRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function normalizeQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

const params = route.params as Record<string, string | string[] | undefined>
const teamId = normalizeRouteParam(params.workspaceId)
const projectId = normalizeQueryValue(route.query.projectId)

const targetPath = teamId && projectId
  ? `/team/${teamId}/project/${projectId}`
  : teamId
    ? `/team/${teamId}`
    : '/team'

await navigateTo(targetPath, { replace: true })
</script>

<template>
  <div class="hidden" />
</template>
