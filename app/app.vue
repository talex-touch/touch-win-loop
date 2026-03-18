<script setup lang="ts">
import { appName } from '~/constants'

useHead({
  title: appName,
})
</script>

<template>
  <VitePwaManifest />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
:root {
  --wl-bg: #fff;
  --wl-fg: #111;
  --wl-muted: #666;
  --wl-border: #e5e5e5;
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  min-height: 100%;
}

body {
  background: var(--wl-bg);
  color: var(--wl-fg);
  font-family: 'IBM Plex Sans', 'DM Sans', 'PingFang SC', 'Helvetica Neue', sans-serif;
  line-height: 1.4;
}
</style>
