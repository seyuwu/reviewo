import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EntityDto } from "../../entities/dto/entity.dto.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { URL_NORMALIZER } from "../../entities/interfaces/url-normalizer.js";
import type { UrlNormalizer } from "../../entities/interfaces/url-normalizer.js";
import { RateEntityDto } from "../../ratings/dto/rate-entity.dto.js";
import { RATINGS_PORT } from "../../ratings/interfaces/ratings.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import { ReputationDisplayService } from "../../reputation/services/reputation-display.service.js";
import { ExtensionQuickRatingResponseDto } from "../dto/extension-quick-rating-response.dto.js";
import type { ExtensionByUrlRatingResponseDto } from "../dto/extension-by-url-rating-response.dto.js";
import type { ExtensionRateByUrlDto } from "../dto/extension-rate-by-url.dto.js";
import type { ExtensionResolveResponseDto } from "../dto/extension-resolve-response.dto.js";
import type { ExtensionEntitySummaryDto } from "../dto/extension-resolve-response.dto.js";
import type { ExtensionResolveEntityBundleDto } from "../dto/extension-resolve-response.dto.js";
import type { ExtensionWebLinkDto } from "../dto/extension-resolve-response.dto.js";
import type { ExtensionEntityChildrenResponseDto } from "../dto/extension-entity-children-response.dto.js";
import type { ExtensionEntityChildItemDto } from "../dto/extension-entity-children-response.dto.js";
import { RateSiteUseCase } from "../use-cases/rate-site.use-case.js";

@Injectable()
export class ExtensionApiService {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    @Inject(RATINGS_PORT)
    private readonly ratingsPort: RatingsPort,
    @Inject(URL_NORMALIZER)
    private readonly urlNormalizer: UrlNormalizer,
    private readonly reputationDisplayService: ReputationDisplayService,
    private readonly rateSiteUseCase: RateSiteUseCase
  ) {}

  async resolveUrl(url: string): Promise<ExtensionResolveResponseDto> {
    const resolvedEntity = await this.entitiesPort.resolveEntityByUrl(url);

    if (!resolvedEntity.entity || resolvedEntity.resolution !== "found") {
      return {
        canCreateEntity: true,
        status: "not_found",
        url: {
          canonical: resolvedEntity.canonicalUrl,
          input: resolvedEntity.inputUrl
        }
      };
    }

    const [rating, trust, parent] = await Promise.all([
      this.ratingsPort.getAggregate(resolvedEntity.entity.id),
      this.reputationDisplayService.resolveEntityTrustConfidence(resolvedEntity.entity.id),
      this.resolveParentSiteBundle(resolvedEntity.canonicalUrl, resolvedEntity.entity.id)
    ]);

    return {
      entity: toExtensionEntitySummaryDto(resolvedEntity.entity),
      rating,
      status: "found",
      trust,
      url: {
        canonical: resolvedEntity.canonicalUrl,
        input: resolvedEntity.inputUrl
      },
      web: toExtensionWebLinkDto(resolvedEntity.entity.id),
      ...(parent ? { parent } : {})
    };
  }

  private async resolveParentSiteBundle(
    canonicalUrl: string,
    currentEntityId: string
  ): Promise<ExtensionResolveEntityBundleDto | undefined> {
    const siteRootCanonicalUrl = this.urlNormalizer.getSiteRootCanonicalUrl(canonicalUrl);

    if (siteRootCanonicalUrl === canonicalUrl) {
      return undefined;
    }

    const siteResolved = await this.entitiesPort.resolveEntityByUrl(siteRootCanonicalUrl);

    if (!siteResolved.entity || siteResolved.resolution !== "found") {
      return undefined;
    }

    if (siteResolved.entity.id === currentEntityId) {
      return undefined;
    }

    const [rating, trust] = await Promise.all([
      this.ratingsPort.getAggregate(siteResolved.entity.id),
      this.reputationDisplayService.resolveEntityTrustConfidence(siteResolved.entity.id)
    ]);

    return {
      entity: toExtensionEntitySummaryDto(siteResolved.entity),
      rating,
      trust,
      web: toExtensionWebLinkDto(siteResolved.entity.id)
    };
  }

  async rateEntity(
    entityId: string,
    input: RateEntityDto,
    currentUser: AuthenticatedUser
  ): Promise<ExtensionQuickRatingResponseDto> {
    const entity = await this.entitiesPort.findEntityById(entityId);

    if (!entity) {
      throw createEntityNotFoundException();
    }

    const ratingResult = await this.ratingsPort.rateEntity(entityId, input, currentUser);
    const trust = await this.reputationDisplayService.resolveEntityTrustConfidence(entityId);

    return {
      entity: toExtensionEntitySummaryDto(entity),
      myRating: ratingResult.rating,
      rating: ratingResult.aggregate,
      trust,
      web: toExtensionWebLinkDto(entity.id)
    };
  }

  async rateSiteByUrl(
    input: ExtensionRateByUrlDto,
    currentUser: AuthenticatedUser
  ): Promise<ExtensionByUrlRatingResponseDto> {
    return this.rateSiteUseCase.execute(
      {
        score: input.score,
        url: input.url,
        ...(input.sourceTitle === undefined ? {} : { sourceTitle: input.sourceTitle })
      },
      currentUser
    );
  }

  async listEntityChildren(
    parentId: string,
    limit: number
  ): Promise<ExtensionEntityChildrenResponseDto> {
    const children = await this.entitiesPort.listChildEntities(parentId, limit);

    const childItems = await Promise.all(
      children.map(async (child): Promise<ExtensionEntityChildItemDto> => {
        const rating = await this.ratingsPort.getAggregate(child.id);

        return {
          entity: toExtensionEntitySummaryDto(child),
          rating,
          web: toExtensionWebLinkDto(child.id)
        };
      })
    );

    return {
      children: childItems,
      parentId
    };
  }
}

function toExtensionEntitySummaryDto(entity: EntityDto): ExtensionEntitySummaryDto {
  return {
    canonicalUrl: entity.canonicalUrl,
    description: entity.description,
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    type: entity.type
  };
}

function toExtensionWebLinkDto(entityId: string): ExtensionWebLinkDto {
  return {
    entityPagePath: `/entities/${entityId}`
  };
}

function createEntityNotFoundException(): Error {
  return createAppException({
    code: AppErrorCode.NotFound,
    message: "Entity was not found",
    statusCode: HttpStatus.NOT_FOUND
  });
}
