import { publicEnv } from "../config/public-env";
import { ApiError } from "./api-error";

export async function serverApiRequest<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(new URL(path, publicEnv.apiBaseUrl), {
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
