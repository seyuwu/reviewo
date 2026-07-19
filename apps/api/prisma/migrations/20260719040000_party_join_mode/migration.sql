DO $$
BEGIN
  CREATE TYPE "social"."game_party_join_mode" AS ENUM ('OPEN', 'CONFIRM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "social"."game_parties"
  ADD COLUMN IF NOT EXISTS "join_mode" "social"."game_party_join_mode" NOT NULL DEFAULT 'CONFIRM';
