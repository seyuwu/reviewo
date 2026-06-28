import { Inject, Injectable } from "@nestjs/common";

import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { EnsureEntityForUrlResult } from "../../entities/interfaces/ensure-entity-for-url.js";
import { RATINGS_PORT } from "../../ratings/interfaces/ratings.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import { ReputationDisplayService } from "../../reputation/services/reputation-display.service.js";
import type { ExtensionByUrlRatingResponseDto } from "../dto/extension-by-url-rating-response.dto.js";
import type { ExtensionEntitySummaryDto } from "../dto/extension-resolve-response.dto.js";
import type { ExtensionWebLinkDto } from "../dto/extension-resolve-response.dto.js";

export interface RateSiteByUrlInput {
  score: number;
  sourceTitle?: string;
  url: string;
}

@Injectable()
export class RateSiteUseCase {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    @Inject(RATINGS_PORT)
    private readonly ratingsPort: RatingsPort,
    private readonly reputationDisplayService: ReputationDisplayService
  ) {}

  async execute(
    input: RateSiteByUrlInput,
    currentUser: AuthenticatedUser
  ): Promise<ExtensionByUrlRatingResponseDto> {
    const resolved = await this.entitiesPort.resolveEntityByUrl(input.url);
    const provision = await this.entitiesPort.ensureEntityForUrl(
      input.url,
      input.sourceTitle === undefined ? {} : { sourceTitle: input.sourceTitle },
      currentUser
    );
    const ratingResult = await this.ratingsPort.rateEntity(
      provision.entity.id,
      {
        score: input.score
      },
      currentUser
    );
    const trust = await this.reputationDisplayService.resolveEntityTrustConfidence(provision.entity.id);

    return {
      entity: toExtensionEntitySummaryDto(provision.entity),
      entityProvision: {
        mode: provision.mode
      },
      myRating: ratingResult.rating,
      rating: ratingResult.aggregate,
      trust,
      url: {
        canonical: resolved.canonicalUrl,
        input: resolved.inputUrl
      },
      web: toExtensionWebLinkDto(provision.entity.id)
    };
  }
}

function toExtensionEntitySummaryDto(
  entity: EnsureEntityForUrlResult["entity"]
): ExtensionEntitySummaryDto {
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
