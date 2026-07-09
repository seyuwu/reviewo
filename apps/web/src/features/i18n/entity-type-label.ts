import type { MessageKey, TranslateFn } from "@reviewo/i18n";

export const ENTITY_TYPES = [
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

export type EntityTypeValue = (typeof ENTITY_TYPES)[number];

const ENTITY_TYPE_KEYS: Record<EntityTypeValue, MessageKey> = {
  book: "entityType.book",
  channel: "entityType.channel",
  company: "entityType.company",
  game: "entityType.game",
  movie: "entityType.movie",
  organization: "entityType.organization",
  other: "entityType.other",
  page: "entityType.page",
  person: "entityType.person",
  place: "entityType.place",
  product: "entityType.product",
  repository: "entityType.repository",
  video: "entityType.video",
  website: "entityType.website"
};

export function formatEntityTypeLabel(t: TranslateFn, type: string): string {
  if (!(type in ENTITY_TYPE_KEYS)) {
    return type;
  }

  return t(ENTITY_TYPE_KEYS[type as EntityTypeValue]);
}
