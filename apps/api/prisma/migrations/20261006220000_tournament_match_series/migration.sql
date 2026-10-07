ALTER TABLE social.dota_tournament_matches ADD COLUMN best_of INTEGER NOT NULL DEFAULT 1
  CHECK (best_of IN (1, 3, 5));
DROP INDEX social.dota_tournament_match_games_match_id_key;
ALTER TABLE social.dota_tournament_match_games
  ALTER COLUMN dota_match_id DROP NOT NULL,
  ADD COLUMN game_number INTEGER NOT NULL DEFAULT 1 CHECK (game_number BETWEEN 1 AND 5),
  ADD COLUMN winner_entry_id UUID,
  ADD COLUMN started_at TIMESTAMPTZ(6),
  ADD COLUMN completed_at TIMESTAMPTZ(6),
  ADD COLUMN result_evidence_url VARCHAR(500),
  ADD COLUMN resolution_note VARCHAR(1000);
CREATE UNIQUE INDEX dota_tournament_match_games_match_game_key
  ON social.dota_tournament_match_games(match_id, game_number);
UPDATE social.dota_tournament_match_games AS game
SET started_at = match.started_at,
    winner_entry_id = CASE WHEN match.status = 'COMPLETED' THEN match.winner_entry_id ELSE NULL END,
    completed_at = CASE WHEN match.status = 'COMPLETED' THEN COALESCE(match.result_confirmed_at, match.resolved_at, match.updated_at) ELSE NULL END,
    result_evidence_url = match.result_evidence_url,
    resolution_note = match.resolution_note
FROM social.dota_tournament_matches AS match WHERE match.id = game.match_id;
INSERT INTO social.dota_tournament_match_games(id, match_id, game_number, started_at, winner_entry_id, completed_at)
SELECT gen_random_uuid(), id, 1, started_at,
  CASE WHEN status = 'COMPLETED' THEN winner_entry_id ELSE NULL END,
  CASE WHEN status = 'COMPLETED' THEN COALESCE(result_confirmed_at, resolved_at, updated_at) ELSE NULL END
FROM social.dota_tournament_matches AS match
WHERE (started_at IS NOT NULL OR (status = 'COMPLETED' AND winner_entry_id IS NOT NULL))
  AND NOT EXISTS (SELECT 1 FROM social.dota_tournament_match_games WHERE match_id = match.id);
CREATE TABLE social.dota_tournament_match_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES social.dota_tournaments(id) ON DELETE CASCADE,
  bracket_kind VARCHAR(16) NOT NULL CHECK (bracket_kind IN ('MAIN','LOWER','BRONZE','GRAND_FINAL','RESET_FINAL')),
  round_offset INTEGER NOT NULL CHECK (round_offset BETWEEN 0 AND 14),
  match_number INTEGER NOT NULL CHECK (match_number BETWEEN 1 AND 128),
  best_of INTEGER NOT NULL DEFAULT 1 CHECK (best_of IN (1,3,5)),
  scheduled_at TIMESTAMPTZ(6),
  updated_by_user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX dota_tournament_match_plans_position_key
  ON social.dota_tournament_match_plans(tournament_id, bracket_kind, round_offset, match_number);
