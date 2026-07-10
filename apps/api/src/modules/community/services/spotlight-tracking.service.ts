import { HttpStatus, Injectable } from "@nestjs/common";
import type { SpotlightPlacementEventType } from "#prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { SpotlightPlacementEventsRepository } from "../repositories/spotlight-placement-events.repository.js";

export interface RecordSpotlightEventInput {
  eventType: SpotlightPlacementEventType;
  placementId: string;
  userId?: string;
  viewerKey: string;
}

@Injectable()
export class SpotlightTrackingService {
  constructor(
    private readonly spotlightPlacementEventsRepository: SpotlightPlacementEventsRepository
  ) {}

  async recordEvent(input: RecordSpotlightEventInput) {
    const trimmedViewerKey = input.viewerKey.trim();

    if (!trimmedViewerKey || trimmedViewerKey.length > 120) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Invalid viewer key",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const placement = await this.spotlightPlacementEventsRepository.findActivePlacement(
      input.placementId
    );

    if (!placement) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Spotlight placement not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return this.spotlightPlacementEventsRepository.record({
      eventType: input.eventType,
      placementId: input.placementId,
      userId: input.userId ?? null,
      viewerKey: trimmedViewerKey
    });
  }
}
