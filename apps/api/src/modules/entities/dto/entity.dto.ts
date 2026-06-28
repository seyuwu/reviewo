import type { EntityType, EntityVisibility } from "@prisma/client";

export class EntityDto {
  canonicalUrl!: string | null;
  createdAt!: string;
  description!: string | null;
  id!: string;
  parentId!: string | null;
  slug!: string;
  title!: string;
  type!: EntityType;
  updatedAt!: string;
  visibility!: EntityVisibility;
}
