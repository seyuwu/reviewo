import { Injectable } from "@nestjs/common";
import type { Prisma, User, UserRole } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

type PrismaClientOrTransaction = Prisma.TransactionClient | PrismaService;

export interface CreateUserInput {
  displayName: string;
  email: string;
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
