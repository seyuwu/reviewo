import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import { DOTA_ATTRIBUTE_KEYS } from "@reviewo/shared";

@Injectable()
export class EntityAttributesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async upsertMany(entityId: string, attributes: Record<string, string>): Promise<void> {
    const entries = Object.entries(attributes);

    if (entries.length === 0) {
      return;
    }

    await this.prismaService.$transaction(
      entries.map(([key, value]) =>
        this.prismaService.entityAttribute.upsert({
          create: {
            entityId,
            key,
            value
          },
          update: {
            value
          },
          where: {
            entityId_key: {
              entityId,
              key
            }
          }
        })
      )
    );
  }

  async findByEntityId(entityId: string): Promise<Record<string, string>> {
    const rows = await this.prismaService.entityAttribute.findMany({
      where: {
        entityId
      }
    });

    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async findEntityIdByDotaAccountId(accountId: string): Promise<string | null> {
    const row = await this.prismaService.entityAttribute.findFirst({
      select: {
        entityId: true
      },
      where: {
        key: DOTA_ATTRIBUTE_KEYS.dotaAccountId,
        value: accountId
      }
    });

    return row?.entityId ?? null;
  }

  isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}
