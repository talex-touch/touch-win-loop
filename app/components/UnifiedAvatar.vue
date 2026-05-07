<script setup lang="ts">
import { resolveAvatarFallbackValue } from '~~/shared/utils/user-avatar-fallback'

const props = withDefaults(defineProps<{
  name?: string
  src?: string | null
  size?: number
  alt?: string
  fallback?: string
  popover?: boolean
  popoverLabel?: string
}>(), {
  name: '',
  src: '',
  size: 32,
  alt: '',
  fallback: '',
  popover: false,
  popoverLabel: '',
})

const normalizedSrc = computed(() => String(props.src || '').trim())
const normalizedSize = computed(() => {
  const rawSize = Number(props.size || 32)
  if (!Number.isFinite(rawSize))
    return 32
  return Math.max(16, Math.round(rawSize))
})
const avatarStyle = computed(() => ({
  width: `${normalizedSize.value}px`,
  height: `${normalizedSize.value}px`,
}))
const avatarAlt = computed(() => {
  const normalizedAlt = String(props.alt || '').trim()
  if (normalizedAlt)
    return normalizedAlt

  const normalizedName = String(props.name || '').trim()
  return normalizedName ? `${normalizedName}头像` : '用户头像'
})
const avatarFallback = computed(() => {
  const normalizedFallback = String(props.fallback || '').trim()
  if (normalizedFallback)
    return normalizedFallback
  return resolveAvatarFallbackValue(String(props.name || '').trim() || 'U')
})
const normalizedName = computed(() => String(props.name || '').trim() || '未命名用户')
</script>

<template>
  <span
    class="unified-avatar-shell"
    :class="{ 'unified-avatar-shell--popover': props.popover }"
    :tabindex="props.popover ? 0 : undefined"
  >
    <span class="unified-avatar" :style="avatarStyle">
      <img
        v-if="normalizedSrc"
        :src="normalizedSrc"
        :alt="avatarAlt"
        class="unified-avatar__image"
      >
      <span v-else class="unified-avatar__fallback">
        {{ avatarFallback }}
      </span>
    </span>
    <span v-if="props.popover" class="unified-avatar__popover" role="tooltip">
      <slot name="popover">
        <span class="unified-avatar__popover-name">
          {{ normalizedName }}
        </span>
        <span v-if="props.popoverLabel" class="unified-avatar__popover-label">
          {{ props.popoverLabel }}
        </span>
      </slot>
    </span>
  </span>
</template>

<style scoped>
.unified-avatar-shell {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  overflow: visible;
}

.unified-avatar-shell--popover {
  outline: none;
}

.unified-avatar-shell--popover:focus-visible .unified-avatar {
  box-shadow: 0 0 0 3px rgb(37 99 235 / 0.16);
}

.unified-avatar {
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 999px;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.unified-avatar__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.unified-avatar__fallback {
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.unified-avatar__popover {
  position: absolute;
  top: 50%;
  left: calc(100% + 10px);
  z-index: 70;
  min-width: 220px;
  max-width: 280px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 50px rgb(15 23 42 / 0.16);
  color: #334155;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(-4px);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.unified-avatar-shell--popover:hover .unified-avatar__popover,
.unified-avatar-shell--popover:focus-within .unified-avatar__popover {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(-50%) translateX(0);
}

.unified-avatar__popover-name {
  display: block;
  color: #0f172a;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.3;
}

.unified-avatar__popover-label {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 0.75rem;
  line-height: 1.4;
}
</style>
