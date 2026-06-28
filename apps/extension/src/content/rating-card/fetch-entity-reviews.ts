import {
  createAuthenticatedApiRequestMessage,
  createPublicApiRequestMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import { sendExtensionMessage } from "../extension-messaging.js";

export interface CardEntityReview {
  createdAt: string;
  entityId: string;
  id: string;
  isOwnReview: boolean;
  likedByCurrentUser: boolean;
  likesCount: number;
  text: string;
  updatedAt: string;
}

async function readAuthenticatedData<T>(options: {
  body?: unknown;
  method?: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
}): Promise<{ data?: T; errorMessage?: string }> {
  const response = await sendExtensionMessage(
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
  const response = await sendExtensionMessage(createPublicApiRequestMessage(path));

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
): Promise<{ errorMessage?: string; reviews?: CardEntityReview[] }> {
  const result = isAuthenticated
    ? await readAuthenticatedData<CardEntityReview[]>({
        path: `/reviews/entities/${entityId}`
      })
    : await readPublicData<CardEntityReview[]>(`/reviews/entities/${entityId}`);

  if (result.errorMessage) {
    return {
      errorMessage: result.errorMessage
    };
  }

  return {
    reviews: result.data ?? []
  };
}

export async function upsertMyEntityReview(
  entityId: string,
  text: string
): Promise<{ errorMessage?: string; review?: CardEntityReview }> {
  const result = await readAuthenticatedData<CardEntityReview>({
    body: { text },
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
): Promise<{ errorMessage?: string; review?: CardEntityReview }> {
  const result = await readAuthenticatedData<CardEntityReview>({
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
): Promise<{ errorMessage?: string; review?: CardEntityReview }> {
  const result = await readAuthenticatedData<CardEntityReview>({
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
