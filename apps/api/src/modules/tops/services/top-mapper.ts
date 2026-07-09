import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import type { TopDto, TopItemDto, TopListItemDto } from "../dto/top.dto.js";
import type { TopListRow, TopWithItems } from "../repositories/tops.repository.js";
import type { UserTopRankMap } from "./user-top-rank.service.js";

interface TopMapperContext {
  author: { displayName: string; id: string };
  currentUserId?: string;
  entitiesPort: EntitiesPort;
  forkedFromAuthor?: { displayName: string; id: string } | null;
  likedByCurrentUser?: boolean;
  rankings?: UserTopRankMap;
  ratingsPort: RatingsPort;
  top: TopWithItems;
}

type MappedTopItem = TopItemDto & {
  storedPosition: number;
};

export async function toTopDto(context: TopMapperContext): Promise<TopDto> {
  const items: MappedTopItem[] = [];

  for (const item of context.top.items) {
    const entity = await context.entitiesPort.findEntityById(item.entityId);

    if (!entity) {
      continue;
    }

    let rating = null;

    try {
      rating = await context.ratingsPort.getAggregate(item.entityId);
    } catch {
      rating = null;
    }

    items.push({
      entity: {
        canonicalUrl: entity.canonicalUrl,
        id: entity.id,
        slug: entity.slug,
        title: entity.title,
        type: entity.type
      },
      note: item.note,
      position: item.position,
      storedPosition: item.position,
      ...mapRankFields(context.top.rankMode, item.position, item.entityId, context.rankings),
      rating
    });
  }

  finalizeItemOrder(items, context.top.rankMode);

  return {
    author: context.author,
    category: mapTopCategory(context.top.category),
    commentsCount: context.top._count.comments,
    createdAt: context.top.createdAt.toISOString(),
    description: context.top.description,
    forkedFrom:
      context.top.forkedFrom && context.forkedFromAuthor
        ? {
            author: context.forkedFromAuthor,
            slug: context.top.forkedFrom.slug,
            title: context.top.forkedFrom.title
          }
        : null,
    forksCount: context.top._count.forks,
    id: context.top.id,
    isOwnTop: context.currentUserId === context.top.authorId,
    itemCount: context.top.items.length,
    items: items.map(stripStoredPosition),
    likedByCurrentUser: context.likedByCurrentUser ?? false,
    likesCount: context.top._count.likes,
    rankMode: context.top.rankMode,
    slug: context.top.slug,
    systemSortKey: context.top.systemSortKey,
    title: context.top.title,
    updatedAt: context.top.updatedAt.toISOString(),
    viewsCount: context.top._count.views,
    visibility: context.top.visibility
  };
}

export function toEmptyTopDto(input: {
  author: { displayName: string; id: string };
  category: TopListItemDto["category"];
  currentUserId: string;
  top: Pick<
    TopWithItems,
    | "authorId"
    | "createdAt"
    | "description"
    | "id"
    | "rankMode"
    | "slug"
    | "systemSortKey"
    | "title"
    | "updatedAt"
    | "visibility"
  >;
}): TopDto {
  return {
    author: input.author,
    category: input.category,
    commentsCount: 0,
    createdAt: input.top.createdAt.toISOString(),
    description: input.top.description,
    forkedFrom: null,
    forksCount: 0,
    id: input.top.id,
    isOwnTop: input.currentUserId === input.top.authorId,
    itemCount: 0,
    items: [],
    likedByCurrentUser: false,
    likesCount: 0,
    rankMode: input.top.rankMode,
    slug: input.top.slug,
    systemSortKey: input.top.systemSortKey,
    title: input.top.title,
    updatedAt: input.top.updatedAt.toISOString(),
    viewsCount: 0,
    visibility: input.top.visibility
  };
}

export function toTopListItemDto(
  top: TopListRow,
  author: { displayName: string; id: string }
): TopListItemDto {
  return {
    author,
    category: mapTopCategory(top.category),
    commentsCount: top._count.comments,
    createdAt: top.createdAt.toISOString(),
    description: top.description,
    forksCount: top._count.forks,
    id: top.id,
    itemCount: top._count.items,
    likesCount: top._count.likes,
    slug: top.slug,
    title: top.title,
    updatedAt: top.updatedAt.toISOString(),
    viewsCount: top._count.views
  };
}

function finalizeItemOrder(items: MappedTopItem[], rankMode: TopWithItems["rankMode"]): void {
  if (rankMode === "SYSTEM") {
    items.sort((left, right) => compareSystemItems(left, right));
    items.forEach((item, index) => {
      item.position = index + 1;
    });
    return;
  }

  items.sort((left, right) => left.storedPosition - right.storedPosition);
}

function compareSystemItems(left: MappedTopItem, right: MappedTopItem): number {
  const leftOk = left.systemPositionStatus === "ok";
  const rightOk = right.systemPositionStatus === "ok";

  if (leftOk && rightOk) {
    return (left.systemPosition ?? 0) - (right.systemPosition ?? 0);
  }

  if (leftOk) {
    return -1;
  }

  if (rightOk) {
    return 1;
  }

  return left.storedPosition - right.storedPosition;
}

function mapRankFields(
  rankMode: TopWithItems["rankMode"],
  authorPosition: number,
  entityId: string,
  rankings?: UserTopRankMap
): Pick<
  TopItemDto,
  "positionDelta" | "systemPosition" | "systemPositionStatus" | "systemScore"
> {
  if (!rankings) {
    return {};
  }

  const ranking = rankings.get(entityId);

  if (
    !ranking ||
    ranking.status === "insufficient_data" ||
    ranking.systemPosition === undefined
  ) {
    if (rankMode === "HYBRID" || rankMode === "SYSTEM") {
      return {
        systemPositionStatus: "insufficient_data"
      };
    }

    return {};
  }

  if (rankMode === "HYBRID") {
    return {
      positionDelta: authorPosition - ranking.systemPosition,
      systemPosition: ranking.systemPosition,
      systemPositionStatus: "ok",
      ...(ranking.systemScore !== undefined ? { systemScore: ranking.systemScore } : {})
    };
  }

  if (rankMode === "SYSTEM") {
    return {
      systemPosition: ranking.systemPosition,
      systemPositionStatus: "ok",
      ...(ranking.systemScore !== undefined ? { systemScore: ranking.systemScore } : {})
    };
  }

  return {};
}

function stripStoredPosition(item: MappedTopItem): TopItemDto {
  const { storedPosition: _storedPosition, ...topItem } = item;

  return topItem;
}

function mapTopCategory(
  category: TopListRow["category"]
): TopListItemDto["category"] {
  if (!category) {
    return null;
  }

  return {
    slug: category.slug,
    title: category.title
  };
}
