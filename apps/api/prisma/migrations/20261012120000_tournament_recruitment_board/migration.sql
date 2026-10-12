ALTER TABLE "social"."dota_tournament_solo_searches"
  ADD COLUMN "mode" VARCHAR(8) NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "recruitment_announced_generation" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "dota_tournament_solo_searches_mode_idx" ON "social"."dota_tournament_solo_searches"("tournament_id", "status", "mode", "created_at");

CREATE TABLE "social"."dota_tournament_recruit_preferences" (
  "id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "next_notification_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "dota_tournament_recruit_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dota_tournament_recruit_preferences_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "social"."dota_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dota_tournament_recruit_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "dota_tournament_recruit_preferences_tournament_id_user_id_key" ON "social"."dota_tournament_recruit_preferences"("tournament_id", "user_id");
CREATE INDEX "dota_tournament_recruit_preferences_tournament_id_enabled_idx" ON "social"."dota_tournament_recruit_preferences"("tournament_id", "enabled");
