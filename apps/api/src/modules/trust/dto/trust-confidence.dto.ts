export type ReliabilityLevel = "very_high" | "high" | "medium" | "low";

export interface TrustConfidenceDto {
  confidence: number;
  dataReliability?: number;
  manipulationRisk?: number;
  reliabilityLevel?: ReliabilityLevel;
}
