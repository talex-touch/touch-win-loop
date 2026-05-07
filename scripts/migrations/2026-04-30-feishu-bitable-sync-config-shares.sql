CREATE TABLE IF NOT EXISTS feishu_bitable_sync_config_shares (
  id TEXT PRIMARY KEY,
  source_sync_id TEXT NOT NULL REFERENCES feishu_bitable_syncs(id) ON DELETE CASCADE,
  share_key TEXT NOT NULL UNIQUE,
  package_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_config_shares_source
  ON feishu_bitable_sync_config_shares(source_sync_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feishu_bitable_sync_config_shares_active
  ON feishu_bitable_sync_config_shares(share_key, expires_at)
  WHERE revoked_at IS NULL;
