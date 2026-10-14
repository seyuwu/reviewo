import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Giveaway, type RewardEvent } from "#prisma/client";
import { PrismaService } from "../../database/prisma.service.js";
import type { GiveawayDto, PurchaseDto, RewardEventDto, RewardSettingsDto } from "./rewards.dto.js";
import {
  chooseWinners,
  DEFAULT_SETTINGS,
  DEFAULT_TASKS,
  moscowDay,
  moscowWeek,
  type RewardSettings,
  type TaskKey
} from "./rewards.rules.js";

type Tx = Prisma.TransactionClient;
type Draw = {
  at: string;
  ticketCount: number;
  hash: string;
  algorithm: string;
  winners: {
    ticketNumber: number;
    telegramId: string;
    prize: string;
    deliveredAt: string | null;
  }[];
};

@Injectable()
export class RewardsService {
  private cached:
    | { expires: number; enabled: boolean; startedAt: Date | null; settings: RewardSettings }
    | undefined;
  constructor(readonly prisma: PrismaService) {}

  async program(force = false) {
    if (!force && this.cached && this.cached.expires > Date.now()) return this.cached;
    const row = await this.prisma.rewardProgram.upsert({
      where: { id: "fdp" },
      create: { id: "fdp", settings: DEFAULT_SETTINGS },
      update: {}
    });
    const saved = row.settings as Partial<RewardSettings>;
    this.cached = {
      expires: Date.now() + 30000,
      enabled: row.enabled,
      startedAt: row.startedAt,
      settings: {
        ...DEFAULT_SETTINGS,
        ...saved,
        tasks: { ...DEFAULT_TASKS, ...saved.tasks },
        phrases: { ...DEFAULT_SETTINGS.phrases, ...saved.phrases }
      }
    };
    return this.cached;
  }
  async requireEnabled() {
    const p = await this.program();
    if (!p.enabled) throw new ServiceUnavailableException("Раздел наград пока выключен");
    return p;
  }
  async telegramForUser(userId: string) {
    const identity = await this.prisma.userAuthIdentity.findFirst({
      where: { userId, provider: "telegram" },
      select: { providerUserId: true }
    });
    if (!identity) throw new BadRequestException("Сначала подключите Telegram");
    return identity.providerUserId;
  }
  async settings(input: RewardSettingsDto, actor: string) {
    const current = await this.program(true);
    if (![input.programName, input.currencyName, input.mascotName].every((s) => s.trim()))
      throw new BadRequestException("Названия не должны быть пустыми");
    if (new Set(input.tasks.map((t) => t.key)).size !== input.tasks.length)
      throw new BadRequestException("Повторяющиеся задания");
    if (input.tasks.some((task) => !task.title.trim()))
      throw new BadRequestException("Названия заданий не должны быть пустыми");
    if (Object.values(input.phrases).some((list: string[]) => list.some((s) => !s.trim())))
      throw new BadRequestException("Фразы не должны быть пустыми");
    const next: RewardSettings = {
      ...current.settings,
      programName: input.programName.trim(),
      currencyName: input.currencyName.trim(),
      mascotName: input.mascotName.trim(),
      tag: input.tag,
      phrases: input.phrases,
      tasks: { ...current.settings.tasks }
    };
    for (const task of input.tasks) {
      const key = task.key as TaskKey;
      next.tasks[key] = {
        ...next.tasks[key],
        title: task.title.trim(),
        amount: task.amount,
        enabled: task.enabled
      };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rewardProgram.update({
        where: { id: "fdp" },
        data: {
          enabled: input.enabled,
          startedAt: current.startedAt ?? (input.enabled ? new Date() : null),
          settings: next
        }
      });
      if (input.tag.toLowerCase() !== current.settings.tag.toLowerCase())
        await tx.rewardTagVerification.updateMany({
          data: {
            status: "PENDING",
            firstSeenAt: null,
            checkedAt: null,
            nextCheckAt: new Date(),
            reason: null
          }
        });
      await this.audit(tx, actor, "settings", "fdp", { enabled: input.enabled, settings: next });
    });
    this.cached = undefined;
    return this.program(true);
  }
  async ingest(events: RewardEventDto[]) {
    const p = await this.program();
    if (!p.enabled || !p.startedAt) return { ok: true, enabled: false };
    const future = Date.now() + 300000;
    if (events.some((e) => new Date(e.occurredAt).getTime() > future))
      throw new BadRequestException("Событие из будущего");
    const valid = events.filter((e) => new Date(e.occurredAt) >= p.startedAt!);
    if (valid.length)
      await this.prisma.rewardEvent.createMany({
        data: valid.map((e) => ({ ...e, occurredAt: new Date(e.occurredAt) })),
        skipDuplicates: true
      });
    return { ok: true, enabled: true };
  }
  async walletPage(telegramId: string, offset = 0) {
    const p = await this.requireEnabled();
    const [wallet, history, giveaways, tags] = await Promise.all([
      this.prisma.rewardWallet.findUnique({ where: { telegramId } }),
      this.prisma.rewardLedger.findMany({
        where: { telegramId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 21,
        skip: offset
      }),
      this.prisma.giveaway.findMany({
        where: { status: { in: ["OPEN", "CLOSED", "DRAWN", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: 10
      }),
      this.prisma.rewardTagVerification.findMany({
        where: { telegramId },
        select: {
          provider: true,
          status: true,
          firstSeenAt: true,
          checkedAt: true,
          reason: true,
          profileId: true
        }
      })
    ]);
    const day = moscowDay(new Date()),
      week = moscowWeek(new Date());
    const progress = await this.prisma.rewardLedger.findMany({
      where: {
        telegramId,
        amount: { gt: 0 },
        OR: [
          {
            key: {
              in: [
                `profile_ready:${telegramId}:once`,
                `first_party_join:${telegramId}:once`,
                `daily_party:${telegramId}:${day}`,
                `weekly_party:${telegramId}:${week}`,
                `telegram_tag:${telegramId}:${day}`,
                `steam_tag:${telegramId}:${day}`
              ]
            }
          }
        ]
      },
      select: { task: true }
    });
    return {
      settings: p.settings,
      balance: wallet?.balance ?? 0,
      tasks: Object.entries(p.settings.tasks)
        .filter(([, t]) => t.enabled)
        .map(([key, t]) => ({ key, ...t, completed: progress.some((item) => item.task === key) })),
      history: history.slice(0, 20),
      hasMore: history.length > 20,
      tags,
      giveaways: giveaways.map((g) => this.publicGiveaway(g, telegramId)),
      updatedAt: new Date().toISOString()
    };
  }
  publicGiveaway(g: Giveaway, telegramId?: string) {
    const draw = g.draw as Draw | null;
    return {
      ...g,
      draw: draw
        ? {
            ...draw,
            winners: draw.winners.map(({ telegramId: id, ...winner }) => ({
              ...winner,
              isMine: id === telegramId
            }))
          }
        : null,
      status: g.status === "OPEN" && g.endsAt <= new Date() ? "CLOSED" : g.status
    };
  }
  async giveawayPage(id: string, telegramId: string) {
    await this.requireEnabled();
    const giveaway = await this.prisma.giveaway.findUnique({ where: { id } });
    if (!giveaway || giveaway.status === "DRAFT") throw new NotFoundException("Розыгрыш не найден");
    const [tickets, wallet, total] = await Promise.all([
      this.prisma.giveawayTicket.findMany({
        where: { giveawayId: id, telegramId },
        orderBy: { number: "asc" },
        select: { number: true }
      }),
      this.prisma.rewardWallet.findUnique({ where: { telegramId } }),
      this.prisma.giveawayTicket.count({ where: { giveawayId: id } })
    ]);
    return {
      ...this.publicGiveaway(giveaway, telegramId),
      tickets: tickets.map((t) => t.number),
      totalTickets: total,
      balance: wallet?.balance ?? 0
    };
  }
  private async lockGiveaway(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM community.giveaways WHERE id=${id}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException("Розыгрыш не найден");
    return tx.giveaway.findUniqueOrThrow({ where: { id } });
  }
  private async lockWallet(tx: Tx, telegramId: string) {
    await tx.rewardWallet.upsert({ where: { telegramId }, create: { telegramId }, update: {} });
    const [wallet] = await tx.$queryRaw<
      { balance: number }[]
    >`SELECT balance FROM community.reward_wallets WHERE telegram_id=${telegramId} FOR UPDATE`;
    return wallet!;
  }
  async grant(
    tx: Tx,
    telegramId: string,
    task: string,
    key: string,
    amount: number,
    details: Prisma.InputJsonObject = {}
  ) {
    await this.lockWallet(tx, telegramId);
    const inserted = await tx.rewardLedger.createMany({
      data: [{ id: randomUUID(), telegramId, task, key, amount, details }],
      skipDuplicates: true
    });
    if (inserted.count)
      await tx.rewardWallet.update({
        where: { telegramId },
        data: { balance: { increment: amount } }
      });
    return inserted.count > 0;
  }
  async purchase(id: string, telegramId: string, input: PurchaseDto) {
    await this.requireEnabled();
    return this.prisma.$transaction(async (tx) => {
      const giveaway = await this.lockGiveaway(tx, id);
      const previous = await tx.giveawayPurchase.findUnique({
        where: { telegramId_requestId: { telegramId, requestId: input.requestId } }
      });
      if (previous) {
        if (
          previous.giveawayId !== id ||
          previous.quantity !== input.quantity ||
          previous.cost !== input.expectedPrice * input.quantity
        )
          throw new ConflictException("Этот запрос уже использован для другой покупки");
        return { purchase: previous, replayed: true };
      }
      const now = new Date();
      if (giveaway.status !== "OPEN" || now < giveaway.startsAt || now >= giveaway.endsAt)
        throw new ConflictException("Приём билетов закрыт или ещё не начат");
      if (input.expectedPrice !== giveaway.ticketPrice)
        throw new ConflictException("Цена изменилась: откройте розыгрыш заново");
      const count = await tx.giveawayTicket.count({ where: { giveawayId: id, telegramId } });
      if (
        count + input.quantity > giveaway.maxTickets ||
        giveaway.nextTicket + input.quantity > 100001
      )
        throw new ConflictException("Достигнут лимит билетов");
      const wallet = await this.lockWallet(tx, telegramId),
        cost = giveaway.ticketPrice * input.quantity;
      if (wallet.balance < cost) throw new ConflictException("Недостаточно танго");
      const purchase = await tx.giveawayPurchase.create({
        data: {
          giveawayId: id,
          telegramId,
          requestId: input.requestId,
          quantity: input.quantity,
          cost
        }
      });
      await tx.rewardWallet.update({
        where: { telegramId },
        data: { balance: { decrement: cost } }
      });
      await tx.rewardLedger.create({
        data: {
          telegramId,
          key: `purchase:${purchase.id}`,
          task: "tickets",
          amount: -cost,
          details: {
            giveawayId: id,
            title: giveaway.title,
            price: giveaway.ticketPrice,
            quantity: input.quantity
          }
        }
      });
      await tx.giveawayTicket.createMany({
        data: Array.from({ length: input.quantity }, (_, i) => ({
          giveawayId: id,
          purchaseId: purchase.id,
          telegramId,
          number: giveaway.nextTicket + i
        }))
      });
      await tx.giveaway.update({
        where: { id },
        data: { nextTicket: { increment: input.quantity } }
      });
      return { purchase, replayed: false };
    });
  }
  async createGiveaway(input: GiveawayDto, actor: string) {
    if (!input.title.trim() || !input.description.trim() || input.prizes.some((s) => !s.trim()))
      throw new BadRequestException("Заполните название, условия и призы");
    const startsAt = new Date(input.startsAt),
      endsAt = new Date(input.endsAt);
    if (
      endsAt <= startsAt ||
      endsAt <= new Date() ||
      endsAt.getTime() - startsAt.getTime() > 366 * 86400000
    )
      throw new BadRequestException("Некорректный срок розыгрыша");
    return this.prisma.$transaction(async (tx) => {
      const giveaway = await tx.giveaway.create({ data: { ...input, startsAt, endsAt } });
      await this.audit(
        tx,
        actor,
        "create",
        giveaway.id,
        input as unknown as Prisma.InputJsonObject
      );
      return giveaway;
    });
  }
  async action(id: string, action: "publish" | "close" | "draw" | "cancel", actor: string) {
    return this.prisma.$transaction(async (tx) => {
      const g = await this.lockGiveaway(tx, id);
      if (action === "draw" && g.status === "DRAWN") return g;
      if (action === "cancel" && g.status === "CANCELLED") return g;
      const now = new Date();
      if (action === "publish") {
        if (g.status !== "DRAFT" || g.endsAt <= now)
          throw new ConflictException("Нельзя опубликовать этот розыгрыш");
        await tx.giveaway.update({ where: { id }, data: { status: "OPEN" } });
      } else if (action === "close") {
        if (g.status !== "OPEN" || g.endsAt > now)
          throw new ConflictException("Срок приёма билетов ещё не закончился");
        await tx.giveaway.update({ where: { id }, data: { status: "CLOSED" } });
      } else if (action === "cancel") {
        if (g.status === "DRAWN") throw new ConflictException("Итоги уже сохранены");
        await tx.giveaway.update({ where: { id }, data: { status: "CANCELLED" } });
      } else {
        if (!["OPEN", "CLOSED"].includes(g.status) || g.endsAt > now)
          throw new ConflictException("Сначала дождитесь окончания розыгрыша");
        const tickets = await tx.giveawayTicket.findMany({
          where: { giveawayId: id },
          orderBy: { number: "asc" }
        });
        const prizes = g.prizes as string[];
        const winners = chooseWinners(tickets, prizes.length, g.uniqueWinners);
        const draw: Draw = {
          at: now.toISOString(),
          ticketCount: tickets.length,
          hash: createHash("sha256")
            .update(JSON.stringify(tickets.map((t) => [t.number, t.telegramId, t.purchaseId])))
            .digest("hex"),
          algorithm: "uniform-ticket-v1",
          winners: winners.map((t, i) => ({
            ticketNumber: t.number,
            telegramId: t.telegramId,
            prize: prizes[i]!,
            deliveredAt: null
          }))
        };
        await tx.giveaway.update({ where: { id }, data: { status: "DRAWN", draw } });
        if (draw.winners.length)
          await tx.rewardNotice.createMany({
            data: draw.winners.map((w) => ({
              key: `winner:${id}:${w.ticketNumber}`,
              telegramId: w.telegramId,
              payload: {
                kind: "winner",
                giveawayId: id,
                title: g.title,
                number: w.ticketNumber,
                prize: w.prize
              }
            })),
            skipDuplicates: true
          });
      }
      await this.audit(tx, actor, action, id, {});
      return tx.giveaway.findUniqueOrThrow({ where: { id } });
    });
  }
  async editGiveaway(id: string, input: GiveawayDto, actor: string) {
    const startsAt = new Date(input.startsAt),
      endsAt = new Date(input.endsAt);
    if (
      !input.title.trim() ||
      !input.description.trim() ||
      input.prizes.some((s) => !s.trim()) ||
      endsAt <= startsAt ||
      endsAt <= new Date() ||
      endsAt.getTime() - startsAt.getTime() > 366 * 86400000
    )
      throw new BadRequestException("Проверьте название, призы и сроки");
    return this.prisma.$transaction(async (tx) => {
      const giveaway = await this.lockGiveaway(tx, id);
      if (giveaway.status !== "DRAFT")
        throw new ConflictException("Условия опубликованного розыгрыша фиксированы");
      const saved = await tx.giveaway.update({
        where: { id },
        data: { ...input, startsAt, endsAt }
      });
      await this.audit(tx, actor, "edit", id, input as unknown as Prisma.InputJsonObject);
      return saved;
    });
  }
  async reviewTag(
    id: string,
    approved: boolean,
    reason: string,
    profileId: string | null,
    actor: string
  ) {
    if (!reason.trim()) throw new BadRequestException("Укажите причину решения");
    const program = await this.program(true);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM community.reward_tag_verifications WHERE id=${id}::uuid FOR UPDATE`;
      if (!rows.length) throw new NotFoundException("Проверка не найдена");
      const row = await tx.rewardTagVerification.findUniqueOrThrow({ where: { id } });
      if (row.profileId !== profileId || (row.provider === "steam" && !row.profileId))
        throw new ConflictException("Профиль изменился или владение Steam ещё не подтверждено");
      const now = new Date(),
        first = approved ? (row.firstSeenAt ?? now) : null;
      await tx.rewardTagVerification.update({
        where: { id },
        data: {
          status: approved ? "VERIFIED" : "MISSING",
          firstSeenAt: first,
          checkedAt: now,
          reason: reason.trim(),
          nextCheckAt: new Date(now.getTime() + 3 * 3600000)
        }
      });
      const task = row.provider === "telegram" ? "telegram_tag" : "steam_tag",
        rule = program.settings.tasks[task];
      if (
        program.enabled &&
        approved &&
        first &&
        now.getTime() - first.getTime() >= 86400000 &&
        rule.enabled
      )
        await this.grant(
          tx,
          row.telegramId,
          task,
          `${task}:${row.telegramId}:${moscowDay(now)}`,
          rule.amount,
          { title: rule.title, at: now.toISOString(), manual: true, actor }
        );
      await this.audit(tx, actor, "tag-review", id, { approved, reason, profileId });
      return { ok: true };
    });
  }
  async delivery(id: string, number: number, actor: string) {
    return this.prisma.$transaction(async (tx) => {
      const g = await this.lockGiveaway(tx, id),
        draw = g.draw as Draw | null;
      const winner = draw?.winners.find((w) => w.ticketNumber === number);
      if (!winner || !draw) throw new NotFoundException("Выигравший билет не найден");
      winner.deliveredAt ??= new Date().toISOString();
      await tx.giveaway.update({ where: { id }, data: { draw } });
      await this.audit(tx, actor, "delivery", id, { number });
      return { ok: true };
    });
  }
  async adminPage() {
    const p = await this.program(true);
    return {
      ...p,
      giveaways: await this.prisma.giveaway.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      verifications: await this.prisma.rewardTagVerification.findMany({
        where: { status: { in: ["PENDING", "ERROR"] } },
        take: 50,
        orderBy: { nextCheckAt: "asc" }
      })
    };
  }
  async tickets(id: string, after: number) {
    return this.prisma.giveawayTicket.findMany({
      where: { giveawayId: id, number: { gt: after } },
      orderBy: { number: "asc" },
      take: 100
    });
  }
  async audit(
    tx: Tx,
    actor: string,
    action: string,
    target: string,
    details: Prisma.InputJsonObject
  ) {
    await tx.rewardAudit.create({ data: { actor, action, target, details } });
  }

  async processBatch() {
    const p = await this.program(true);
    if (!p.enabled || !p.startedAt) return;
    await this.prisma.$transaction(
      async (tx) => {
        const [lease] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(714014001) AS locked`;
        if (!lease?.locked) return;
        const events = await tx.$queryRaw<
          RewardEvent[]
        >`SELECT id,telegram_id AS "telegramId",kind,occurred_at AS "occurredAt",processed_at AS "processedAt" FROM community.reward_events WHERE processed_at IS NULL AND occurred_at<=NOW()-INTERVAL '2 minutes' ORDER BY occurred_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`;
        if (p.settings.tasks.telegram_tag.enabled)
          await tx.rewardTagVerification.createMany({
            data: [
              ...new Set(
                events.filter((e) => e.occurredAt >= p.startedAt!).map((e) => e.telegramId)
              )
            ].map((telegramId) => ({ telegramId, provider: "telegram" })),
            skipDuplicates: true
          });
        for (const event of events) {
          if (event.occurredAt >= p.startedAt!) {
            if (event.kind === "search_pending") {
              const session = await tx.dotaSearchSession.findUnique({
                where: { id: event.id.split(":").at(-1)! }
              });
              if (
                session &&
                (session.status === "JOINED" ||
                  Math.min(
                    session.finishedAt?.getTime() ?? Date.now(),
                    session.expiresAt.getTime()
                  ) -
                    session.startedAt.getTime() >=
                    120000)
              )
                await this.rewardEvent(
                  tx,
                  {
                    ...event,
                    kind: session.searchType === "RECRUIT" ? "party_created" : "search_started"
                  },
                  p.settings,
                  p.startedAt!
                );
            } else await this.rewardEvent(tx, event, p.settings, p.startedAt!);
          }
          await tx.rewardEvent.update({
            where: { id: event.id },
            data: { processedAt: new Date() }
          });
        }
      },
      { timeout: 10000 }
    );
    await this.prisma.giveaway.updateMany({
      where: { status: "OPEN", endsAt: { lte: new Date() } },
      data: { status: "CLOSED" }
    });
    await this.refundBatch();
  }
  private async rewardEvent(
    tx: Tx,
    event: RewardEvent,
    settings: RewardSettings,
    campaignStart: Date
  ) {
    const { telegramId: id, occurredAt: at, kind } = event;
    const credit = async (task: TaskKey, period: string) => {
      const rule = settings.tasks[task];
      if (!rule.enabled) return false;
      const key = `${task}:${id}:${period}`;
      const credited = await this.grant(tx, id, task, key, rule.amount, {
        source: event.id,
        at: at.toISOString(),
        title: rule.title,
        currency: settings.currencyName,
        ruleVersion: 1
      });
      if (credited && task === "profile_ready")
        await tx.rewardNotice.createMany({
          data: [
            {
              key: `award:${key}`,
              telegramId: id,
              payload: {
                kind: "award",
                amount: rule.amount,
                title: rule.title,
                currency: settings.currencyName,
                programName: settings.programName
              }
            }
          ],
          skipDuplicates: true
        });
      return credited;
    };
    if (kind === "account_ready") await credit("profile_ready", "once");
    if (kind === "party_joined" || kind === "search_result")
      await credit("first_party_join", "once");
    if (["search_started", "party_created", "party_joined", "search_result"].includes(kind)) {
      await credit("daily_party", moscowDay(at));
      const week = moscowWeek(at),
        start = new Date(`${week}T00:00:00+03:00`),
        end = new Date(start.getTime() + 7 * 86400000);
      const [count] = await tx.$queryRaw<
        { days: number }[]
      >`SELECT COUNT(*)::int AS days FROM community.reward_ledger WHERE key>=${`daily_party:${id}:${moscowDay(start)}`} AND key<${`daily_party:${id}:${moscowDay(end)}`}`;
      if (count?.days === 7) await credit("weekly_party", week);
      const referral = await tx.fdpReferral.findUnique({ where: { inviteeTelegramId: id } });
      if (
        referral?.accountReadyAt &&
        referral.accountReadyAt >= campaignStart &&
        settings.tasks.referral_active.enabled
      )
        await this.grant(
          tx,
          referral.inviterTelegramId,
          "referral_active",
          `referral_active:${referral.inviterTelegramId}:${id}`,
          settings.tasks.referral_active.amount,
          {
            source: event.id,
            at: at.toISOString(),
            title: settings.tasks.referral_active.title,
            currency: settings.currencyName,
            ruleVersion: 1
          }
        );
    }
    if (kind === "referral_ready" || kind === "referral_active")
      await credit(kind, event.id.split(":").at(-1)!);
  }
  async refundBatch() {
    await this.prisma.$transaction(
      async (tx) => {
        const [lease] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(714014001) AS locked`;
        if (!lease?.locked) return;
        const purchases = await tx.$queryRaw<
          { id: string; telegramId: string; cost: number; giveawayId: string }[]
        >`SELECT p.id,p.telegram_id AS "telegramId",p.cost,p.giveaway_id AS "giveawayId" FROM community.giveaway_purchases p JOIN community.giveaways g ON g.id=p.giveaway_id WHERE g.status='CANCELLED' AND p.refunded_at IS NULL ORDER BY p.telegram_id,p.id LIMIT 100 FOR UPDATE OF p SKIP LOCKED`;
        for (const purchase of purchases) {
          await this.grant(
            tx,
            purchase.telegramId,
            "refund",
            `refund:${purchase.id}`,
            purchase.cost,
            { giveawayId: purchase.giveawayId }
          );
          await tx.giveawayPurchase.update({
            where: { id: purchase.id },
            data: { refundedAt: new Date() }
          });
        }
      },
      { timeout: 10000 }
    );
  }
  async claimNotices() {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM community.reward_notices WHERE sent_at IS NULL AND attempts<6 AND next_attempt_at<=NOW() ORDER BY next_attempt_at,id LIMIT 10 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return [];
      await tx.rewardNotice.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { nextAttemptAt: new Date(Date.now() + 10 * 60000) }
      });
      return tx.rewardNotice.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: { id: true, telegramId: true, payload: true }
      });
    });
  }
  async noticeDelivery(id: string, delivered: boolean) {
    await this.prisma.rewardNotice.updateMany({
      where: { id, sentAt: null },
      data: delivered
        ? { sentAt: new Date() }
        : { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 30 * 60000) }
    });
    return { ok: true };
  }
}
