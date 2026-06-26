import { apiRequest } from "../../../lib/api/api-client";
import type { CreateEntityInput, Entity } from "../types/entity";

export function createEntity(input: CreateEntityInput, accessToken: string): Promise<Entity> {
  return apiRequest<Entity>("/entities", {
    body: normalizeCreateEntityInput(input),
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

function normalizeCreateEntityInput(input: CreateEntityInput): CreateEntityInput {
  const normalizedInput: CreateEntityInput = {
    title: input.title,
    type: input.type
  };

  if (input.canonicalUrl) {
    normalizedInput.canonicalUrl = input.canonicalUrl;
  }

  if (input.description) {
    normalizedInput.description = input.description;
  }

  return normalizedInput;
}
