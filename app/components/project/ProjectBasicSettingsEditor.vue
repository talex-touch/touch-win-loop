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

function selectProjectSettingsCustomAccent(event: Event) {
  selectProjectSettingsDisplayAccent((event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="space-y-5" data-testid="project-basic-settings-editor">
    <div class="project-basic-settings-editor__hero">
      <div class="space-y-4">
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
            class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[116px] w-full focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            :data-testid="summaryInputTestId"
            :disabled="disabled"
            placeholder="输入项目介绍"
            @input="updateProjectSettingsCommonField('summary', ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
      </div>

      <section class="border border-slate-200 rounded-2xl bg-slate-50/80 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200">
          <div class="flex gap-2 items-center">
            <h3 class="text-sm text-slate-800 font-semibold">
              项目标识
            </h3>
            <span
              class="text-[10px] font-semibold px-2 py-0.5 border rounded-full"
              :class="projectSettingsDisplayHasOverride ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'"
            >
              {{ projectSettingsDisplayHasOverride ? '已自定义' : '默认生成' }}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 leading-5 mt-1">
            项目卡会即时预览当前图标与配色。图标后续可扩展图标库 / emoji，颜色也会继续补充更多预设。
          </p>
        </div>

        <div class="p-4">
          <article
            class="p-4 border rounded-[20px] bg-white relative overflow-hidden"
            :style="{
              borderColor: projectSettingsDisplayPreview.accent.border,
              background: `linear-gradient(145deg, ${projectSettingsDisplayPreview.accent.soft} 0%, #ffffff 66%, ${projectSettingsDisplayPreview.accent.soft} 100%)`,
            }"
          >
            <div
              class="rounded-full h-24 w-24 right-[-18px] top-[-26px] absolute"
              :style="{
                background: `radial-gradient(circle, ${projectSettingsDisplayPreview.accent.border} 0%, transparent 72%)`,
                opacity: 0.65,
              }"
            />
            <div class="flex gap-3 items-start relative">
              <div
                class="border rounded-[18px] flex shrink-0 h-14 w-14 shadow-sm items-center justify-center"
                :style="{
                  color: projectSettingsDisplayPreview.accent.text,
                  backgroundColor: projectSettingsDisplayPreview.accent.soft,
                  borderColor: projectSettingsDisplayPreview.accent.border,
                }"
              >
                <span class="material-symbols-outlined text-[24px]">{{ projectSettingsDisplayPreview.icon }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex gap-2 items-center justify-between">
                  <p class="text-sm text-slate-900 font-semibold truncate">
                    {{ projectSettingsDisplayPreview.title }}
                  </p>
                  <span
                    class="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    :style="{
                      color: projectSettingsDisplayPreview.accent.text,
                      backgroundColor: projectSettingsDisplayPreview.accent.soft,
                    }"
                  >
                    {{ projectSettingsDisplayPreview.monogram }}
                  </span>
                </div>
                <p class="text-[11px] text-slate-600 leading-5 mt-1 line-clamp-2">
                  {{ projectSettingsDisplayPreview.summary }}
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div class="gap-4 grid grid-cols-1 lg:grid-cols-2">
      <section class="p-4 border border-slate-200 rounded-2xl bg-slate-50/70">
        <div class="mb-3">
          <p class="text-xs text-slate-700 font-medium">
            图标
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            当前先提供常用系统图标，后续可扩展图标库 / emoji。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in projectDisplayIconOptions"
            :key="`project-icon-${option.value}`"
            class="px-3 py-2.5 text-left border rounded-xl bg-white flex-1 basis-[148px] min-w-[148px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :class="projectSettingsDisplayPreview.icon === option.value ? 'border-slate-900 shadow-sm' : 'border-slate-200 hover:border-slate-300'"
            :disabled="disabled"
            type="button"
            @click="selectProjectSettingsDisplayIcon(option.value)"
          >
            <span class="flex gap-2 items-center">
              <span class="material-symbols-outlined text-[18px] text-slate-700">{{ option.value }}</span>
              <span class="text-[11px] text-slate-600 font-medium">{{ option.label }}</span>
            </span>
          </button>
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-2xl bg-slate-50/70">
        <div class="mb-3">
          <p class="text-xs text-slate-700 font-medium">
            强调色
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            预设色板与自定义颜色都支持，后续可继续扩展更多颜色。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in projectDisplayAccentOptions"
            :key="`project-accent-${option.value}`"
            class="px-3 py-2 text-left border rounded-xl bg-white flex-1 basis-[148px] min-w-[148px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            :class="projectSettingsDisplayPreview.accent.value === option.value ? 'border-slate-900 shadow-sm' : 'border-slate-200 hover:border-slate-300'"
            :disabled="disabled"
            type="button"
            @click="selectProjectSettingsDisplayAccent(option.value)"
          >
            <span class="flex gap-2 items-center">
              <span
                class="border rounded-full shrink-0 h-3 w-3"
                :style="{ backgroundColor: option.solid, borderColor: option.border }"
              />
              <span class="text-[11px] text-slate-600 font-medium">{{ option.label }}</span>
            </span>
          </button>
        </div>

        <div class="mt-3 px-3 py-3 border border-slate-200 rounded-xl bg-white flex flex-wrap gap-3 items-center">
          <label class="flex gap-2 items-center">
            <span class="text-[11px] text-slate-600 font-medium">自定义颜色</span>
            <input
              class="border border-slate-200 rounded bg-transparent h-8 w-10 cursor-pointer disabled:cursor-not-allowed"
              :disabled="disabled"
              :value="projectSettingsCustomAccentValue"
              type="color"
              @input="selectProjectSettingsCustomAccent"
            >
          </label>
          <span class="text-[11px] text-slate-500">
            {{ projectSettingsUsingCustomAccent ? projectSettingsCustomAccentValue : '未启用自定义色' }}
          </span>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.project-basic-settings-editor__hero {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 1024px) {
  .project-basic-settings-editor__hero {
    align-items: start;
    grid-template-columns: minmax(0, 1.06fr) minmax(320px, 0.94fr);
  }
}
</style>
