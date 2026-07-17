-- Games launch waitlist / admin search toggle
CREATE TABLE IF NOT EXISTS "social"."games_launch_settings" (
    "id" VARCHAR(32) NOT NULL,
    "search_live" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_user_id" UUID,
    CONSTRAINT "games_launch_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "social"."games_launch_interests" (
    "id" UUID NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "contact" VARCHAR(320) NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "games_launch_interests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "games_launch_interests_created_at_idx"
  ON "social"."games_launch_interests"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "games_launch_interests_channel_created_at_idx"
  ON "social"."games_launch_interests"("channel", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "social"."games_launch_suggestions" (
    "id" UUID NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "contact" VARCHAR(320),
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "games_launch_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "games_launch_suggestions_source_created_at_idx"
  ON "social"."games_launch_suggestions"("source", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "games_launch_suggestions_created_at_idx"
  ON "social"."games_launch_suggestions"("created_at" DESC);

INSERT INTO "social"."games_launch_settings" ("id", "search_live", "updated_at")
VALUES ('default', false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
