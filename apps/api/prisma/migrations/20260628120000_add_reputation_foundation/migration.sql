CREATE SCHEMA IF NOT EXISTS reputation;

CREATE TABLE "reputation"."user_behavior_metrics" (
    "user_id" UUID NOT NULL,
    "total_ratings" INTEGER NOT NULL DEFAULT 0,
    "unique_entity_count" INTEGER NOT NULL DEFAULT 0,
    "unique_entity_type_count" INTEGER NOT NULL DEFAULT 0,
    "unique_root_domain_count" INTEGER NOT NULL DEFAULT 0,
    "score_1_count" INTEGER NOT NULL DEFAULT 0,
    "score_2_count" INTEGER NOT NULL DEFAULT 0,
    "score_3_count" INTEGER NOT NULL DEFAULT 0,
    "score_4_count" INTEGER NOT NULL DEFAULT 0,
    "score_5_count" INTEGER NOT NULL DEFAULT 0,
    "first_rating_at" TIMESTAMPTZ(6),
    "last_rating_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_behavior_metrics_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_behavior_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "reputation"."user_activity_daily" (
    "user_id" UUID NOT NULL,
    "activity_date" DATE NOT NULL,
    "rating_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_activity_daily_pkey" PRIMARY KEY ("user_id", "activity_date"),
    CONSTRAINT "user_activity_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_activity_daily_rating_count_check" CHECK ("rating_count" >= 0)
);

CREATE INDEX "user_activity_daily_user_id_activity_date_idx"
    ON "reputation"."user_activity_daily" ("user_id", "activity_date" DESC);

CREATE TABLE "reputation"."user_entity_stats" (
    "user_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "last_rated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_entity_stats_pkey" PRIMARY KEY ("user_id", "entity_id"),
    CONSTRAINT "user_entity_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_entity_stats_rating_count_check" CHECK ("rating_count" >= 0)
);

CREATE INDEX "user_entity_stats_user_id_rating_count_idx"
    ON "reputation"."user_entity_stats" ("user_id", "rating_count" DESC);

CREATE TABLE "reputation"."user_entity_type_stats" (
    "user_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "parent_context_type" TEXT NOT NULL DEFAULT '__root__',
    "rating_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_entity_type_stats_pkey" PRIMARY KEY ("user_id", "entity_type", "parent_context_type"),
    CONSTRAINT "user_entity_type_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_entity_type_stats_rating_count_check" CHECK ("rating_count" >= 0)
);

CREATE TABLE "reputation"."user_root_domain_stats" (
    "user_id" UUID NOT NULL,
    "root_domain" TEXT NOT NULL,
    "rating_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_root_domain_stats_pkey" PRIMARY KEY ("user_id", "root_domain"),
    CONSTRAINT "user_root_domain_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_root_domain_stats_rating_count_check" CHECK ("rating_count" >= 0)
);

CREATE TABLE "reputation"."user_trust_profiles" (
    "user_id" UUID NOT NULL,
    "trust_score" NUMERIC(4, 3) NOT NULL,
    "diversity_score" NUMERIC(4, 3) NOT NULL,
    "coverage_score" NUMERIC(4, 3) NOT NULL,
    "stability_score" NUMERIC(4, 3) NOT NULL,
    "consensus_score" NUMERIC(4, 3) NOT NULL,
    "account_age_bonus" NUMERIC(4, 3) NOT NULL,
    "anomaly_penalty" NUMERIC(4, 3) NOT NULL DEFAULT 0,
    "calculation_version" INTEGER NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_trust_profiles_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_trust_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "reputation"."vote_weight_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rating_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "score" SMALLINT NOT NULL,
    "vote_weight" NUMERIC(4, 3) NOT NULL,
    "weight_factors" JSONB NOT NULL DEFAULT '{}',
    "calculation_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_weight_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vote_weight_snapshots_rating_id_key" UNIQUE ("rating_id"),
    CONSTRAINT "vote_weight_snapshots_score_check" CHECK ("score" BETWEEN 1 AND 5)
);

CREATE INDEX "vote_weight_snapshots_entity_id_idx" ON "reputation"."vote_weight_snapshots" ("entity_id");
CREATE INDEX "vote_weight_snapshots_user_id_idx" ON "reputation"."vote_weight_snapshots" ("user_id");

CREATE TABLE "reputation"."entity_anomaly_metrics" (
    "entity_id" UUID NOT NULL,
    "anomaly_score" NUMERIC(4, 3) NOT NULL DEFAULT 0,
    "burst_score" NUMERIC(4, 3) NOT NULL DEFAULT 0,
    "sync_score" NUMERIC(4, 3) NOT NULL DEFAULT 0,
    "cluster_score" NUMERIC(4, 3) NOT NULL DEFAULT 0,
    "recent_burst_count" INTEGER NOT NULL DEFAULT 0,
    "last_anomaly_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_anomaly_metrics_pkey" PRIMARY KEY ("entity_id")
);

CREATE TABLE "reputation"."entity_activity_hourly" (
    "entity_id" UUID NOT NULL,
    "activity_hour" TIMESTAMPTZ(6) NOT NULL,
    "rating_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "entity_activity_hourly_pkey" PRIMARY KEY ("entity_id", "activity_hour"),
    CONSTRAINT "entity_activity_hourly_rating_count_check" CHECK ("rating_count" >= 0)
);

CREATE TABLE "reputation"."entity_confidence_profiles" (
    "entity_id" UUID NOT NULL,
    "confidence_score" NUMERIC(4, 3) NOT NULL,
    "effective_vote_mass" NUMERIC(10, 2) NOT NULL DEFAULT 0,
    "unique_raters_count" INTEGER NOT NULL DEFAULT 0,
    "activity_duration_days" INTEGER NOT NULL DEFAULT 0,
    "score_variance" NUMERIC(6, 4),
    "anomaly_score" NUMERIC(4, 3) NOT NULL DEFAULT 0,
    "calculation_version" INTEGER NOT NULL,
    "explanation" JSONB NOT NULL DEFAULT '[]',
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_confidence_profiles_pkey" PRIMARY KEY ("entity_id")
);

CREATE TABLE "reputation"."reputation_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "user_id" UUID,
    "entity_id" UUID,
    "rating_id" UUID,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reputation_events_user_id_created_at_idx"
    ON "reputation"."reputation_events" ("user_id", "created_at");
CREATE INDEX "reputation_events_entity_id_created_at_idx"
    ON "reputation"."reputation_events" ("entity_id", "created_at");
CREATE INDEX "reputation_events_type_created_at_idx"
    ON "reputation"."reputation_events" ("type", "created_at");
