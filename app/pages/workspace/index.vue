<script setup lang="ts">
const route = useRoute()

function normalizeQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

const legacyTeamId = normalizeQueryValue(route.query.workspaceId || route.query.teamId)
const legacyProjectId = normalizeQueryValue(route.query.projectId)
const createFlag = normalizeQueryValue(route.query.create)
const deniedTeamId = normalizeQueryValue(route.query.deniedTeamId || route.query.deniedWorkspaceId)

if (legacyTeamId) {
  const targetPath = legacyProjectId
    ? `/team/${legacyTeamId}/project/${legacyProjectId}`
    : `/team/${legacyTeamId}`
  await navigateTo(targetPath, { replace: true })
}
else {
  const query: Record<string, string> = {}
  if (createFlag)
    query.create = createFlag
  if (deniedTeamId)
    query.deniedTeamId = deniedTeamId

  await navigateTo({
    path: '/team',
    query: Object.keys(query).length > 0 ? query : undefined,
  }, { replace: true })
}
</script>

<template>
  <div class="hidden" />
</template>
