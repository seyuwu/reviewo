CREATE TYPE "entities"."entity_type" AS ENUM (
    'website',
    'page',
    'video',
    'channel',
    'repository',
    'organization',
    'product',
    'book',
    'movie',
    'game',
    'company',
    'person',
    'place',
    'other'
);

CREATE TABLE "entities"."entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "entities"."entity_type" NOT NULL,
    "description" TEXT,
    "canonical_url" TEXT,
    "parent_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "entities"."entities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "entities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "entities_slug_key" ON "entities"."entities" ("slug");
CREATE UNIQUE INDEX "entities_canonical_url_key" ON "entities"."entities" ("canonical_url") WHERE "canonical_url" IS NOT NULL;
CREATE INDEX "entities_type_idx" ON "entities"."entities" ("type");
CREATE INDEX "entities_parent_id_idx" ON "entities"."entities" ("parent_id");
CREATE INDEX "entities_created_by_idx" ON "entities"."entities" ("created_by");
CREATE INDEX "entities_title_search_idx" ON "entities"."entities" USING GIN (to_tsvector('simple', "title"));
