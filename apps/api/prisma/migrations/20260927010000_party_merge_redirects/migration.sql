ALTER TABLE "social"."game_parties"
ADD COLUMN "merged_into_slug" VARCHAR(120);

CREATE INDEX "game_parties_merged_into_slug_idx"
ON "social"."game_parties"("merged_into_slug");
