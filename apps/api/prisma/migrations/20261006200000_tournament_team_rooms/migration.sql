ALTER TABLE social.dota_tournaments ADD COLUMN finished_at TIMESTAMPTZ(6);
UPDATE social.dota_tournaments SET finished_at = updated_at
WHERE status IN ('COMPLETED', 'CANCELLED');
CREATE INDEX dota_tournaments_status_finished_at_idx
  ON social.dota_tournaments(status, finished_at);

ALTER TABLE social.dota_tournament_entry_members ADD COLUMN room_left_at TIMESTAMPTZ(6);
UPDATE social.dota_tournament_entries AS entry SET created_by_user_id = party.owner_user_id
FROM social.game_parties AS party
WHERE entry.team_party_id = party.id AND entry.created_by_user_id IS NULL;

CREATE TABLE social.dota_tournament_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL UNIQUE REFERENCES social.dota_tournament_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  expires_at TIMESTAMPTZ(6),
  discord_channel_id VARCHAR(32),
  discord_invite_url VARCHAR(256),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX dota_tournament_rooms_expires_at_idx ON social.dota_tournament_rooms(expires_at);

CREATE TABLE social.dota_tournament_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES social.dota_tournament_rooms(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sender_user_id UUID REFERENCES users.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  sender_name VARCHAR(80) NOT NULL,
  body VARCHAR(10000) NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX dota_tournament_room_messages_room_id_created_at_id_idx
  ON social.dota_tournament_room_messages(room_id, created_at, id);

CREATE TABLE social.dota_tournament_room_voice_grants (
  room_id UUID NOT NULL REFERENCES social.dota_tournament_rooms(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id UUID NOT NULL,
  discord_user_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (room_id, user_id)
);
