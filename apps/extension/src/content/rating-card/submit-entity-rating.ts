import {
  createAuthenticatedApiRequestMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import type { ExtensionQuickRatingResponse } from "../../shared/types/quick-rating.js";
import { sendExtensionMessage } from "../extension-messaging.js";

export async function submitEntityRating(
  entityId: string,
  score: number
): Promise<{ errorMessage?: string; result?: ExtensionQuickRatingResponse }> {
  const response = await sendExtensionMessage(
    createAuthenticatedApiRequestMessage(`/extension/entities/${entityId}/my-rating`, "PUT", {
      score
    })
  );

  if (response?.type === ExtensionMessageType.AuthenticatedApiResult) {
    return {
      result: response.payload?.data as ExtensionQuickRatingResponse
    };
  }

  if (response?.type === ExtensionMessageType.AuthenticatedApiError) {
    return {
      errorMessage: response.payload?.message ?? "Could not save rating."
    };
  }

  return {
    errorMessage: "Could not save rating."
  };
}
