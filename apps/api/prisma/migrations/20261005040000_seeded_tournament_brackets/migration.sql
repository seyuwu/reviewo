ALTER TABLE social.dota_tournaments
  ADD COLUMN automatic_bracket BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN bracket_generated_at TIMESTAMPTZ(6),
  ADD COLUMN bracket_size INTEGER;
-- Preserve existing manually operated events; new tournaments use automatic brackets.
ALTER TABLE social.dota_tournaments ALTER COLUMN automatic_bracket SET DEFAULT true;
CREATE INDEX dota_tournaments_automatic_bracket_status_starts_at_idx
  ON social.dota_tournaments(automatic_bracket, status, starts_at);
ALTER TABLE social.dota_tournament_matches
  ADD COLUMN bracket_kind VARCHAR(16) NOT NULL DEFAULT 'MANUAL';
-- Unstarted events with no assigned matches can adopt the new default safely.
UPDATE social.dota_tournaments AS tournament
SET automatic_bracket = true
WHERE status IN ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED')
  AND NOT EXISTS (
    SELECT 1 FROM social.dota_tournament_matches AS match
    WHERE match.tournament_id = tournament.id
  );
CREATE TABLE social.dota_tournament_bracket_seeds (
  id UUID PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES social.dota_tournaments(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL UNIQUE REFERENCES social.dota_tournament_entries(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL CHECK (seed BETWEEN 1 AND 256),
  average_mmr DOUBLE PRECISION,
  UNIQUE(tournament_id, seed)
);
