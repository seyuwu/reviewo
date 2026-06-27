import type { EnsureEntityForUrlInput, EnsureEntityForUrlResult } from "./ensure-entity-for-url.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EntityDto } from "../dto/entity.dto.js";

export const ENTITIES_PORT = Symbol("ENTITIES_PORT");

export interface ResolveEntityByUrlResult {
  canonicalUrl: string;
  entity: EntityDto | null;
  inputUrl: string;
  resolution: EntityUrlResolution;
}

export type EntityUrlResolution = "found" | "hidden" | "not_found";

export interface EntitiesPort {
  ensureEntityForUrl(
    url: string,
    input: EnsureEntityForUrlInput,
    currentUser: AuthenticatedUser
  ): Promise<EnsureEntityForUrlResult>;
  findEntityById(id: string): Promise<EntityDto | null>;
  hideEntity(entityId: string): Promise<EntityDto>;
  resolveEntityByUrl(url: string): Promise<ResolveEntityByUrlResult>;
  searchEntities(query: string): Promise<EntityDto[]>;
  unhideEntity(entityId: string): Promise<EntityDto>;
}
