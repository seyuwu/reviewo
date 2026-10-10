-- Bring currently active Dota parties up to six hours from creation.
-- Keep existing longer extensions and leave expired parties and teams alone.
WITH extended AS (
  UPDATE social.game_parties
  SET expires_at = created_at + interval '6 hours',
      discord_voice_expires_at = CASE
        WHEN discord_channel_id IS NOT NULL
          THEN GREATEST(discord_voice_expires_at, created_at + interval '6 hours')
        ELSE discord_voice_expires_at
      END,
      -- The previous Discord invite may still expire at the old party deadline.
      -- Opening voice again will issue a fresh invite for its remaining lifetime.
      discord_invite_url = CASE
        WHEN discord_channel_id IS NOT NULL THEN NULL
        ELSE discord_invite_url
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE vertical = 'dota'
    AND kind = 'PARTY'
    AND merged_into_slug IS NULL
    AND expires_at > CURRENT_TIMESTAMP
    AND expires_at < created_at + interval '6 hours'
  RETURNING slug, expires_at
)
UPDATE social.game_parties AS alias
SET expires_at = extended.expires_at,
    updated_at = CURRENT_TIMESTAMP
FROM extended
WHERE alias.vertical = 'dota'
  AND alias.kind = 'PARTY'
  AND alias.merged_into_slug = extended.slug
  AND alias.expires_at > CURRENT_TIMESTAMP
  AND alias.expires_at < extended.expires_at;
