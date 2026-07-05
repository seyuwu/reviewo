import { existsSync } from "node:fs";

import { publicEnv } from "../config/public-env";
import { ApiError } from "./api-error";

function getServerApiBaseUrl(): string {
  const internalBaseUrl = process.env.API_INTERNAL_BASE_URL?.trim();

  if (internalBaseUrl) {
    return internalBaseUrl;
  }

  const publicApiBaseUrl = publicEnv.apiBaseUrl;

  if (
    existsSync("/.dockerenv") &&
    (publicApiBaseUrl.includes("localhost:3000") || publicApiBaseUrl.includes("127.0.0.1:3000"))
  ) {
    return "http://api:3000";
  }

  return publicApiBaseUrl;
}

export async function serverApiRequest<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(new URL(path, getServerApiBaseUrl()), {
    next: { revalidate: 60 }
  });

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError("API request failed", response.status, responseBody);
  }

  return responseBody as TResponse;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
