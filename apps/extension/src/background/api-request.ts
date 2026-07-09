import { extensionConfig } from "../shared/config.js";

export interface ApiRequestOptions {
  accessToken?: string;
  body?: unknown;
  method?: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
}

export interface ApiRequestResult<TData = unknown> {
  data: TData;
  ok: true;
  status: number;
}

export interface ApiRequestError {
  errorDetails?: unknown;
  errorMessage: string;
  ok: false;
  status: number;
}

export type ApiRequestResponse<TData = unknown> = ApiRequestError | ApiRequestResult<TData>;

export function resolveApiEndpoint(
  path: string,
  apiBaseUrl = extensionConfig.apiBaseUrl
): URL {
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new Error("API path is required.");
  }

  const normalizedPath = path.trim();

  if (normalizedPath.startsWith("//")) {
    throw new Error("Protocol-relative API paths are not allowed.");
  }

  const base = new URL(apiBaseUrl);
  const endpoint = new URL(normalizedPath, base);

  if (endpoint.origin !== base.origin) {
    throw new Error("API path must stay on the configured API origin.");
  }

  if (!endpoint.pathname.startsWith("/")) {
    throw new Error("Invalid API path.");
  }

  return endpoint;
}

export async function apiRequest<TData = unknown>(
  options: ApiRequestOptions
): Promise<ApiRequestResponse<TData>> {
  let endpoint: URL;

  try {
    endpoint = resolveApiEndpoint(options.path);
  } catch (error: unknown) {
    const messageText = error instanceof Error ? error.message : "Invalid API path.";

    return {
      errorMessage: messageText,
      ok: false,
      status: 400
    };
  }

  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(endpoint.toString(), {
    body: options.body === undefined ? null : JSON.stringify(options.body),
    headers,
    method: options.method ?? "GET"
  });

  const data = await parseResponseBody(response);

  if (!response.ok) {
    return {
      errorDetails: extractErrorDetails(data),
      errorMessage: extractErrorMessage(data, response.status),
      ok: false,
      status: response.status
    };
  }

  return {
    data: data as TData,
    ok: true,
    status: response.status
  };
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

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: { message?: string } }).error;

    if (error?.message) {
      return error.message;
    }
  }

  return `API request failed with status ${status}`;
}

function extractErrorDetails(data: unknown): unknown {
  if (data && typeof data === "object" && "error" in data) {
    return (data as { error?: { details?: unknown } }).error?.details;
  }

  return undefined;
}
