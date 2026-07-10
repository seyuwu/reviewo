import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { EntityVisibility, TopRankMode, TopSystemSortKey } from "#prisma/client";
import { normalizeContentLocaleFilter } from "@reviewo/shared";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { resolveVoterKey } from "../../../common/voter-key.js";
import { createSlug } from "../../entities/services/entity-slug.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { RATINGS_PORT } from "../../ratings/interfaces/ratings.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import { UsersRepository } from "../../users/repositories/users.repository.js";
import {
  MAX_TOP_COMMENT_LENGTH,
  MAX_TOP_ITEMS,
  MAX_TOP_NOTE_LENGTH,
  MIN_TOP_ITEMS,
  RESERVED_SYSTEM_TOP_SLUGS,
  RESERVED_TOP_SLUG_PREFIX
} from "../constants/top-limits.js";
import { normalizeTopListSort } from "../constants/top-list-sort.js";
import type { CreateTopCommentDto } from "../dto/create-top-comment.dto.js";
import type { CreateTopCategoryDto } from "../dto/create-top-category.dto.js";
import type { CreateTopDto } from "../dto/create-top.dto.js";
import type { ReplaceTopItemsDto } from "../dto/replace-top-items.dto.js";
import type {
  EntityTopsResponseDto,
  TopCommentDto,
  TopCommentListResponseDto,
  TopDto,
  TopLikeResponseDto,
  TopListItemDto,
  TopListResponseDto,
  TopViewResponseDto
} from "../dto/top.dto.js";
import type { TopCategoryListResponseDto, TopCategoryDto } from "../dto/top-category.dto.js";
import type { UpdateTopDto } from "../dto/update-top.dto.js";
import type { TopsPort } from "../interfaces/tops.port.js";
import type { TopListRow, TopWithItems } from "../repositories/tops.repository.js";
import { TopCategoriesRepository } from "../repositories/top-categories.repository.js";
import {
  isValidTopCategorySlug,
  normalizeTopCategoryTitle,
  slugifyTopCategoryTitle
} from "../utils/top-category-slug.utils.js";
import { buildForkTopTitle, resolveForkAuthorLabel } from "../utils/build-fork-top-title.js";
import { normalizeTopSearchQuery } from "../utils/normalize-top-search-query.js";
import { TopEngagementRepository } from "../repositories/top-engagement.repository.js";
import { TopsRepository } from "../repositories/tops.repository.js";
import { resolveTopLocale } from "../lib/resolve-top-locale.js";
import { toEmptyTopDto, toTopDto, toTopListItemDto } from "./top-mapper.js";
import { UserTopRankService } from "./user-top-rank.service.js";
import {
  createTopCreatedEvent,
  createTopUpdatedEvent
} from "../../community/events/top-changed.event.js";
import { createTopForkedEvent } from "../../community/events/top-forked.event.js";
import { createTopLikedEvent } from "../../community/events/top-liked.event.js";

@Injectable()
export class TopsService implements TopsPort {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    @Inject(RATINGS_PORT)
    private readonly ratingsPort: RatingsPort,
    private readonly topCategoriesRepository: TopCategoriesRepository,
    private readonly topEngagementRepository: TopEngagementRepository,
    private readonly topsRepository: TopsRepository,
    private readonly userTopRankService: UserTopRankService,
    private readonly usersRepository: UsersRepository,
    private readonly domainEventBus: DomainEventBus
  ) {}

  async createTop(
    input: CreateTopDto,
    currentUser: AuthenticatedUser,
    localeInput?: string
  ): Promise<TopDto> {
    assertValidTopSlug(input.slug);

    if (!input.categoryId) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Top category is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    await this.requireCategoryId(input.categoryId);

    const slug = await this.resolveAvailableSlug(input.slug);
    const rankSettings = resolveCreateRankMode(input);
    const locale = resolveTopLocale(localeInput, input.title, input.description ?? null);

    try {
      const top = await this.topsRepository.create({
        authorId: currentUser.id,
        categoryId: input.categoryId,
        description: input.description ?? null,
        locale,
        rankMode: rankSettings.rankMode,
        slug,
        systemSortKey: rankSettings.systemSortKey,
        title: input.title
      });

      const author = await this.requireUser(currentUser.id);
      const category = await this.topCategoriesRepository.findById(input.categoryId);

      await this.domainEventBus.publish(
        createTopCreatedEvent({
          categoryId: input.categoryId,
          topId: top.id,
          userId: currentUser.id
        })
      );

      return toEmptyTopDto({
        author,
        category: category
          ? {
              slug: category.slug,
              title: category.title
            }
          : null,
        currentUserId: currentUser.id,
        top
      });
    } catch (error) {
      if (this.topsRepository.isUniqueConstraintError(error)) {
        throw createTopSlugConflictException();
      }

      throw error;
    }
  }

  async getTopBySlug(slug: string, currentUserId?: string): Promise<TopDto> {
    const top = await this.topsRepository.findActiveBySlug(slug);

    if (!top) {
      throw createTopNotFoundException();
    }

    return this.buildTopDto(top, currentUserId);
  }

  async updateTop(topId: string, input: UpdateTopDto, currentUser: AuthenticatedUser): Promise<TopDto> {
    const top = await this.requireOwnedTop(topId, currentUser.id);

    if (
      input.title === undefined &&
      input.description === undefined &&
      input.categoryId === undefined &&
      input.rankMode === undefined &&
      input.systemSortKey === undefined
    ) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "At least one field must be provided",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    if (input.categoryId) {
      await this.requireCategoryId(input.categoryId);
    }

    const rankSettings = resolveUpdateRankMode(top, input);

    const updated = await this.topsRepository.update(top.id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(rankSettings.rankMode !== undefined ? { rankMode: rankSettings.rankMode } : {}),
      ...(rankSettings.systemSortKey !== undefined ? { systemSortKey: rankSettings.systemSortKey } : {})
    });

    const fullTop = await this.loadTopWithItems(updated.id);

    await this.domainEventBus.publish(
      createTopUpdatedEvent({
        categoryId: updated.categoryId,
        topId: updated.id,
        userId: currentUser.id
      })
    );

    return this.buildTopDto(fullTop, currentUser.id);
  }

  async deleteTop(topId: string, currentUser: AuthenticatedUser): Promise<TopDto> {
    const top = await this.requireOwnedTop(topId, currentUser.id);
    const hidden = await this.topsRepository.updateVisibility(top.id, "HIDDEN");
    const fullTop = await this.loadTopWithItems(hidden.id);

    return this.buildTopDto(fullTop, currentUser.id);
  }

  async replaceTopItems(
    topId: string,
    input: ReplaceTopItemsDto,
    currentUser: AuthenticatedUser
  ): Promise<TopDto> {
    const top = await this.requireOwnedTop(topId, currentUser.id);

    const normalizedItems = validateAndNormalizeTopItems(input);

    for (const item of normalizedItems) {
      const entity = await this.entitiesPort.findEntityById(item.entityId);

      if (!entity || entity.visibility !== EntityVisibility.ACTIVE) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: `Entity ${item.entityId} is not available for tops`,
          statusCode: HttpStatus.BAD_REQUEST
        });
      }
    }

    const updated = await this.topsRepository.replaceItems(
      top.id,
      normalizedItems.map((item, index) => ({
        entityId: item.entityId,
        note: item.note ?? null,
        position: index + 1
      }))
    );

    await this.domainEventBus.publish(
      createTopUpdatedEvent({
        categoryId: updated.categoryId,
        topId: updated.id,
        userId: currentUser.id
      })
    );

    return this.buildTopDto(updated, currentUser.id);
  }

  async listRecentTops(
    limit: number,
    cursor?: string,
    sort?: string | null,
    searchQuery?: string | null,
    localeInput?: string
  ): Promise<TopListResponseDto> {
    const normalizedSearchQuery = normalizeTopSearchQuery(searchQuery);
    const localeFilter = { locale: normalizeContentLocaleFilter(localeInput) };
    const result = await this.topsRepository.listRecent({
      limit,
      localeFilter,
      sort: normalizeTopListSort(sort),
      ...(cursor ? { cursor } : {}),
      ...(normalizedSearchQuery ? { searchQuery: normalizedSearchQuery } : {})
    });

    return this.toTopListResponse(result.items, result.nextCursor);
  }

  async listTopsByAuthor(
    userId: string,
    limit: number,
    cursor?: string,
    localeInput?: string
  ): Promise<TopListResponseDto> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "User was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const localeFilter = { locale: normalizeContentLocaleFilter(localeInput) };
    const result = await this.topsRepository.listByAuthor({
      authorId: userId,
      limit,
      localeFilter,
      ...(cursor ? { cursor } : {})
    });

    return this.toTopListResponse(result.items, result.nextCursor);
  }

  async listTopCategories(): Promise<TopCategoryListResponseDto> {
    const categories = await this.topCategoriesRepository.listAll();

    return {
      items: categories.map((category) => mapTopCategoryDto(category))
    };
  }

  async createTopCategory(
    input: CreateTopCategoryDto,
    _currentUser: AuthenticatedUser
  ): Promise<TopCategoryDto> {
    const title = normalizeTopCategoryTitle(input.title);

    if (!title) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Top category title is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const slug = slugifyTopCategoryTitle(title);

    if (!isValidTopCategorySlug(slug)) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Top category title must contain letters or numbers",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const existingBySlug = await this.topCategoriesRepository.findBySlug(slug);

    if (existingBySlug) {
      if (existingBySlug.title.trim().toLowerCase() === title.toLowerCase()) {
        return mapTopCategoryDto(existingBySlug);
      }

      throw createTopCategorySlugConflictException();
    }

    try {
      const sortOrder = (await this.topCategoriesRepository.getMaxSortOrder()) + 1;
      const created = await this.topCategoriesRepository.create({
        slug,
        sortOrder,
        title
      });

      return mapTopCategoryDto(created);
    } catch (error) {
      if (this.topCategoriesRepository.isUniqueConstraintError(error)) {
        const raced = await this.topCategoriesRepository.findBySlug(slug);

        if (raced && raced.title.trim().toLowerCase() === title.toLowerCase()) {
          return mapTopCategoryDto(raced);
        }

        throw createTopCategorySlugConflictException();
      }

      throw error;
    }
  }

  async listTopsByCategory(
    slug: string,
    limit: number,
    cursor?: string,
    sort?: string | null,
    searchQuery?: string | null,
    localeInput?: string
  ): Promise<TopListResponseDto> {
    const category = await this.topCategoriesRepository.findBySlug(slug);

    if (!category) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Top category not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const normalizedSearchQuery = normalizeTopSearchQuery(searchQuery);
    const localeFilter = { locale: normalizeContentLocaleFilter(localeInput) };
    const result = await this.topsRepository.listByCategory({
      categoryId: category.id,
      limit,
      localeFilter,
      sort: normalizeTopListSort(sort),
      ...(cursor ? { cursor } : {}),
      ...(normalizedSearchQuery ? { searchQuery: normalizedSearchQuery } : {})
    });

    return this.toTopListResponse(result.items, result.nextCursor);
  }

  async listTopsForEntity(entityId: string, localeInput?: string): Promise<EntityTopsResponseDto> {
    const entity = await this.entitiesPort.findEntityById(entityId);

    if (!entity || entity.visibility !== EntityVisibility.ACTIVE) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const localeFilter = { locale: normalizeContentLocaleFilter(localeInput) };
    const items = await this.topsRepository.listAppearancesForEntity(entityId, localeFilter);

    return { items };
  }

  async forkTop(sourceTopId: string, currentUser: AuthenticatedUser): Promise<TopDto> {
    const source = await this.topsRepository.findActiveById(sourceTopId);

    if (!source) {
      throw createTopNotFoundException();
    }

    if (source.authorId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "You cannot fork your own top",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const slug = await this.resolveAvailableSlug(createSlug(`${source.slug}-fork`));
    const title = buildForkTopTitle(source.title, resolveForkAuthorLabel(currentUser));

    try {
      const forked = await this.topsRepository.createFork({
        authorId: currentUser.id,
        slug,
        sourceTop: source,
        title
      });

      await this.domainEventBus.publish(
        createTopCreatedEvent({
          categoryId: forked.categoryId,
          topId: forked.id,
          userId: currentUser.id
        })
      );

      await this.domainEventBus.publish(
        createTopForkedEvent({
          categoryId: source.categoryId,
          forkedTopId: forked.id,
          forkerUserId: currentUser.id,
          sourceAuthorId: source.authorId,
          sourceTopId: source.id
        })
      );

      return this.buildTopDto(forked, currentUser.id);
    } catch (error) {
      if (this.topsRepository.isUniqueConstraintError(error)) {
        throw createTopSlugConflictException();
      }

      throw error;
    }
  }

  async listTopForks(
    sourceTopId: string,
    limit: number,
    cursor?: string,
    localeInput?: string
  ): Promise<TopListResponseDto> {
    const source = await this.topsRepository.findActiveById(sourceTopId);

    if (!source) {
      throw createTopNotFoundException();
    }

    const localeFilter = { locale: normalizeContentLocaleFilter(localeInput) };
    const result = await this.topsRepository.listForks({
      limit,
      localeFilter,
      sourceTopId,
      ...(cursor ? { cursor } : {})
    });

    return this.toTopListResponse(result.items, result.nextCursor);
  }

  async toggleTopLike(topId: string, currentUser: AuthenticatedUser): Promise<TopLikeResponseDto> {
    const top = await this.requireActiveTop(topId);

    if (top.authorId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "You cannot like your own top",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const result = await this.topEngagementRepository.toggleLike(top.id, currentUser.id);

    if (result.liked && result.likeId) {
      await this.domainEventBus.publish(
        createTopLikedEvent({
          categoryId: top.categoryId,
          likeId: result.likeId,
          likedByUserId: currentUser.id,
          topAuthorId: top.authorId,
          topId: top.id
        })
      );
    }

    return {
      likedByCurrentUser: result.liked,
      likesCount: await this.topEngagementRepository.countLikes(top.id)
    };
  }

  async recordTopView(
    topId: string,
    voterHeader: string | undefined,
    request: RequestLike,
    userId?: string
  ): Promise<TopViewResponseDto> {
    const top = await this.requireActiveTop(topId);
    const viewerKey = resolveVoterKey(voterHeader, request);
    const result = await this.topEngagementRepository.recordView(top.id, viewerKey, userId);

    return {
      recorded: result.recorded,
      viewsCount: await this.topEngagementRepository.countViews(top.id)
    };
  }

  async listTopComments(
    topId: string,
    limit: number,
    cursor?: string,
    currentUserId?: string
  ): Promise<TopCommentListResponseDto> {
    await this.requireActiveTop(topId);

    const result = await this.topEngagementRepository.listComments({
      limit,
      topId,
      ...(cursor ? { cursor } : {})
    });

    const authorIds = [...new Set(result.items.map((item) => item.authorId))];
    const authors = await Promise.all(authorIds.map((id) => this.requireUser(id)));
    const authorMap = new Map(authors.map((author) => [author.id, author]));

    const items: TopCommentDto[] = result.items.map((comment) => ({
      author: authorMap.get(comment.authorId)!,
      createdAt: comment.createdAt.toISOString(),
      id: comment.id,
      isOwnComment: currentUserId === comment.authorId,
      text: comment.text
    }));

    return {
      items,
      nextCursor: result.nextCursor
    };
  }

  async createTopComment(
    topId: string,
    input: CreateTopCommentDto,
    currentUser: AuthenticatedUser
  ): Promise<TopCommentDto> {
    await this.requireActiveTop(topId);

    const text = input.text.trim();

    if (text.length === 0 || text.length > MAX_TOP_COMMENT_LENGTH) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: `Comment must be between 1 and ${MAX_TOP_COMMENT_LENGTH} characters`,
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const comment = await this.topEngagementRepository.createComment(topId, currentUser.id, text);
    const author = await this.requireUser(comment.authorId);

    return {
      author,
      createdAt: comment.createdAt.toISOString(),
      id: comment.id,
      isOwnComment: true,
      text: comment.text
    };
  }

  private async buildTopDto(top: TopWithItems, currentUserId?: string): Promise<TopDto> {
    const author = await this.requireUser(top.authorId);
    const forkedFromAuthor = top.forkedFrom
      ? await this.requireUser(top.forkedFrom.authorId)
      : null;
    const likedByCurrentUser = currentUserId
      ? await this.topEngagementRepository.isLikedByUser(top.id, currentUserId)
      : false;
    const rankings =
      (top.rankMode === TopRankMode.HYBRID || top.rankMode === TopRankMode.SYSTEM) &&
      top.systemSortKey
        ? await this.userTopRankService.computeRankings(
            top.items.map((item) => item.entityId),
            top.systemSortKey
          )
        : undefined;

    return toTopDto({
      author,
      ...(currentUserId ? { currentUserId } : {}),
      entitiesPort: this.entitiesPort,
      forkedFromAuthor,
      ...(rankings ? { rankings } : {}),
      likedByCurrentUser,
      ratingsPort: this.ratingsPort,
      top
    });
  }

  private async requireActiveTop(topId: string): Promise<TopWithItems> {
    const top = await this.topsRepository.findActiveById(topId);

    if (!top) {
      throw createTopNotFoundException();
    }

    return top;
  }

  private async toTopListResponse(
    tops: TopListRow[],
    nextCursor: string | null
  ): Promise<TopListResponseDto> {
    const authorIds = [...new Set(tops.map((top) => top.authorId))];
    const authors = await Promise.all(authorIds.map((id) => this.requireUser(id)));
    const authorMap = new Map(authors.map((author) => [author.id, author]));
    const activeItemCounts = await this.topsRepository.countActiveItemsByTopIds(
      tops.map((top) => top.id)
    );

    const items: TopListItemDto[] = tops.map((top) =>
      toTopListItemDto(top, authorMap.get(top.authorId)!, activeItemCounts.get(top.id))
    );

    return {
      items,
      nextCursor
    };
  }

  private async requireOwnedTop(topId: string, userId: string): Promise<TopWithItems> {
    const top = await this.topsRepository.findById(topId);

    if (!top) {
      throw createTopNotFoundException();
    }

    if (top.authorId !== userId) {
      throw createTopNotFoundException();
    }

    return this.loadTopWithItems(top.id);
  }

  private async loadTopWithItems(topId: string): Promise<TopWithItems> {
    const top = await this.topsRepository.findById(topId);

    if (!top) {
      throw createTopNotFoundException();
    }

    const withItems = await this.topsRepository.findBySlug(top.slug);

    if (!withItems) {
      throw createTopNotFoundException();
    }

    return withItems;
  }

  private async requireUser(userId: string): Promise<{ displayName: string; id: string }> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "User was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return {
      displayName: user.displayName,
      id: user.id
    };
  }

  private async resolveAvailableSlug(requestedSlug: string): Promise<string> {
    const baseSlug = createSlug(requestedSlug) || requestedSlug;
    let candidate = baseSlug;
    let suffix = 2;

    while (await this.topsRepository.slugExists(candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private async requireCategoryId(categoryId: string): Promise<void> {
    const category = await this.topCategoriesRepository.findById(categoryId);

    if (!category) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Top category not found",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
  }
}

export function assertValidTopSlug(slug: string): void {
  if (slug.startsWith(RESERVED_TOP_SLUG_PREFIX) || RESERVED_SYSTEM_TOP_SLUGS.has(slug)) {
    throw createAppException({
      code: AppErrorCode.ValidationError,
      message: "This slug is reserved",
      statusCode: HttpStatus.BAD_REQUEST
    });
  }
}

export function validateAndNormalizeTopItems(
  input: ReplaceTopItemsDto
): ReplaceTopItemsDto["items"] {
  if (input.items.length < MIN_TOP_ITEMS || input.items.length > MAX_TOP_ITEMS) {
    throw createAppException({
      code: AppErrorCode.ValidationError,
      message: `Top must contain between ${MIN_TOP_ITEMS} and ${MAX_TOP_ITEMS} items`,
      statusCode: HttpStatus.BAD_REQUEST
    });
  }

  const seen = new Set<string>();

  for (const item of input.items) {
    if (seen.has(item.entityId)) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Each entity can appear only once in a top",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    seen.add(item.entityId);

    if (item.note && item.note.length > MAX_TOP_NOTE_LENGTH) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: `Note must be at most ${MAX_TOP_NOTE_LENGTH} characters`,
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
  }

  return input.items;
}

function createTopNotFoundException() {
  return createAppException({
    code: AppErrorCode.NotFound,
    message: "Top was not found",
    statusCode: HttpStatus.NOT_FOUND
  });
}

function createTopSlugConflictException() {
  return createAppException({
    code: AppErrorCode.Conflict,
    message: "Top slug is already taken",
    statusCode: HttpStatus.CONFLICT
  });
}

function createTopCategorySlugConflictException() {
  return createAppException({
    code: AppErrorCode.Conflict,
    message: "Top category slug is already taken",
    statusCode: HttpStatus.CONFLICT
  });
}

function mapTopCategoryDto(category: {
  id: string;
  slug: string;
  sortOrder: number;
  title: string;
}): TopCategoryDto {
  return {
    id: category.id,
    slug: category.slug,
    sortOrder: category.sortOrder,
    title: category.title
  };
}

export function resolveCreateRankMode(input: Pick<CreateTopDto, "rankMode" | "systemSortKey">): {
  rankMode: TopRankMode;
  systemSortKey: TopSystemSortKey | null;
} {
  const rankMode = input.rankMode ?? TopRankMode.MANUAL;

  if (rankMode === TopRankMode.HYBRID || rankMode === TopRankMode.SYSTEM) {
    return {
      rankMode,
      systemSortKey: input.systemSortKey ?? TopSystemSortKey.RELIABILITY
    };
  }

  if (input.systemSortKey !== undefined) {
    throw createAppException({
      code: AppErrorCode.ValidationError,
      message: "systemSortKey is only valid when rankMode is HYBRID or SYSTEM",
      statusCode: HttpStatus.BAD_REQUEST
    });
  }

  return {
    rankMode,
    systemSortKey: null
  };
}

export function resolveUpdateRankMode(
  current: Pick<TopWithItems, "rankMode" | "systemSortKey">,
  input: Pick<UpdateTopDto, "rankMode" | "systemSortKey">
): {
  rankMode?: TopRankMode;
  systemSortKey?: TopSystemSortKey | null;
} {
  const nextRankMode = input.rankMode ?? current.rankMode;
  const patch: {
    rankMode?: TopRankMode;
    systemSortKey?: TopSystemSortKey | null;
  } = {};

  if (input.rankMode !== undefined) {
    patch.rankMode = input.rankMode;
  }

  if (nextRankMode === TopRankMode.MANUAL) {
    if (nextRankMode !== current.rankMode || input.systemSortKey !== undefined) {
      patch.systemSortKey = null;
    }
  } else if (nextRankMode === TopRankMode.HYBRID || nextRankMode === TopRankMode.SYSTEM) {
    if (input.systemSortKey !== undefined) {
      patch.systemSortKey = input.systemSortKey;
    } else if (
      input.rankMode !== undefined &&
      input.rankMode !== current.rankMode &&
      current.systemSortKey === null
    ) {
      patch.systemSortKey = TopSystemSortKey.RELIABILITY;
    }
  }

  if (input.systemSortKey !== undefined && nextRankMode === TopRankMode.MANUAL) {
    throw createAppException({
      code: AppErrorCode.ValidationError,
      message: "systemSortKey is only valid when rankMode is HYBRID or SYSTEM",
      statusCode: HttpStatus.BAD_REQUEST
    });
  }

  return patch;
}
