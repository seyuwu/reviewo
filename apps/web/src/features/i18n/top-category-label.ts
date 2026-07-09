import type { MessageKey, TranslateFn } from "@reviewo/i18n";

export const TOP_CATEGORY_SLUGS = [
  "ai",
  "programming",
  "devtools",
  "open-source",
  "tech",
  "productivity",
  "mobile-apps",
  "hardware",
  "games",
  "roblox",
  "movies",
  "tv-shows",
  "anime",
  "music",
  "books",
  "youtube",
  "streaming",
  "podcasts",
  "food",
  "travel",
  "places",
  "sports",
  "fashion",
  "beauty",
  "health",
  "parenting",
  "pets",
  "photography",
  "companies",
  "startups",
  "finance",
  "crypto",
  "ecommerce",
  "news",
  "education",
  "universities",
  "science",
  "history",
  "people",
  "design",
  "sites",
  "social-media",
  "other"
] as const;

export type TopCategorySlug = (typeof TOP_CATEGORY_SLUGS)[number];

const TOP_CATEGORY_LABEL_KEYS: Record<TopCategorySlug, MessageKey> = {
  ai: "web.userTops.categories.ai",
  anime: "web.userTops.categories.anime",
  beauty: "web.userTops.categories.beauty",
  books: "web.userTops.categories.books",
  companies: "web.userTops.categories.companies",
  crypto: "web.userTops.categories.crypto",
  design: "web.userTops.categories.design",
  devtools: "web.userTops.categories.devtools",
  ecommerce: "web.userTops.categories.ecommerce",
  education: "web.userTops.categories.education",
  fashion: "web.userTops.categories.fashion",
  finance: "web.userTops.categories.finance",
  food: "web.userTops.categories.food",
  games: "web.userTops.categories.games",
  hardware: "web.userTops.categories.hardware",
  health: "web.userTops.categories.health",
  history: "web.userTops.categories.history",
  "mobile-apps": "web.userTops.categories.mobile-apps",
  movies: "web.userTops.categories.movies",
  music: "web.userTops.categories.music",
  news: "web.userTops.categories.news",
  "open-source": "web.userTops.categories.open-source",
  other: "web.userTops.categories.other",
  parenting: "web.userTops.categories.parenting",
  people: "web.userTops.categories.people",
  pets: "web.userTops.categories.pets",
  photography: "web.userTops.categories.photography",
  places: "web.userTops.categories.places",
  podcasts: "web.userTops.categories.podcasts",
  productivity: "web.userTops.categories.productivity",
  programming: "web.userTops.categories.programming",
  roblox: "web.userTops.categories.roblox",
  science: "web.userTops.categories.science",
  sites: "web.userTops.categories.sites",
  "social-media": "web.userTops.categories.social-media",
  sports: "web.userTops.categories.sports",
  startups: "web.userTops.categories.startups",
  streaming: "web.userTops.categories.streaming",
  tech: "web.userTops.categories.tech",
  travel: "web.userTops.categories.travel",
  "tv-shows": "web.userTops.categories.tv-shows",
  universities: "web.userTops.categories.universities",
  youtube: "web.userTops.categories.youtube"
};

export function isKnownTopCategorySlug(slug: string): slug is TopCategorySlug {
  return slug in TOP_CATEGORY_LABEL_KEYS;
}

export function formatTopCategoryLabel(
  t: TranslateFn,
  slug: string,
  fallbackTitle?: string | null
): string {
  if (isKnownTopCategorySlug(slug)) {
    return t(TOP_CATEGORY_LABEL_KEYS[slug]);
  }

  return fallbackTitle?.trim() || slug;
}
