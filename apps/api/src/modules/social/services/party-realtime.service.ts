import { Injectable } from "@nestjs/common";

import type {
  PartyNotificationPayload,
  PartyRealtimePublisher,
  PartyRecruitUpdatedPayload
} from "../party-realtime.types.js";
import { GamePartyGateway } from "../gateways/game-party.gateway.js";

/**
 * Publishes party realtime events without creating an ESM circular import
 * between GamePartiesService and GamePartyGateway.
 */
@Injectable()
export class PartyRealtimeService implements PartyRealtimePublisher {
  constructor(private readonly gamePartyGateway: GamePartyGateway) {}

  emitPartyNotification(userId: string, payload: PartyNotificationPayload): void {
    this.gamePartyGateway.emitPartyNotification(userId, payload);
  }

  broadcastPartyRecruitUpdated(payload: PartyRecruitUpdatedPayload): void {
    this.gamePartyGateway.broadcastPartyRecruitUpdated(payload);
  }
}
