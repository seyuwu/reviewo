import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "#prisma/client";
import type { RewardTaskDto } from "./rewards.dto.js";
import {
  activeTask,
  normalizeSettings,
  taskPeriod,
  TASK_CONDITIONS,
  type RewardTask,
  type RewardSettings
} from "./rewards.rules.js";
import { RewardsService } from "./rewards.service.js";
import { RewardsAnalyticsDatabase } from "./rewards.database.js";

type Filters = {
  task?: string | undefined;
  telegramId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  offset: number;
};
@Injectable()
export class RewardsTasksService {
  constructor(
    private readonly rewards: RewardsService,
    private readonly analyticsDb: RewardsAnalyticsDatabase
  ) {}

  private async change(
    actor: string,
    action: string,
    key: string,
    mutate: (settings: RewardSettings) => void
  ) {
    await this.rewards.program(true);
    const result = await this.rewards.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM community.reward_programs WHERE id='fdp' FOR UPDATE`;
      const row = await tx.rewardProgram.findUniqueOrThrow({ where: { id: "fdp" } });
      const settings = normalizeSettings(row.settings);
      mutate(settings);
      await tx.rewardProgram.update({ where: { id: "fdp" }, data: { settings } });
      await tx.rewardAudit.create({
        data: { actor, action, target: key, details: settings.tasks[key]! }
      });
      return { key, ...settings.tasks[key]! };
    });
    this.rewards.invalidateProgram();
    return result;
  }
  async save(key: string | null, input: RewardTaskDto, actor: string) {
    if (!input.title.trim() || !input.description.trim())
      throw new BadRequestException("Укажите название и понятные условия задания");
    const condition = TASK_CONDITIONS[input.condition];
    if (!condition || !(condition.periods as readonly string[]).includes(input.period))
      throw new BadRequestException("Этот период не подходит выбранному условию");
    const id = key ?? "custom_" + randomUUID().replaceAll("-", "");
    return this.change(actor, key ? "task-edit" : "task-create", id, (settings) => {
      if (key && !Object.hasOwn(settings.tasks, key))
        throw new NotFoundException("Задание не найдено");
      if (!key && Object.values(settings.tasks).filter((t) => !t.archivedAt).length >= 50)
        throw new ConflictException("Доступно до 50 заданий; сначала отправьте ненужное в архив");
      const old = settings.tasks[id];
      settings.tasks[id] = {
        ...old,
        ...input,
        title: input.title.trim(),
        description: input.description.trim(),
        createdAt: old?.createdAt ?? (old ? new Date(0).toISOString() : new Date().toISOString()),
        updatedAt: new Date().toISOString(),
        archivedAt: old?.archivedAt ?? null
      };
    });
  }
  archive(key: string, actor: string, restore = false) {
    return this.change(actor, restore ? "task-restore" : "task-archive", key, (settings) => {
      const task = Object.hasOwn(settings.tasks, key) ? settings.tasks[key] : undefined;
      if (!task) throw new NotFoundException("Задание не найдено");
      if (
        restore &&
        task.archivedAt &&
        Object.values(settings.tasks).filter((t) => !t.archivedAt).length >= 50
      )
        throw new ConflictException("Доступно до 50 активных заданий");
      settings.tasks[key] = {
        ...task,
        enabled: restore,
        archivedAt: restore ? null : (task.archivedAt ?? new Date().toISOString()),
        updatedAt: new Date().toISOString()
      };
    });
  }
  private checkFilters(filters: Filters, settings: RewardSettings) {
    if (filters.task && !Object.hasOwn(settings.tasks, filters.task))
      throw new BadRequestException("Задание не найдено");
    if (filters.telegramId && !/^[1-9]\d{0,19}$/.test(filters.telegramId))
      throw new BadRequestException("Укажите числовой Telegram ID игрока");
    const day = (value?: string) => {
      if (!value) return null;
      const at = new Date(value + "T00:00:00+03:00");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(at.getTime()) ||
        new Date(at.getTime() + 10800000).toISOString().slice(0, 10) !== value
      )
        throw new BadRequestException("Некорректная дата фильтра");
      return at;
    };
    const from = day(filters.from),
      to = day(filters.to);
    if (from && to && from > to) throw new BadRequestException("Дата окончания раньше начала");
    return { from, until: to ? new Date(to.getTime() + 86400000) : null };
  }
  async analytics(filters: Filters) {
    const p = await this.rewards.program(true);
    const { from, until } = this.checkFilters(filters, p.settings);
    const keys = filters.task ? [filters.task] : Object.keys(p.settings.tasks);
    const where = Prisma.sql`l.amount>0 AND l.task IN (${Prisma.join(keys)})
      ${filters.telegramId ? Prisma.sql`AND l.telegram_id=${filters.telegramId}` : Prisma.empty}
      ${from ? Prisma.sql`AND l.created_at>=${from}` : Prisma.empty}
      ${until ? Prisma.sql`AND l.created_at<${until}` : Prisma.empty}`;
    const [summary, rows, totals] = await Promise.all([
      this.analyticsDb.$queryRaw<
        { task: string; completions: number; users: number; amount: bigint }[]
      >(Prisma.sql`
        SELECT l.task, COUNT(*)::int AS completions, COUNT(DISTINCT l.telegram_id)::int AS users,
        SUM(l.amount)::bigint AS amount FROM community.reward_ledger l WHERE ${where} GROUP BY l.task`),
      this.analyticsDb.$queryRaw<
        {
          id: string;
          task: string;
          telegramId: string;
          amount: number;
          createdAt: Date;
          details: Record<string, unknown>;
          displayName: string | null;
          telegramUsername: string | null;
        }[]
      >(Prisma.sql`
        SELECT l.id,l.task,l.telegram_id AS "telegramId",l.amount,l.created_at AS "createdAt",l.details,
        u.display_name AS "displayName",i.telegram_username AS "telegramUsername"
        FROM community.reward_ledger l LEFT JOIN auth.user_auth_identities i
        ON i.provider='telegram' AND i.provider_user_id=l.telegram_id LEFT JOIN users.users u ON u.id=i.user_id
        WHERE ${where} ORDER BY l.created_at DESC,l.id DESC LIMIT 100 OFFSET ${filters.offset}`),
      this.analyticsDb.$queryRaw<
        { completions: number; users: number; amount: bigint }[]
      >(Prisma.sql`
        SELECT COUNT(*)::int AS completions, COUNT(DISTINCT l.telegram_id)::int AS users,
        COALESCE(SUM(l.amount),0)::bigint AS amount FROM community.reward_ledger l WHERE ${where}`)
    ]);
    return {
      totals: { ...totals[0]!, amount: Number(totals[0]!.amount) },
      tasks: keys.map((key) => {
        const row = summary.find((r) => r.task === key);
        return {
          key,
          title: p.settings.tasks[key]!.title,
          archived: !!p.settings.tasks[key]!.archivedAt,
          completions: row?.completions ?? 0,
          users: row?.users ?? 0,
          amount: Number(row?.amount ?? 0)
        };
      }),
      completions: rows.map((row) => ({
        ...row,
        title: row.details["title"] ?? p.settings.tasks[row.task]?.title,
        occurredAt: row.details["at"] ?? row.createdAt.toISOString()
      })),
      offset: filters.offset,
      hasMore: filters.offset + rows.length < totals[0]!.completions
    };
  }
  async submit(key: string, telegramId: string, evidence: string) {
    const p = await this.rewards.requireEnabled(),
      task = p.settings.tasks[key];
    if (!task || !activeTask(task) || task.condition !== "manual")
      throw new NotFoundException("Это задание не принимает заявки");
    if (!evidence.trim()) throw new BadRequestException("Опишите выполнение или пришлите ссылку");
    const at = new Date(),
      period = taskPeriod(task, at),
      ledgerKey = `${key}:${telegramId}:${period}`;
    return this.rewards.prisma.$transaction(async (tx) => {
      if (await tx.rewardLedger.findUnique({ where: { key: ledgerKey } }))
        return { completed: true };
      const rule = { ...task, currencyName: p.settings.currencyName };
      let row = await tx.rewardTaskSubmission.upsert({
        where: { taskKey_telegramId_periodKey: { taskKey: key, telegramId, periodKey: period } },
        create: { taskKey: key, telegramId, periodKey: period, evidence: evidence.trim(), rule },
        update: {}
      });
      if (row.status === "REJECTED") {
        const updated = await tx.rewardTaskSubmission.updateMany({
          where: { id: row.id, status: "REJECTED" },
          data: {
            evidence: evidence.trim(),
            rule,
            status: "PENDING",
            reason: null,
            reviewedAt: null,
            submittedAt: at
          }
        });
        if (updated.count)
          row = await tx.rewardTaskSubmission.findUniqueOrThrow({ where: { id: row.id } });
      }
      return { id: row.id, status: row.status };
    });
  }
  async submissions(task?: string, status = "PENDING", offset = 0) {
    if (!["PENDING", "APPROVED", "REJECTED", "ALL"].includes(status))
      throw new BadRequestException("Некорректный статус заявки");
    const p = await this.rewards.program(true);
    if (task && !Object.hasOwn(p.settings.tasks, task))
      throw new BadRequestException("Задание не найдено");
    const where = { ...(task ? { taskKey: task } : {}), ...(status !== "ALL" ? { status } : {}) };
    const [rows, total] = await Promise.all([
      this.rewards.prisma.rewardTaskSubmission.findMany({
        where,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 50,
        skip: offset
      }),
      this.rewards.prisma.rewardTaskSubmission.count({ where })
    ]);
    const identities = await this.rewards.prisma.userAuthIdentity.findMany({
      where: { provider: "telegram", providerUserId: { in: rows.map((row) => row.telegramId) } },
      select: {
        providerUserId: true,
        telegramUsername: true,
        user: { select: { displayName: true } }
      }
    });
    return {
      total,
      hasMore: offset + rows.length < total,
      items: rows.map((row) => {
        const identity = identities.find((i) => i.providerUserId === row.telegramId);
        return {
          ...row,
          displayName: identity?.user.displayName ?? null,
          telegramUsername: identity?.telegramUsername ?? null
        };
      })
    };
  }
  async review(id: string, approved: boolean, reason: string, actor: string) {
    const program = await this.rewards.requireEnabled();
    if (!reason.trim()) throw new BadRequestException("Укажите причину решения");
    return this.rewards.prisma.$transaction(async (tx) => {
      const found = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM community.reward_task_submissions WHERE id=${id}::uuid FOR UPDATE`;
      if (!found.length) throw new NotFoundException("Заявка не найдена");
      const row = await tx.rewardTaskSubmission.findUniqueOrThrow({ where: { id } });
      const status = approved ? "APPROVED" : "REJECTED";
      if (row.status === status) return row;
      if (row.status !== "PENDING") throw new ConflictException("Заявка уже рассмотрена");
      const rule = row.rule as RewardTask & { currencyName: string };
      const credited = approved
        ? await this.rewards.grant(
            tx,
            row.telegramId,
            row.taskKey,
            `${row.taskKey}:${row.telegramId}:${row.periodKey}`,
            rule.amount,
            {
              title: rule.title,
              currency: rule.currencyName,
              at: row.submittedAt.toISOString(),
              manual: true,
              actor,
              submissionId: id,
              evidence: row.evidence,
              ruleVersion: rule.updatedAt ?? 1
            }
          )
        : false;
      const result = await tx.rewardTaskSubmission.update({
        where: { id },
        data: {
          status,
          reason: reason.trim(),
          awardedAmount: credited ? rule.amount : 0,
          reviewedAt: new Date()
        }
      });
      await tx.rewardAudit.create({
        data: {
          actor,
          action: "task-review",
          target: id,
          details: {
            approved,
            reason,
            taskKey: row.taskKey,
            telegramId: row.telegramId,
            evidence: row.evidence,
            awardedAmount: result.awardedAmount,
            rule: row.rule
          }
        }
      });
      const welcome =
        credited &&
        (await this.rewards.firstTaskNotice(
          tx,
          row.telegramId,
          `${row.taskKey}:${row.telegramId}:${row.periodKey}`,
          {
            kind: "award",
            amount: result.awardedAmount,
            title: rule.title,
            currency: rule.currencyName,
            programName: program.settings.programName,
            reason: reason.trim()
          }
        ));
      if (!welcome)
        await tx.rewardNotice.createMany({
          data: [
            {
              key: `task-review:${id}:${row.submittedAt.toISOString()}`,
              telegramId: row.telegramId,
              payload: {
                kind: "task_review",
                approved,
                title: rule.title,
                amount: result.awardedAmount,
                currency: rule.currencyName,
                reason: reason.trim()
              }
            }
          ],
          skipDuplicates: true
        });
      return result;
    });
  }
}
