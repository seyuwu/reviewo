import type { ContentLocaleParam } from "@reviewo/shared";
import type { Prisma } from "#prisma/client";

export interface ReviewListFilter {
  locale?: ContentLocaleParam;
}

export function buildReviewWhere(
  entityId: string,
  filter: ReviewListFilter = {}
): Prisma.ReviewWhereInput {
  const where: Prisma.ReviewWhereInput = {
    entityId,
    visibility: "ACTIVE"
  };

  if (filter.locale && filter.locale !== "all") {
    where.locale = filter.locale;
  }

  return where;
}
