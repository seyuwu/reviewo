-- AlterTable
ALTER TABLE "social"."game_parties"
  ADD COLUMN IF NOT EXISTS "discord_channel_id" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "discord_invite_url" VARCHAR(256),
  ADD COLUMN IF NOT EXISTS "discord_voice_created_at" TIMESTAMPTZ(6);
