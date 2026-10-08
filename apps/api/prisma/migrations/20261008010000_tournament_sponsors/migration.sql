CREATE TABLE social.dota_tournament_sponsors (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    logo_url VARCHAR(1000),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT dota_tournament_sponsors_pkey PRIMARY KEY (id),
    CONSTRAINT dota_tournament_sponsors_tournament_id_fkey
      FOREIGN KEY (tournament_id) REFERENCES social.dota_tournaments(id)
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX dota_tournament_sponsors_tournament_id_sort_order_idx
  ON social.dota_tournament_sponsors(tournament_id, sort_order);

CREATE TABLE social.dota_tournament_sponsor_clicks (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL,
    sponsor_id UUID NOT NULL,
    user_id UUID NOT NULL,
    clicked_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT dota_tournament_sponsor_clicks_pkey PRIMARY KEY (id),
    CONSTRAINT dota_tournament_sponsor_clicks_tournament_id_user_id_key
      UNIQUE (tournament_id, user_id),
    CONSTRAINT dota_tournament_sponsor_clicks_tournament_id_fkey
      FOREIGN KEY (tournament_id) REFERENCES social.dota_tournaments(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT dota_tournament_sponsor_clicks_sponsor_id_fkey
      FOREIGN KEY (sponsor_id) REFERENCES social.dota_tournament_sponsors(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT dota_tournament_sponsor_clicks_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users.users(id)
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX dota_tournament_sponsor_clicks_sponsor_id_clicked_at_idx
  ON social.dota_tournament_sponsor_clicks(sponsor_id, clicked_at);
