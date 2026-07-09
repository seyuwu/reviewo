export interface TopAuthor {
  displayName: string;
  id: string;
}

export interface TopItemEntity {
  canonicalUrl: string | null;
  id: string;
  logoUrl: string | null;
  slug: string;
  title: string;
  type: string;
}

export interface TopItemRating {
  avgScore: number;
  entityId: string;
  votesCount: number;
}

export interface TopItem {
  entity: TopItemEntity;
  note: string | null;
  position: number;
  positionDelta?: number;
  rating: TopItemRating | null;
  systemPosition?: number;
  systemPositionStatus?: "insufficient_data" | "ok";
  systemScore?: number;
}

export interface TopCategorySummary {
  slug: string;
  title: string;
}

export interface TopCategory {
  id: string;
  slug: string;
  sortOrder: number;
  title: string;
}

export interface TopCategoryListResponse {
  items: TopCategory[];
}

export interface TopForkSource {
  author: TopAuthor;
  slug: string;
  title: string;
}

export interface Top {
  author: TopAuthor;
  category: TopCategorySummary | null;
  commentsCount: number;
  createdAt: string;
  description: string | null;
  forkedFrom: TopForkSource | null;
  forksCount: number;
  id: string;
  isOwnTop: boolean;
  itemCount: number;
  items: TopItem[];
  likedByCurrentUser: boolean;
  likesCount: number;
  rankMode: "HYBRID" | "MANUAL" | "SYSTEM";
  slug: string;
  systemSortKey: "POPULARITY" | "RATING" | "RELIABILITY" | "TRENDING" | null;
  title: string;
  updatedAt: string;
  viewsCount: number;
  visibility: string;
}

export interface TopLikeResponse {
  likedByCurrentUser: boolean;
  likesCount: number;
}

export interface TopViewResponse {
  recorded: boolean;
  viewsCount: number;
}

export interface TopComment {
  author: TopAuthor;
  createdAt: string;
  id: string;
  isOwnComment: boolean;
  text: string;
}

export interface TopCommentListResponse {
  items: TopComment[];
  nextCursor: string | null;
}

export interface TopListItem {
  author: TopAuthor;
  category: TopCategorySummary | null;
  commentsCount: number;
  createdAt: string;
  description: string | null;
  forksCount: number;
  id: string;
  itemCount: number;
  likesCount: number;
  slug: string;
  title: string;
  updatedAt: string;
  viewsCount: number;
}

export interface TopListResponse {
  items: TopListItem[];
  nextCursor: string | null;
}

export interface EntityTopAppearance {
  isSystemTop?: boolean;
  position: number;
  slug: string;
  title: string;
  topId?: string;
}

export interface EntityTopsResponse {
  items: EntityTopAppearance[];
}

export interface SystemTopCatalogItem {
  computedAt: string | null;
  description: string;
  slug: string;
  title: string;
}

export interface SystemTopCatalogResponse {
  items: SystemTopCatalogItem[];
}

export interface SystemTopItem {
  avgScore: number | null;
  entity: TopItemEntity;
  position: number;
  score: number;
  votesCount: number | null;
}

export interface SystemTopDetail {
  computedAt: string | null;
  description: string;
  items: SystemTopItem[];
  slug: string;
  sort: string;
  title: string;
}

export interface EntitySystemTopsResponse {
  items: EntityTopAppearance[];
}

export type TopRankModeInput = "HYBRID" | "MANUAL" | "SYSTEM";

export interface CreateTopCategoryInput {
  title: string;
}

export interface CreateTopInput {
  categoryId: string;
  description?: string;
  rankMode?: TopRankModeInput;
  slug: string;
  systemSortKey?: "POPULARITY" | "RATING" | "RELIABILITY";
  title: string;
}

export interface UpdateTopInput {
  categoryId?: string | null;
  description?: string | null;
  rankMode?: TopRankModeInput;
  systemSortKey?: "POPULARITY" | "RATING" | "RELIABILITY" | null;
  title?: string;
}

export interface ReplaceTopItemInput {
  entityId: string;
  note?: string | null;
}

export interface DraftTopItem {
  entity: TopItemEntity;
  note: string;
}
