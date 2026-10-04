CREATE TYPE social.dota_tournament_match_status AS ENUM (
  'SCHEDULED',
  'LOBBY_CONFIRMATION',
  'READY',
  'IN_PROGRESS',
  'RESULT_CONFIRMATION',
  'DISPUTED',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE social.dota_tournaments
  ADD COLUMN game_mode VARCHAR(32) NOT NULL DEFAULT 'ALL_PICK',
  ADD COLUMN server_region VARCHAR(32) NOT NULL DEFAULT 'EUROPE',
  ADD COLUMN allow_spectators BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN cheats_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE social.dota_tournament_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  entry_a_id UUID NOT NULL,
  entry_b_id UUID NOT NULL,
  round_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  scheduled_at TIMESTAMPTZ(6) NOT NULL,
  status social.dota_tournament_match_status NOT NULL DEFAULT 'SCHEDULED',
  game_mode VARCHAR(32) NOT NULL,
  server_region VARCHAR(32) NOT NULL,
  allow_spectators BOOLEAN NOT NULL DEFAULT FALSE,
  cheats_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  host_side VARCHAR(1) NOT NULL DEFAULT 'A',
  lobby_name VARCHAR(120),
  lobby_password VARCHAR(120),
  lobby_proof_url VARCHAR(500),
  lobby_submitted_by_user_id UUID,
  lobby_submitted_at TIMESTAMPTZ(6),
  settings_confirmed_by_user_id UUID,
  settings_confirmed_at TIMESTAMPTZ(6),
  started_at TIMESTAMPTZ(6),
  reported_winner_entry_id UUID,
  result_reported_by_user_id UUID,
  result_reported_at TIMESTAMPTZ(6),
  result_confirmed_by_user_id UUID,
  result_confirmed_at TIMESTAMPTZ(6),
  result_evidence_url VARCHAR(500),
  stream_url VARCHAR(500),
  dispute_reason VARCHAR(1000),
  winner_entry_id UUID,
  resolution_note VARCHAR(1000),
  resolved_by_user_id UUID,
  resolved_at TIMESTAMPTZ(6),
  lobby_deadline_at TIMESTAMPTZ(6) NOT NULL,
  confirmation_deadline_at TIMESTAMPTZ(6),
  result_deadline_at TIMESTAMPTZ(6),
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT dota_tournament_matches_pkey PRIMARY KEY (id),
  CONSTRAINT dota_tournament_matches_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES social.dota_tournaments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_matches_entry_a_id_fkey
    FOREIGN KEY (entry_a_id) REFERENCES social.dota_tournament_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_matches_entry_b_id_fkey
    FOREIGN KEY (entry_b_id) REFERENCES social.dota_tournament_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_matches_distinct_entries_check CHECK (entry_a_id <> entry_b_id),
  CONSTRAINT dota_tournament_matches_round_number_check CHECK (round_number > 0),
  CONSTRAINT dota_tournament_matches_match_number_check CHECK (match_number > 0),
  CONSTRAINT dota_tournament_matches_host_side_check CHECK (host_side IN ('A', 'B'))
);

CREATE UNIQUE INDEX dota_tournament_matches_tournament_round_match_key
  ON social.dota_tournament_matches(tournament_id, round_number, match_number);
CREATE INDEX dota_tournament_matches_tournament_scheduled_idx
  ON social.dota_tournament_matches(tournament_id, scheduled_at);
CREATE INDEX dota_tournament_matches_status_lobby_deadline_idx
  ON social.dota_tournament_matches(status, lobby_deadline_at);
CREATE INDEX dota_tournament_matches_status_confirmation_deadline_idx
  ON social.dota_tournament_matches(status, confirmation_deadline_at);
CREATE INDEX dota_tournament_matches_status_result_deadline_idx
  ON social.dota_tournament_matches(status, result_deadline_at);
