CREATE TYPE tops.top_comment_visibility AS ENUM ('ACTIVE', 'HIDDEN');

CREATE TABLE tops.top_likes (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    top_id UUID NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT top_likes_pkey PRIMARY KEY (id),
    CONSTRAINT top_likes_top_id_fkey FOREIGN KEY (top_id) REFERENCES tops.tops(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT top_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users.users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX top_likes_top_id_user_id_key ON tops.top_likes (top_id, user_id);
CREATE INDEX top_likes_top_id_idx ON tops.top_likes (top_id);
CREATE INDEX top_likes_user_id_idx ON tops.top_likes (user_id);

CREATE TABLE tops.top_views (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    top_id UUID NOT NULL,
    viewer_key TEXT NOT NULL,
    user_id UUID,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT top_views_pkey PRIMARY KEY (id),
    CONSTRAINT top_views_top_id_fkey FOREIGN KEY (top_id) REFERENCES tops.tops(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT top_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES users.users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX top_views_top_id_viewer_key_key ON tops.top_views (top_id, viewer_key);
CREATE INDEX top_views_top_id_idx ON tops.top_views (top_id);

CREATE TABLE tops.top_comments (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    top_id UUID NOT NULL,
    author_id UUID NOT NULL,
    text TEXT NOT NULL,
    visibility tops.top_comment_visibility NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT top_comments_pkey PRIMARY KEY (id),
    CONSTRAINT top_comments_text_not_blank_check CHECK (length(btrim(text)) > 0),
    CONSTRAINT top_comments_text_length_check CHECK (length(text) <= 2000),
    CONSTRAINT top_comments_top_id_fkey FOREIGN KEY (top_id) REFERENCES tops.tops(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT top_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users.users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX top_comments_top_id_idx ON tops.top_comments (top_id);
CREATE INDEX top_comments_author_id_idx ON tops.top_comments (author_id);
CREATE INDEX top_comments_visibility_idx ON tops.top_comments (visibility);
