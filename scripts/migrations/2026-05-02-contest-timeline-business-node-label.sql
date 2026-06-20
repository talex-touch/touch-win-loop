ALTER TABLE contest_timelines
  ADD COLUMN IF NOT EXISTS business_node_label TEXT NOT NULL DEFAULT '';

ALTER TABLE contest_track_timelines
  ADD COLUMN IF NOT EXISTS business_node_label TEXT NOT NULL DEFAULT '';
