CREATE TABLE "ratings"."ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "score" SMALLINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ratings_score_check" CHECK ("score" BETWEEN 1 AND 5),
    CONSTRAINT "ratings_source_check" CHECK ("source" IN ('web', 'extension', 'mobile', 'api')),
    CONSTRAINT "ratings_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"."entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ratings_entity_id_user_id_key" ON "ratings"."ratings" ("entity_id", "user_id");
CREATE INDEX "ratings_entity_id_idx" ON "ratings"."ratings" ("entity_id");
CREATE INDEX "ratings_user_id_idx" ON "ratings"."ratings" ("user_id");

CREATE TABLE "ratings"."rating_aggregates" (
    "entity_id" UUID NOT NULL,
    "avg_score" NUMERIC(3,2) NOT NULL DEFAULT 0,
    "votes_count" INTEGER NOT NULL DEFAULT 0,
    "distribution_1" INTEGER NOT NULL DEFAULT 0,
    "distribution_2" INTEGER NOT NULL DEFAULT 0,
    "distribution_3" INTEGER NOT NULL DEFAULT 0,
    "distribution_4" INTEGER NOT NULL DEFAULT 0,
    "distribution_5" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_aggregates_pkey" PRIMARY KEY ("entity_id"),
    CONSTRAINT "rating_aggregates_non_negative_check" CHECK (
        "avg_score" >= 0
        AND "votes_count" >= 0
        AND "distribution_1" >= 0
        AND "distribution_2" >= 0
        AND "distribution_3" >= 0
        AND "distribution_4" >= 0
        AND "distribution_5" >= 0
    ),
    CONSTRAINT "rating_aggregates_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"."entities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
