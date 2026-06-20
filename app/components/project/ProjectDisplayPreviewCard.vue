<script setup lang="ts">
import { getProjectDisplayIconKind } from '~~/shared/constants/project-display'

const props = withDefaults(defineProps<{
  title: string
  summary?: string
  icon: string
  monogram: string
  accent: {
    solid: string
    soft: string
    border: string
    text: string
  }
  compact?: boolean
}>(), {
  summary: '',
  compact: false,
})

const previewStyle = computed(() => ({
  '--project-display-accent-solid': props.accent.solid,
  '--project-display-accent-soft': props.accent.soft,
  '--project-display-accent-border': props.accent.border,
  '--project-display-accent-text': props.accent.text,
}))

const iconKind = computed(() => getProjectDisplayIconKind(props.icon))
</script>

<template>
  <article
    class="project-display-preview-card"
    :class="{ 'project-display-preview-card--compact': compact }"
    :style="previewStyle"
    data-testid="project-display-preview-card"
  >
    <div
      class="project-display-preview-card__icon"
      :class="`project-display-preview-card__icon--${iconKind}`"
    >
      <span v-if="iconKind === 'text'" class="project-display-preview-card__text-icon">{{ monogram }}</span>
      <span v-else-if="iconKind === 'symbol'" class="material-symbols-outlined">{{ icon }}</span>
    </div>

    <div class="project-display-preview-card__copy">
      <h3>{{ title || '未命名项目' }}</h3>
      <p>{{ summary || '待补充项目简介' }}</p>
    </div>

    <span class="project-display-preview-card__monogram">
      {{ monogram }}
    </span>
  </article>
</template>

<style scoped>
.project-display-preview-card {
  align-items: center;
  background: #ffffff;
  border: 1px solid var(--project-display-accent-border);
  border-radius: 12px;
  display: grid;
  gap: 14px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 76px;
  padding: 14px 16px;
}

.project-display-preview-card--compact {
  min-height: 64px;
  padding: 10px 12px;
}

.project-display-preview-card__icon {
  align-items: center;
  background: linear-gradient(145deg, var(--project-display-accent-solid), var(--project-display-accent-text));
  border-radius: 12px;
  color: #ffffff;
  display: flex;
  height: 46px;
  justify-content: center;
  width: 46px;
}

.project-display-preview-card--compact .project-display-preview-card__icon {
  border-radius: 10px;
  height: 40px;
  width: 40px;
}

.project-display-preview-card__icon span {
  font-size: 24px;
}

.project-display-preview-card__icon--solid {
  background: var(--project-display-accent-solid);
}

.project-display-preview-card__text-icon {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0;
}

.project-display-preview-card__copy {
  min-width: 0;
}

.project-display-preview-card__copy h3 {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-display-preview-card__copy p {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-display-preview-card__monogram {
  align-items: center;
  background: #f1f5f9;
  border-radius: 999px;
  color: #475569;
  display: flex;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  height: 28px;
  justify-content: center;
  min-width: 32px;
  padding: 0 9px;
}

@media (max-width: 640px) {
  .project-display-preview-card {
    align-items: start;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .project-display-preview-card__monogram {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
