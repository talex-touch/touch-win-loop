<script setup lang="ts">
throw createError({
  statusCode: 404,
  statusMessage: 'Not Found',
  message: '旧的 /workspace/:workspaceId/project/:projectId 入口已下线，请改用 /team/:teamId/project/:projectId。',
})
</script>
