CREATE TABLE "social"."dota_search_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "party_id" UUID,
    "party_name" VARCHAR(80),
    "search_type" VARCHAR(16) NOT NULL DEFAULT 'SOLO',
    "source" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'SEARCHING',
    "initial_member_count" INTEGER NOT NULL DEFAULT 1,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "dota_search_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dota_search_sessions_search_type_check" CHECK ("search_type" IN ('SOLO', 'RECRUIT')),
    CONSTRAINT "dota_search_sessions_source_check" CHECK ("source" IN ('telegram', 'web')),
    CONSTRAINT "dota_search_sessions_status_check" CHECK (
      "status" IN ('SEARCHING', 'JOINED', 'CANCELLED', 'EXPIRED')
    )
);

CREATE INDEX "dota_search_sessions_started_at_idx"
  ON "social"."dota_search_sessions"("started_at");

CREATE INDEX "dota_search_sessions_status_expires_at_idx"
  ON "social"."dota_search_sessions"("status", "expires_at");

CREATE INDEX "dota_search_sessions_search_type_started_at_idx"
  ON "social"."dota_search_sessions"("search_type", "started_at");

CREATE INDEX "dota_search_sessions_user_search_type_status_idx"
  ON "social"."dota_search_sessions"("user_id", "search_type", "status");

CREATE INDEX "dota_search_sessions_party_search_type_status_idx"
  ON "social"."dota_search_sessions"("party_id", "search_type", "status");

CREATE UNIQUE INDEX "dota_search_sessions_one_active_solo_per_user_idx"
  ON "social"."dota_search_sessions"("user_id")
  WHERE "search_type" = 'SOLO' AND "status" = 'SEARCHING';

CREATE UNIQUE INDEX "dota_search_sessions_one_active_recruit_per_party_idx"
  ON "social"."dota_search_sessions"("party_id")
  WHERE "search_type" = 'RECRUIT' AND "status" = 'SEARCHING';
