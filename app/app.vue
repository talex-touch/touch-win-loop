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
html.wl-scroll-lock,
body.wl-scroll-lock {
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden !important;
  overscroll-behavior: none;
}

body.wl-scroll-lock #__nuxt {
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}
</style>
