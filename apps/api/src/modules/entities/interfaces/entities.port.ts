import type { EntityDto } from "../dto/entity.dto.js";

export const ENTITIES_PORT = Symbol("ENTITIES_PORT");

export interface ResolveEntityByUrlResult {
  canonicalUrl: string;
  entity: EntityDto | null;
  inputUrl: string;
}

export interface EntitiesPort {
  findEntityById(id: string): Promise<EntityDto | null>;
  resolveEntityByUrl(url: string): Promise<ResolveEntityByUrlResult>;
  searchEntities(query: string): Promise<EntityDto[]>;
}
