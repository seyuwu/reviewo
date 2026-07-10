ALTER TABLE community.user_contribution_snapshots
  ADD COLUMN contribution_score INT NOT NULL DEFAULT 0;

CREATE TABLE community.user_contribution_badges (
  user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

CREATE INDEX user_contribution_badges_user_idx
  ON community.user_contribution_badges (user_id);

CREATE TABLE community.user_expertise_snapshots (
  user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope_type, scope_key)
);

CREATE INDEX user_expertise_snapshots_user_score_idx
  ON community.user_expertise_snapshots (user_id, score DESC);

CREATE TABLE community.user_curator_rank_snapshots (
  user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL,
  score INT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);

CREATE INDEX user_curator_rank_snapshots_category_score_idx
  ON community.user_curator_rank_snapshots (category_id, score DESC);
