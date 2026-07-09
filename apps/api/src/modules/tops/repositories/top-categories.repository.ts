import { Injectable } from "@nestjs/common";
import type { TopCategory } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

@Injectable()
export class TopCategoriesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listAll(): Promise<TopCategory[]> {
    return this.prismaService.topCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
    });
  }

  async findBySlug(slug: string): Promise<TopCategory | null> {
    return this.prismaService.topCategory.findUnique({
      where: { slug }
    });
  }

  async findById(id: string): Promise<TopCategory | null> {
    return this.prismaService.topCategory.findUnique({
      where: { id }
    });
  }

  async getMaxSortOrder(): Promise<number> {
    const row = await this.prismaService.topCategory.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true }
    });

    return row?.sortOrder ?? 0;
  }

  async create(input: { slug: string; sortOrder: number; title: string }): Promise<TopCategory> {
    return this.prismaService.topCategory.create({
      data: {
        slug: input.slug,
        sortOrder: input.sortOrder,
        title: input.title
      }
    });
  }

  isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
