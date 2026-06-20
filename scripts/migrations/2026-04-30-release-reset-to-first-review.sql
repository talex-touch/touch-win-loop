ALTER TABLE release_review_logs
  DROP CONSTRAINT IF EXISTS release_review_logs_action_check;

ALTER TABLE release_review_logs
  ADD CONSTRAINT release_review_logs_action_check
  CHECK (action IN (
    'sync_generated',
    'manual_generated',
    'sync_draft_overwritten',
    'first_review_approved',
    'second_review_claimed',
    'second_review_approved',
    'rejected',
    'reset_to_first_review',
    'published'
  ));
