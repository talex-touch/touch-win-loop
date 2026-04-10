<script setup lang="ts">
import { appName } from '~/constants'
import { createIconLogoFaviconHref } from '~/constants/icon-logo'

useHead({
  title: appName,
})

if (import.meta.client) {
  const colorMode = useColorMode()

  useHead(() => ({
    link: [{
      key: 'app-favicon-svg',
      id: 'app-favicon-svg',
      rel: 'icon',
      type: 'image/svg+xml',
      sizes: 'any',
      href: createIconLogoFaviconHref(colorMode.value === 'dark' ? 'dark' : 'light'),
    }],
  }))
}
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
