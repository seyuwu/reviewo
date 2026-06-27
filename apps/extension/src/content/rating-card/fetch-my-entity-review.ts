import {
  createAuthenticatedApiRequestMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import { sendExtensionMessage } from "../extension-messaging.js";

export interface MyEntityReview {
  text: string;
  updatedAt: string;
}

export async function fetchMyEntityReview(entityId: string): Promise<MyEntityReview | null> {
  const response = await sendExtensionMessage(
    createAuthenticatedApiRequestMessage(`/reviews/entities/${entityId}/my-review`, "GET")
  );

  if (response?.type !== ExtensionMessageType.AuthenticatedApiResult) {
    return null;
  }

  const review = response.payload?.data as { text?: string; updatedAt?: string } | null | undefined;
  const text = review?.text?.trim();

  if (!text) {
    return null;
  }

  return {
    text,
    updatedAt: review?.updatedAt ?? new Date().toISOString()
  };
}
