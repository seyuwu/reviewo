ALTER TABLE community.reward_tag_verifications
  ADD COLUMN observed_username VARCHAR(32),
  ADD COLUMN observed_at TIMESTAMPTZ(6),
  ADD COLUMN attempted_at TIMESTAMPTZ(6),
  ADD COLUMN error_code VARCHAR(32);

CREATE INDEX reward_tag_verifications_status_checked_at_idx
  ON community.reward_tag_verifications(status, checked_at DESC);
