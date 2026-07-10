import type { DomainEvent } from "../../../common/domain-events/domain-event.js";
import { DomainEventName } from "../../../common/domain-events/domain-event-name.js";

export interface TopLikedPayload {
  categoryId: string | null;
  likeId: string;
  likedByUserId: string;
  topAuthorId: string;
  topId: string;
}

export type TopLikedEvent = DomainEvent<DomainEventName.TopLiked, TopLikedPayload>;

export function createTopLikedEvent(payload: TopLikedPayload): TopLikedEvent {
  return {
    name: DomainEventName.TopLiked,
    occurredAt: new Date(),
    payload
  };
}
