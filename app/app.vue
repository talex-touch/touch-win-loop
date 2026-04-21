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

.wl-workspace-font-scope {
  --wl-ws-font-scale: 1;
  --wl-ws-space-scale: 1;
  --wl-ws-font-2xs: calc(10px * var(--wl-ws-font-scale));
  --wl-ws-font-xs: calc(11px * var(--wl-ws-font-scale));
  --wl-ws-font-sm: calc(12px * var(--wl-ws-font-scale));
  --wl-ws-font-md: calc(13px * var(--wl-ws-font-scale));
  --wl-ws-font-lg: calc(14px * var(--wl-ws-font-scale));
  --wl-ws-font-xl: calc(16px * var(--wl-ws-font-scale));
  --wl-ws-font-2xl: calc(18px * var(--wl-ws-font-scale));
  --wl-ws-text-11: var(--wl-ws-font-xs);
  --wl-ws-text-12: var(--wl-ws-font-sm);
  --wl-ws-text-13: var(--wl-ws-font-md);
  --wl-ws-space-1: calc(4px * var(--wl-ws-space-scale));
  --wl-ws-space-1_5: calc(6px * var(--wl-ws-space-scale));
  --wl-ws-space-2: calc(8px * var(--wl-ws-space-scale));
  --wl-ws-space-2_5: calc(10px * var(--wl-ws-space-scale));
  --wl-ws-space-3: calc(12px * var(--wl-ws-space-scale));
  --wl-ws-space-3_5: calc(14px * var(--wl-ws-space-scale));
  --wl-ws-space-4: calc(16px * var(--wl-ws-space-scale));
  --wl-ws-space-5: calc(20px * var(--wl-ws-space-scale));
  --wl-ws-space-6: calc(24px * var(--wl-ws-space-scale));
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

.wl-workspace-font-scope[data-workspace-spacing='ultra_compact'] {
  --wl-ws-space-scale: 0.84;
}

.wl-workspace-font-scope[data-workspace-spacing='compact'] {
  --wl-ws-space-scale: 0.92;
}

.wl-workspace-font-scope[data-workspace-spacing='default'] {
  --wl-ws-space-scale: 1;
}

.wl-workspace-font-scope[data-workspace-spacing='relaxed'] {
  --wl-ws-space-scale: 1.08;
}

.wl-workspace-font-scope[data-workspace-spacing='spacious'] {
  --wl-ws-space-scale: 1.16;
}

.wl-workspace-font-scope :is(.text-\[10px\]):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-2xs);
  line-height: calc(var(--wl-ws-font-2xs) * 1.45);
}

.wl-workspace-font-scope :is(.text-\[11px\], .text-xs):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-text-11);
  line-height: calc(var(--wl-ws-text-11) * 1.45);
}

.wl-workspace-font-scope :is(.text-\[12px\], .text-sm):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-sm);
  line-height: calc(var(--wl-ws-font-sm) * 1.5);
}

.wl-workspace-font-scope :is(.text-\[13px\], .text-base):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-md);
  line-height: calc(var(--wl-ws-font-md) * 1.52);
}

.wl-workspace-font-scope :is(.gap-1) {
  gap: var(--wl-ws-space-1);
}

.wl-workspace-font-scope :is(.gap-1\.5) {
  gap: var(--wl-ws-space-1_5);
}

.wl-workspace-font-scope :is(.gap-2) {
  gap: var(--wl-ws-space-2);
}

.wl-workspace-font-scope :is(.gap-2\.5) {
  gap: var(--wl-ws-space-2_5);
}

.wl-workspace-font-scope :is(.gap-3) {
  gap: var(--wl-ws-space-3);
}

.wl-workspace-font-scope :is(.gap-4) {
  gap: var(--wl-ws-space-4);
}

.wl-workspace-font-scope :is(.space-y-2) > :not([hidden]) ~ :not([hidden]) {
  margin-top: var(--wl-ws-space-2);
}

.wl-workspace-font-scope :is(.space-y-3) > :not([hidden]) ~ :not([hidden]) {
  margin-top: var(--wl-ws-space-3);
}

.wl-workspace-font-scope :is(.space-y-4) > :not([hidden]) ~ :not([hidden]) {
  margin-top: var(--wl-ws-space-4);
}

.wl-workspace-font-scope :is(.p-2) {
  padding: var(--wl-ws-space-2);
}

.wl-workspace-font-scope :is(.p-2\.5) {
  padding: var(--wl-ws-space-2_5);
}

.wl-workspace-font-scope :is(.p-3) {
  padding: var(--wl-ws-space-3);
}

.wl-workspace-font-scope :is(.p-4) {
  padding: var(--wl-ws-space-4);
}

.wl-workspace-font-scope :is(.px-2) {
  padding-left: var(--wl-ws-space-2);
  padding-right: var(--wl-ws-space-2);
}

.wl-workspace-font-scope :is(.px-2\.5) {
  padding-left: var(--wl-ws-space-2_5);
  padding-right: var(--wl-ws-space-2_5);
}

.wl-workspace-font-scope :is(.px-3) {
  padding-left: var(--wl-ws-space-3);
  padding-right: var(--wl-ws-space-3);
}

.wl-workspace-font-scope :is(.px-3\.5) {
  padding-left: var(--wl-ws-space-3_5);
  padding-right: var(--wl-ws-space-3_5);
}

.wl-workspace-font-scope :is(.px-4) {
  padding-left: var(--wl-ws-space-4);
  padding-right: var(--wl-ws-space-4);
}

.wl-workspace-font-scope :is(.py-1) {
  padding-top: var(--wl-ws-space-1);
  padding-bottom: var(--wl-ws-space-1);
}

.wl-workspace-font-scope :is(.py-1\.5) {
  padding-top: var(--wl-ws-space-1_5);
  padding-bottom: var(--wl-ws-space-1_5);
}

.wl-workspace-font-scope :is(.py-2) {
  padding-top: var(--wl-ws-space-2);
  padding-bottom: var(--wl-ws-space-2);
}

.wl-workspace-font-scope :is(.py-2\.5) {
  padding-top: var(--wl-ws-space-2_5);
  padding-bottom: var(--wl-ws-space-2_5);
}

.wl-workspace-font-scope :is(.py-3) {
  padding-top: var(--wl-ws-space-3);
  padding-bottom: var(--wl-ws-space-3);
}

.wl-workspace-font-scope :is(.py-4) {
  padding-top: var(--wl-ws-space-4);
  padding-bottom: var(--wl-ws-space-4);
}

.wl-workspace-font-scope :is(.leading-5) {
  line-height: calc(var(--wl-ws-font-md) * 1.5);
}

.wl-workspace-font-scope :is(.leading-6) {
  line-height: calc(var(--wl-ws-font-md) * 1.65);
}

.wl-workspace-font-scope :is(.leading-7) {
  line-height: calc(var(--wl-ws-font-lg) * 1.7);
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
