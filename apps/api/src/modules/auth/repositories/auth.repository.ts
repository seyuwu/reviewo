import { Injectable } from "@nestjs/common";
import type {
  AccountRecoveryToken,
  Prisma,
  RefreshToken,
  User,
  UserAuthIdentity
} from "#prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";

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

export type RecoveryTokenWithUser = AccountRecoveryToken & {
  user: User;
};

export type RefreshTokenWithUser = RefreshToken & {
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

  async createGuestIdentity(
    userId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<UserAuthIdentity> {
    return client.userAuthIdentity.create({
      data: {
        passwordHash: null,
        provider: "guest",
        providerUserId: randomUUID(),
        userId
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

  async findEmailIdentityByUserId(userId: string): Promise<UserAuthIdentity | null> {
    return this.prismaService.userAuthIdentity.findFirst({
      where: {
        provider: "email",
        userId
      }
    });
  }

  async findGuestIdentityByUserId(userId: string): Promise<UserAuthIdentity | null> {
    return this.prismaService.userAuthIdentity.findFirst({
      where: {
        provider: "guest",
        userId
      }
    });
  }

  async createDiscordIdentity(
    userId: string,
    discordUserId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<UserAuthIdentity> {
    return client.userAuthIdentity.create({
      data: {
        passwordHash: null,
        provider: "discord",
        providerUserId: discordUserId,
        userId
      }
    });
  }

  async findDiscordIdentityByUserId(userId: string): Promise<UserAuthIdentity | null> {
    return this.prismaService.userAuthIdentity.findFirst({
      where: {
        provider: "discord",
        userId
      }
    });
  }

  async findDiscordIdentityByDiscordUserId(
    discordUserId: string
  ): Promise<EmailIdentityWithUser | null> {
    return this.prismaService.userAuthIdentity.findUnique({
      include: {
        user: true
      },
      where: {
        provider_providerUserId: {
          provider: "discord",
          providerUserId: discordUserId
        }
      }
    });
  }

  async deleteDiscordIdentityByUserId(userId: string): Promise<void> {
    await this.prismaService.userAuthIdentity.deleteMany({
      where: {
        provider: "discord",
        userId
      }
    });
  }

  async updateEmailIdentity(
    id: string,
    input: {
      email: string;
      passwordHash?: string;
    },
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<UserAuthIdentity> {
    return client.userAuthIdentity.update({
      data: {
        providerUserId: input.email,
        ...(input.passwordHash ? { passwordHash: input.passwordHash } : {})
      },
      where: {
        id
      }
    });
  }

  createRecoveryTokenPlaintext(): string {
    return randomBytes(32).toString("base64url");
  }

  hashRecoveryToken(token: string): string {
    return createHash("sha256").update(token).digest("base64url");
  }

  async createRecoveryToken(
    userId: string,
    tokenHash: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<AccountRecoveryToken> {
    return client.accountRecoveryToken.create({
      data: {
        tokenHash,
        userId
      }
    });
  }

  async findActiveRecoveryTokenByHash(tokenHash: string): Promise<RecoveryTokenWithUser | null> {
    return this.prismaService.accountRecoveryToken.findFirst({
      include: {
        user: true
      },
      where: {
        consumedAt: null,
        tokenHash
      }
    });
  }

  async consumeRecoveryToken(
    id: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<AccountRecoveryToken> {
    return client.accountRecoveryToken.update({
      data: {
        consumedAt: new Date()
      },
      where: {
        id
      }
    });
  }

  async consumeActiveRecoveryTokensForUser(
    userId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<void> {
    await client.accountRecoveryToken.updateMany({
      data: {
        consumedAt: new Date()
      },
      where: {
        consumedAt: null,
        userId
      }
    });
  }

  createRefreshTokenPlaintext(): string {
    return randomBytes(48).toString("base64url");
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("base64url");
  }

  async createRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<RefreshToken> {
    return client.refreshToken.create({
      data: {
        expiresAt,
        tokenHash,
        userId
      }
    });
  }

  async rotateRefreshToken(input: {
    expiresAt: Date;
    id: string;
    nextTokenHash: string;
    now: Date;
    userId: string;
  }): Promise<boolean> {
    return this.prismaService.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.updateMany({
        data: { revokedAt: input.now },
        where: {
          expiresAt: { gt: input.now },
          id: input.id,
          revokedAt: null
        }
      });

      if (revoked.count !== 1) {
        return false;
      }

      await this.createRefreshToken(
        input.userId,
        input.nextTokenHash,
        input.expiresAt,
        transaction
      );

      return true;
    });
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenWithUser | null> {
    return this.prismaService.refreshToken.findUnique({
      include: {
        user: true
      },
      where: {
        tokenHash
      }
    });
  }

  async revokeRefreshToken(
    id: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<void> {
    await client.refreshToken.update({
      data: {
        revokedAt: new Date()
      },
      where: {
        id
      }
    });
  }

  async revokeRefreshTokensForUser(
    userId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<void> {
    await client.refreshToken.updateMany({
      data: {
        revokedAt: new Date()
      },
      where: {
        revokedAt: null,
        userId
      }
    });
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
