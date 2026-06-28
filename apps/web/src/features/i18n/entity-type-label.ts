import type { MessageKey, TranslateFn } from "@reviewo/i18n";

const ENTITY_TYPE_KEYS: Record<string, MessageKey> = {
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
  const key = ENTITY_TYPE_KEYS[type];

  if (!key) {
    return type;
  }

  return t(key);
}
