-- Fix enum name: earlier migration created GamePartyInviteKind; Prisma @@map expects game_party_invite_kind.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'GamePartyInviteKind' AND n.nspname = 'social'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'game_party_invite_kind' AND n.nspname = 'social'
  ) THEN
    ALTER TYPE "social"."GamePartyInviteKind" RENAME TO "game_party_invite_kind";
  END IF;
END $$;
