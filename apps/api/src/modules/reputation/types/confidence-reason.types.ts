export type ConfidenceReasonImpact = "positive" | "neutral" | "negative";

export interface ConfidenceReason {
  code: string;
  impact: ConfidenceReasonImpact;
  label: string;
  weight?: number;
}
