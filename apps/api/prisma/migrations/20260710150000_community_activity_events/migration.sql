CREATE SCHEMA IF NOT EXISTS community;

CREATE TYPE community.contribution_level AS ENUM (
  'newcomer',
  'contributor',
  'active_contributor',
  'curator',
  'pioneer'
);

CREATE TABLE community.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_id UUID NULL,
  entity_type TEXT NULL,
  category_id UUID NULL,
  target_user_id UUID NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX activity_events_dedupe_idx
  ON community.activity_events (user_id, action_type, (payload->>'sourceId'))
  WHERE payload ? 'sourceId';

CREATE INDEX activity_events_user_created_idx
  ON community.activity_events (user_id, created_at DESC);

CREATE INDEX activity_events_type_created_idx
  ON community.activity_events (action_type, created_at DESC);

CREATE INDEX activity_events_entity_created_idx
  ON community.activity_events (entity_id, created_at DESC);

CREATE TABLE community.user_contribution_snapshots (
  user_id UUID PRIMARY KEY REFERENCES users.users(id) ON DELETE CASCADE,
  level community.contribution_level NOT NULL DEFAULT 'newcomer',
  ratings_count INT NOT NULL DEFAULT 0,
  reviews_count INT NOT NULL DEFAULT 0,
  battle_votes_count INT NOT NULL DEFAULT 0,
  tops_count INT NOT NULL DEFAULT 0,
  entities_created_count INT NOT NULL DEFAULT 0,
  field_fixes_count INT NOT NULL DEFAULT 0,
  discussions_count INT NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
