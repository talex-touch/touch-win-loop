<script setup lang="ts">
import { resolveAvatarFallbackValue } from '~~/shared/utils/user-avatar-fallback'

const props = withDefaults(defineProps<{
  name?: string
  src?: string | null
  size?: number
  alt?: string
  fallback?: string
}>(), {
  name: '',
  src: '',
  size: 32,
  alt: '',
  fallback: '',
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
</script>

<template>
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
</template>

<style scoped>
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
</style>
