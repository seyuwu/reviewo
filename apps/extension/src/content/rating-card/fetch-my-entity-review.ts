import type { ContentLocaleParam } from "@reviewo/shared";

import {
  createAuthenticatedApiRequestMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import { appendPathContentLocale } from "../../shared/content-locale.js";
import { sendExtensionMessage } from "../extension-messaging.js";

export interface MyEntityReview {
  text: string;
  updatedAt: string;
}

export async function fetchMyEntityReview(
  entityId: string,
  locale: ContentLocaleParam
): Promise<MyEntityReview | null> {
  const response = await sendExtensionMessage(
    createAuthenticatedApiRequestMessage(
      appendPathContentLocale(`/reviews/entities/${entityId}/my-review`, locale),
      "GET"
    )
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
