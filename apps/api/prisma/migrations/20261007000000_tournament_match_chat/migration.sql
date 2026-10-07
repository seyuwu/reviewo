CREATE TABLE social.dota_tournament_match_chat_messages (
  id uuid PRIMARY KEY, match_id uuid NOT NULL REFERENCES social.dota_tournament_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, display_name varchar(200) NOT NULL, message varchar(4000) NOT NULL,
  mentions jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dota_match_chat_messages_history_idx ON social.dota_tournament_match_chat_messages(match_id, created_at DESC, id DESC);
CREATE TABLE social.dota_tournament_match_chat_mentions (
  id uuid PRIMARY KEY, message_id uuid NOT NULL REFERENCES social.dota_tournament_match_chat_messages(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, target_user_id)
);
CREATE INDEX dota_match_chat_mentions_inbox_idx ON social.dota_tournament_match_chat_mentions(target_user_id, read_at, created_at DESC);
CREATE TABLE social.dota_tournament_match_mention_cooldowns (
  match_id uuid NOT NULL REFERENCES social.dota_tournament_matches(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL, notified_at timestamptz NOT NULL,
  PRIMARY KEY(match_id, target_user_id)
);
