import type {
  EntityTopsResponseDto,
  TopCommentDto,
  TopCommentListResponseDto,
  TopDto,
  TopLikeResponseDto,
  TopListResponseDto,
  TopViewResponseDto
} from "../dto/top.dto.js";
import type { CreateTopCommentDto } from "../dto/create-top-comment.dto.js";
import type { CreateTopDto } from "../dto/create-top.dto.js";
import type { ReplaceTopItemsDto } from "../dto/replace-top-items.dto.js";
import type { UpdateTopDto } from "../dto/update-top.dto.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";

export const TOPS_PORT = Symbol("TOPS_PORT");

export interface TopsPort {
  createTop(input: CreateTopDto, currentUser: AuthenticatedUser): Promise<TopDto>;
  createTopComment(
    topId: string,
    input: CreateTopCommentDto,
    currentUser: AuthenticatedUser
  ): Promise<TopCommentDto>;
  deleteTop(topId: string, currentUser: AuthenticatedUser): Promise<TopDto>;
  forkTop(sourceTopId: string, currentUser: AuthenticatedUser): Promise<TopDto>;
  getTopBySlug(slug: string, currentUserId?: string): Promise<TopDto>;
  listRecentTops(limit: number, cursor?: string, sort?: string | null, searchQuery?: string | null): Promise<TopListResponseDto>;
  listTopComments(
    topId: string,
    limit: number,
    cursor?: string,
    currentUserId?: string
  ): Promise<TopCommentListResponseDto>;
  listTopForks(sourceTopId: string, limit: number, cursor?: string): Promise<TopListResponseDto>;
  listTopsByAuthor(userId: string, limit: number, cursor?: string): Promise<TopListResponseDto>;
  listTopsForEntity(entityId: string): Promise<EntityTopsResponseDto>;
  recordTopView(
    topId: string,
    voterHeader: string | undefined,
    request: RequestLike,
    userId?: string
  ): Promise<TopViewResponseDto>;
  replaceTopItems(
    topId: string,
    input: ReplaceTopItemsDto,
    currentUser: AuthenticatedUser
  ): Promise<TopDto>;
  toggleTopLike(topId: string, currentUser: AuthenticatedUser): Promise<TopLikeResponseDto>;
  updateTop(topId: string, input: UpdateTopDto, currentUser: AuthenticatedUser): Promise<TopDto>;
}
