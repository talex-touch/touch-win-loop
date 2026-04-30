<script setup lang="ts">
import type { Project, WorkspaceFontSizePreset, WorkspaceTabSpacingPreset } from '~~/shared/types/domain'
import type { WorkspaceProjectCommonForm } from '~/types/workspace'
import {
  buildProjectMonogram,
  getProjectDisplayAccent,
  isProjectDisplayPresetAccentColor,
  normalizeProjectDisplayAccentColor,
  normalizeProjectDisplayConfig,
  PROJECT_DISPLAY_ACCENT_OPTIONS,
  PROJECT_DISPLAY_ICON_OPTIONS,
  resolveProjectDisplayConfig,
} from '~~/shared/constants/project-display'

const props = withDefaults(defineProps<{
  modelValue: WorkspaceProjectCommonForm
  project?: Project | null
  fontSizePreset?: WorkspaceFontSizePreset | ''
  tabSpacingPreset?: WorkspaceTabSpacingPreset | ''
  disabled?: boolean
  titleInputTestId?: string
  summaryInputTestId?: string
}>(), {
  project: null,
  fontSizePreset: '',
  tabSpacingPreset: '',
  disabled: false,
  titleInputTestId: 'project-basic-settings-title-input',
  summaryInputTestId: 'project-basic-settings-summary-input',
})

const emit = defineEmits<{
  'update:modelValue': [value: WorkspaceProjectCommonForm]
}>()

const projectDisplayIconOptions = PROJECT_DISPLAY_ICON_OPTIONS
const projectDisplayAccentOptions = PROJECT_DISPLAY_ACCENT_OPTIONS

const projectSettingsDisplayHasOverride = computed(() => {
  return Boolean(
    String(props.modelValue.icon || '').trim()
    && String(props.modelValue.accentColor || '').trim(),
  )
})

const projectSettingsDisplayPreview = computed(() => {
  const seed = `${String(props.project?.id || 'project').trim()}:${String(props.project?.title || '').trim()}`
  const configuredDisplay = normalizeProjectDisplayConfig({
    icon: props.modelValue.icon,
    accentColor: props.modelValue.accentColor,
  })
  const display = resolveProjectDisplayConfig(configuredDisplay || props.project?.display || null, seed)
  const accent = getProjectDisplayAccent(display.accentColor)
  const title = String(props.modelValue.title || props.project?.title || '').trim() || '未命名项目'
  const summary = String(props.modelValue.summary || props.project?.summary || '').trim() || '项目卡会使用当前图标与颜色方案展示。'

  return {
    title,
    summary,
    icon: display.icon,
    monogram: buildProjectMonogram(title),
    accent,
  }
})

const projectSettingsCustomAccentValue = computed(() => {
  const normalized = normalizeProjectDisplayAccentColor(
    props.modelValue.accentColor || projectSettingsDisplayPreview.value.accent.value,
  )

  if (!normalized)
    return '#5b82f6'
  if (!isProjectDisplayPresetAccentColor(normalized))
    return normalized
  return projectSettingsDisplayPreview.value.accent.solid
})

const projectSettingsUsingCustomAccent = computed(() => {
  const normalized = normalizeProjectDisplayAccentColor(props.modelValue.accentColor)
  return Boolean(normalized && !isProjectDisplayPresetAccentColor(normalized))
})

function emitProjectSettingsCommon(next: WorkspaceProjectCommonForm) {
  emit('update:modelValue', {
    ...next,
  })
}

function updateProjectSettingsCommonField(field: keyof WorkspaceProjectCommonForm, value: string) {
  emitProjectSettingsCommon({
    ...props.modelValue,
    [field]: value,
  })
}

function selectProjectSettingsDisplayIcon(icon: string) {
  emitProjectSettingsCommon({
    ...props.modelValue,
    icon,
    accentColor: projectSettingsDisplayPreview.value.accent.value,
  })
}

function selectProjectSettingsDisplayAccent(accentColor: string) {
  const normalizedAccentColor = normalizeProjectDisplayAccentColor(accentColor)
  if (!normalizedAccentColor)
    return

  emitProjectSettingsCommon({
    ...props.modelValue,
    icon: projectSettingsDisplayPreview.value.icon,
    accentColor: normalizedAccentColor,
  })
}
</script>

<template>
  <section class="project-basic-settings-editor" data-testid="project-basic-settings-editor">
    <div class="project-basic-settings-editor__fields">
      <label class="text-xs text-slate-600 block space-y-1.5">
        <span class="text-slate-700 font-medium">项目标题</span>
        <input
          :value="modelValue.title"
          class="text-xs px-3 outline-none border border-slate-200 rounded-xl bg-white h-10 w-full focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          :data-testid="titleInputTestId"
          :disabled="disabled"
          placeholder="输入项目标题"
          @input="updateProjectSettingsCommonField('title', ($event.target as HTMLInputElement).value)"
        >
      </label>

      <label class="text-xs text-slate-600 block space-y-1.5">
        <span class="text-slate-700 font-medium">项目介绍（摘要）</span>
        <textarea
          :value="modelValue.summary"
          class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[84px] w-full focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          :data-testid="summaryInputTestId"
          :disabled="disabled"
          placeholder="输入项目介绍"
          @input="updateProjectSettingsCommonField('summary', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
    </div>

    <ProjectIdentityThemeCard
      :title="projectSettingsDisplayPreview.title"
      :summary="projectSettingsDisplayPreview.summary"
      :icon="projectSettingsDisplayPreview.icon"
      :monogram="projectSettingsDisplayPreview.monogram"
      :accent="projectSettingsDisplayPreview.accent"
      :icon-options="projectDisplayIconOptions"
      :accent-options="projectDisplayAccentOptions"
      :custom-accent-value="projectSettingsCustomAccentValue"
      :using-custom-accent="projectSettingsUsingCustomAccent"
      :has-override="projectSettingsDisplayHasOverride"
      :disabled="disabled"
      @select-icon="selectProjectSettingsDisplayIcon"
      @select-accent="selectProjectSettingsDisplayAccent"
    />
  </section>
</template>

<style scoped>
.project-basic-settings-editor {
  display: grid;
  gap: 1rem;
}

.project-basic-settings-editor__fields {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

@media (min-width: 1024px) {
  .project-basic-settings-editor__fields {
    grid-template-columns: minmax(260px, 0.78fr) minmax(0, 1.22fr);
  }
}
</style>
