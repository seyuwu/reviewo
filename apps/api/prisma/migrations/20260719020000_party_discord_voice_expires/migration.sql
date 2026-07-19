ALTER TABLE "social"."game_parties"
  ADD COLUMN IF NOT EXISTS "discord_voice_expires_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "game_parties_discord_voice_expires_at_idx"
  ON "social"."game_parties" ("discord_voice_expires_at")
  WHERE "discord_channel_id" IS NOT NULL;
