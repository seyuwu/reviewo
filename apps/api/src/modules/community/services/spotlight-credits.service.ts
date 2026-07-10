import { HttpStatus, Injectable } from "@nestjs/common";
import type { ContributionLevel, Prisma } from "#prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { PrismaService } from "../../../database/prisma.service.js";
import {
  SPOTLIGHT_EXPIRY_RETENTION_RATE,
  SPOTLIGHT_MAX_ACTIVE_PLACEMENTS_PER_USER,
  SPOTLIGHT_MAX_SPEND_PER_REQUEST,
  SPOTLIGHT_MIN_TRUST_SCORE,
  SPOTLIGHT_MONTHLY_GRANTS
} from "../constants/spotlight-credits.js";
import { ContributionSnapshotRepository } from "../repositories/contribution-snapshot.repository.js";
import { SpotlightCreditsRepository } from "../repositories/spotlight-credits.repository.js";
import type { SpotlightCreditsDto } from "../dto/spotlight.dto.js";

@Injectable()
export class SpotlightCreditsService {
  constructor(
    private readonly contributionSnapshotRepository: ContributionSnapshotRepository,
    private readonly prismaService: PrismaService,
    private readonly spotlightCreditsRepository: SpotlightCreditsRepository
  ) {}

  async getCreditsForUser(userId: string): Promise<SpotlightCreditsDto> {
    const snapshot = await this.contributionSnapshotRepository.findByUserId(userId);
    const level: ContributionLevel = snapshot?.level ?? "newcomer";

    await this.ensureMonthlyGrant(userId, level);

    const [balance, activePlacements] = await Promise.all([
      this.spotlightCreditsRepository.getBalance(userId),
      this.countActivePlacements(userId)
    ]);

    return {
      activePlacements,
      balance: balance?.balance ?? 0,
      level,
      maxActivePlacements: SPOTLIGHT_MAX_ACTIVE_PLACEMENTS_PER_USER,
      monthlyGrant: SPOTLIGHT_MONTHLY_GRANTS[level]
    };
  }

  async spend(
    userId: string,
    amount: number,
    reason: string,
    referenceId?: string,
    transaction?: Prisma.TransactionClient
  ): Promise<number> {
    await this.assertCanSpend(userId);
    this.assertValidSpendAmount(amount);

    try {
      const input = {
        amount,
        reason,
        ...(referenceId ? { referenceId } : {}),
        userId
      };

      if (transaction) {
        return await this.spotlightCreditsRepository.spendCreditsInTransaction(transaction, input);
      }

      return await this.spotlightCreditsRepository.spendCredits(input);
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "Insufficient spotlight credits",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      if (error instanceof Error && error.message === "INVALID_SPEND_AMOUNT") {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "Invalid spotlight spend amount",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      throw error;
    }
  }

  private async ensureMonthlyGrant(userId: string, level: ContributionLevel): Promise<void> {
    const grantPeriod = currentGrantPeriod();

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.spotlightCreditBalance.upsert({
        create: {
          balance: 0,
          userId
        },
        update: {},
        where: { userId }
      });

      const lockedRows = await transaction.$queryRaw<
        Array<{ balance: number; last_grant_period: string | null }>
      >`
        SELECT balance, last_grant_period
        FROM community.spotlight_credit_balances
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `;
      const current = lockedRows[0] ?? { balance: 0, last_grant_period: null };

      if (current.last_grant_period === grantPeriod) {
        return;
      }

      let nextBalance = current.balance;

      if (nextBalance > 0) {
        const expiredAmount = Math.floor(nextBalance * (1 - SPOTLIGHT_EXPIRY_RETENTION_RATE));

        if (expiredAmount > 0) {
          nextBalance -= expiredAmount;
          await transaction.spotlightCreditLedger.create({
            data: {
              amount: -expiredAmount,
              reason: "monthly_expiry",
              userId
            }
          });
        }
      }

      const grantAmount = SPOTLIGHT_MONTHLY_GRANTS[level];

      if (grantAmount > 0) {
        nextBalance += grantAmount;
        await transaction.spotlightCreditLedger.create({
          data: {
            amount: grantAmount,
            reason: "monthly_grant",
            userId
          }
        });
      }

      await transaction.spotlightCreditBalance.update({
        data: {
          balance: nextBalance,
          lastGrantPeriod: grantPeriod
        },
        where: { userId }
      });
    });
  }

  private assertValidSpendAmount(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0 || amount > SPOTLIGHT_MAX_SPEND_PER_REQUEST) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: `Spend between 1 and ${SPOTLIGHT_MAX_SPEND_PER_REQUEST} spotlight credits`,
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
  }

  private async countActivePlacements(userId: string): Promise<number> {
    const now = new Date();

    return this.prismaService.spotlightPlacement.count({
      where: {
        endsAt: { gt: now },
        startsAt: { lte: now },
        userId
      }
    });
  }

  private async assertCanSpend(userId: string): Promise<void> {
    const trustProfile = await this.prismaService.userTrustProfile.findUnique({
      where: { userId }
    });

    if (!trustProfile || Number(trustProfile.trustScore) < SPOTLIGHT_MIN_TRUST_SCORE) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Trust score is too low to spend spotlight credits",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
  }
}

function currentGrantPeriod(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
