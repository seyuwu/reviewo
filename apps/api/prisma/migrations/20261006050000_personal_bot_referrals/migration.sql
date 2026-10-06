CREATE TABLE community.fdp_referrals (
  invitee_telegram_id VARCHAR(20) PRIMARY KEY,
  inviter_telegram_id VARCHAR(20) NOT NULL,
  code VARCHAR(24) NOT NULL,
  inviter_name VARCHAR(128) NOT NULL,
  inviter_username VARCHAR(32),
  invitee_name VARCHAR(128) NOT NULL,
  invitee_username VARCHAR(32),
  started_at TIMESTAMPTZ(6) NOT NULL,
  account_created_at TIMESTAMPTZ(6),
  account_ready_at TIMESTAMPTZ(6),
  search_started_at TIMESTAMPTZ(6),
  party_joined_at TIMESTAMPTZ(6),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CHECK (invitee_telegram_id <> inviter_telegram_id)
);
CREATE INDEX fdp_referrals_started_at_idx ON community.fdp_referrals(started_at);
CREATE INDEX fdp_referrals_inviter_telegram_id_started_at_idx
  ON community.fdp_referrals(inviter_telegram_id, started_at);
