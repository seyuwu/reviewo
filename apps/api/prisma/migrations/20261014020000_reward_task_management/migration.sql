CREATE TABLE community.reward_activity_days (
  telegram_id VARCHAR(20) NOT NULL,
  day VARCHAR(10) NOT NULL,
  PRIMARY KEY (telegram_id, day)
);
CREATE TABLE community.reward_task_submissions (
  id UUID PRIMARY KEY,
  task_key VARCHAR(40) NOT NULL,
  telegram_id VARCHAR(20) NOT NULL,
  period_key VARCHAR(40) NOT NULL,
  evidence VARCHAR(1000) NOT NULL,
  rule JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reason VARCHAR(500),
  awarded_amount INTEGER NOT NULL DEFAULT 0 CHECK (awarded_amount >= 0),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (task_key, telegram_id, period_key)
);
CREATE INDEX reward_task_submission_status_idx ON community.reward_task_submissions(status, submitted_at, id);
CREATE INDEX reward_task_submission_user_idx ON community.reward_task_submissions(telegram_id, submitted_at);
CREATE INDEX reward_ledger_task_time_idx ON community.reward_ledger(task, created_at DESC, telegram_id);
