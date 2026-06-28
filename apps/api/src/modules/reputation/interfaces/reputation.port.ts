export const REPUTATION_PORT = Symbol("REPUTATION_PORT");

export interface ReputationPort {
  getDisplayConfidence(entityId: string): Promise<number | null>;
}
