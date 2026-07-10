CREATE TYPE community.spotlight_placement_event_type AS ENUM (
  'impression',
  'click'
);

CREATE TABLE community.spotlight_placement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES community.spotlight_placements(id) ON DELETE CASCADE,
  event_type community.spotlight_placement_event_type NOT NULL,
  viewer_key TEXT NOT NULL,
  user_id UUID NULL REFERENCES users.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX spotlight_placement_events_dedupe_idx
  ON community.spotlight_placement_events (placement_id, event_type, viewer_key);

CREATE INDEX spotlight_placement_events_placement_created_idx
  ON community.spotlight_placement_events (placement_id, created_at DESC);

CREATE INDEX spotlight_placement_events_type_created_idx
  ON community.spotlight_placement_events (event_type, created_at DESC);
