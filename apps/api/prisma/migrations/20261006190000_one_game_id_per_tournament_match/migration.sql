WITH ranked_game_ids AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY created_at DESC, id DESC) AS row_number
  FROM social.dota_tournament_match_games
)
DELETE FROM social.dota_tournament_match_games AS games
USING ranked_game_ids
WHERE games.id = ranked_game_ids.id
  AND ranked_game_ids.row_number > 1;

DROP INDEX IF EXISTS social.dota_tournament_match_games_match_id_created_at_idx;
CREATE UNIQUE INDEX dota_tournament_match_games_match_id_key
  ON social.dota_tournament_match_games(match_id);
