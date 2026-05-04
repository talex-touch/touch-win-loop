ALTER TABLE billing_usage_events
  DROP CONSTRAINT IF EXISTS billing_usage_events_event_code_check;

ALTER TABLE billing_usage_events
  ADD CONSTRAINT billing_usage_events_event_code_check
  CHECK (event_code IN (
    'resource.upload',
    'resource.download',
    'resource.favorite.create',
    'ai.topic_proposal.generate',
    'review.submit',
    'review.report.export',
    'ai.defense.start',
    'ai.meeting.asr'
  ));
