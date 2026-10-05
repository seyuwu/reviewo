-- All Dota profiles use EU while region selection is disabled.
-- Includes profiles created on the website without a region attribute.
INSERT INTO entities.entity_attributes AS attributes (entity_id, key, value, updated_at)
SELECT entity_id, 'server', 'EU', CURRENT_TIMESTAMP
FROM entities.entity_attributes
WHERE key = 'vertical' AND value = 'dota'
ON CONFLICT (entity_id, key) DO UPDATE
SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
WHERE attributes.value IS DISTINCT FROM EXCLUDED.value;
