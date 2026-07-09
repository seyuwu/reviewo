CREATE TABLE entities.entity_clusters (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT entity_clusters_pkey PRIMARY KEY (id)
);

CREATE TABLE entities.entity_cluster_members (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL,
    entity_id UUID NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT entity_cluster_members_pkey PRIMARY KEY (id),
    CONSTRAINT entity_cluster_members_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES entities.entity_clusters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT entity_cluster_members_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES entities.entities(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX entity_cluster_members_entity_id_key ON entities.entity_cluster_members (entity_id);
CREATE INDEX entity_cluster_members_cluster_id_idx ON entities.entity_cluster_members (cluster_id);

ALTER TYPE contributions.contribution_type ADD VALUE IF NOT EXISTS 'LINK_ENTITY';

INSERT INTO contributions.contribution_policies (type, tier, base_approve_weight, base_reject_weight, activity_scale, min_unique_voters, cooldown_hours)
VALUES ('LINK_ENTITY', 'MODERATION', 1.0, 2.0, false, 1, 0)
ON CONFLICT (type) DO NOTHING;
