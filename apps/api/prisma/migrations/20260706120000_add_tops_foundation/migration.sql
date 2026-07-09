CREATE SCHEMA IF NOT EXISTS tops;

CREATE TYPE tops.top_visibility AS ENUM ('ACTIVE', 'HIDDEN');
CREATE TYPE tops.top_rank_mode AS ENUM ('MANUAL', 'SYSTEM', 'HYBRID');
CREATE TYPE tops.top_system_sort_key AS ENUM ('RATING', 'POPULARITY', 'TRENDING', 'RELIABILITY');

CREATE TABLE tops.tops (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    author_id UUID NOT NULL,
    forked_from_id UUID,
    visibility tops.top_visibility NOT NULL DEFAULT 'ACTIVE',
    rank_mode tops.top_rank_mode NOT NULL DEFAULT 'MANUAL',
    system_sort_key tops.top_system_sort_key,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT tops_pkey PRIMARY KEY (id),
    CONSTRAINT tops_title_not_blank_check CHECK (length(btrim(title)) > 0),
    CONSTRAINT tops_author_id_fkey FOREIGN KEY (author_id) REFERENCES users.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT tops_forked_from_id_fkey FOREIGN KEY (forked_from_id) REFERENCES tops.tops(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX tops_slug_key ON tops.tops (slug);
CREATE INDEX tops_author_id_idx ON tops.tops (author_id);
CREATE INDEX tops_forked_from_id_idx ON tops.tops (forked_from_id);
CREATE INDEX tops_visibility_idx ON tops.tops (visibility);
CREATE INDEX tops_rank_mode_idx ON tops.tops (rank_mode);

CREATE TABLE tops.top_items (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    top_id UUID NOT NULL,
    entity_id UUID NOT NULL,
    position INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT top_items_pkey PRIMARY KEY (id),
    CONSTRAINT top_items_position_positive_check CHECK (position > 0),
    CONSTRAINT top_items_note_length_check CHECK (note IS NULL OR length(note) <= 280),
    CONSTRAINT top_items_top_id_fkey FOREIGN KEY (top_id) REFERENCES tops.tops(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT top_items_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES entities.entities(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX top_items_top_id_entity_id_key ON tops.top_items (top_id, entity_id);
CREATE UNIQUE INDEX top_items_top_id_position_key ON tops.top_items (top_id, position);
CREATE INDEX top_items_entity_id_idx ON tops.top_items (entity_id);
