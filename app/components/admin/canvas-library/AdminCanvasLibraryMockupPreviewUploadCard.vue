<script setup lang="ts">
import type { RequestOption, UploadRequest } from "@arco-design/web-vue";
import type { PropType } from "vue";

const props = defineProps({
  previewUrl: {
    type: String,
    default: "",
  },
  assetLabel: {
    type: String,
    required: true,
  },
  helperText: {
    type: String,
    required: true,
  },
  uploadButtonText: {
    type: String,
    required: true,
  },
  uploading: {
    type: Boolean,
    default: false,
  },
  accept: {
    type: String,
    default: "",
  },
  alt: {
    type: String,
    default: "预览图",
  },
  emptyText: {
    type: String,
    default: "待上传",
  },
  compact: {
    type: Boolean,
    default: false,
  },
  buttonSize: {
    type: String as PropType<"mini" | "small" | "medium" | "large" | undefined>,
    default: undefined,
  },
  customRequest: {
    type: Function as PropType<(option: RequestOption) => UploadRequest>,
    required: true,
  },
});
</script>

<template>
  <div :class="compact ? 'space-y-3' : 'rounded-lg border border-slate-200 bg-slate-50 p-4'">
    <div :class="compact ? 'flex items-center gap-3' : 'flex flex-col gap-4 md:flex-row md:items-start'">
      <div :class="compact ? '' : 'shrink-0'">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          :alt="alt"
          :class="compact ? 'h-16 w-16 rounded-lg border border-slate-200 bg-white object-contain' : 'h-28 w-28 rounded-xl border border-slate-200 bg-white object-contain'"
        >
        <div
          v-else
          :class="compact ? 'flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-[10px] text-slate-400' : 'flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-400'"
        >
          {{ emptyText }}
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <p :class="compact ? 'm-0 text-[11px] text-slate-600' : 'm-0 text-sm font-medium text-slate-900'">
          {{ assetLabel }}
        </p>
        <p :class="compact ? 'm-0 mt-1 text-[10px] text-slate-400' : 'm-0 mt-1 text-xs leading-5 text-slate-500'">
          {{ helperText }}
        </p>
        <div class="mt-3">
          <a-upload
            :accept="accept"
            :custom-request="customRequest"
            :show-file-list="false"
            :limit="1"
          >
            <template #upload-button>
              <a-button type="outline" :size="buttonSize" :loading="uploading">
                {{ uploadButtonText }}
              </a-button>
            </template>
          </a-upload>
        </div>
      </div>
    </div>
  </div>
</template>
