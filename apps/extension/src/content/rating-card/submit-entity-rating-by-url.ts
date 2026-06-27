import {
  createAuthenticatedApiRequestMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import type { ExtensionByUrlRatingResponse } from "../../shared/types/quick-rating.js";
import { sendExtensionMessage } from "../extension-messaging.js";

export async function submitEntityRatingByUrl(
  url: string,
  score: number,
  sourceTitle?: string
): Promise<{ errorMessage?: string; result?: ExtensionByUrlRatingResponse }> {
  const response = await sendExtensionMessage(
    createAuthenticatedApiRequestMessage("/extension/entities/by-url/my-rating", "PUT", {
      score,
      sourceTitle,
      url
    })
  );

  if (response?.type === ExtensionMessageType.AuthenticatedApiResult) {
    return {
      result: response.payload?.data as ExtensionByUrlRatingResponse
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
