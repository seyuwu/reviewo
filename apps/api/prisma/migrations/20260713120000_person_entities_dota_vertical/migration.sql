-- Person entities, attributes, and quality confirmations for Dota vertical

ALTER TABLE entities.entities
  ADD COLUMN owner_user_id UUID;

CREATE UNIQUE INDEX entities_owner_user_id_unique
  ON entities.entities (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX entities_owner_user_id_idx ON entities.entities (owner_user_id);

CREATE TABLE entities.entity_attributes (
  entity_id UUID NOT NULL REFERENCES entities.entities (id) ON DELETE CASCADE,
  key VARCHAR(64) NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_id, key)
);

CREATE INDEX entity_attributes_key_value_idx
  ON entities.entity_attributes (key, value);

CREATE UNIQUE INDEX entity_attributes_dota_account_id_unique
  ON entities.entity_attributes (value)
  WHERE key = 'dota_account_id';

CREATE TABLE entities.entity_quality_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities.entities (id) ON DELETE CASCADE,
  quality_key VARCHAR(64) NOT NULL,
  confirmer_key VARCHAR(128) NOT NULL,
  voter_user_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT entity_quality_confirmations_unique UNIQUE (entity_id, quality_key, confirmer_key)
);

CREATE INDEX entity_quality_confirmations_entity_id_idx
  ON entities.entity_quality_confirmations (entity_id);

CREATE INDEX entity_quality_confirmations_confirmer_key_idx
  ON entities.entity_quality_confirmations (confirmer_key);
