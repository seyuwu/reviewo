import { apiRequest } from "../../../lib/api/api-client";

export type SpotlightTrackingEventType = "click" | "impression";

export function recordSpotlightPlacementEvent(
  placementId: string,
  eventType: SpotlightTrackingEventType,
  viewerKey: string,
  accessToken?: string
): Promise<{ recorded: boolean }> {
  return apiRequest<{ recorded: boolean }>(`/spotlight/placements/${placementId}/events`, {
    body: {
      eventType,
      viewerKey
    },
    ...(accessToken
      ? {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      : {}),
    method: "POST"
  });
}
