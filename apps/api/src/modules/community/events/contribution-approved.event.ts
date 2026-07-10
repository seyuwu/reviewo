import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface ContributionApprovedPayload {
  authorId: string;
  contributionId: string;
  contributionType: string;
  entityId: string;
}

export type ContributionApprovedEvent = DomainEvent<
  DomainEventName.ContributionApproved,
  ContributionApprovedPayload
>;

export function createContributionApprovedEvent(
  payload: ContributionApprovedPayload
): ContributionApprovedEvent {
  return {
    name: DomainEventName.ContributionApproved,
    occurredAt: new Date(),
    payload
  };
}
