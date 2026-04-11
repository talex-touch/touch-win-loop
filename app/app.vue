<script setup lang="ts">
import { appName } from '~/constants'
import { createIconLogoFaviconHref } from '~/constants/icon-logo'

const colorMode = useColorMode()
const lightFaviconHref = createIconLogoFaviconHref('light')
const darkFaviconHref = createIconLogoFaviconHref('dark')

useHead(() => ({
  title: appName,
  link: import.meta.server
    ? [
        {
          key: 'app-favicon-svg-light',
          id: 'app-favicon-svg-light',
          rel: 'icon',
          type: 'image/svg+xml',
          sizes: 'any',
          media: '(prefers-color-scheme: light)',
          href: lightFaviconHref,
        },
        {
          key: 'app-favicon-svg-dark',
          id: 'app-favicon-svg-dark',
          rel: 'icon',
          type: 'image/svg+xml',
          sizes: 'any',
          media: '(prefers-color-scheme: dark)',
          href: darkFaviconHref,
        },
      ]
    : [
        {
          key: 'app-favicon-runtime',
          id: 'app-favicon-runtime',
          rel: 'icon',
          type: 'image/svg+xml',
          sizes: 'any',
          href: createIconLogoFaviconHref(colorMode.value === 'dark' ? 'dark' : 'light'),
        },
        {
          key: 'app-favicon-shortcut-runtime',
          id: 'app-favicon-shortcut-runtime',
          rel: 'shortcut icon',
          type: 'image/svg+xml',
          href: createIconLogoFaviconHref(colorMode.value === 'dark' ? 'dark' : 'light'),
        },
      ],
}))
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
