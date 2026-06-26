import { Injectable } from "@nestjs/common";
import type { Entity, EntityType, Prisma } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface CreateEntityRecordInput {
  canonicalUrl?: string;
  createdBy: string;
  description?: string;
  parentId?: string;
  slug: string;
  title: string;
  type: EntityType;
}

@Injectable()
export class EntitiesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(input: CreateEntityRecordInput): Promise<Entity> {
    const data: Prisma.EntityUncheckedCreateInput = {
      createdBy: input.createdBy,
      slug: input.slug,
      title: input.title,
      type: input.type
    };

    if (input.canonicalUrl) {
      data.canonicalUrl = input.canonicalUrl;
    }

    if (input.description) {
      data.description = input.description;
    }

    if (input.parentId) {
      data.parentId = input.parentId;
    }

    return this.prismaService.entity.create({
      data
    });
  }

  async findById(id: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({
      where: {
        id
      }
    });
  }

  async findByCanonicalUrl(canonicalUrl: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({
      where: {
        canonicalUrl
      }
    });
  }

  async findBySlug(slug: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({
      where: {
        slug
      }
    });
  }

  async search(query: string): Promise<Entity[]> {
    return this.prismaService.entity.findMany({
      orderBy: {
        updatedAt: "desc"
      },
      take: 20,
      where: {
        OR: [
          {
            title: {
              contains: query,
              mode: "insensitive"
            }
          },
          {
            slug: {
              contains: query,
              mode: "insensitive"
            }
          },
          {
            canonicalUrl: {
              contains: query,
              mode: "insensitive"
            }
          }
        ]
      }
    });
  }

  isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}
