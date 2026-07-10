CREATE TABLE community.recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  placement_type community.spotlight_placement_type NOT NULL,
  entity_id UUID NULL,
  top_id UUID NULL,
  pair_key TEXT NULL,
  pair_slug TEXT NULL,
  review_id UUID NULL REFERENCES reviews.reviews(id) ON DELETE SET NULL,
  message TEXT NULL,
  locale TEXT NOT NULL DEFAULT 'ru',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX community_recommendations_author_created_idx
  ON community.recommendations (author_id, created_at DESC);

CREATE INDEX community_recommendations_entity_created_idx
  ON community.recommendations (entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;

CREATE INDEX recommendations_locale_created_at_idx
  ON community.recommendations (locale, created_at DESC);

ALTER TABLE community.spotlight_placements
  ADD COLUMN recommendation_id UUID NULL REFERENCES community.recommendations(id) ON DELETE CASCADE;

DO $$
DECLARE
  placement_row RECORD;
  new_recommendation_id UUID;
BEGIN
  FOR placement_row IN
    SELECT id, user_id, placement_type, entity_id, top_id, pair_key, pair_slug, created_at
    FROM community.spotlight_placements
  LOOP
    INSERT INTO community.recommendations (
      author_id,
      placement_type,
      entity_id,
      top_id,
      pair_key,
      pair_slug,
      created_at
    )
    VALUES (
      placement_row.user_id,
      placement_row.placement_type,
      placement_row.entity_id,
      placement_row.top_id,
      placement_row.pair_key,
      placement_row.pair_slug,
      placement_row.created_at
    )
    RETURNING id INTO new_recommendation_id;

    UPDATE community.spotlight_placements
    SET recommendation_id = new_recommendation_id
    WHERE id = placement_row.id;
  END LOOP;
END $$;

UPDATE community.recommendations AS recommendation
SET locale = review.locale
FROM reviews.reviews AS review
WHERE recommendation.review_id = review.id;

UPDATE community.recommendations AS recommendation
SET locale = top.locale
FROM tops.tops AS top
WHERE recommendation.top_id = top.id;

UPDATE community.recommendations
SET locale = CASE
  WHEN message ~ '[а-яА-ЯёЁ]' THEN 'ru'
  ELSE 'en'
END
WHERE review_id IS NULL
  AND top_id IS NULL
  AND message IS NOT NULL
  AND length(trim(message)) > 0;

ALTER TABLE community.spotlight_placements
  ALTER COLUMN recommendation_id SET NOT NULL;

CREATE INDEX spotlight_placements_recommendation_idx
  ON community.spotlight_placements (recommendation_id, created_at DESC);

ALTER TABLE community.spotlight_placement_endorsements
  ADD COLUMN recommendation_id UUID NULL REFERENCES community.recommendations(id) ON DELETE CASCADE;

UPDATE community.spotlight_placement_endorsements AS endorsement
SET recommendation_id = placement.recommendation_id
FROM community.spotlight_placements AS placement
WHERE endorsement.placement_id = placement.id;

ALTER TABLE community.spotlight_placement_endorsements
  DROP CONSTRAINT spotlight_placement_endorsements_placement_id_fkey;

DROP INDEX IF EXISTS community.spotlight_placement_endorsements_unique_idx;
DROP INDEX IF EXISTS community.spotlight_placement_endorsements_placement_idx;

ALTER TABLE community.spotlight_placement_endorsements
  DROP COLUMN placement_id;

ALTER TABLE community.spotlight_placement_endorsements
  ALTER COLUMN recommendation_id SET NOT NULL;

CREATE UNIQUE INDEX recommendation_endorsements_unique_idx
  ON community.spotlight_placement_endorsements (recommendation_id, user_id);

CREATE INDEX recommendation_endorsements_recommendation_idx
  ON community.spotlight_placement_endorsements (recommendation_id);

ALTER TABLE community.spotlight_placement_endorsements
  RENAME TO recommendation_endorsements;
