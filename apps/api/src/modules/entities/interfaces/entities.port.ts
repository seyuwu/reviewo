import type { EntityDto } from "../dto/entity.dto.js";
import type { EnsureEntityForUrlInput, EnsureEntityForUrlResult } from "./ensure-entity-for-url.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";

export const ENTITIES_PORT = Symbol("ENTITIES_PORT");

export interface ResolveEntityByUrlResult {
  canonicalUrl: string;
  entity: EntityDto | null;
  inputUrl: string;
}

export interface EntitiesPort {
  ensureEntityForUrl(
    url: string,
    input: EnsureEntityForUrlInput,
    currentUser: AuthenticatedUser
  ): Promise<EnsureEntityForUrlResult>;
  findEntityById(id: string): Promise<EntityDto | null>;
  resolveEntityByUrl(url: string): Promise<ResolveEntityByUrlResult>;
  searchEntities(query: string): Promise<EntityDto[]>;
}
