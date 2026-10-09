ALTER TABLE "social"."game_party_members"
  ADD COLUMN "ready_at" TIMESTAMPTZ(6),
  ADD COLUMN "telegram_contact_shared" BOOLEAN NOT NULL DEFAULT false;
