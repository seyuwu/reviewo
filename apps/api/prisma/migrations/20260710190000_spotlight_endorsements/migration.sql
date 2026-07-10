CREATE TABLE community.spotlight_placement_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES community.spotlight_placements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX spotlight_placement_endorsements_unique_idx
  ON community.spotlight_placement_endorsements (placement_id, user_id);

CREATE INDEX spotlight_placement_endorsements_placement_idx
  ON community.spotlight_placement_endorsements (placement_id);

CREATE INDEX spotlight_placement_endorsements_user_created_idx
  ON community.spotlight_placement_endorsements (user_id, created_at DESC);
