CREATE TABLE "community"."analytics_daily_counters" (
    "day" DATE NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "analytics_daily_counters_pkey" PRIMARY KEY ("day", "key")
);

CREATE TABLE "community"."analytics_daily_ctas" (
    "day" DATE NOT NULL,
    "cta_key" VARCHAR(96) NOT NULL,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "analytics_daily_ctas_pkey" PRIMARY KEY ("day", "cta_key")
);

CREATE TABLE "community"."analytics_daily_visitors" (
    "day" DATE NOT NULL,
    "visitor_hash" VARCHAR(64) NOT NULL,
    CONSTRAINT "analytics_daily_visitors_pkey" PRIMARY KEY ("day", "visitor_hash")
);

CREATE TABLE "community"."analytics_daily_path_times" (
    "day" DATE NOT NULL,
    "path_key" VARCHAR(96) NOT NULL,
    "time_ms_sum" BIGINT NOT NULL DEFAULT 0,
    "sample_count" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "analytics_daily_path_times_pkey" PRIMARY KEY ("day", "path_key")
);
