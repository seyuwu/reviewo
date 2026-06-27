import {
  createAuthenticatedApiRequestMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import type { ExtensionUserRating } from "../../shared/types/quick-rating.js";
import { sendExtensionMessage } from "../extension-messaging.js";

export async function fetchMyEntityRating(entityId: string): Promise<number | null> {
  const response = await sendExtensionMessage(
    createAuthenticatedApiRequestMessage(`/ratings/entities/${entityId}/my-rating`, "GET")
  );

  if (response?.type !== ExtensionMessageType.AuthenticatedApiResult) {
    return null;
  }

  const rating = response.payload?.data as ExtensionUserRating | null | undefined;

  return typeof rating?.score === "number" ? rating.score : null;
}
