import { Injectable } from "@nestjs/common";
import type { Prisma } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface AdjustCreditsInput {
  amount: number;
  reason: string;
  referenceId?: string;
  userId: string;
}

export interface SpendCreditsInput {
  amount: number;
  reason: string;
  referenceId?: string;
  userId: string;
}

@Injectable()
export class SpotlightCreditsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async getBalance(userId: string) {
    return this.prismaService.spotlightCreditBalance.findUnique({
      where: { userId }
    });
  }

  async spendCredits(input: SpendCreditsInput): Promise<number> {
    return this.prismaService.$transaction((transaction) =>
      this.spendCreditsInTransaction(transaction, input)
    );
  }

  async spendCreditsInTransaction(
    transaction: Prisma.TransactionClient,
    input: SpendCreditsInput
  ): Promise<number> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error("INVALID_SPEND_AMOUNT");
    }

    await transaction.spotlightCreditBalance.upsert({
      create: {
        balance: 0,
        userId: input.userId
      },
      update: {},
      where: { userId: input.userId }
    });

    const rows = await transaction.$queryRaw<Array<{ balance: number }>>`
      UPDATE community.spotlight_credit_balances
      SET balance = balance - ${input.amount},
          updated_at = NOW()
      WHERE user_id = ${input.userId}::uuid
        AND balance >= ${input.amount}
      RETURNING balance
    `;

    if (rows.length === 0) {
      throw new Error("INSUFFICIENT_CREDITS");
    }

    await transaction.spotlightCreditLedger.create({
      data: {
        amount: -input.amount,
        reason: input.reason,
        referenceId: input.referenceId ?? null,
        userId: input.userId
      }
    });

    return rows[0]?.balance ?? 0;
  }

  async adjustBalance(input: AdjustCreditsInput): Promise<number> {
    if (input.amount < 0) {
      return this.spendCredits({
        amount: Math.abs(input.amount),
        reason: input.reason,
        ...(input.referenceId ? { referenceId: input.referenceId } : {}),
        userId: input.userId
      });
    }

    return this.prismaService.$transaction(async (transaction) => {
      await transaction.spotlightCreditBalance.upsert({
        create: {
          balance: 0,
          userId: input.userId
        },
        update: {},
        where: { userId: input.userId }
      });

      const lockedRows = await transaction.$queryRaw<Array<{ balance: number }>>`
        SELECT balance
        FROM community.spotlight_credit_balances
        WHERE user_id = ${input.userId}::uuid
        FOR UPDATE
      `;
      const currentBalance = lockedRows[0]?.balance ?? 0;
      const nextBalance = currentBalance + input.amount;

      await transaction.spotlightCreditBalance.update({
        data: {
          balance: nextBalance
        },
        where: { userId: input.userId }
      });

      await transaction.spotlightCreditLedger.create({
        data: {
          amount: input.amount,
          reason: input.reason,
          referenceId: input.referenceId ?? null,
          userId: input.userId
        }
      });

      return nextBalance;
    });
  }

  async setGrantPeriod(userId: string, grantPeriod: string): Promise<void> {
    await this.prismaService.spotlightCreditBalance.upsert({
      create: {
        balance: 0,
        lastGrantPeriod: grantPeriod,
        userId
      },
      update: {
        lastGrantPeriod: grantPeriod
      },
      where: { userId }
    });
  }
}
