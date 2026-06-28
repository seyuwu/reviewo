import type { ConfidenceReason } from "../types/confidence-reason.types.js";

export interface EntityConfidenceExplanationDto {
  confidence: number;
  entityId: string;
  reasons: ConfidenceReason[];
}
