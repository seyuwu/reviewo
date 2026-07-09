import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ContributionPolicy, EntityContribution } from "#prisma/client";
import { ContributionType, EntityType, EntityVisibility } from "#prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { URL_NORMALIZER } from "../../entities/interfaces/url-normalizer.js";
import type { UrlNormalizer } from "../../entities/interfaces/url-normalizer.js";
import { MAX_CONTRIBUTIONS_PER_USER_PER_DAY } from "../constants/contribution-limits.js";
import type { CreateContributionDto } from "../dto/create-contribution.dto.js";
import type {
  AdminContributionListResponseDto,
  AdminContributionStatsDto,
  EditorStatsDto,
  ListAdminContributionsQuery
} from "../dto/admin-contribution.dto.js";
import type { AdminContributionListItemDto } from "../dto/admin-contribution.dto.js";
import type { ContributionDto, ContributionListResponseDto } from "../dto/contribution.dto.js";
import type { DuplicateSuggestionsResponseDto } from "../dto/duplicate-suggestion.dto.js";
import type { FieldProvenanceListResponseDto } from "../dto/field-provenance.dto.js";
import type { VoteContributionDto } from "../dto/vote-contribution.dto.js";
import { ContributionsRepository } from "../repositories/contributions.repository.js";
import { UsersRepository } from "../../users/repositories/users.repository.js";
import { ContributionEvaluatorService } from "../services/contribution-evaluator.service.js";
import type { ContributionRequirements } from "../services/contribution-evaluator.service.js";
import { ContributionVoteWeightService } from "../services/contribution-vote-weight.service.js";
import { DuplicateDetectionService } from "../services/duplicate-detection.service.js";
import { EntityMergeService } from "../services/entity-merge.service.js";
import type { FieldChangePayload, MergeEntityPayload } from "../types/contribution-payload.js";
import { isFieldChangePayload, isIncomingFieldChangePayload, isMergeEntityPayload } from "../types/contribution-payload.js";
import type { Prisma } from "#prisma/client";

@Injectable()
export class ContributionsService {
  constructor(
    private readonly contributionsRepository: ContributionsRepository,
    private readonly contributionEvaluatorService: ContributionEvaluatorService,
    private readonly contributionVoteWeightService: ContributionVoteWeightService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly entityMergeService: EntityMergeService,
    private readonly usersRepository: UsersRepository,
    @Inject(URL_NORMALIZER)
    private readonly urlNormalizer: UrlNormalizer
  ) {}

  async createContribution(
    entityId: string,
    input: CreateContributionDto,
    currentUser: AuthenticatedUser
  ): Promise<ContributionDto> {
    await this.assertContributionRateLimit(currentUser.id);

    const entity = await this.requireActiveEntity(entityId);
    const policy = await this.contributionsRepository.findPolicy(input.type);

    if (!policy) {
      throw createAppException({
        code: AppErrorCode.InternalServerError,
        message: "Contribution policy was not found",
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR
      });
    }

    const payload = this.buildValidatedPayload(input.type, entity, input.payload);

    await this.contributionsRepository.supersedePendingContributions(entityId, input.type);

    const contribution = await this.contributionsRepository.createContribution({
      authorId: currentUser.id,
      entityId,
      payload: payload as unknown as Prisma.InputJsonValue,
      tier: policy.tier,
      type: input.type
    });

    return this.enrichContributionDto(contribution);
  }

  async listContributions(
    entityId: string,
    status?: EntityContribution["status"]
  ): Promise<ContributionListResponseDto> {
    await this.requireActiveEntity(entityId);

    const items = await this.contributionsRepository.listContributionsByEntity(entityId, status);

    return {
      items: await this.enrichContributionDtos(items, entityId)
    };
  }

  async voteContribution(
    contributionId: string,
    input: VoteContributionDto,
    currentUser: AuthenticatedUser
  ): Promise<ContributionDto> {
    const contribution = await this.contributionsRepository.findContributionById(contributionId);

    if (!contribution || contribution.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Contribution was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (contribution.authorId === currentUser.id) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Authors cannot vote on their own contributions",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const weight = this.contributionVoteWeightService.resolveWeight(currentUser.id);

    await this.contributionsRepository.upsertVote({
      contributionId,
      kind: input.kind,
      voterId: currentUser.id,
      weight
    });

    const totals = await this.contributionsRepository.refreshContributionWeights(contributionId);
    const policy = await this.contributionsRepository.findPolicy(contribution.type);

    if (!policy) {
      throw createAppException({
        code: AppErrorCode.InternalServerError,
        message: "Contribution policy was not found",
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR
      });
    }

    const votesCount = await this.contributionsRepository.getEntityVotesCount(contribution.entityId);
    const outcome = this.contributionEvaluatorService.evaluate({
      payload: contribution.payload,
      policy,
      tier: contribution.tier,
      totals,
      type: contribution.type,
      votesCount
    });

    if (outcome.action === "reject") {
      const rejected = await this.contributionsRepository.updateContributionStatus({
        contributionId,
        status: "REJECTED"
      });

      return this.enrichContributionDto(rejected);
    }

    if (outcome.action === "apply") {
      return this.applyContribution(contributionId, null);
    }

    const refreshed = await this.contributionsRepository.findContributionById(contributionId);

    return this.enrichContributionDto(refreshed ?? contribution);
  }

  async resolveContribution(
    contributionId: string,
    action: "apply" | "reject",
    moderator: AuthenticatedUser
  ): Promise<ContributionDto> {
    const contribution = await this.contributionsRepository.findContributionById(contributionId);

    if (!contribution || contribution.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Contribution was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    if (action === "reject") {
      const rejected = await this.contributionsRepository.updateContributionStatus({
        contributionId,
        resolvedBy: moderator.id,
        status: "REJECTED"
      });

      return this.enrichContributionDto(rejected);
    }

    return this.applyContribution(contributionId, moderator.id);
  }

  async getFieldProvenance(entityId: string): Promise<FieldProvenanceListResponseDto> {
    await this.requireActiveEntity(entityId);

    const items = await this.contributionsRepository.listFieldProvenance(entityId);

    return {
      items: items.map((item) => ({
        confirmedAt: item.confirmedAt.toISOString(),
        contributionId: item.contributionId,
        field: item.field,
        source: item.source,
        votersCount: item.votersCount
      }))
    };
  }

  async getDuplicateSuggestions(entityId: string): Promise<DuplicateSuggestionsResponseDto> {
    const items = await this.duplicateDetectionService.findSuggestions(entityId);

    return { items };
  }

  async getAdminContributionStats(): Promise<AdminContributionStatsDto> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [pendingTotal, pendingGroups, appliedLast7Days, rejectedLast7Days, oldestPending] =
      await Promise.all([
        this.contributionsRepository.countPendingContributions(),
        this.contributionsRepository.groupPendingContributionsByType(),
        this.contributionsRepository.countContributionsByStatusSince("APPLIED", sevenDaysAgo),
        this.contributionsRepository.countContributionsByStatusSince("REJECTED", sevenDaysAgo),
        this.contributionsRepository.findOldestPendingContribution()
      ]);

    const pendingByType = createEmptyPendingByType();

    for (const group of pendingGroups) {
      pendingByType[group.type] = group.count;
    }

    return {
      appliedLast7Days,
      oldestPendingAt: oldestPending?.createdAt.toISOString() ?? null,
      pendingByType,
      pendingTotal,
      rejectedLast7Days
    };
  }

  async listAdminContributions(
    query: ListAdminContributionsQuery
  ): Promise<AdminContributionListResponseDto> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const status = query.status ?? "PENDING";
    const rows = await this.contributionsRepository.listContributionsForAdmin({
      limit,
      status,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.type ? { type: query.type } : {})
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    if (pageRows.length === 0) {
      return { items: [], nextCursor: null };
    }

    const entityIds = [...new Set(pageRows.map((row) => row.entityId))];
    const authorIds = [...new Set(pageRows.map((row) => row.authorId))];
    const [entities, authors] = await Promise.all([
      this.contributionsRepository.findEntitiesByIds(entityIds),
      this.usersRepository.findByIds(authorIds)
    ]);
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const authorById = new Map(authors.map((author) => [author.id, author]));
    const payloadByContributionId = await this.buildEnrichedPayloadMap(pageRows);

    const items: AdminContributionListItemDto[] = pageRows.map((contribution) => {
      const entity = entityById.get(contribution.entityId);
      const author = authorById.get(contribution.authorId);
      const payload = payloadByContributionId.get(contribution.id) ?? contribution.payload;

      return {
        ...toContributionDto(contribution, emptyContributionRequirements(), payload),
        author: {
          displayName: author?.displayName ?? "Unknown",
          id: contribution.authorId
        },
        entity: {
          canonicalUrl: entity?.canonicalUrl ?? null,
          id: contribution.entityId,
          slug: entity?.slug ?? "",
          title: entity?.title ?? "Unknown entity"
        }
      };
    });

    const lastItem = pageRows.at(-1);

    return {
      items,
      nextCursor:
        hasMore && lastItem
          ? `${lastItem.createdAt.toISOString()}|${lastItem.id}`
          : null
    };
  }

  async getEditorStats(userId: string): Promise<EditorStatsDto> {
    const groups = await this.contributionsRepository.groupAuthorContributionsByStatus(userId);
    const countByStatus = new Map(groups.map((group) => [group.status, group.count]));

    const appliedCount = countByStatus.get("APPLIED") ?? 0;
    const rejectedCount = countByStatus.get("REJECTED") ?? 0;
    const pendingCount = countByStatus.get("PENDING") ?? 0;
    const totalSubmitted = appliedCount + rejectedCount;
    const editorScorePercent =
      totalSubmitted === 0 ? null : Math.round((appliedCount / totalSubmitted) * 1000) / 10;

    return {
      appliedCount,
      editorScorePercent,
      pendingCount,
      rejectedCount,
      totalSubmitted
    };
  }

  private async applyContribution(
    contributionId: string,
    resolvedBy: string | null
  ): Promise<ContributionDto> {
    const contribution = await this.contributionsRepository.findContributionById(contributionId);

    if (!contribution || contribution.status !== "PENDING") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Contribution was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const entity = await this.requireActiveEntity(contribution.entityId);
    const votersCount =
      (await this.contributionsRepository.refreshContributionWeights(contributionId)).uniqueApprovers;

    await this.executeContributionChange(
      contribution.type,
      entity.id,
      contribution.payload,
      resolvedBy
    );

    const field = mapContributionTypeToField(contribution.type);

    if (field) {
      await this.contributionsRepository.upsertFieldProvenance({
        contributionId,
        entityId: entity.id,
        field,
        source: "community",
        votersCount
      });
    }

    const applied = await this.contributionsRepository.updateContributionStatus({
      contributionId,
      resolvedBy,
      status: "APPLIED"
    });

    return this.enrichContributionDto(applied);
  }

  private async enrichContributionDto(contribution: EntityContribution): Promise<ContributionDto> {
    const policy = await this.contributionsRepository.findPolicy(contribution.type);

    if (!policy) {
      return toContributionDto(contribution, emptyContributionRequirements());
    }

    const votesCount = await this.contributionsRepository.getEntityVotesCount(contribution.entityId);
    const payload = await this.enrichContributionPayload(contribution);

    return toContributionDto(
      contribution,
      this.resolveContributionRequirements(contribution, policy, votesCount),
      payload
    );
  }

  private async enrichContributionDtos(
    contributions: EntityContribution[],
    entityId: string
  ): Promise<ContributionDto[]> {
    if (contributions.length === 0) {
      return [];
    }

    const votesCount = await this.contributionsRepository.getEntityVotesCount(entityId);
    const uniqueTypes = [...new Set(contributions.map((item) => item.type))];
    const policies = await Promise.all(
      uniqueTypes.map(
        async (type) => [type, await this.contributionsRepository.findPolicy(type)] as const
      )
    );
    const policyCache = new Map(policies);
    const payloadByContributionId = await this.buildEnrichedPayloadMap(contributions);

    return contributions.map((contribution) => {
      const policy = policyCache.get(contribution.type) ?? null;
      const payload = payloadByContributionId.get(contribution.id) ?? contribution.payload;

      return toContributionDto(
        contribution,
        policy
          ? this.resolveContributionRequirements(contribution, policy, votesCount)
          : emptyContributionRequirements(),
        payload
      );
    });
  }

  private async buildEnrichedPayloadMap(
    contributions: EntityContribution[]
  ): Promise<Map<string, unknown>> {
    const mergeContributions = contributions.filter(
      (contribution) => contribution.type === ContributionType.MERGE_ENTITY
    );

    if (mergeContributions.length === 0) {
      return new Map();
    }

    const entityIds = new Set<string>();

    for (const contribution of mergeContributions) {
      if (!isMergeEntityPayload(contribution.payload)) {
        continue;
      }

      entityIds.add(contribution.payload.sourceEntityId);
      entityIds.add(contribution.payload.targetEntityId);
    }

    const entities = await this.contributionsRepository.findEntitiesByIds([...entityIds]);
    const titleById = new Map(entities.map((entity) => [entity.id, entity.title]));
    const payloadByContributionId = new Map<string, unknown>();

    for (const contribution of mergeContributions) {
      if (!isMergeEntityPayload(contribution.payload)) {
        continue;
      }

      const mergePayload = contribution.payload;

      payloadByContributionId.set(contribution.id, {
        reason: mergePayload.reason,
        sourceEntityId: mergePayload.sourceEntityId,
        sourceEntityTitle: titleById.get(mergePayload.sourceEntityId) ?? null,
        targetEntityId: mergePayload.targetEntityId,
        targetEntityTitle: titleById.get(mergePayload.targetEntityId) ?? null
      });
    }

    return payloadByContributionId;
  }

  private async enrichContributionPayload(contribution: EntityContribution): Promise<unknown> {
    if (contribution.type !== ContributionType.MERGE_ENTITY || !isMergeEntityPayload(contribution.payload)) {
      return contribution.payload;
    }

    const payloadMap = await this.buildEnrichedPayloadMap([contribution]);

    return payloadMap.get(contribution.id) ?? contribution.payload;
  }

  private resolveContributionRequirements(
    contribution: EntityContribution,
    policy: ContributionPolicy,
    votesCount?: number
  ): ContributionRequirements {
    return this.contributionEvaluatorService.resolveRequirements({
      payload: contribution.payload,
      policy,
      tier: contribution.tier,
      totals: {
        approvalsWeight: Number(contribution.approvalsWeight),
        rejectionsWeight: Number(contribution.rejectionsWeight),
        uniqueApprovers: 0,
        uniqueRejecters: 0
      },
      type: contribution.type,
      votesCount: votesCount ?? 0
    });
  }

  private async executeContributionChange(
    type: ContributionType,
    entityId: string,
    payload: unknown,
    resolvedBy: string | null
  ): Promise<void> {
    switch (type) {
      case ContributionType.UPDATE_NAME: {
        const change = this.requireFieldChangePayload(payload);
        await this.contributionsRepository.updateEntityField(entityId, {
          title: change.newValue?.trim() ?? ""
        });
        return;
      }
      case ContributionType.UPDATE_DESCRIPTION: {
        const change = this.requireFieldChangePayload(payload);
        await this.contributionsRepository.updateEntityField(entityId, {
          description: change.newValue?.trim() ?? null
        });
        return;
      }
      case ContributionType.UPDATE_URL: {
        const change = this.requireFieldChangePayload(payload);
        const canonicalUrl = this.normalizeCanonicalUrl(change.newValue ?? "");

        await this.assertCanonicalUrlAvailable(canonicalUrl, entityId);
        await this.contributionsRepository.updateEntityField(entityId, { canonicalUrl });
        return;
      }
      case ContributionType.UPDATE_LOGO: {
        const change = this.requireFieldChangePayload(payload);
        await this.contributionsRepository.updateEntityField(entityId, {
          logoUrl: change.newValue?.trim() ?? null
        });
        return;
      }
      case ContributionType.UPDATE_TYPE: {
        const change = this.requireFieldChangePayload(payload);
        const nextType = change.newValue?.trim() as EntityType;

        if (!Object.values(EntityType).includes(nextType)) {
          throw createAppException({
            code: AppErrorCode.BadRequest,
            message: "Invalid entity type",
            statusCode: HttpStatus.BAD_REQUEST
          });
        }

        await this.contributionsRepository.updateEntityField(entityId, { type: nextType });
        return;
      }
      case ContributionType.MERGE_ENTITY: {
        const mergePayload = this.requireMergePayload(payload);
        await this.entityMergeService.mergeEntities({
          moderatorId: resolvedBy ?? mergePayload.sourceEntityId,
          sourceEntityId: mergePayload.sourceEntityId,
          targetEntityId: mergePayload.targetEntityId
        });
        return;
      }
      default:
        throw createAppException({
          code: AppErrorCode.BadRequest,
          message: "Unsupported contribution type",
          statusCode: HttpStatus.BAD_REQUEST
        });
    }
  }

  private buildValidatedPayload(
    type: ContributionType,
    entity: { canonicalUrl: string | null; description: string | null; id: string; logoUrl?: string | null; title: string; type: EntityType },
    payload: CreateContributionDto["payload"]
  ): FieldChangePayload | MergeEntityPayload {
    if (type === ContributionType.MERGE_ENTITY) {
      if (!isMergeEntityPayload(payload)) {
        throw invalidPayloadException();
      }

      if (payload.sourceEntityId !== entity.id) {
        throw createAppException({
          code: AppErrorCode.BadRequest,
          message: "Merge source must match the current entity",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      if (payload.sourceEntityId === payload.targetEntityId) {
        throw createAppException({
          code: AppErrorCode.BadRequest,
          message: "Cannot merge entity into itself",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      return payload;
    }

    if (!isIncomingFieldChangePayload(payload)) {
      throw invalidPayloadException();
    }

    const oldValue = this.readCurrentFieldValue(type, entity);
    const newValue = String((payload as FieldChangePayload).newValue ?? "").trim();

    if (!newValue) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Contribution newValue is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    if (type === ContributionType.UPDATE_URL) {
      this.normalizeCanonicalUrl(newValue);
    }

    if (type === ContributionType.UPDATE_TYPE && !Object.values(EntityType).includes(newValue as EntityType)) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Invalid entity type",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    return {
      newValue,
      oldValue
    };
  }

  private readCurrentFieldValue(
    type: ContributionType,
    entity: {
      canonicalUrl: string | null;
      description: string | null;
      logoUrl?: string | null;
      title: string;
      type: EntityType;
    }
  ): string | null {
    switch (type) {
      case ContributionType.UPDATE_NAME:
        return entity.title;
      case ContributionType.UPDATE_DESCRIPTION:
        return entity.description;
      case ContributionType.UPDATE_URL:
        return entity.canonicalUrl;
      case ContributionType.UPDATE_LOGO:
        return entity.logoUrl ?? null;
      case ContributionType.UPDATE_TYPE:
        return entity.type;
      default:
        return null;
    }
  }

  private requireFieldChangePayload(payload: unknown): FieldChangePayload {
    if (!isFieldChangePayload(payload)) {
      throw invalidPayloadException();
    }

    return payload;
  }

  private requireMergePayload(payload: unknown): MergeEntityPayload {
    if (!isMergeEntityPayload(payload)) {
      throw invalidPayloadException();
    }

    return payload;
  }

  private normalizeCanonicalUrl(value: string): string {
    const normalized = this.urlNormalizer.normalize(value);

    if (!normalized) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Canonical URL must be a valid HTTP or HTTPS URL",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    return normalized;
  }

  private async assertCanonicalUrlAvailable(canonicalUrl: string, entityId: string): Promise<void> {
    const existing = await this.contributionsRepository.findEntityByCanonicalUrl(canonicalUrl);

    if (existing && existing.id !== entityId) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        details: { entityId: existing.id },
        message: "Entity with this canonical URL already exists",
        statusCode: HttpStatus.CONFLICT
      });
    }
  }

  private async requireActiveEntity(entityId: string) {
    const entity = await this.contributionsRepository.findEntityById(entityId);

    if (!entity || entity.visibility !== EntityVisibility.ACTIVE) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return entity;
  }

  private async assertContributionRateLimit(authorId: string): Promise<void> {
    const since = new Date();
    since.setHours(since.getHours() - 24);

    const count = await this.contributionsRepository.countContributionsByAuthorSince(authorId, since);

    if (count >= MAX_CONTRIBUTIONS_PER_USER_PER_DAY) {
      throw createAppException({
        code: AppErrorCode.TooManyRequests,
        message: "Too many contribution attempts from this account",
        statusCode: HttpStatus.TOO_MANY_REQUESTS
      });
    }
  }
}

function mapContributionTypeToField(type: ContributionType): string | null {
  switch (type) {
    case ContributionType.UPDATE_NAME:
      return "title";
    case ContributionType.UPDATE_DESCRIPTION:
      return "description";
    case ContributionType.UPDATE_URL:
      return "canonicalUrl";
    case ContributionType.UPDATE_LOGO:
      return "logoUrl";
    case ContributionType.UPDATE_TYPE:
      return "type";
    default:
      return null;
  }
}

function toContributionDto(
  contribution: EntityContribution,
  requirements: ContributionRequirements,
  payload: unknown = contribution.payload
): ContributionDto {
  return {
    appliedAt: contribution.appliedAt?.toISOString() ?? null,
    approvalsWeight: Number(contribution.approvalsWeight),
    authorId: contribution.authorId,
    createdAt: contribution.createdAt.toISOString(),
    entityId: contribution.entityId,
    id: contribution.id,
    minUniqueVoters: requirements.minUniqueVoters,
    payload,
    rejectionsWeight: Number(contribution.rejectionsWeight),
    requiredApprovalsWeight: requirements.requiredApprovalsWeight,
    requiredRejectionsWeight: requirements.requiredRejectionsWeight,
    resolvedAt: contribution.resolvedAt?.toISOString() ?? null,
    resolvedBy: contribution.resolvedBy,
    status: contribution.status,
    tier: contribution.tier,
    type: contribution.type
  };
}

function emptyContributionRequirements(): ContributionRequirements {
  return {
    minUniqueVoters: 0,
    requiredApprovalsWeight: 0,
    requiredRejectionsWeight: 0
  };
}

function createEmptyPendingByType(): Record<ContributionType, number> {
  return {
    MERGE_ENTITY: 0,
    UPDATE_DESCRIPTION: 0,
    UPDATE_LOGO: 0,
    UPDATE_NAME: 0,
    UPDATE_TYPE: 0,
    UPDATE_URL: 0
  };
}

function invalidPayloadException(): Error {
  return createAppException({
    code: AppErrorCode.BadRequest,
    message: "Invalid contribution payload",
    statusCode: HttpStatus.BAD_REQUEST
  });
}
