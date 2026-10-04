CREATE TYPE social.dota_tournament_status AS ENUM (
  'DRAFT',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE social.dota_tournament_entry_status AS ENUM (
  'REGISTERED',
  'WITHDRAWN',
  'DISQUALIFIED'
);

CREATE TYPE social.dota_tournament_entry_request_status AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN'
);

CREATE TABLE social.dota_tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  format VARCHAR(80),
  rules_url VARCHAR(500),
  starts_at TIMESTAMPTZ(6),
  registration_closes_at TIMESTAMPTZ(6),
  max_teams INTEGER,
  status social.dota_tournament_status NOT NULL DEFAULT 'DRAFT',
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT dota_tournaments_pkey PRIMARY KEY (id),
  CONSTRAINT dota_tournaments_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users.users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE social.dota_tournament_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  team_party_id UUID,
  team_name_snapshot VARCHAR(80) NOT NULL,
  team_slug_snapshot VARCHAR(120) NOT NULL,
  join_mode social.game_party_join_mode NOT NULL DEFAULT 'CONFIRM',
  status social.dota_tournament_entry_status NOT NULL DEFAULT 'REGISTERED',
  created_by_user_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT dota_tournament_entries_pkey PRIMARY KEY (id),
  CONSTRAINT dota_tournament_entries_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES social.dota_tournaments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_entries_team_party_id_fkey
    FOREIGN KEY (team_party_id) REFERENCES social.game_parties(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_entries_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users.users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE social.dota_tournament_entry_members (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  entry_id UUID NOT NULL,
  user_id UUID,
  display_name VARCHAR(80) NOT NULL,
  dota_profile_slug VARCHAR(120),
  mmr INTEGER,
  position_role VARCHAR(8),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dota_tournament_entry_members_pkey PRIMARY KEY (id),
  CONSTRAINT dota_tournament_entry_members_entry_id_fkey
    FOREIGN KEY (entry_id) REFERENCES social.dota_tournament_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_entry_members_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES social.dota_tournaments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_entry_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_entry_members_position_role_check
    CHECK (position_role IS NULL OR position_role IN ('1', '2', '3', '4', '5')),
  CONSTRAINT dota_tournament_entry_members_mmr_check
    CHECK (mmr IS NULL OR mmr >= 0)
);

CREATE TABLE social.dota_tournament_entry_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  entry_id UUID NOT NULL,
  user_id UUID NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  dota_profile_slug VARCHAR(120),
  mmr INTEGER,
  position_role VARCHAR(8) NOT NULL,
  status social.dota_tournament_entry_request_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT dota_tournament_entry_requests_pkey PRIMARY KEY (id),
  CONSTRAINT dota_tournament_entry_requests_entry_id_fkey
    FOREIGN KEY (entry_id) REFERENCES social.dota_tournament_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_entry_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_entry_requests_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES social.dota_tournaments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT dota_tournament_entry_requests_position_role_check
    CHECK (position_role IN ('1', '2', '3', '4', '5')),
  CONSTRAINT dota_tournament_entry_requests_mmr_check
    CHECK (mmr IS NULL OR mmr >= 0)
);

CREATE UNIQUE INDEX dota_tournaments_slug_key ON social.dota_tournaments(slug);
CREATE INDEX dota_tournaments_status_registration_closes_at_idx
  ON social.dota_tournaments(status, registration_closes_at);
CREATE UNIQUE INDEX dota_tournament_entries_tournament_id_team_party_id_key
  ON social.dota_tournament_entries(tournament_id, team_party_id);
CREATE INDEX dota_tournament_entries_tournament_id_status_created_at_idx
  ON social.dota_tournament_entries(tournament_id, status, created_at);
CREATE INDEX dota_tournament_entries_team_party_id_status_idx
  ON social.dota_tournament_entries(team_party_id, status);
CREATE UNIQUE INDEX dota_tournament_entry_members_entry_id_user_id_key
  ON social.dota_tournament_entry_members(entry_id, user_id);
CREATE INDEX dota_tournament_entry_members_tournament_id_is_active_idx
  ON social.dota_tournament_entry_members(tournament_id, is_active);
CREATE INDEX dota_tournament_entry_members_user_id_idx
  ON social.dota_tournament_entry_members(user_id);
CREATE UNIQUE INDEX dota_tournament_entry_members_one_active_user_per_tournament_idx
  ON social.dota_tournament_entry_members(tournament_id, user_id)
  WHERE is_active AND user_id IS NOT NULL;
CREATE UNIQUE INDEX dota_tournament_entry_members_one_active_role_idx
  ON social.dota_tournament_entry_members(entry_id, position_role)
  WHERE is_active AND position_role IS NOT NULL;
CREATE UNIQUE INDEX dota_tournament_entry_requests_entry_id_user_id_key
  ON social.dota_tournament_entry_requests(entry_id, user_id);
CREATE INDEX dota_tournament_entry_requests_tournament_id_status_created_at_idx
  ON social.dota_tournament_entry_requests(tournament_id, status, created_at);
CREATE INDEX dota_tournament_entry_requests_user_id_status_idx
  ON social.dota_tournament_entry_requests(user_id, status);
CREATE UNIQUE INDEX dota_tournament_entry_requests_one_pending_per_tournament_idx
  ON social.dota_tournament_entry_requests(tournament_id, user_id)
  WHERE status = 'PENDING';
