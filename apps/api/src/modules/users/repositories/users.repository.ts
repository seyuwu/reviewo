import { Injectable } from "@nestjs/common";
import type { Prisma, User, UserRole } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

type PrismaClientOrTransaction = Prisma.TransactionClient | PrismaService;

export interface CreateUserInput {
  displayName: string;
  email: string;
}

export interface UpdateUserProfileInput {
  displayName: string;
  email: string;
  username: string | null;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(
    input: CreateUserInput,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<User> {
    return client.user.create({
      data: {
        displayName: input.displayName,
        email: input.email,
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
