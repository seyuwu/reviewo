import { ApiError } from "./api-error";
import { publicEnv } from "../config/public-env";

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  const { body, headers, ...requestOptions } = options;
  const requestInit: RequestInit = {
    ...requestOptions,
    headers: {
      ...(body === undefined ? undefined : { "content-type": "application/json" }),
      ...headers
    }
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(createApiUrl(path), requestInit);

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError("API request failed", response.status, responseBody);
  }

  return responseBody as TResponse;
}

function createApiUrl(path: string): URL {
  return new URL(path, publicEnv.apiBaseUrl);
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
