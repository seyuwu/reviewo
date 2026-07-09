import type { EntityType } from "#prisma/client";

export type SystemTopSort = "composite" | "rating" | "reliability" | "votes";

export interface SystemTopDefinitionFilters {
  entityTypes?: EntityType[];
  parentId?: string | null;
}

export interface SystemTopDefinition {
  description: string;
  filters: SystemTopDefinitionFilters;
  limit: number;
  minVotes: number;
  slug: string;
  sort: SystemTopSort;
  title: string;
}

export const SYSTEM_TOP_DEFINITIONS: SystemTopDefinition[] = [
  {
    description: "Лучшие AI-инструменты по композитному рейтингу Opinia.",
    filters: {
      entityTypes: ["product", "website"]
    },
    limit: 20,
    minVotes: 5,
    slug: "ai-tools",
    sort: "composite",
    title: "AI Tools"
  },
  {
    description: "Топ игр по оценкам сообщества.",
    filters: {
      entityTypes: ["game"]
    },
    limit: 20,
    minVotes: 5,
    slug: "games",
    sort: "composite",
    title: "Games"
  },
  {
    description: "Популярные Roblox-игры по рейтингу Opinia.",
    filters: {
      entityTypes: ["game"]
    },
    limit: 20,
    minVotes: 3,
    slug: "roblox-games",
    sort: "composite",
    title: "Roblox Games"
  },
  {
    description: "Лучшие корневые сайты по надёжности Opinia.",
    filters: {
      entityTypes: ["website"],
      parentId: null
    },
    limit: 20,
    minVotes: 5,
    slug: "sites",
    sort: "reliability",
    title: "Sites"
  },
  {
    description: "Топ компаний по композитному рейтингу.",
    filters: {
      entityTypes: ["company"]
    },
    limit: 20,
    minVotes: 5,
    slug: "companies",
    sort: "composite",
    title: "Companies"
  },
  {
    description: "Лучшие фильмы по оценкам сообщества.",
    filters: {
      entityTypes: ["movie"]
    },
    limit: 20,
    minVotes: 5,
    slug: "movies",
    sort: "composite",
    title: "Movies"
  },
  {
    description: "Лучшие книги по композитному рейтингу.",
    filters: {
      entityTypes: ["book"]
    },
    limit: 20,
    minVotes: 5,
    slug: "books",
    sort: "composite",
    title: "Books"
  }
];

const definitionsBySlug = new Map(
  SYSTEM_TOP_DEFINITIONS.map((definition) => [definition.slug, definition])
);

export function getSystemTopDefinition(slug: string): SystemTopDefinition | undefined {
  return definitionsBySlug.get(slug);
}

export function getAllSystemTopSlugs(): string[] {
  return SYSTEM_TOP_DEFINITIONS.map((definition) => definition.slug);
}
