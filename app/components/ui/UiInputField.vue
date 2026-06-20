<script setup lang="ts">
import { computed, useAttrs } from 'vue'

interface UiInputFieldProps {
  autocomplete?: string
  disabled?: boolean
  label?: string
  modelValue?: string
  placeholder?: string
  type?: 'text' | 'password'
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<UiInputFieldProps>(), {
  autocomplete: undefined,
  disabled: false,
  label: '',
  modelValue: '',
  placeholder: '',
  type: 'text',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const attrs = useAttrs()

const inputValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

const inputAttrs = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}

  if (props.autocomplete)
    result.autocomplete = props.autocomplete

  const dataTestId = attrs['data-testid']
  if (typeof dataTestId === 'string' && dataTestId)
    result['data-testid'] = dataTestId

  return result
})

const forwardedAttrs = computed(() => {
  const { 'data-testid': _dataTestId, class: _class, style: _style, ...rest } = attrs
  return rest
})
</script>

<template>
  <label class="ui-input-field">
    <span v-if="props.label" class="ui-input-field__label">{{ props.label }}</span>

    <a-input
      v-model="inputValue"
      v-bind="forwardedAttrs"
      :type="props.type"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      :input-attrs="inputAttrs"
      class="ui-input-field__control"
      :class="attrs.class"
      :style="attrs.style"
    />
  </label>
</template>

<style scoped>
.ui-input-field {
  display: block;
  width: 100%;
}

.ui-input-field__label {
  display: block;
  margin-bottom: 6px;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}

.ui-input-field__control.arco-input-wrapper {
  width: 100%;
  min-height: 42px;
  border-radius: var(--wl-radius-md);
  border-color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(12px);
}

.ui-input-field__control.arco-input-wrapper:hover {
  border-color: rgba(148, 163, 184, 0.56);
}

.ui-input-field__control.arco-input-wrapper.arco-input-focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
}

.ui-input-field__control :deep(.arco-input) {
  min-height: 40px;
  color: #0f172a;
  font-family: var(--wl-font-sans);
  font-size: 14px;
  font-weight: 500;
}

.ui-input-field__control :deep(.arco-input::placeholder) {
  color: #94a3b8;
  font-weight: 500;
}
</style>
