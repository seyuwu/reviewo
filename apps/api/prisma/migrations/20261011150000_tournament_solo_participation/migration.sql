ALTER TABLE "social"."dota_tournaments"
  ADD COLUMN "solo_match_lease_token" UUID,
  ADD COLUMN "solo_match_lease_until" TIMESTAMPTZ(6);

CREATE TABLE "social"."dota_tournament_solo_searches" (
  "id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "roles" TEXT[] NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'WAITING',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "assigned_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "dota_tournament_solo_searches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dota_tournament_solo_searches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "social"."dota_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dota_tournament_solo_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "dota_tournament_solo_searches_tournament_id_user_id_key" ON "social"."dota_tournament_solo_searches"("tournament_id", "user_id");
CREATE INDEX "dota_tournament_solo_searches_status_tournament_id_created_at_idx" ON "social"."dota_tournament_solo_searches"("status", "tournament_id", "created_at");
