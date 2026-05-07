<script setup lang="ts">
definePageMeta({
  layout: 'admin',
})

await navigateTo('/admin/integrations/oauth', { replace: true })
</script>
