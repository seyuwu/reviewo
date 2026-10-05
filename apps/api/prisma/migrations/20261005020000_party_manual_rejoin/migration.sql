-- Existing blocks do not distinguish kicks from voluntary leaves: retain their restrictions.
ALTER TABLE social.game_party_join_blocks
ADD COLUMN allow_manual_rejoin BOOLEAN NOT NULL DEFAULT FALSE;
