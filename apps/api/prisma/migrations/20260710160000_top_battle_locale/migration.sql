ALTER TABLE "tops"."tops"
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ru';

UPDATE "tops"."tops"
SET "locale" = CASE
  WHEN COALESCE("title", '') ~ '[\u0400-\u04FF]'
    OR COALESCE("description", '') ~ '[\u0400-\u04FF]' THEN 'ru'
  ELSE 'en'
END;

CREATE INDEX "tops_locale_created_at_idx"
ON "tops"."tops"("locale", "created_at");

ALTER TABLE "growth"."battle_votes"
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ru';

ALTER TABLE "growth"."battle_votes" DROP CONSTRAINT IF EXISTS "battle_votes_pair_key_voter_key_key";

CREATE UNIQUE INDEX "battle_votes_pair_key_voter_key_locale_key"
ON "growth"."battle_votes"("pair_key", "voter_key", "locale");

CREATE INDEX "battle_votes_pair_key_locale_idx"
ON "growth"."battle_votes"("pair_key", "locale");
