import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Giveaway, type RewardEvent } from "#prisma/client";
import { PrismaService } from "../../database/prisma.service.js";
import { RewardsDatabase } from "./rewards.database.js";
import type { GiveawayDto, PurchaseDto, RewardEventDto, RewardSettingsDto } from "./rewards.dto.js";
import {
  chooseWinners,
  DEFAULT_SETTINGS,
  activeTask,
  moscowDay,
  moscowWeek,
  normalizeSettings,
  taskPeriod,
  TASK_CONDITIONS,
  type RewardSettings,
  type RewardTask
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
  constructor(@Inject(RewardsDatabase) readonly prisma: PrismaService) {}

  async program(force = false) {
    if (!force && this.cached && this.cached.expires > Date.now()) return this.cached;
    const row = await this.prisma.rewardProgram.upsert({
      where: { id: "fdp" },
      create: { id: "fdp", settings: DEFAULT_SETTINGS },
      update: {}
    });
    this.cached = {
      expires: Date.now() + 30000,
      enabled: row.enabled,
      startedAt: row.startedAt,
      settings: normalizeSettings(row.settings)
    };
    return this.cached;
  }
  invalidateProgram() {
    this.cached = undefined;
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
    await this.program(true);
    if (![input.programName, input.currencyName, input.mascotName].every((s) => s.trim()))
      throw new BadRequestException("Названия не должны быть пустыми");
    if (new Set((input.tasks ?? []).map((t) => t.key)).size !== (input.tasks ?? []).length)
      throw new BadRequestException("Повторяющиеся задания");
    if (input.tasks?.some((task) => !task.title.trim()))
      throw new BadRequestException("Названия заданий не должны быть пустыми");
    if (Object.values(input.phrases).some((list: string[]) => list.some((s) => !s.trim())))
      throw new BadRequestException("Фразы не должны быть пустыми");
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM community.reward_programs WHERE id='fdp' FOR UPDATE`;
      const row = await tx.rewardProgram.findUniqueOrThrow({ where: { id: "fdp" } });
      const saved = normalizeSettings(row.settings);
      const next: RewardSettings = {
        ...saved,
        programName: input.programName.trim(),
        currencyName: input.currencyName.trim(),
        mascotName: input.mascotName.trim(),
        tag: input.tag,
        phrases: input.phrases,
        tasks: { ...saved.tasks }
      };
      for (const task of input.tasks ?? []) {
        const key = task.key;
        const existing = Object.hasOwn(next.tasks, key) ? next.tasks[key] : undefined;
        if (!existing)
          throw new BadRequestException("Задание не найдено; используйте создание задания");
        next.tasks[key] = {
          ...existing,
          title: task.title.trim(),
          amount: task.amount,
          enabled: task.enabled
        };
      }
      await tx.rewardProgram.update({
        where: { id: "fdp" },
        data: {
          enabled: input.enabled,
          startedAt: row.startedAt ?? (input.enabled ? new Date() : null),
          settings: next
        }
      });
      if (input.tag.toLowerCase() !== saved.tag.toLowerCase())
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
        where: { telegramId, provider: "telegram" },
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
    const now = new Date();
    const tasks = Object.entries(p.settings.tasks).filter(([, task]) => activeTask(task));
    const progress = await this.prisma.rewardLedger.findMany({
      where: {
        telegramId,
        amount: { gt: 0 },
        key: {
          in: tasks
            .filter(([, t]) => t.period !== "friend")
            .map(([key, task]) => `${key}:${telegramId}:${taskPeriod(task, now)}`)
        }
      },
      select: { task: true }
    });
    const manualTasks = tasks.filter(([, task]) => task.condition === "manual");
    const submissions = manualTasks.length
      ? await this.prisma.rewardTaskSubmission.findMany({
          where: {
            telegramId,
            OR: manualTasks.map(([key, task]) => ({
              taskKey: key,
              periodKey: taskPeriod(task, now)
            }))
          },
          take: 50,
          select: {
            taskKey: true,
            periodKey: true,
            status: true,
            reason: true,
            awardedAmount: true,
            rule: true
          }
        })
      : [];
    return {
      settings: p.settings,
      balance: wallet?.balance ?? 0,
      tasks: tasks.map(([key, task]) => ({
        key,
        ...task,
        completed: progress.some((item) => item.task === key),
        submission:
          task.condition === "manual"
            ? (submissions.find(
                (row) => row.taskKey === key && row.periodKey === taskPeriod(task, now)
              ) ?? null)
            : null
      })),
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
      if (row.provider !== "telegram" || row.profileId !== profileId)
        throw new ConflictException("Эта проверка не относится к заданию Telegram");
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
      if (program.enabled && approved && first)
        await this.creditVerifiedTags(tx, row.telegramId, first, now, program.settings, {
          manual: true,
          actor
        });
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
      taskConditions: Object.entries(TASK_CONDITIONS).map(([value, rule]) => ({ value, ...rule })),
      giveaways: await this.prisma.giveaway.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      verifications: await this.prisma.rewardTagVerification.findMany({
        where: { provider: "telegram", status: { in: ["PENDING", "ERROR"] } },
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
    // Bound transaction work even when an administrator creates many tasks.
    const activeCount = Object.values(p.settings.tasks).filter((task) => activeTask(task)).length;
    const batchSize = Math.max(5, Math.min(100, Math.floor(500 / Math.max(1, activeCount))));
    await this.prisma.$transaction(
      async (tx) => {
        const [lease] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(714014001) AS locked`;
        if (!lease?.locked) return;
        const events = await tx.$queryRaw<
          RewardEvent[]
        >`SELECT id,telegram_id AS "telegramId",kind,occurred_at AS "occurredAt",processed_at AS "processedAt" FROM community.reward_events WHERE processed_at IS NULL AND occurred_at<=NOW()-INTERVAL '2 minutes' ORDER BY occurred_at,id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`;
        if (
          Object.values(p.settings.tasks).some(
            (task) => activeTask(task) && task.condition === "telegram_tag"
          )
        )
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
  async creditTask(
    tx: Tx,
    id: string,
    key: string,
    task: RewardTask,
    settings: RewardSettings,
    at: Date,
    friend?: string,
    details: Prisma.InputJsonObject = {}
  ) {
    const ledgerKey = `${key}:${id}:${taskPeriod(task, at, friend)}`;
    const credited = await this.grant(tx, id, key, ledgerKey, task.amount, {
      ...details,
      at: at.toISOString(),
      title: task.title,
      currency: settings.currencyName,
      ruleVersion: task.updatedAt ?? 1
    });
    if (credited && key === "profile_ready")
      await tx.rewardNotice.createMany({
        data: [
          {
            key: `award:${ledgerKey}`,
            telegramId: id,
            payload: {
              kind: "award",
              amount: task.amount,
              title: task.title,
              currency: settings.currencyName,
              programName: settings.programName
            }
          }
        ],
        skipDuplicates: true
      });
    return credited;
  }
  async creditVerifiedTags(
    tx: Tx,
    id: string,
    first: Date,
    at: Date,
    settings: RewardSettings,
    details: Prisma.InputJsonObject = {}
  ) {
    for (const [key, task] of Object.entries(settings.tasks)) {
      if (
        activeTask(task, at) &&
        task.condition === "telegram_tag" &&
        at.getTime() - first.getTime() >= task.minimumHours * 3600000
      )
        await this.creditTask(tx, id, key, task, settings, at, undefined, details);
    }
  }
  private async rewardEvent(
    tx: Tx,
    event: RewardEvent,
    settings: RewardSettings,
    campaignStart: Date
  ) {
    const { telegramId: id, occurredAt: at, kind } = event;
    const activity = ["search_started", "party_created", "party_joined", "search_result"].includes(
      kind
    );
    let sevenDays = false;
    if (activity) {
      await tx.rewardActivityDay.createMany({
        data: [{ telegramId: id, day: moscowDay(at) }],
        skipDuplicates: true
      });
      const start = new Date(`${moscowWeek(at)}T00:00:00+03:00`);
      const days = await tx.rewardActivityDay.count({
        where: {
          telegramId: id,
          day: { gte: moscowDay(start), lt: moscowDay(new Date(start.getTime() + 7 * 86400000)) }
        }
      });
      sevenDays = days === 7;
    }
    for (const [key, task] of Object.entries(settings.tasks)) {
      if (!activeTask(task, at)) continue;
      const matches =
        (task.condition === "account_ready" && kind === "account_ready") ||
        (task.condition === "party_activity" && activity) ||
        (task.condition === "search_started" &&
          ["search_started", "search_result"].includes(kind)) ||
        (task.condition === "party_created" && kind === "party_created") ||
        (task.condition === "party_joined" && ["party_joined", "search_result"].includes(kind)) ||
        (task.condition === "weekly_party" && activity && sevenDays) ||
        (["referral_ready", "referral_active"].includes(task.condition) && task.condition === kind);
      if (matches)
        await this.creditTask(
          tx,
          id,
          key,
          task,
          settings,
          at,
          ["referral_ready", "referral_active"].includes(kind)
            ? event.id.split(":").at(-1)!
            : undefined,
          { source: event.id }
        );
    }
    if (activity) {
      const referral = await tx.fdpReferral.findUnique({ where: { inviteeTelegramId: id } });
      if (referral?.accountReadyAt && referral.accountReadyAt >= campaignStart)
        for (const [key, task] of Object.entries(settings.tasks)) {
          if (activeTask(task, at) && task.condition === "referral_active")
            await this.creditTask(tx, referral.inviterTelegramId, key, task, settings, at, id, {
              source: event.id
            });
        }
    }
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
