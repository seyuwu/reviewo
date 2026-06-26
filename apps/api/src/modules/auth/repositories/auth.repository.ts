import { Injectable } from "@nestjs/common";
import type { Prisma, User, UserAuthIdentity } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

type PrismaClientOrTransaction = Prisma.TransactionClient | PrismaService;

export interface CreateEmailIdentityInput {
  email: string;
  passwordHash: string;
  userId: string;
}

export type EmailIdentityWithUser = UserAuthIdentity & {
  user: User;
};

@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createEmailIdentity(
    input: CreateEmailIdentityInput,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<UserAuthIdentity> {
    return client.userAuthIdentity.create({
      data: {
        passwordHash: input.passwordHash,
        provider: "email",
        providerUserId: input.email,
        userId: input.userId
      }
    });
  }

  async findEmailIdentity(email: string): Promise<EmailIdentityWithUser | null> {
    return this.prismaService.userAuthIdentity.findUnique({
      include: {
        user: true
      },
      where: {
        provider_providerUserId: {
          provider: "email",
          providerUserId: email
        }
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
