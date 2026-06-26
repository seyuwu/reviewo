import type { TrustConfidenceDto } from "../dto/trust-confidence.dto.js";

export const TRUST_PORT = Symbol("TRUST_PORT");

export interface TrustPort {
  getEntityTrust(entityId: string): Promise<TrustConfidenceDto>;
}
