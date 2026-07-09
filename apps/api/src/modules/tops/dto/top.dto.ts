import type { TopRankMode, TopSystemSortKey, TopVisibility } from "#prisma/client";

import type { RatingAggregateDto } from "../../ratings/dto/rating-aggregate.dto.js";
import type { EntityDto } from "../../entities/dto/entity.dto.js";

export class TopCategorySummaryDto {
  slug!: string;
  title!: string;
}

export class TopAuthorDto {
  displayName!: string;
  id!: string;
}

export class TopForkSourceDto {
  author!: TopAuthorDto;
  slug!: string;
  title!: string;
}

export class TopItemEntityDto {
  canonicalUrl!: string | null;
  id!: string;
  slug!: string;
  title!: string;
  type!: EntityDto["type"];
}

export class TopItemDto {
  entity!: TopItemEntityDto;
  note!: string | null;
  position!: number;
  positionDelta?: number;
  rating!: RatingAggregateDto | null;
  systemPosition?: number;
  systemPositionStatus?: "insufficient_data" | "ok";
  systemScore?: number;
}

export class TopDto {
  author!: TopAuthorDto;
  category!: TopCategorySummaryDto | null;
  commentsCount!: number;
  createdAt!: string;
  description!: string | null;
  forkedFrom!: TopForkSourceDto | null;
  forksCount!: number;
  id!: string;
  isOwnTop!: boolean;
  itemCount!: number;
  items!: TopItemDto[];
  likedByCurrentUser!: boolean;
  likesCount!: number;
  rankMode!: TopRankMode;
  slug!: string;
  systemSortKey!: TopSystemSortKey | null;
  title!: string;
  updatedAt!: string;
  viewsCount!: number;
  visibility!: TopVisibility;
}

export class TopLikeResponseDto {
  likedByCurrentUser!: boolean;
  likesCount!: number;
}

export class TopViewResponseDto {
  recorded!: boolean;
  viewsCount!: number;
}

export class TopCommentDto {
  author!: TopAuthorDto;
  createdAt!: string;
  id!: string;
  isOwnComment!: boolean;
  text!: string;
}

export class TopCommentListResponseDto {
  items!: TopCommentDto[];
  nextCursor!: string | null;
}

export class TopListItemDto {
  author!: TopAuthorDto;
  category!: TopCategorySummaryDto | null;
  commentsCount!: number;
  createdAt!: string;
  description!: string | null;
  forksCount!: number;
  id!: string;
  itemCount!: number;
  likesCount!: number;
  slug!: string;
  title!: string;
  updatedAt!: string;
  viewsCount!: number;
}

export class TopListResponseDto {
  items!: TopListItemDto[];
  nextCursor!: string | null;
}

export class EntityTopAppearanceDto {
  position!: number;
  slug!: string;
  title!: string;
  topId!: string;
}

export class EntityTopsResponseDto {
  items!: EntityTopAppearanceDto[];
}
