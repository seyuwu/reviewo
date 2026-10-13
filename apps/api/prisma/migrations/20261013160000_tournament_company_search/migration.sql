ALTER TABLE social.dota_tournament_entries ADD COLUMN company_search_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE social.dota_tournament_entry_members ADD COLUMN company_consent_version VARCHAR(64);
ALTER TABLE social.dota_tournament_entry_requests ADD COLUMN source_entry_id UUID,
  ADD COLUMN source_roster JSONB;
ALTER TABLE social.dota_tournament_entry_requests ADD CONSTRAINT dota_tournament_company_source_fkey
  FOREIGN KEY (source_entry_id) REFERENCES social.dota_tournament_entries(id) ON DELETE CASCADE;
CREATE INDEX dota_tournament_entry_requests_source_entry_id_status_idx
  ON social.dota_tournament_entry_requests(source_entry_id, status);
