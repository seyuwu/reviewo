import type { ContentLocaleParam } from "@reviewo/shared";
import type { Prisma } from "#prisma/client";

export interface TopListLocaleFilter {
  locale?: ContentLocaleParam;
}

export function buildTopLocaleWhere(filter: TopListLocaleFilter = {}): Prisma.TopWhereInput {
  if (filter.locale && filter.locale !== "all") {
    return { locale: filter.locale };
  }

  return {};
}
