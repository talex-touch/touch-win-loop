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
  --wl-ws-font-scale: 1;
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
  height: 100%;
  min-height: 100%;
}

body {
  background: var(--wl-bg);
  color: var(--wl-fg);
  font-family: 'IBM Plex Sans', 'DM Sans', 'PingFang SC', 'Helvetica Neue', sans-serif;
  line-height: 1.4;
}

.wl-workspace-font-scope {
  --wl-ws-font-scale: 1;
  --wl-ws-font-2xs: calc(10px * var(--wl-ws-font-scale));
  --wl-ws-font-xs: calc(11px * var(--wl-ws-font-scale));
  --wl-ws-font-sm: calc(12px * var(--wl-ws-font-scale));
  --wl-ws-font-md: calc(13px * var(--wl-ws-font-scale));
  --wl-ws-font-base: calc(14px * var(--wl-ws-font-scale));
  --wl-ws-font-lg: calc(16px * var(--wl-ws-font-scale));
  --wl-ws-font-xl: calc(20px * var(--wl-ws-font-scale));
  --wl-ws-font-2xl: calc(24px * var(--wl-ws-font-scale));
}

.wl-workspace-font-scope[data-workspace-font-size='xs'] {
  --wl-ws-font-scale: 0.9;
}

.wl-workspace-font-scope[data-workspace-font-size='sm'] {
  --wl-ws-font-scale: 0.95;
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

.wl-workspace-font-scope .wl-ws-text-2xs,
.wl-workspace-font-scope :is(.text-\[10px\]):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-2xs) !important;
  line-height: calc(14px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .wl-ws-text-xs,
.wl-workspace-font-scope :is(.text-\[11px\], .text-xs):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-xs) !important;
  line-height: calc(16px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .wl-ws-text-sm,
.wl-workspace-font-scope :is(.text-\[12px\], .text-sm):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-sm) !important;
  line-height: calc(18px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .wl-ws-text-md,
.wl-workspace-font-scope :is(.text-\[13px\]):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-md) !important;
  line-height: calc(19px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .wl-ws-text-base,
.wl-workspace-font-scope :is(.text-\[14px\], .text-base):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-base) !important;
  line-height: calc(20px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .wl-ws-text-lg,
.wl-workspace-font-scope :is(.text-\[16px\], .text-lg):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-lg) !important;
  line-height: calc(24px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .wl-ws-text-xl,
.wl-workspace-font-scope :is(.text-xl):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-xl) !important;
  line-height: calc(28px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .wl-ws-text-2xl,
.wl-workspace-font-scope :is(.text-2xl):not(.material-symbols-outlined) {
  font-size: var(--wl-ws-font-2xl) !important;
  line-height: calc(32px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .workspace-tab-context-menu__item,
.wl-workspace-font-scope .workspace-tree-item__label,
.wl-workspace-font-scope .workspace-project-add-actions__menu-item,
.wl-workspace-font-scope .workspace-resource-actions__menu-item,
.wl-workspace-font-scope .workspace-recycle-item__title,
.wl-workspace-font-scope .workspace-outline-item--child,
.wl-workspace-font-scope .workspace-empty-text,
.wl-workspace-font-scope .workspace-linked-library-group__title,
.wl-workspace-font-scope .workspace-library-item__title,
.wl-workspace-font-scope .workspace-share-modal__field,
.wl-workspace-font-scope .workspace-share-modal__select,
.wl-workspace-font-scope .workspace-delete-modal__btn,
.wl-workspace-font-scope .workspace-suggestion-list,
.wl-workspace-font-scope .workspace-textarea,
.wl-workspace-font-scope .workspace-btn,
.wl-workspace-font-scope .workspace-contest-item__name,
.wl-workspace-font-scope .workspace-input,
.wl-workspace-font-scope .workspace-issue-report-card__title,
.wl-workspace-font-scope .workspace-issue-item__title,
.wl-workspace-font-scope .workspace-upload-task-row__name,
.wl-workspace-font-scope .workspace-upload-drawer__empty {
  font-size: calc(12px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .workspace-recycle-panel__header h3,
.wl-workspace-font-scope .workspace-outline-item,
.wl-workspace-font-scope .workspace-share-modal__target,
.wl-workspace-font-scope .workspace-delete-modal p,
.wl-workspace-font-scope .workspace-card h3,
.wl-workspace-font-scope .workspace-upload-drawer__title {
  font-size: calc(13px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .workspace-resource-detail__title,
.wl-workspace-font-scope .meeting-btn {
  font-size: calc(14px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .workspace-recycle-panel__hint,
.wl-workspace-font-scope .workspace-tree-block__title,
.wl-workspace-font-scope .workspace-upload-task-item__action,
.wl-workspace-font-scope .workspace-recycle-item__action,
.wl-workspace-font-scope .workspace-outline-item__meta,
.wl-workspace-font-scope .workspace-linked-library-category__title,
.wl-workspace-font-scope .workspace-library-item__add,
.wl-workspace-font-scope .workspace-delete-modal__hint,
.wl-workspace-font-scope .workspace-config-summary,
.wl-workspace-font-scope .workspace-analysis-status__head,
.wl-workspace-font-scope .workspace-analysis-status p,
.wl-workspace-font-scope .workspace-inline-action,
.wl-workspace-font-scope .workspace-log-text,
.wl-workspace-font-scope .workspace-admin-detail,
.wl-workspace-font-scope .workspace-topk-row label,
.wl-workspace-font-scope .workspace-preset-item,
.wl-workspace-font-scope .workspace-issue-panel__hint,
.wl-workspace-font-scope .workspace-issue-report-card p,
.wl-workspace-font-scope .workspace-issue-item__line,
.wl-workspace-font-scope .workspace-status-storage__summary,
.wl-workspace-font-scope .workspace-upload-tray__title,
.wl-workspace-font-scope .workspace-upload-drawer__subtitle,
.wl-workspace-font-scope .workspace-upload-drawer__action,
.wl-workspace-font-scope .workspace-upload-drawer__group-title,
.wl-workspace-font-scope .workspace-upload-task-row__avatar,
.wl-workspace-font-scope .workspace-upload-task-row__status,
.wl-workspace-font-scope .workspace-upload-task-row__action,
.wl-workspace-font-scope .workspace-chat-composer__meta-text,
.wl-workspace-font-scope .workspace-ai-marquee,
.wl-workspace-font-scope .workspace-mode-select,
.wl-workspace-font-scope .meeting-stat__label {
  font-size: calc(11px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .workspace-upload-task-item__status,
.wl-workspace-font-scope .workspace-upload-task-item__meta,
.wl-workspace-font-scope .workspace-recycle-item__meta,
.wl-workspace-font-scope .workspace-linked-library-group__meta,
.wl-workspace-font-scope .workspace-linked-library-category__count,
.wl-workspace-font-scope .workspace-library-item__meta,
.wl-workspace-font-scope .workspace-pill,
.wl-workspace-font-scope .workspace-admin-detail__label,
.wl-workspace-font-scope .workspace-contest-item__meta,
.wl-workspace-font-scope .workspace-issue-report-card__meta,
.wl-workspace-font-scope .workspace-issue-item__meta,
.wl-workspace-font-scope .workspace-issue-tag,
.wl-workspace-font-scope .workspace-status-storage__tooltip,
.wl-workspace-font-scope .workspace-upload-tray__meta,
.wl-workspace-font-scope .workspace-upload-task-row__detail,
.wl-workspace-font-scope .workspace-issue-pill {
  font-size: calc(10px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .meeting-stat__value {
  font-size: calc(16px * var(--wl-ws-font-scale)) !important;
}

.wl-workspace-font-scope .meeting-token,
.wl-workspace-font-scope .meeting-list-item {
  font-size: calc(12.8px * var(--wl-ws-font-scale)) !important;
}

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
