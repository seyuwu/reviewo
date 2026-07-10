-- AlterTable
ALTER TABLE "community"."recommendations" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ru';

-- CreateIndex
CREATE INDEX "recommendations_locale_created_at_idx" ON "community"."recommendations"("locale", "created_at" DESC);

-- Backfill from linked review locale
UPDATE "community"."recommendations" AS recommendation
SET "locale" = review."locale"
FROM "reviews"."reviews" AS review
WHERE recommendation."review_id" = review."id";

-- Backfill from linked top locale
UPDATE "community"."recommendations" AS recommendation
SET "locale" = top."locale"
FROM "tops"."tops" AS top
WHERE recommendation."top_id" = top."id";

-- Infer locale from custom message text when no review/top locale was applied
UPDATE "community"."recommendations"
SET "locale" = CASE
  WHEN "message" ~ '[а-яА-ЯёЁ]' THEN 'ru'
  ELSE 'en'
END
WHERE "review_id" IS NULL
  AND "top_id" IS NULL
  AND "message" IS NOT NULL
  AND length(trim("message")) > 0;
