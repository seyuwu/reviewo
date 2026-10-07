ALTER TABLE social.dota_tournaments
  ADD COLUMN bracket_format VARCHAR(24) NOT NULL DEFAULT 'SINGLE_ELIMINATION'
  CHECK (bracket_format IN ('SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'));

DROP INDEX IF EXISTS social.dota_tournament_matches_tournament_round_match_key;
DROP INDEX IF EXISTS social.dota_tournament_matches_tournament_id_round_number_match_number_key;
CREATE UNIQUE INDEX dota_tournament_matches_bracket_round_match_key
  ON social.dota_tournament_matches(tournament_id, bracket_kind, round_number, match_number);
