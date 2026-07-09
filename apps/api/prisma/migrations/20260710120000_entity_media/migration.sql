CREATE TYPE "entities"."entity_media_type" AS ENUM ('LOGO', 'IMAGE', 'COVER');

CREATE TYPE "entities"."entity_media_source" AS ENUM (
    'MANUAL',
    'CONTRIBUTION',
    'FAVICON',
    'OG_IMAGE',
    'MIGRATION'
);

CREATE TABLE "entities"."entity_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_id" UUID NOT NULL,
    "type" "entities"."entity_media_type" NOT NULL,
    "source" "entities"."entity_media_source" NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "trust_score" DECIMAL(4, 3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_media_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"."entities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "entity_media_entity_id_type_source_key" ON "entities"."entity_media" ("entity_id", "type", "source");
CREATE INDEX "entity_media_entity_id_type_idx" ON "entities"."entity_media" ("entity_id", "type");

INSERT INTO "entities"."entity_media" (
    "entity_id",
    "type",
    "source",
    "url",
    "trust_score"
)
SELECT
    "id",
    'LOGO'::"entities"."entity_media_type",
    'MIGRATION'::"entities"."entity_media_source",
    "logo_url",
    1.000
FROM "entities"."entities"
WHERE "logo_url" IS NOT NULL
  AND BTRIM("logo_url") <> '';
