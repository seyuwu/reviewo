import type { EntityType } from "@prisma/client";

export class EntityDto {
  canonicalUrl!: string | null;
  createdAt!: string;
  createdBy!: string | null;
  description!: string | null;
  id!: string;
  parentId!: string | null;
  slug!: string;
  title!: string;
  type!: EntityType;
  updatedAt!: string;
}
