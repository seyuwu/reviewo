import {
  createAuthenticatedApiRequestMessage,
  createPublicApiRequestMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import type { ExtensionReview } from "../types/review.js";
import { sendExtensionMessage } from "./popup-messaging.js";

async function readAuthenticatedData<T>(options: {
  body?: unknown;
  method?: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
}): Promise<{ data?: T; errorMessage?: string }> {
  const response = await sendExtensionMessage<{
    payload?: { data?: T; message?: string };
    type?: string;
  }>(
    createAuthenticatedApiRequestMessage(
      options.path,
      options.method ?? "GET",
      options.body
    )
  );

  if (response?.type === ExtensionMessageType.AuthenticatedApiResult) {
    return {
      data: response.payload?.data as T
    };
  }

  if (response?.type === ExtensionMessageType.AuthenticatedApiError) {
    return {
      errorMessage: response.payload?.message ?? "Request failed."
    };
  }

  return {
    errorMessage: "Request failed."
  };
}

async function readPublicData<T>(path: string): Promise<{ data?: T; errorMessage?: string }> {
  const response = await sendExtensionMessage<{
    payload?: { data?: T; message?: string };
    type?: string;
  }>(createPublicApiRequestMessage(path));

  if (response?.type === ExtensionMessageType.PublicApiResult) {
    return {
      data: response.payload?.data as T
    };
  }

  if (response?.type === ExtensionMessageType.PublicApiError) {
    return {
      errorMessage: response.payload?.message ?? "Request failed."
    };
  }

  return {
    errorMessage: "Request failed."
  };
}

export async function fetchEntityReviews(
  entityId: string,
  isAuthenticated: boolean
): Promise<{ errorMessage?: string; reviews?: ExtensionReview[] }> {
  const result = isAuthenticated
    ? await readAuthenticatedData<ExtensionReview[]>({
        path: `/reviews/entities/${entityId}`
      })
    : await readPublicData<ExtensionReview[]>(`/reviews/entities/${entityId}`);

  if (result.errorMessage) {
    return {
      errorMessage: result.errorMessage
    };
  }

  return {
    reviews: result.data ?? []
  };
}

export async function fetchMyEntityReview(
  entityId: string
): Promise<{ errorMessage?: string; review?: ExtensionReview | null }> {
  const result = await readAuthenticatedData<ExtensionReview | null>({
    path: `/reviews/entities/${entityId}/my-review`
  });

  if (result.errorMessage) {
    return {
      errorMessage: result.errorMessage
    };
  }

  return {
    review: result.data ?? null
  };
}

export async function upsertMyEntityReview(
  entityId: string,
  text: string
): Promise<{ errorMessage?: string; review?: ExtensionReview }> {
  const result = await readAuthenticatedData<ExtensionReview>({
    body: {
      text
    },
    method: "PUT",
    path: `/reviews/entities/${entityId}/my-review`
  });

  if (result.errorMessage) {
    return {
      errorMessage: result.errorMessage
    };
  }

  if (!result.data) {
    return {
      errorMessage: "Could not save review."
    };
  }

  return {
    review: result.data
  };
}

export async function likeEntityReview(
  reviewId: string
): Promise<{ errorMessage?: string; review?: ExtensionReview }> {
  const result = await readAuthenticatedData<ExtensionReview>({
    method: "POST",
    path: `/reviews/${reviewId}/like`
  });

  if (result.errorMessage) {
    return {
      errorMessage: result.errorMessage
    };
  }

  if (!result.data) {
    return {
      errorMessage: "Could not like review."
    };
  }

  return {
    review: result.data
  };
}

export async function unlikeEntityReview(
  reviewId: string
): Promise<{ errorMessage?: string; review?: ExtensionReview }> {
  const result = await readAuthenticatedData<ExtensionReview>({
    method: "DELETE",
    path: `/reviews/${reviewId}/like`
  });

  if (result.errorMessage) {
    return {
      errorMessage: result.errorMessage
    };
  }

  if (!result.data) {
    return {
      errorMessage: "Could not remove like."
    };
  }

  return {
    review: result.data
  };
}
