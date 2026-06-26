export const entityTypes = [
  "website",
  "page",
  "video",
  "channel",
  "repository",
  "organization",
  "product",
  "book",
  "movie",
  "game",
  "company",
  "person",
  "place",
  "other"
] as const;

export type EntityType = (typeof entityTypes)[number];

export interface CreateEntityInput {
  canonicalUrl?: string;
  description?: string;
  title: string;
  type: EntityType;
}

export interface Entity {
  canonicalUrl: string | null;
  createdAt: string;
  createdBy: string | null;
  description: string | null;
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  type: EntityType;
  updatedAt: string;
}
