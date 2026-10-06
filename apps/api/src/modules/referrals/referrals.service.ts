import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "#prisma/client";
import { PrismaService } from "../../database/prisma.service.js";
import type { BotReferralEventDto, ReferralRangeDto } from "./referrals.dto.js";

const PAGE_SIZE = 25;
const DAY_MS = 86400000;

export function referralRange(input: ReferralRangeDto) {
  const parse = (value: string) => {
    const utc = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException("Invalid referral date");
    }
    return new Date(utc.getTime() - 3 * 3600000);
  };
  const start = parse(input.from),
    end = new Date(parse(input.to).getTime() + DAY_MS);
  if (end <= start || end.getTime() - start.getTime() > 366 * DAY_MS) {
    throw new BadRequestException("Choose an ordered period of up to 366 days");
  }
  return { start, end, offset: input.offset ?? 0 };
}

type TotalsRow = {
  invited: number;
  inviters: number;
  accounts: number;
  createdAccounts: number;
  searched: number;
  joined: number;
};
type LeaderRow = {
  inviterTelegramId: string;
  displayName: string;
  telegramUsername: string | null;
  userId: string | null;
  invited: number;
  accounts: number;
  searched: number;
  joined: number;
};
type InviteeRow = {
  inviteeTelegramId: string;
  displayName: string;
  telegramUsername: string | null;
  startedAt: Date;
  accountCreatedAt: Date | null;
  accountReadyAt: Date | null;
  searchStartedAt: Date | null;
  partyJoinedAt: Date | null;
};

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(events: BotReferralEventDto[]) {
    const now = Date.now() + 5 * 60000;
    for (const e of events) {
      const started = new Date(e.startedAt).getTime();
      if (
        e.inviterTelegramId === e.inviteeTelegramId ||
        !Number.isFinite(started) ||
        started > now ||
        started < 0
      ) {
        throw new BadRequestException("Invalid referral attribution");
      }
      for (const at of [e.accountCreatedAt, e.accountReadyAt, e.searchStartedAt, e.partyJoinedAt]) {
        if (at && (new Date(at).getTime() < started || new Date(at).getTime() > now)) {
          throw new BadRequestException("Invalid referral milestone time");
        }
      }
    }
    const at = (value?: string | null) => (value ? new Date(value) : null);
    await this.prisma.$transaction(
      events.map(
        (e) => this.prisma.$executeRaw`
      INSERT INTO community.fdp_referrals AS stored
        (invitee_telegram_id, inviter_telegram_id, code, inviter_name, inviter_username,
         invitee_name, invitee_username, started_at, account_created_at, account_ready_at,
         search_started_at, party_joined_at, updated_at)
      VALUES (${e.inviteeTelegramId}, ${e.inviterTelegramId}, ${e.code}, ${e.inviterName}, ${e.inviterUsername ?? null},
        ${e.inviteeName}, ${e.inviteeUsername ?? null}, ${at(e.startedAt)}, ${at(e.accountCreatedAt)},
        ${at(e.accountReadyAt)}, ${at(e.searchStartedAt)}, ${at(e.partyJoinedAt)}, NOW())
      ON CONFLICT (invitee_telegram_id) DO UPDATE SET
        account_created_at = LEAST(stored.account_created_at, EXCLUDED.account_created_at),
        account_ready_at = LEAST(stored.account_ready_at, EXCLUDED.account_ready_at),
        search_started_at = LEAST(stored.search_started_at, EXCLUDED.search_started_at),
        party_joined_at = LEAST(stored.party_joined_at, EXCLUDED.party_joined_at),
        updated_at = NOW()
      WHERE stored.inviter_telegram_id = EXCLUDED.inviter_telegram_id
        AND stored.code = EXCLUDED.code AND stored.started_at = EXCLUDED.started_at
    `
      )
    );
    return { ok: true };
  }

  async leaderboard(input: ReferralRangeDto) {
    const { start, end, offset } = referralRange(input);
    const [totals, items] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::int AS invited, COUNT(DISTINCT inviter_telegram_id)::int AS inviters,
          COUNT(*) FILTER (WHERE account_ready_at < ${end})::int AS accounts,
          COUNT(*) FILTER (WHERE account_created_at < ${end})::int AS "createdAccounts",
          COUNT(*) FILTER (WHERE search_started_at < ${end})::int AS searched,
          COUNT(*) FILTER (WHERE party_joined_at < ${end})::int AS joined
        FROM community.fdp_referrals WHERE started_at >= ${start} AND started_at < ${end}
      `,
        this.prisma.$queryRaw<LeaderRow[]>`
        WITH ranked AS (
          SELECT inviter_telegram_id, COUNT(*)::int AS invited,
            COUNT(*) FILTER (WHERE account_ready_at < ${end})::int AS accounts,
            COUNT(*) FILTER (WHERE search_started_at < ${end})::int AS searched,
            COUNT(*) FILTER (WHERE party_joined_at < ${end})::int AS joined
          FROM community.fdp_referrals WHERE started_at >= ${start} AND started_at < ${end}
          GROUP BY inviter_telegram_id ORDER BY invited DESC, inviter_telegram_id ASC
          LIMIT ${PAGE_SIZE} OFFSET ${offset}
        )
        SELECT r.inviter_telegram_id AS "inviterTelegramId", r.invited, r.accounts, r.searched, r.joined,
          COALESCE(u.display_name, snapshot.inviter_name) AS "displayName",
          CASE WHEN i.id IS NOT NULL THEN i.telegram_username ELSE snapshot.inviter_username END AS "telegramUsername",
          u.id AS "userId"
        FROM ranked r
        LEFT JOIN auth.user_auth_identities i ON i.provider='telegram' AND i.provider_user_id=r.inviter_telegram_id
        LEFT JOIN users.users u ON u.id=i.user_id
        LEFT JOIN LATERAL (
          SELECT inviter_name, inviter_username FROM community.fdp_referrals
          WHERE inviter_telegram_id=r.inviter_telegram_id ORDER BY started_at DESC LIMIT 1
        ) snapshot ON TRUE
        ORDER BY r.invited DESC, r.inviter_telegram_id ASC
      `
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    return {
      from: input.from,
      to: input.to,
      timezone: "Europe/Moscow",
      pageSize: PAGE_SIZE,
      offset,
      totals: totals[0],
      items,
      updatedAt: new Date().toISOString()
    };
  }

  async invitees(inviterTelegramId: string, input: ReferralRangeDto) {
    const { start, end, offset } = referralRange(input);
    const [counts, items] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM community.fdp_referrals
        WHERE inviter_telegram_id=${inviterTelegramId} AND started_at>=${start} AND started_at<${end}
      `,
        this.prisma.$queryRaw<InviteeRow[]>`
        SELECT r.invitee_telegram_id AS "inviteeTelegramId",
          COALESCE(u.display_name, r.invitee_name) AS "displayName",
          CASE WHEN i.id IS NOT NULL THEN i.telegram_username ELSE r.invitee_username END AS "telegramUsername",
          r.started_at AS "startedAt",
          CASE WHEN r.account_created_at<${end} THEN r.account_created_at END AS "accountCreatedAt",
          CASE WHEN r.account_ready_at<${end} THEN r.account_ready_at END AS "accountReadyAt",
          CASE WHEN r.search_started_at<${end} THEN r.search_started_at END AS "searchStartedAt",
          CASE WHEN r.party_joined_at<${end} THEN r.party_joined_at END AS "partyJoinedAt"
        FROM community.fdp_referrals r
        LEFT JOIN auth.user_auth_identities i ON i.provider='telegram' AND i.provider_user_id=r.invitee_telegram_id
        LEFT JOIN users.users u ON u.id=i.user_id
        WHERE r.inviter_telegram_id=${inviterTelegramId} AND r.started_at>=${start} AND r.started_at<${end}
        ORDER BY r.started_at DESC,r.invitee_telegram_id ASC LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    return { total: counts[0]?.total ?? 0, items, offset, pageSize: PAGE_SIZE };
  }
}
