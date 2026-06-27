import { extensionConfig } from "../../shared/config.js";
import type { ExtensionEntityChildrenResponse } from "../../shared/types/children.js";

export async function fetchEntityChildren(
  parentId: string,
  limit = 20
): Promise<ExtensionEntityChildrenResponse> {
  const endpoint = new URL(`/extension/entities/${parentId}/children`, extensionConfig.apiBaseUrl);
  endpoint.searchParams.set("limit", String(limit));

  const response = await fetch(endpoint.toString());

  if (!response.ok) {
    throw new Error(`Children lookup failed with status ${response.status}`);
  }

  return (await response.json()) as ExtensionEntityChildrenResponse;
}
