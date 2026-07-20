-- Default party join: instant seat (OPEN), not application (CONFIRM).
ALTER TABLE "social"."game_parties"
  ALTER COLUMN "join_mode" SET DEFAULT 'OPEN';

UPDATE "social"."game_parties"
SET "join_mode" = 'OPEN'
WHERE "join_mode" = 'CONFIRM';
