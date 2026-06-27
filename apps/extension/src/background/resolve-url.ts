import { extensionConfig } from "../shared/config.js";
import type { ExtensionResolveResponse } from "../shared/types/resolve.js";

export async function resolveUrlWithApi(url: string): Promise<ExtensionResolveResponse> {
  const endpoint = new URL("/extension/resolve", extensionConfig.apiBaseUrl);
  endpoint.searchParams.set("url", url);

  const response = await fetch(endpoint.toString());

  if (!response.ok) {
    throw new Error(`Extension resolve failed with status ${response.status}`);
  }

  return (await response.json()) as ExtensionResolveResponse;
}
