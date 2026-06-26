import type { EntityDto } from "../dto/entity.dto.js";

export const ENTITIES_PORT = Symbol("ENTITIES_PORT");

export interface EntitiesPort {
  findEntityById(id: string): Promise<EntityDto | null>;
  searchEntities(query: string): Promise<EntityDto[]>;
}
