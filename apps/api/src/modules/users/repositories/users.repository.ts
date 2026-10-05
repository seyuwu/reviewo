import { Injectable } from "@nestjs/common";
import type { Prisma, User, UserRole } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

type PrismaClientOrTransaction = Prisma.TransactionClient | PrismaService;

export interface CreateUserInput {
  displayName: string;
  email?: string | null;
}

export interface UpdateUserProfileInput {
  displayName: string;
  email: string;
  username: string | null;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findTelegramContact(userId: string) {
    return this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        telegramContactVisible: true,
        authIdentities: {
          where: { provider: "telegram" },
          take: 1,
          select: { telegramUsername: true }
        }
      }
    });
  }

  async setTelegramContactVisibility(userId: string, visible: boolean): Promise<void> {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { telegramContactVisible: visible }
    });
  }

  async create(
    input: CreateUserInput,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<User> {
    return client.user.create({
      data: {
        displayName: input.displayName,
        email: input.email ?? null,
        status: "active"
      }
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prismaService.user.findUnique({
      where: {
        email
      }
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prismaService.user.findUnique({
      where: {
        id
      }
    });
  }

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.prismaService.user.findMany({
      where: { id: { in: ids } }
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prismaService.user.findUnique({
      where: {
        username
      }
    });
  }

  async findByUsernameInsensitive(username: string): Promise<User | null> {
    const normalized = username.trim();

    if (!normalized) {
      return null;
    }

    return this.prismaService.user.findFirst({
      where: {
        username: {
          equals: normalized,
          mode: "insensitive"
        }
      }
    });
  }

  async searchByUsernameOrDisplayName(query: string, limit = 10): Promise<User[]> {
    const normalized = query.trim();

    if (!normalized) {
      return [];
    }

    return this.prismaService.user.findMany({
      take: limit,
      where: {
        OR: [
          {
            username: {
              contains: normalized,
              mode: "insensitive"
            }
          },
          {
            displayName: {
              contains: normalized,
              mode: "insensitive"
            }
          }
        ]
      }
    });
  }

  async searchRoleManagementUsers(query: string, limit: number) {
    return this.prismaService.user.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: { displayName: true, id: true, role: true, username: true },
      take: limit,
      where: {
        status: "active",
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { displayName: { contains: query, mode: "insensitive" } },
          ...(isUuid(query) ? [{ id: query }] : [])
        ]
      }
    });
  }

  async updateRoleUnlessAdmin(id: string, role: UserRole) {
    const result = await this.prismaService.user.updateMany({
      data: { role },
      where: { id, role: { not: "ADMIN" }, status: "active" }
    });
    if (result.count !== 1) return null;

    return this.prismaService.user.findUnique({
      select: { displayName: true, id: true, role: true, username: true },
      where: { id }
    });
  }

  async updateProfile(
    id: string,
    input: UpdateUserProfileInput,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<User> {
    return client.user.update({
      data: {
        displayName: input.displayName,
        email: input.email,
        username: input.username
      },
      where: {
        id
      }
    });
  }

  async updateDisplayName(
    id: string,
    displayName: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<User> {
    return client.user.update({
      data: { displayName },
      where: { id }
    });
  }

  async updateAvatarUrl(
    id: string,
    avatarUrl: string | null,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<User> {
    return client.user.update({
      data: { avatarUrl },
      where: { id }
    });
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    return this.prismaService.user.update({
      data: {
        role
      },
      where: {
        id
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
