CREATE TABLE IF NOT EXISTS feishu_bitable_sync_run_samples (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES feishu_bitable_sync_item_runs(id) ON DELETE CASCADE,
  sync_item_id TEXT NOT NULL REFERENCES feishu_bitable_sync_items(id) ON DELETE CASCADE,
  sample_type TEXT NOT NULL CHECK (sample_type IN ('auto_sync_filtered', 'business_skipped')),
  sample_index INTEGER NOT NULL,
  record_id TEXT NOT NULL DEFAULT '',
  external_id TEXT,
  reason_code TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, sample_type, sample_index)
);

CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_run_samples_run_type_index
  ON feishu_bitable_sync_run_samples(run_id, sample_type, sample_index ASC);

CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_run_samples_sync_item_run
  ON feishu_bitable_sync_run_samples(sync_item_id, run_id, sample_index ASC);
