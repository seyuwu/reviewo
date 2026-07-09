import { apiRequest } from "../../../lib/api/api-client";

export async function fetchEntityTitle(entityId: string): Promise<string> {
  const entity = await apiRequest<{ title: string }>(`/entities/${entityId}`);

  return entity.title;
}
