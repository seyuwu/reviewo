CREATE TYPE community.spotlight_placement_type AS ENUM (
  'entity_spotlight',
  'battle_boost',
  'top_highlight'
);

CREATE TABLE community.spotlight_credit_balances (
  user_id UUID PRIMARY KEY REFERENCES users.users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0,
  last_grant_period TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE community.spotlight_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  reference_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX spotlight_credit_ledger_user_created_idx
  ON community.spotlight_credit_ledger (user_id, created_at DESC);

CREATE TABLE community.spotlight_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  placement_type community.spotlight_placement_type NOT NULL,
  entity_id UUID NULL,
  top_id UUID NULL,
  pair_key TEXT NULL,
  pair_slug TEXT NULL,
  cost INT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX spotlight_placements_active_idx
  ON community.spotlight_placements (ends_at DESC, starts_at DESC);

CREATE INDEX spotlight_placements_user_created_idx
  ON community.spotlight_placements (user_id, created_at DESC);
