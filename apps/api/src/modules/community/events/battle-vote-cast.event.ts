import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface BattleVoteCastPayload {
  battleVoteId: string;
  entityId: string;
  pairKey: string;
  userId: string | null;
}

export type BattleVoteCastEvent = DomainEvent<DomainEventName.BattleVoteCast, BattleVoteCastPayload>;

export function createBattleVoteCastEvent(payload: BattleVoteCastPayload): BattleVoteCastEvent {
  return {
    name: DomainEventName.BattleVoteCast,
    occurredAt: new Date(),
    payload
  };
}
