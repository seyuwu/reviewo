import type { EntityDto } from "../dto/entity.dto.js";

export interface EnsureEntityForUrlInput {
  sourceTitle?: string;
}

export type EnsureEntityForUrlMode = "created" | "existing";

export interface EnsureEntityForUrlResult {
  entity: EntityDto;
  mode: EnsureEntityForUrlMode;
}
