CREATE TABLE "reputation"."user_activity_hourly" (
    "user_id" UUID NOT NULL,
    "activity_hour" TIMESTAMPTZ(6) NOT NULL,
    "rating_created_count" INTEGER NOT NULL DEFAULT 0,
    "rating_updated_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_activity_hourly_pkey" PRIMARY KEY ("user_id", "activity_hour"),
    CONSTRAINT "user_activity_hourly_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_activity_hourly_rating_created_count_check" CHECK ("rating_created_count" >= 0),
    CONSTRAINT "user_activity_hourly_rating_updated_count_check" CHECK ("rating_updated_count" >= 0)
);

CREATE INDEX "user_activity_hourly_user_id_activity_hour_idx"
    ON "reputation"."user_activity_hourly" ("user_id", "activity_hour" DESC);
