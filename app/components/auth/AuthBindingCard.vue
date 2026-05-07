<script setup lang="ts">
interface AuthBindingCardMetaItem {
  label: string
  value: string
  mono?: boolean
}

const props = withDefaults(defineProps<{
  title: string
  description: string
  linked?: boolean
  metaItems?: AuthBindingCardMetaItem[]
}>(), {
  linked: false,
  metaItems: () => [],
})
</script>

<template>
  <section class="auth-binding-card">
    <div class="auth-binding-card__header">
      <div class="auth-binding-card__copy">
        <p class="auth-binding-card__title">
          {{ props.title }}
        </p>
        <p class="auth-binding-card__description">
          {{ props.description }}
        </p>
      </div>

      <span
        class="auth-binding-card__status"
        :class="props.linked ? 'is-linked' : 'is-idle'"
      >
        {{ props.linked ? '已绑定' : '未绑定' }}
      </span>
    </div>

    <div v-if="props.metaItems.length" class="auth-binding-card__meta">
      <p
        v-for="item in props.metaItems"
        :key="`${item.label}:${item.value}`"
        class="auth-binding-card__meta-item"
      >
        <span class="auth-binding-card__meta-label">{{ item.label }}：</span>
        <span :class="item.mono ? 'auth-binding-card__meta-value auth-binding-card__meta-value--mono' : 'auth-binding-card__meta-value'">
          {{ item.value }}
        </span>
      </p>
    </div>

    <div v-if="$slots.actions" class="auth-binding-card__actions">
      <slot name="actions" />
    </div>

    <div v-if="$slots.default" class="auth-binding-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.auth-binding-card {
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(16px);
}

.auth-binding-card__header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.auth-binding-card__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.auth-binding-card__title {
  margin: 0;
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
}

.auth-binding-card__description {
  margin: 6px 0 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.auth-binding-card__status {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.72);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.auth-binding-card__status.is-linked {
  border-color: rgba(16, 185, 129, 0.32);
  background: rgba(236, 253, 245, 0.96);
  color: #047857;
}

.auth-binding-card__meta {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-binding-card__meta-item {
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
  word-break: break-all;
}

.auth-binding-card__meta-label {
  color: #64748b;
}

.auth-binding-card__meta-value {
  color: #0f172a;
}

.auth-binding-card__meta-value--mono {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
}

.auth-binding-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.auth-binding-card__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}
</style>
