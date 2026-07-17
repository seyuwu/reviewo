-- Early community unlock (teams / friend invites) without opening teammate search.
ALTER TABLE "social"."games_launch_settings"
  ADD COLUMN IF NOT EXISTS "community_open" BOOLEAN NOT NULL DEFAULT false;
