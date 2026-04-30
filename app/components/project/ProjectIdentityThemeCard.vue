<script setup lang="ts">
import { getProjectDisplayIconKind } from '~~/shared/constants/project-display'

withDefaults(defineProps<{
  title: string
  summary?: string
  icon: string
  monogram: string
  accent: {
    value: string
    label: string
    solid: string
    soft: string
    border: string
    text: string
  }
  iconOptions: Array<{ value: string, label: string }>
  accentOptions: Array<{
    value: string
    label: string
    solid: string
    border: string
  }>
  customAccentValue: string
  usingCustomAccent?: boolean
  hasOverride?: boolean
  disabled?: boolean
}>(), {
  summary: '',
  usingCustomAccent: false,
  hasOverride: false,
  disabled: false,
})

const emit = defineEmits<{
  selectIcon: [icon: string]
  selectAccent: [accentColor: string]
}>()

function selectCustomAccent(event: Event) {
  emit('selectAccent', (event.target as HTMLInputElement).value)
}

function resolveIconKind(value: string) {
  return getProjectDisplayIconKind(value)
}
</script>

<template>
  <section class="project-identity-theme-card" data-testid="project-identity-theme-card">
    <header class="project-identity-theme-card__header">
      <div class="project-identity-theme-card__title-group">
        <span class="material-symbols-outlined">palette</span>
        <div>
          <div class="project-identity-theme-card__heading">
            <h3>项目标识与主题</h3>
            <span :class="hasOverride ? 'is-custom' : ''">
              {{ hasOverride ? '已自定义' : '默认生成' }}
            </span>
          </div>
          <p>
            项目卡即时预览当前图标与配色，保存后同步到工作区入口和项目列表。
          </p>
        </div>
      </div>
    </header>

    <div class="project-identity-theme-card__body">
      <a-trigger
        trigger="click"
        position="br"
        :popup-translate="[0, 10]"
        :disabled="disabled"
      >
        <button
          class="project-identity-theme-card__icon-trigger"
          type="button"
          :disabled="disabled"
          aria-label="编辑项目图标与主题色"
          data-testid="project-identity-theme-trigger"
          :style="{
            '--project-identity-accent-solid': accent.solid,
            '--project-identity-accent-text': accent.text,
          }"
        >
          <span v-if="resolveIconKind(icon) === 'text'" class="project-identity-theme-card__text-icon">{{ monogram }}</span>
          <span v-else-if="resolveIconKind(icon) === 'symbol'" class="material-symbols-outlined">{{ icon }}</span>
        </button>

        <template #content>
          <div class="project-identity-theme-card__popover" data-testid="project-identity-theme-popover">
            <section>
              <p class="project-identity-theme-card__label">
                图标样式
              </p>
              <div class="project-identity-theme-card__icon-grid" role="listbox" aria-label="项目图标">
                <button
                  v-for="option in iconOptions"
                  :key="`project-icon-${option.value}`"
                  class="project-identity-theme-card__icon-option"
                  :class="[
                    { 'is-active': icon === option.value },
                    `project-identity-theme-card__icon-option--${resolveIconKind(option.value)}`,
                  ]"
                  :disabled="disabled"
                  type="button"
                  :aria-label="option.label"
                  :aria-selected="icon === option.value"
                  @click="emit('selectIcon', option.value)"
                >
                  <span v-if="resolveIconKind(option.value) === 'text'" class="project-identity-theme-card__option-text-icon">{{ monogram }}</span>
                  <span v-else-if="resolveIconKind(option.value) === 'symbol'" class="material-symbols-outlined">{{ option.value }}</span>
                  <span v-else class="project-identity-theme-card__option-solid-icon" />
                  <span>{{ option.label }}</span>
                </button>
              </div>
            </section>

            <section>
              <p class="project-identity-theme-card__label">
                主题色
              </p>
              <div class="project-identity-theme-card__color-row" role="listbox" aria-label="项目主题色">
                <button
                  v-for="option in accentOptions"
                  :key="`project-accent-${option.value}`"
                  class="project-identity-theme-card__color-option"
                  :class="{ 'is-active': accent.value === option.value }"
                  :disabled="disabled"
                  type="button"
                  :aria-label="option.label"
                  :aria-selected="accent.value === option.value"
                  :data-tooltip="option.label"
                  :title="option.label"
                  :style="{ '--project-identity-color': option.solid, '--project-identity-color-border': option.border }"
                  @click="emit('selectAccent', option.value)"
                >
                  <span />
                </button>

                <label
                  class="project-identity-theme-card__custom-color"
                  :class="{ 'is-active': usingCustomAccent }"
                  :title="usingCustomAccent ? `自定义颜色 ${customAccentValue}` : '自定义颜色'"
                >
                  <span class="material-symbols-outlined">edit</span>
                  <input
                    :disabled="disabled"
                    :value="customAccentValue"
                    type="color"
                    aria-label="自定义颜色"
                    @input="selectCustomAccent"
                  >
                </label>
              </div>
            </section>
          </div>
        </template>
      </a-trigger>

      <ProjectDisplayPreviewCard
        :title="title"
        :summary="summary"
        :icon="icon"
        :monogram="monogram"
        :accent="accent"
        compact
      />
    </div>
  </section>
</template>

<style scoped>
.project-identity-theme-card {
  background: #ffffff;
  border: 1px solid #dfe7f1;
  border-radius: 14px;
  overflow: hidden;
}

.project-identity-theme-card__header {
  border-bottom: 1px solid #e5edf7;
  padding: 16px 18px;
}

.project-identity-theme-card__title-group {
  align-items: flex-start;
  display: flex;
  gap: 10px;
}

.project-identity-theme-card__title-group > .material-symbols-outlined {
  color: #334155;
  font-size: 20px;
  margin-top: 1px;
}

.project-identity-theme-card__heading {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.project-identity-theme-card__heading h3 {
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  margin: 0;
}

.project-identity-theme-card__heading span {
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 5px 9px;
}

.project-identity-theme-card__heading span.is-custom {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #2563eb;
}

.project-identity-theme-card__title-group p {
  color: #64748b;
  font-size: 12px;
  line-height: 1.55;
  margin: 7px 0 0;
}

.project-identity-theme-card__body {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: auto minmax(280px, 1fr);
  padding: 18px;
}

.project-identity-theme-card__icon-trigger {
  align-items: center;
  background: linear-gradient(145deg, var(--project-identity-accent-solid), var(--project-identity-accent-text));
  border: 0;
  border-radius: 14px;
  color: #ffffff;
  cursor: pointer;
  display: flex;
  height: 72px;
  justify-content: center;
  transition:
    box-shadow 160ms ease,
    transform 160ms ease;
  width: 72px;
}

.project-identity-theme-card__icon-trigger:hover:not(:disabled) {
  box-shadow: 0 10px 24px rgb(37 99 235 / 18%);
  transform: translateY(-1px);
}

.project-identity-theme-card__icon-trigger:focus-visible {
  box-shadow:
    0 0 0 3px #ffffff,
    0 0 0 5px #93c5fd;
  outline: none;
}

.project-identity-theme-card__icon-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.project-identity-theme-card__icon-trigger span {
  font-size: 38px;
}

.project-identity-theme-card__text-icon {
  font-size: 23px;
  font-weight: 800;
  letter-spacing: 0;
}

.project-identity-theme-card__popover {
  background: #ffffff;
  border: 1px solid #dfe7f1;
  border-radius: 14px;
  box-shadow: 0 18px 45px rgb(15 23 42 / 14%);
  display: grid;
  gap: 18px;
  max-height: min(620px, calc(100vh - 96px));
  overflow-y: auto;
  padding: 16px;
  width: 420px;
}

.project-identity-theme-card__label {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  margin: 0 0 10px;
}

.project-identity-theme-card__icon-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.project-identity-theme-card__icon-option {
  align-items: center;
  background: #ffffff;
  border: 1px solid #dfe7f1;
  border-radius: 12px;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 5px;
  height: 62px;
  justify-content: center;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease;
}

.project-identity-theme-card__icon-option span:first-child {
  font-size: 21px;
}

.project-identity-theme-card__option-text-icon {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0;
}

.project-identity-theme-card__option-solid-icon {
  background: currentColor;
  border-radius: 9px;
  display: block;
  height: 22px;
  width: 22px;
}

.project-identity-theme-card__icon-option span:last-child {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.project-identity-theme-card__icon-option:hover:not(:disabled) {
  border-color: #b6c4d8;
}

.project-identity-theme-card__icon-option.is-active {
  border-color: #111827;
  box-shadow: 0 0 0 1px #111827;
  color: #0f172a;
}

.project-identity-theme-card__color-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.project-identity-theme-card__color-option {
  align-items: center;
  background: #ffffff;
  border: 1px solid transparent;
  border-radius: 999px;
  display: flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  position: relative;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
  width: 28px;
}

.project-identity-theme-card__color-option span {
  background: var(--project-identity-color);
  border: 1px solid var(--project-identity-color-border);
  border-radius: 999px;
  display: block;
  height: 18px;
  width: 18px;
}

.project-identity-theme-card__color-option:hover:not(:disabled),
.project-identity-theme-card__color-option.is-active {
  border-color: #cbd5e1;
  box-shadow: 0 0 0 2px #eff6ff;
}

.project-identity-theme-card__color-option::after {
  background: #0f172a;
  border-radius: 6px;
  bottom: calc(100% + 8px);
  color: #ffffff;
  content: attr(data-tooltip);
  font-size: 11px;
  font-weight: 700;
  left: 50%;
  line-height: 1;
  opacity: 0;
  padding: 6px 8px;
  pointer-events: none;
  position: absolute;
  transform: translate(-50%, 4px);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
  white-space: nowrap;
  z-index: 1;
}

.project-identity-theme-card__color-option:hover::after,
.project-identity-theme-card__color-option:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.project-identity-theme-card__custom-color {
  align-items: center;
  border: 1px solid #dfe7f1;
  border-radius: 999px;
  color: #64748b;
  cursor: pointer;
  display: flex;
  height: 28px;
  justify-content: center;
  overflow: hidden;
  position: relative;
  transition:
    border-color 160ms ease,
    color 160ms ease;
  width: 28px;
}

.project-identity-theme-card__custom-color.is-active {
  border-color: #111827;
  color: #0f172a;
}

.project-identity-theme-card__custom-color .material-symbols-outlined {
  font-size: 15px;
}

.project-identity-theme-card__custom-color input {
  cursor: pointer;
  inset: 0;
  opacity: 0;
  position: absolute;
}

.project-identity-theme-card :disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 780px) {
  .project-identity-theme-card__body {
    align-items: start;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .project-identity-theme-card__header,
  .project-identity-theme-card__body {
    padding: 14px;
  }

  .project-identity-theme-card__popover {
    width: min(420px, calc(100vw - 32px));
  }

  .project-identity-theme-card__icon-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
