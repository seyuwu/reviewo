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
  errorMessage: string;
  ok: false;
  status: number;
}

export type ApiRequestResponse<TData = unknown> = ApiRequestError | ApiRequestResult<TData>;

export async function apiRequest<TData = unknown>(
  options: ApiRequestOptions
): Promise<ApiRequestResponse<TData>> {
  const endpoint = new URL(options.path, extensionConfig.apiBaseUrl);
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
