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

.wl-workspace-font-scope {
  --wl-ws-font-scale: 1;
  --wl-ws-text-11: calc(11px * var(--wl-ws-font-scale));
  --wl-ws-text-12: calc(12px * var(--wl-ws-font-scale));
  --wl-ws-text-13: calc(13px * var(--wl-ws-font-scale));
}

.wl-workspace-font-scope[data-workspace-font-size='xs'] {
  --wl-ws-font-scale: 0.9;
}

.wl-workspace-font-scope[data-workspace-font-size='sm'] {
  --wl-ws-font-scale: 0.96;
}

.wl-workspace-font-scope[data-workspace-font-size='md'] {
  --wl-ws-font-scale: 1;
}

.wl-workspace-font-scope[data-workspace-font-size='lg'] {
  --wl-ws-font-scale: 1.08;
}

.wl-workspace-font-scope[data-workspace-font-size='xl'] {
  --wl-ws-font-scale: 1.16;
}

.wl-workspace-font-scope :is(.text-\[11px\], .text-xs):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-text-11);
  line-height: calc(var(--wl-ws-text-11) * 1.45);
}

.wl-workspace-font-scope .workspace-tree-item__label {
  font-size: var(--wl-ws-text-12);
}

.wl-workspace-font-scope .workspace-upload-tray__title {
  font-size: var(--wl-ws-text-12);
}

.wl-workspace-font-scope .meeting-btn {
  font-size: var(--wl-ws-text-13);
}
</style>
