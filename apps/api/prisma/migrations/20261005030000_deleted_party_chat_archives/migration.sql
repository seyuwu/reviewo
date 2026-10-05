CREATE TABLE social.game_party_chat_archives (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  archived_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX game_party_chat_archives_archived_at_id_idx
  ON social.game_party_chat_archives (archived_at DESC, id DESC);
CREATE INDEX game_party_chat_archives_expires_at_idx
  ON social.game_party_chat_archives (expires_at);

CREATE TABLE social.game_party_archived_chat_messages (
  id UUID PRIMARY KEY,
  archive_id UUID NOT NULL REFERENCES social.game_party_chat_archives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX game_party_archived_chat_messages_archive_id_created_at_id_idx
  ON social.game_party_archived_chat_messages (archive_id, created_at DESC, id DESC);

-- Covers explicit deletion, expiration batches and FK cascades in one transaction.
-- Message insertion takes a FK lock on the party; deletion cannot miss committed messages.
CREATE FUNCTION social.archive_deleted_party_chat() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.vertical <> 'dota' OR OLD.merged_into_slug IS NOT NULL THEN
    RETURN OLD;
  END IF;
  -- Do not keep empty rooms or rooms containing only generated notices.
  IF NOT EXISTS (
    SELECT 1 FROM social.game_party_chat_messages WHERE party_id = OLD.id
      AND message NOT IN ('__system__:party_safety', '__system__:party_merged', '__system__:discord_voice_ready')
  ) THEN
    RETURN OLD;
  END IF;
  INSERT INTO social.game_party_chat_archives (id, name, archived_at, expires_at)
    VALUES (OLD.id, OLD.name, NOW(), NOW() + INTERVAL '72 hours');
  INSERT INTO social.game_party_archived_chat_messages (id, archive_id, user_id, display_name, message, created_at)
    SELECT m.id, OLD.id, m.user_id, COALESCE(u.display_name, 'Deleted user'), m.message, m.created_at
    FROM social.game_party_chat_messages m LEFT JOIN users.users u ON u.id = m.user_id
    WHERE m.party_id = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER archive_deleted_party_chat
  BEFORE DELETE ON social.game_parties
  FOR EACH ROW EXECUTE FUNCTION social.archive_deleted_party_chat();
