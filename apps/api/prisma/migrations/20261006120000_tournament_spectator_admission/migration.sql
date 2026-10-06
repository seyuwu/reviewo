ALTER TYPE "social"."dota_tournament_match_status" ADD VALUE 'SPECTATOR_ADMISSION';

ALTER TABLE "social"."dota_tournament_matches"
  ADD COLUMN "captain_a_ready_at" TIMESTAMPTZ(6),
  ADD COLUMN "captain_b_ready_at" TIMESTAMPTZ(6),
  ADD COLUMN "spectator_admission_ends_at" TIMESTAMPTZ(6);

CREATE INDEX "dota_tournament_matches_status_spectator_admission_ends_at_idx"
  ON "social"."dota_tournament_matches"("status", "spectator_admission_ends_at");

-- Preserve matches already confirmed under the previous workflow.
UPDATE "social"."dota_tournament_matches"
SET "captain_a_ready_at" = COALESCE("settings_confirmed_at", "lobby_submitted_at", "created_at"),
    "captain_b_ready_at" = COALESCE("settings_confirmed_at", "lobby_submitted_at", "created_at")
WHERE "status" IN ('READY', 'IN_PROGRESS', 'RESULT_CONFIRMATION', 'COMPLETED');
