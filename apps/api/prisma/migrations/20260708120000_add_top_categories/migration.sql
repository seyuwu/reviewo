CREATE TABLE tops.top_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL,

    CONSTRAINT top_categories_pkey PRIMARY KEY (id),
    CONSTRAINT top_categories_title_not_blank_check CHECK (length(btrim(title)) > 0),
    CONSTRAINT top_categories_slug_not_blank_check CHECK (length(btrim(slug)) > 0)
);

CREATE UNIQUE INDEX top_categories_slug_key ON tops.top_categories (slug);
CREATE INDEX top_categories_sort_order_idx ON tops.top_categories (sort_order);

ALTER TABLE tops.tops
    ADD COLUMN category_id UUID;

ALTER TABLE tops.tops
    ADD CONSTRAINT tops_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES tops.top_categories(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX tops_category_id_idx ON tops.tops (category_id);
