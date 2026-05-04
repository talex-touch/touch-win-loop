// 公共共享类型统一从 ./domain 导出，避免 Nuxt 生成重复自动导入。
export type {
  FeishuBitableSyncCleanupPreview,
  FeishuBitableSyncCleanupResult,
  FeishuBitableSyncConfigImportPreview,
  FeishuBitableSyncConfigImportResult,
  FeishuBitableSyncConfigPackage,
  FeishuBitableSyncConfigShare,
  FeishuSyncedDataQuery,
  FeishuSyncRunSamplePage,
} from './domain-legacy'
