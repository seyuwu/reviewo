-- Positional Dota roles (1-5) for party members; separate from OWNER/MEMBER.
ALTER TABLE "social"."game_party_members"
ADD COLUMN IF NOT EXISTS "position_role" TEXT;

ALTER TABLE "social"."game_party_members"
DROP CONSTRAINT IF EXISTS "game_party_members_position_role_check";

ALTER TABLE "social"."game_party_members"
ADD CONSTRAINT "game_party_members_position_role_check"
CHECK ("position_role" IS NULL OR "position_role" IN ('1', '2', '3', '4', '5'));

CREATE UNIQUE INDEX IF NOT EXISTS "game_party_members_party_id_position_role_uidx"
ON "social"."game_party_members"("party_id", "position_role")
WHERE "position_role" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'game_party_invite_kind' AND n.nspname = 'social'
  ) THEN
    CREATE TYPE "social"."game_party_invite_kind" AS ENUM ('INVITE', 'APPLICATION');
  END IF;
END $$;

ALTER TABLE "social"."game_party_invites"
ADD COLUMN IF NOT EXISTS "kind" "social"."game_party_invite_kind" NOT NULL DEFAULT 'INVITE';

ALTER TABLE "social"."game_party_invites"
ADD COLUMN IF NOT EXISTS "position_role" TEXT;

ALTER TABLE "social"."game_party_invites"
DROP CONSTRAINT IF EXISTS "game_party_invites_position_role_check";

ALTER TABLE "social"."game_party_invites"
ADD CONSTRAINT "game_party_invites_position_role_check"
CHECK ("position_role" IS NULL OR "position_role" IN ('1', '2', '3', '4', '5'));
