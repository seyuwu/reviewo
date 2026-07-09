CREATE SCHEMA IF NOT EXISTS contributions;

ALTER TABLE entities.entities ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE TYPE contributions.contribution_type AS ENUM (
    'UPDATE_NAME',
    'UPDATE_URL',
    'UPDATE_DESCRIPTION',
    'UPDATE_LOGO',
    'UPDATE_TYPE',
    'MERGE_ENTITY'
);

CREATE TYPE contributions.contribution_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'APPLIED',
    'SUPERSEDED'
);

CREATE TYPE contributions.contribution_tier AS ENUM ('AUTO', 'MODERATION');

CREATE TYPE contributions.contribution_vote_kind AS ENUM ('APPROVE', 'REJECT');

CREATE TYPE contributions.field_provenance_source AS ENUM ('community', 'author', 'system');

CREATE TABLE contributions.entity_contributions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    author_id UUID NOT NULL,
    type contributions.contribution_type NOT NULL,
    payload JSONB NOT NULL,
    status contributions.contribution_status NOT NULL DEFAULT 'PENDING',
    tier contributions.contribution_tier NOT NULL,
    approvals_weight DECIMAL(8, 3) NOT NULL DEFAULT 0,
    rejections_weight DECIMAL(8, 3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ(6),
    applied_at TIMESTAMPTZ(6),
    resolved_by UUID,

    CONSTRAINT entity_contributions_pkey PRIMARY KEY (id),
    CONSTRAINT entity_contributions_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES entities.entities(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT entity_contributions_author_id_fkey FOREIGN KEY (author_id) REFERENCES users.users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX entity_contributions_entity_id_status_idx ON contributions.entity_contributions (entity_id, status);
CREATE INDEX entity_contributions_author_id_idx ON contributions.entity_contributions (author_id);
CREATE INDEX entity_contributions_type_status_idx ON contributions.entity_contributions (type, status);

CREATE TABLE contributions.contribution_votes (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    contribution_id UUID NOT NULL,
    voter_id UUID NOT NULL,
    kind contributions.contribution_vote_kind NOT NULL,
    weight DECIMAL(4, 3) NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT contribution_votes_pkey PRIMARY KEY (id),
    CONSTRAINT contribution_votes_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES contributions.entity_contributions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT contribution_votes_voter_id_fkey FOREIGN KEY (voter_id) REFERENCES users.users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX contribution_votes_contribution_id_voter_id_key ON contributions.contribution_votes (contribution_id, voter_id);
CREATE INDEX contribution_votes_voter_id_idx ON contributions.contribution_votes (voter_id);

CREATE TABLE contributions.contribution_policies (
    type contributions.contribution_type NOT NULL,
    tier contributions.contribution_tier NOT NULL,
    base_approve_weight DECIMAL(6, 3) NOT NULL,
    base_reject_weight DECIMAL(6, 3) NOT NULL,
    activity_scale BOOLEAN NOT NULL DEFAULT false,
    min_unique_voters INTEGER NOT NULL DEFAULT 2,
    cooldown_hours INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT contribution_policies_pkey PRIMARY KEY (type)
);

CREATE TABLE contributions.entity_field_provenance (
    entity_id UUID NOT NULL,
    field TEXT NOT NULL,
    source contributions.field_provenance_source NOT NULL,
    contribution_id UUID,
    confirmed_at TIMESTAMPTZ(6) NOT NULL,
    voters_count INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT entity_field_provenance_pkey PRIMARY KEY (entity_id, field),
    CONSTRAINT entity_field_provenance_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES entities.entities(id) ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO contributions.contribution_policies (type, tier, base_approve_weight, base_reject_weight, activity_scale, min_unique_voters, cooldown_hours)
VALUES
    ('UPDATE_DESCRIPTION', 'AUTO', 2.0, 2.0, true, 2, 0),
    ('UPDATE_NAME', 'AUTO', 3.0, 2.0, true, 2, 0),
    ('UPDATE_URL', 'AUTO', 2.0, 2.0, false, 2, 0),
    ('UPDATE_LOGO', 'MODERATION', 1.0, 2.0, false, 1, 0),
    ('UPDATE_TYPE', 'MODERATION', 1.0, 2.0, false, 1, 0),
    ('MERGE_ENTITY', 'MODERATION', 1.0, 2.0, false, 1, 0)
ON CONFLICT (type) DO NOTHING;
