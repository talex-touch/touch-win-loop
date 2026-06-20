ALTER TABLE feishu_bitable_sync_item_runs
  ADD COLUMN IF NOT EXISTS diagnostics_json JSONB NOT NULL DEFAULT '{}'::JSONB;
