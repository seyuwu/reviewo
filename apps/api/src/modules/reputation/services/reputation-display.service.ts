import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ApplicationConfig } from "../../../config/environment.config.js";
import { TRUST_PORT } from "../../trust/interfaces/trust.port.js";
import type { TrustPort } from "../../trust/interfaces/trust.port.js";
import type { TrustConfidenceDto } from "../../trust/dto/trust-confidence.dto.js";
import { ReputationRepository } from "../repositories/reputation.repository.js";
import type { ReputationPort } from "../interfaces/reputation.port.js";

@Injectable()
export class ReputationDisplayService implements ReputationPort {
  constructor(
    private readonly configService: ConfigService,
    private readonly reputationRepository: ReputationRepository,
    @Inject(TRUST_PORT)
    private readonly trustPort: TrustPort
  ) {}

  async getDisplayConfidence(entityId: string): Promise<number | null> {
    if (!this.isReputationEngineEnabled()) {
      return null;
    }

    const profile = await this.reputationRepository.getEntityConfidenceProfile(entityId);

    return profile ? Number(profile.confidenceScore) : null;
  }

  async resolveEntityTrustConfidence(entityId: string): Promise<TrustConfidenceDto> {
    const reputationConfidence = await this.getDisplayConfidence(entityId);

    if (reputationConfidence !== null) {
      return {
        confidence: reputationConfidence
      };
    }

    return this.trustPort.getEntityTrust(entityId);
  }

  private isReputationEngineEnabled(): boolean {
    return this.configService.get<ApplicationConfig>("app")?.reputationEngineEnabled === true;
  }
}
