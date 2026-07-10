ALTER TABLE "reviews"."reviews"
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ru';

UPDATE "reviews"."reviews"
SET "locale" = CASE
  WHEN "text" ~ '[\u0400-\u04FF]' THEN 'ru'
  ELSE 'en'
END;

ALTER TABLE "reviews"."reviews" DROP CONSTRAINT IF EXISTS "reviews_author_id_entity_id_key";

CREATE UNIQUE INDEX "reviews_author_id_entity_id_locale_key"
ON "reviews"."reviews"("author_id", "entity_id", "locale");

CREATE INDEX "reviews_entity_id_locale_idx"
ON "reviews"."reviews"("entity_id", "locale");
