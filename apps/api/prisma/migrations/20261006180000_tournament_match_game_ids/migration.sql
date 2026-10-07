CREATE TABLE social.dota_tournament_match_games (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  dota_match_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dota_tournament_match_games_pkey PRIMARY KEY (id),
  CONSTRAINT dota_tournament_match_games_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES social.dota_tournament_matches(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX dota_tournament_match_games_dota_match_id_key
  ON social.dota_tournament_match_games(dota_match_id);
CREATE INDEX dota_tournament_match_games_match_id_created_at_idx
  ON social.dota_tournament_match_games(match_id, created_at);
