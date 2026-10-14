import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../config/environment.validation.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { RewardsService } from "./rewards.service.js";
import { DEFAULT_SETTINGS, moscowWeek, normalizeSettings } from "./rewards.rules.js";
import { RewardVerificationService } from "./rewards.verification.js";
import { RewardsTasksService } from "./rewards-tasks.service.js";
import { RewardsAnalyticsDatabase } from "./rewards.database.js";
import type { RewardTaskDto } from "./rewards.dto.js";

const url = process.env["REWARDS_TEST_DATABASE_URL"];
describe("Rewards with isolated PostgreSQL", { skip: !url }, () => {
  let db: PrismaClient, service: RewardsService;
  let taskService: RewardsTasksService, analyticsDb: RewardsAnalyticsDatabase;
  const campaign = new Date(Date.now() - 86400000),
    at = () => new Date(Date.now() - 300000).toISOString();
  before(async () => {
    assert.match(
      url!,
      /^postgresql:\/\/[^/]+@127\.0\.0\.1:55439\/rewards_qa$/,
      "Use only the explicitly isolated rewards QA database"
    );
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url, options: "-c timezone=UTC" })
    });
    await db.$connect();
    analyticsDb = new RewardsAnalyticsDatabase(
      new ConfigService<EnvironmentVariables, true>({ DATABASE_URL: url! })
    );
  });
  after(async () => {
    await analyticsDb?.$disconnect();
    await db?.$disconnect();
  });
  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE community.reward_activity_days,community.reward_task_submissions,community.giveaway_tickets,community.giveaway_purchases,community.giveaways,community.reward_ledger,community.reward_wallets,community.reward_events,community.reward_tag_verifications,community.reward_steam_links,community.reward_audit,community.reward_notices CASCADE`;
    await db.rewardProgram.upsert({
      where: { id: "fdp" },
      create: { id: "fdp", enabled: true, startedAt: campaign, settings: DEFAULT_SETTINGS },
      update: { enabled: true, startedAt: campaign, settings: DEFAULT_SETTINGS }
    });
    service = new RewardsService(db as PrismaService);
    taskService = new RewardsTasksService(service, analyticsDb);
  });
  const customTask = (patch: Partial<RewardTaskDto> = {}): RewardTaskDto => ({
    title: "Создай пати",
    description: "Создай свою пати после появления задания.",
    amount: 13,
    condition: "party_created",
    period: "once",
    enabled: true,
    minimumHours: 24,
    ...patch
  });
  async function backdateTask(key: string) {
    const row = await db.rewardProgram.findUniqueOrThrow({ where: { id: "fdp" } });
    const settings = normalizeSettings(row.settings);
    settings.tasks[key]!.createdAt = campaign.toISOString();
    await db.rewardProgram.update({ where: { id: "fdp" }, data: { settings } });
    service.invalidateProgram();
  }
  const balance = async (id = "101") =>
    (await db.rewardWallet.findUnique({ where: { telegramId: id } }))?.balance ?? 0;
  const fund = async (amount = 100, id = "101") =>
    db.$transaction((tx) => service.grant(tx, id, "fixture", `fixture:${id}`, amount));
  it("welcomes only the first completed task when the profile task is disabled", async () => {
    await taskService.save(
      "profile_ready",
      { ...DEFAULT_SETTINGS.tasks["profile_ready"]!, enabled: false },
      "admin"
    );
    await service.ingest([
      { id: "welcome:create", telegramId: "101", kind: "party_created", occurredAt: at() },
      { id: "welcome:join", telegramId: "101", kind: "party_joined", occurredAt: at() },
      { id: "welcome:profile", telegramId: "101", kind: "account_ready", occurredAt: at() }
    ]);
    await service.processBatch();
    assert.equal(await balance(), 10);
    const notices = await db.rewardNotice.findMany();
    assert.equal(notices.length, 1);
    assert.equal(notices[0]!.key, "first-task:101");
    assert.equal(
      (notices[0]!.payload as { title: string }).title,
      DEFAULT_SETTINGS.tasks["daily_party"]!.title
    );
    await service.ingest([
      { id: "welcome:repeat", telegramId: "101", kind: "party_joined", occurredAt: at() }
    ]);
    await service.processBatch();
    assert.equal(await db.rewardNotice.count(), 1);
  });
  it("does not repeat a welcome already sent by an earlier release", async () => {
    await service.ingest([
      { id: "legacy:profile", telegramId: "101", kind: "account_ready", occurredAt: at() }
    ]);
    await service.processBatch();
    await db.rewardNotice.updateMany({
      data: { key: "award:profile_ready:101:once", sentAt: new Date() }
    });
    await service.ingest([
      { id: "legacy:party", telegramId: "101", kind: "party_created", occurredAt: at() }
    ]);
    await service.processBatch();
    assert.equal(await db.rewardNotice.count(), 1);
    assert.equal(await db.rewardNotice.count({ where: { sentAt: null } }), 0);
  });
  it("serializes first-task notices for concurrent approvals of different tasks", async () => {
    const first = await taskService.save(null, customTask({ condition: "manual" }), "admin");
    const second = await taskService.save(null, customTask({ condition: "manual" }), "admin");
    const submissions = await Promise.all([
      taskService.submit(first.key, "202", "Первое подтверждение"),
      taskService.submit(second.key, "202", "Второе подтверждение")
    ]);
    await Promise.all(
      submissions.map((submission) => {
        assert.ok("id" in submission);
        return taskService.review(submission.id!, true, "Проверено", "admin");
      })
    );
    assert.equal(await balance("202"), 26);
    const notices = await db.rewardNotice.findMany();
    assert.equal(
      notices.filter((notice) => (notice.payload as { kind: string }).kind === "award").length,
      1
    );
    assert.equal(
      notices.filter((notice) => (notice.payload as { kind: string }).kind === "task_review")
        .length,
      1
    );
  });
  async function giveaway(maxTickets = 10) {
    const g = await service.createGiveaway(
      {
        title: "Сокровищницы",
        description: "Приз выдаёт администратор в течение 7 дней.",
        prizes: ["Сокровищница A", "Сокровищница B"],
        ticketPrice: 10,
        maxTickets,
        uniqueWinners: true,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString()
      },
      "admin"
    );
    await service.action(g.id, "publish", "admin");
    return g;
  }
  it("creates automatic tasks without claims and keeps them idempotent", async () => {
    const task = await taskService.save(null, customTask(), "admin");
    await backdateTask(task.key);
    await service.ingest([
      { id: "new-task:1", telegramId: "101", kind: "party_created", occurredAt: at() },
      { id: "new-task:2", telegramId: "101", kind: "party_created", occurredAt: at() }
    ]);
    await service.processBatch();
    assert.equal(await balance(), 18);
    assert.equal(await db.rewardLedger.count({ where: { task: task.key } }), 1);
    assert.equal(
      (await service.walletPage("101")).tasks.find((t) => t.key === task.key)?.completed,
      true
    );
    assert.equal((await db.rewardAudit.findFirstOrThrow()).action, "task-create");
  });
  it("applies task edits to future awards and preserves archived history and analytics", async () => {
    const task = await taskService.save(null, customTask(), "admin");
    await backdateTask(task.key);
    await service.ingest([
      { id: "edit-task:1", telegramId: "101", kind: "party_created", occurredAt: at() }
    ]);
    await service.processBatch();
    await taskService.save(
      task.key,
      customTask({ title: "Обновлённое задание", amount: 17 }),
      "admin"
    );
    await service.ingest([
      { id: "edit-task:2", telegramId: "202", kind: "party_created", occurredAt: at() }
    ]);
    await service.processBatch();
    await taskService.archive(task.key, "admin");
    await service.ingest([
      { id: "edit-task:3", telegramId: "303", kind: "party_created", occurredAt: at() }
    ]);
    await service.processBatch();
    assert.equal(await balance("303"), 5);
    assert.ok(!(await service.walletPage("101")).tasks.some((t) => t.key === task.key));
    const report = await taskService.analytics({ task: task.key, offset: 0 });
    assert.deepEqual(report.totals, { completions: 2, users: 2, amount: 30 });
    assert.equal(report.tasks[0]?.archived, true);
    assert.deepEqual(
      new Set(report.completions.map((row) => row.title)),
      new Set(["Создай пати", "Обновлённое задание"])
    );
    const filtered = await taskService.analytics({ task: task.key, telegramId: "202", offset: 0 });
    assert.equal(filtered.totals.amount, 17);
    await taskService.archive(task.key, "admin", true);
    assert.ok((await service.walletPage("101")).tasks.some((t) => t.key === task.key));
  });
  it("does not apply a newly created task to earlier actions", async () => {
    const task = await taskService.save(null, customTask(), "admin");
    await service.ingest([
      { id: "old-for-new-task", telegramId: "101", kind: "party_created", occurredAt: at() }
    ]);
    await service.processBatch();
    assert.equal(await db.rewardLedger.count({ where: { task: task.key } }), 0);
  });
  it("reviews a manual task once and honors its submitted reward after edits or archival", async () => {
    const task = await taskService.save(
      null,
      customTask({ condition: "manual", amount: 17 }),
      "admin"
    );
    const submitted = await taskService.submit(task.key, "101", "https://example.com/proof");
    assert.ok("id" in submitted);
    await taskService.save(task.key, customTask({ condition: "manual", amount: 99 }), "admin");
    await taskService.archive(task.key, "admin");
    await Promise.all([
      taskService.review(submitted.id!, true, "Проверено", "admin"),
      taskService.review(submitted.id!, true, "Повтор", "admin")
    ]);
    assert.equal(await balance(), 17);
    assert.equal(await db.rewardLedger.count({ where: { task: task.key } }), 1);
    assert.equal(await db.rewardAudit.count({ where: { action: "task-review" } }), 1);
    await assert.rejects(taskService.review(submitted.id!, false, "Передумал", "admin"));
    await taskService.archive(task.key, "admin", true);
    assert.deepEqual(await taskService.submit(task.key, "101", "Второй запрос"), {
      completed: true
    });
    assert.equal((await taskService.analytics({ task: task.key, offset: 0 })).totals.amount, 17);
  });
  it("allows corrected proof after rejection and keeps player submission status private", async () => {
    const task = await taskService.save(null, customTask({ condition: "manual" }), "admin");
    const submitted = await taskService.submit(task.key, "101", "Первое подтверждение");
    assert.ok("id" in submitted);
    await taskService.review(submitted.id!, false, "Нужна рабочая ссылка", "admin");
    const retry = await taskService.submit(task.key, "101", "https://example.com/fixed");
    assert.equal("status" in retry && retry.status, "PENDING");
    assert.equal(
      (await service.walletPage("202")).tasks.find((t) => t.key === task.key)?.submission,
      null
    );
    const queue = await taskService.submissions();
    assert.equal(queue.total, 1);
    assert.equal(queue.items[0]?.evidence, "https://example.com/fixed");
    assert.equal(await balance(), 0);
  });
  it("counts seven active days even when the daily task is removed", async () => {
    const monday = new Date(`${moscowWeek(new Date())}T12:00:00+03:00`);
    monday.setUTCDate(monday.getUTCDate() - 7);
    await db.rewardProgram.update({
      where: { id: "fdp" },
      data: { startedAt: new Date(monday.getTime() - 86400000) }
    });
    await taskService.archive("daily_party", "admin");
    await service.ingest(
      Array.from({ length: 7 }, (_, i) => ({
        id: `independent-week:${i}`,
        telegramId: "101",
        kind: "search_started",
        occurredAt: new Date(monday.getTime() + i * 86400000).toISOString()
      }))
    );
    await service.processBatch();
    assert.equal(await balance(), 10);
    assert.equal(await db.rewardActivityDay.count(), 7);
  });
  it("validates task conditions and analytics filters before querying", async () => {
    await assert.rejects(
      taskService.save(null, customTask({ condition: "manual", period: "friend" }), "admin")
    );
    await assert.rejects(taskService.analytics({ task: "invalid", offset: 0 }));
    await assert.rejects(taskService.analytics({ task: "constructor", offset: 0 }));
    await assert.rejects(taskService.save("__proto__", customTask(), "admin"));
    await assert.rejects(taskService.analytics({ telegramId: "101' OR 1=1", offset: 0 }));
    await assert.rejects(taskService.analytics({ from: "2026-02-31", offset: 0 }));
  });
  it("credits events before first page view; retries and concurrent workers cannot mint twice", async () => {
    const event = {
      id: "bot:ready:101",
      telegramId: "101",
      kind: "account_ready",
      occurredAt: at()
    };
    await service.ingest([event, event]);
    await Promise.all([
      service.processBatch(),
      new RewardsService(db as PrismaService).processBatch()
    ]);
    assert.equal(await balance(), 5);
    await service.ingest([event]);
    await service.processBatch();
    assert.equal(await balance(), 5);
    assert.equal(await db.rewardLedger.count({ where: { telegramId: "101" } }), 1);
  });
  it("shares the daily award between search and creation", async () => {
    await service.ingest(
      ["search_started", "party_created", "party_joined"].map((kind, index) => ({
        id: `bot:activity:${index}`,
        telegramId: "101",
        kind,
        occurredAt: at()
      }))
    );
    await service.processBatch();
    assert.equal(await balance(), 10); // daily 5 + first join 5
    assert.equal(await db.rewardLedger.count({ where: { task: "daily_party" } }), 1);
  });
  it("ignores actions before the campaign and does not reward future events early", async () => {
    await service.ingest([
      {
        id: "bot:old",
        telegramId: "101",
        kind: "account_ready",
        occurredAt: new Date(campaign.getTime() - 1000).toISOString()
      },
      {
        id: "bot:future",
        telegramId: "101",
        kind: "account_ready",
        occurredAt: new Date(Date.now() + 60000).toISOString()
      }
    ]);
    await service.processBatch();
    assert.equal(await balance(), 0);
    assert.equal(await db.rewardEvent.count(), 1);
  });
  it("replays a purchase without double spending or tickets", async () => {
    await fund();
    const g = await giveaway(),
      input = { requestId: randomUUID(), quantity: 3, expectedPrice: 10 };
    const results = await Promise.all([
      service.purchase(g.id, "101", input),
      service.purchase(g.id, "101", input)
    ]);
    assert.equal(results.filter((r) => r.replayed).length, 1);
    assert.equal(await balance(), 70);
    assert.equal(await db.giveawayTicket.count(), 3);
    await assert.rejects(service.purchase(g.id, "101", { ...input, quantity: 1 }));
  });
  it("serializes competing purchases and never overdraws", async () => {
    await fund(10);
    const g = await giveaway();
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.purchase(g.id, "101", { requestId: randomUUID(), quantity: 1, expectedPrice: 10 })
      )
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await balance(), 0);
    assert.equal(await db.giveawayTicket.count(), 1);
  });
  it("enforces limits, price snapshots, expiry, and draft visibility", async () => {
    await fund();
    const g = await giveaway(1);
    await assert.rejects(
      service.purchase(g.id, "101", { requestId: randomUUID(), quantity: 2, expectedPrice: 10 })
    );
    await assert.rejects(
      service.purchase(g.id, "101", { requestId: randomUUID(), quantity: 1, expectedPrice: 11 })
    );
    await db.giveaway.update({ where: { id: g.id }, data: { endsAt: new Date(Date.now() - 1) } });
    await assert.rejects(
      service.purchase(g.id, "101", { requestId: randomUUID(), quantity: 1, expectedPrice: 10 })
    );
    assert.equal(await balance(), 100);
  });
  it("draws once across parallel requests and strips other users' IDs from public results", async () => {
    await fund();
    await fund(100, "202");
    const g = await giveaway();
    await service.purchase(g.id, "101", {
      requestId: randomUUID(),
      quantity: 3,
      expectedPrice: 10
    });
    await service.purchase(g.id, "202", {
      requestId: randomUUID(),
      quantity: 1,
      expectedPrice: 10
    });
    await assert.rejects(service.action(g.id, "draw", "admin"));
    await db.giveaway.update({ where: { id: g.id }, data: { endsAt: new Date(Date.now() - 1) } });
    const [one, two] = await Promise.all([
      service.action(g.id, "draw", "admin"),
      service.action(g.id, "draw", "admin")
    ]);
    assert.deepEqual(one.draw, two.draw);
    const result = await service.giveawayPage(g.id, "101");
    assert.equal(result.draw!.winners.length, 2);
    assert.equal(
      result.draw!.winners.some((w) => "telegramId" in w),
      false
    );
    assert.equal(result.draw!.winners.filter((w) => w.isMine).length, 1);
    assert.equal(await db.rewardAudit.count({ where: { action: "draw" } }), 1);
  });
  it("refunds the actual purchase once after cancellation", async () => {
    await fund();
    const g = await giveaway();
    await service.purchase(g.id, "101", {
      requestId: randomUUID(),
      quantity: 3,
      expectedPrice: 10
    });
    await service.action(g.id, "cancel", "admin");
    await Promise.all([
      service.refundBatch(),
      new RewardsService(db as PrismaService).refundBatch()
    ]);
    await service.refundBatch();
    assert.equal(await balance(), 100);
    assert.equal(await db.rewardLedger.count({ where: { task: "refund" } }), 1);
    await assert.rejects(service.action(g.id, "draw", "admin"));
  });
  it("preserves tag rewards during Telegram outages and rejects the removed Steam task", async () => {
    const check = new RewardVerificationService(service);
    await fund(10);
    await db.rewardTagVerification.create({
      data: { telegramId: "101", provider: "telegram", firstSeenAt: campaign }
    });
    const old = process.env["DOTA_BOT_TOKEN"];
    process.env["DOTA_BOT_TOKEN"] = "qa-token";
    const mocked = mock.method(globalThis, "fetch", async () => {
      throw new Error("Fixture outage");
    });
    try {
      await check.checkBatch();
      assert.equal(await balance(), 10);
      assert.equal((await db.rewardTagVerification.findFirstOrThrow()).status, "ERROR");
      assert.equal(await db.rewardNotice.count(), 1);
      await db.rewardTagVerification.updateMany({ data: { nextCheckAt: new Date() } });
      await check.checkBatch();
      assert.equal(await db.rewardNotice.count(), 1); // Background retries do not notify again.
      assert.equal(
        (await db.rewardTagVerification.findFirstOrThrow()).firstSeenAt?.getTime(),
        campaign.getTime()
      );
      await assert.rejects(check.enroll("101", "steam"));
      assert.ok(!("steam_tag" in (await service.program()).settings.tasks));
    } finally {
      mocked.mock.restore();
      if (old) process.env["DOTA_BOT_TOKEN"] = old;
      else delete process.env["DOTA_BOT_TOKEN"];
    }
  });
  it("reports an explicit Telegram check and keeps periodic checks quiet", async () => {
    const check = new RewardVerificationService(service);
    await db.rewardTagVerification.create({
      data: { telegramId: "101", provider: "telegram", status: "MISSING" }
    });
    await check.enroll("101", "telegram");
    assert.equal((await db.rewardTagVerification.findFirstOrThrow()).status, "PENDING");
    const old = process.env["DOTA_BOT_TOKEN"];
    process.env["DOTA_BOT_TOKEN"] = "qa-token";
    let name = "QA @FDPdotabot";
    const mocked = mock.method(
      globalThis,
      "fetch",
      async () => new Response(JSON.stringify({ ok: true, result: { id: 101, first_name: name } }))
    );
    try {
      await check.checkBatch();
      assert.equal((await db.rewardTagVerification.findFirstOrThrow()).status, "VERIFIED");
      assert.equal(await balance(), 0); // The hold period has only just started.
      assert.equal(await db.rewardNotice.count(), 1);
      await db.rewardTagVerification.updateMany({ data: { nextCheckAt: new Date() } });
      await check.checkBatch();
      assert.equal(await db.rewardNotice.count(), 1);
      name = "QA";
      await check.enroll("101", "telegram");
      await check.checkBatch();
      assert.equal((await db.rewardTagVerification.findFirstOrThrow()).status, "MISSING");
      assert.equal(await db.rewardNotice.count(), 2);
    } finally {
      mocked.mock.restore();
      if (old) process.env["DOTA_BOT_TOKEN"] = old;
      else delete process.env["DOTA_BOT_TOKEN"];
    }
  });
  it("rejects requests for a disabled Telegram task without creating a check", async () => {
    await taskService.save(
      "telegram_tag",
      { ...DEFAULT_SETTINGS.tasks["telegram_tag"]!, enabled: false },
      "admin"
    );
    await assert.rejects(new RewardVerificationService(service).enroll("101", "telegram"), {
      status: 409
    });
    assert.equal(await db.rewardTagVerification.count(), 0);
  });
  it("awards a week once for seven distinct Moscow days", async () => {
    const monday = new Date(`${moscowWeek(new Date())}T12:00:00+03:00`);
    monday.setUTCDate(monday.getUTCDate() - 7);
    await db.rewardProgram.update({
      where: { id: "fdp" },
      data: { startedAt: new Date(monday.getTime() - 86400000) }
    });
    const events = Array.from({ length: 7 }, (_, i) => ({
      id: `week:${i}`,
      telegramId: "101",
      kind: "search_started",
      occurredAt: new Date(monday.getTime() + i * 86400000).toISOString()
    }));
    await service.ingest(events);
    await service.processBatch();
    await service.ingest(events);
    await service.processBatch();
    assert.equal(await balance(), 45);
    assert.equal(await db.rewardLedger.count({ where: { task: "weekly_party" } }), 1);
  });
  it("splits referral rewards and deduplicates registration, qualified search, and join", async () => {
    await db.fdpReferral.create({
      data: {
        inviteeTelegramId: "404",
        inviterTelegramId: "101",
        code: "a".repeat(24),
        inviterName: "QA",
        inviteeName: "Friend",
        startedAt: new Date(Date.now() - 600000),
        accountReadyAt: new Date(at())
      }
    });
    try {
      await service.ingest([
        { id: "friend:search", telegramId: "404", kind: "search_started", occurredAt: at() }
      ]);
      await service.processBatch();
      assert.equal(await balance(), 20);
      await db.fdpReferral.update({
        where: { inviteeTelegramId: "404" },
        data: { partyJoinedAt: new Date(at()) }
      });
      await service.processBatch();
      assert.equal(await balance(), 20);
    } finally {
      await db.fdpReferral.delete({ where: { inviteeTelegramId: "404" } });
    }
  });
  it("leases notices once and remembers delivery", async () => {
    await service.ingest([
      { id: "notice:ready", telegramId: "101", kind: "account_ready", occurredAt: at() }
    ]);
    await service.processBatch();
    const [first, second] = await Promise.all([service.claimNotices(), service.claimNotices()]);
    assert.equal(first.length + second.length, 1);
    const notice = [...first, ...second][0]!;
    await service.noticeDelivery(notice.id, true);
    await service.noticeDelivery(notice.id, false);
    assert.deepEqual(await service.claimNotices(), []);
    assert.ok((await db.rewardNotice.findUniqueOrThrow({ where: { id: notice.id } })).sentAt);
  });
  it("locks published terms and audits manual tag review", async () => {
    const g = await giveaway();
    await assert.rejects(
      service.editGiveaway(
        g.id,
        {
          title: g.title,
          description: g.description,
          prizes: g.prizes as string[],
          ticketPrice: 9,
          maxTickets: 5,
          uniqueWinners: true,
          startsAt: g.startsAt.toISOString(),
          endsAt: g.endsAt.toISOString()
        },
        "admin"
      )
    );
    const tag = await db.rewardTagVerification.create({
      data: {
        telegramId: "101",
        provider: "telegram",
        firstSeenAt: new Date(Date.now() - 2 * 86400000)
      }
    });
    await service.reviewTag(tag.id, true, "Проверил имя профиля", null, "admin");
    await service.reviewTag(tag.id, true, "Повторная проверка", null, "admin");
    assert.equal(await balance(), 2);
    assert.equal(await db.rewardAudit.count({ where: { action: "tag-review" } }), 2);
  });
  it("captures background search sessions durably and skips short cancellations", async () => {
    const user = await db.user.create({
      data: { displayName: "QA", email: `${randomUUID()}@rewards.invalid` }
    });
    try {
      await db.userAuthIdentity.create({
        data: { userId: user.id, provider: "telegram", providerUserId: "303" }
      });
      const startedAt = new Date(Date.now() - 300000);
      await db.dotaSearchSession.create({
        data: { userId: user.id, source: "web", startedAt, expiresAt: new Date(Date.now() + 10000) }
      });
      assert.equal(await db.rewardEvent.count({ where: { kind: "search_pending" } }), 1);
      await service.processBatch();
      assert.equal(await balance("303"), 5);
      await db.dotaSearchSession.create({
        data: {
          userId: user.id,
          source: "web",
          startedAt: new Date(startedAt.getTime() + 1000),
          expiresAt: new Date(Date.now() + 10000),
          finishedAt: new Date(startedAt.getTime() + 2000),
          status: "CANCELLED"
        }
      });
      await service.processBatch();
      assert.equal(await balance("303"), 5);
      assert.equal(
        await db.rewardLedger.count({ where: { telegramId: "303", task: "daily_party" } }),
        1
      );
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
