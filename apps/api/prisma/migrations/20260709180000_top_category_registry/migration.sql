-- Platform TopCategory registry: upsert official categories, reassign orphans to "other", delete junk.

INSERT INTO tops.top_categories (slug, title, sort_order)
VALUES
  ('ai', 'AI', 1),
  ('programming', 'Programming', 2),
  ('devtools', 'Dev Tools', 3),
  ('open-source', 'Open Source', 4),
  ('tech', 'Tech', 5),
  ('productivity', 'Productivity', 6),
  ('mobile-apps', 'Mobile Apps', 7),
  ('hardware', 'Hardware', 8),
  ('games', 'Games', 9),
  ('roblox', 'Roblox', 10),
  ('movies', 'Movies', 11),
  ('tv-shows', 'TV Shows', 12),
  ('anime', 'Anime', 13),
  ('music', 'Music', 14),
  ('books', 'Books', 15),
  ('youtube', 'YouTube', 16),
  ('streaming', 'Streaming', 17),
  ('podcasts', 'Podcasts', 18),
  ('food', 'Food', 19),
  ('travel', 'Travel', 20),
  ('places', 'Places', 21),
  ('sports', 'Sports', 22),
  ('fashion', 'Fashion', 23),
  ('beauty', 'Beauty', 24),
  ('health', 'Health', 25),
  ('parenting', 'Parenting', 26),
  ('pets', 'Pets', 27),
  ('photography', 'Photography', 28),
  ('companies', 'Companies', 29),
  ('startups', 'Startups', 30),
  ('finance', 'Finance', 31),
  ('crypto', 'Crypto', 32),
  ('ecommerce', 'E-commerce', 33),
  ('news', 'News', 34),
  ('education', 'Education', 35),
  ('universities', 'Universities', 36),
  ('science', 'Science', 37),
  ('history', 'History', 38),
  ('people', 'People', 39),
  ('design', 'Design', 40),
  ('sites', 'Sites', 41),
  ('social-media', 'Social Media', 42),
  ('other', 'Other', 43)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order;

UPDATE tops.tops
SET category_id = (SELECT id FROM tops.top_categories WHERE slug = 'other')
WHERE category_id IN (
  SELECT id FROM tops.top_categories
  WHERE slug NOT IN (
    'ai', 'programming', 'devtools', 'open-source', 'tech', 'productivity', 'mobile-apps', 'hardware',
    'games', 'roblox', 'movies', 'tv-shows', 'anime', 'music', 'books', 'youtube', 'streaming', 'podcasts',
    'food', 'travel', 'places', 'sports', 'fashion', 'beauty', 'health', 'parenting', 'pets', 'photography',
    'companies', 'startups', 'finance', 'crypto', 'ecommerce', 'news', 'education', 'universities',
    'science', 'history', 'people', 'design', 'sites', 'social-media', 'other'
  )
);

DELETE FROM tops.top_categories
WHERE slug NOT IN (
  'ai', 'programming', 'devtools', 'open-source', 'tech', 'productivity', 'mobile-apps', 'hardware',
  'games', 'roblox', 'movies', 'tv-shows', 'anime', 'music', 'books', 'youtube', 'streaming', 'podcasts',
  'food', 'travel', 'places', 'sports', 'fashion', 'beauty', 'health', 'parenting', 'pets', 'photography',
  'companies', 'startups', 'finance', 'crypto', 'ecommerce', 'news', 'education', 'universities',
  'science', 'history', 'people', 'design', 'sites', 'social-media', 'other'
);
