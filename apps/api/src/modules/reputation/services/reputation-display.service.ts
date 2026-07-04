import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { resolveReliabilityLevel } from "@reviewo/shared";

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
    const trust = await this.resolveEntityTrustConfidence(entityId);

    return trust.confidence;
  }

  async resolveEntityTrustConfidence(entityId: string): Promise<TrustConfidenceDto> {
    if (this.isReputationEngineEnabled()) {
      const profile = await this.reputationRepository.getEntityConfidenceProfile(entityId);

      if (profile) {
        const confidence = Number(profile.confidenceScore);

        return {
          confidence,
          ...(profile.dataReliability !== null && profile.dataReliability !== undefined
            ? { dataReliability: Number(profile.dataReliability) }
            : {}),
          ...(profile.manipulationRisk !== null && profile.manipulationRisk !== undefined
            ? { manipulationRisk: Number(profile.manipulationRisk) }
            : {}),
          reliabilityLevel: resolveReliabilityLevel(confidence)
        };
      }
    }

    return this.trustPort.getEntityTrust(entityId);
  }

  private isReputationEngineEnabled(): boolean {
    return this.configService.get<ApplicationConfig>("app")?.reputationEngineEnabled === true;
  }
}
