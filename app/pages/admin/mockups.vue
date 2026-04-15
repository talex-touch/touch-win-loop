<script setup lang="ts">
await navigateTo({
  path: "/admin/canvas-library",
  query: {
    tab: "mockups",
  },
}, {
  redirectCode: 302,
  replace: true,
});
</script>
