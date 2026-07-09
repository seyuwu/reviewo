CREATE TABLE tops.system_top_snapshots (
    definition_slug TEXT NOT NULL,
    computed_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    items JSONB NOT NULL,

    CONSTRAINT system_top_snapshots_pkey PRIMARY KEY (definition_slug, computed_at)
);

CREATE INDEX system_top_snapshots_definition_slug_computed_at_idx
    ON tops.system_top_snapshots (definition_slug, computed_at DESC);
