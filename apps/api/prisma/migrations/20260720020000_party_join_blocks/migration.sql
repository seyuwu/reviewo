CREATE TABLE IF NOT EXISTS "social"."game_party_join_blocks" (
  "id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "game_party_join_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_party_join_blocks_party_id_user_id_key"
  ON "social"."game_party_join_blocks"("party_id", "user_id");

CREATE INDEX IF NOT EXISTS "game_party_join_blocks_user_id_idx"
  ON "social"."game_party_join_blocks"("user_id");

DO $$
BEGIN
  ALTER TABLE "social"."game_party_join_blocks"
    ADD CONSTRAINT "game_party_join_blocks_party_id_fkey"
    FOREIGN KEY ("party_id") REFERENCES "social"."game_parties"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
