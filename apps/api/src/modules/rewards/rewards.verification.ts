import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import { RewardsService } from "./rewards.service.js";
import { activeTask, containsTag, normalizeSettings } from "./rewards.rules.js";
import { readTelegramProfile, TelegramCheckError } from "./rewards-telegram.js";

@Injectable()
export class RewardVerificationService {
  constructor(private readonly rewards: RewardsService) {}
  async enroll(telegramId: string, provider: string) {
    const program = await this.rewards.requireEnabled();
    if (provider !== "telegram") throw new BadRequestException("Задание Steam убрано");
    if (
      !Object.values(program.settings.tasks).some(
        (task) => activeTask(task) && task.condition === "telegram_tag"
      )
    )
      throw new ConflictException("Задание проверки Telegram выключено");
    await this.rewards.prisma.rewardTagVerification.upsert({
      where: { telegramId_provider: { telegramId, provider } },
      create: { telegramId, provider },
      update: { status: "PENDING", reason: null, nextCheckAt: new Date() }
    });
    return { pending: true };
  }
  async retry(id: string, actor: string) {
    const p = await this.rewards.requireEnabled();
    if (
      !Object.values(p.settings.tasks).some(
        (task) => activeTask(task) && task.condition === "telegram_tag"
      )
    )
      throw new ConflictException("Задание проверки Telegram выключено");
    await this.rewards.prisma.$transaction(async (tx) => {
      const row = await tx.rewardTagVerification.findUnique({ where: { id } });
      if (!row || row.provider !== "telegram") throw new NotFoundException("Проверка не найдена");
      // Keep the status: an administrative retry must not notify the player again.
      await tx.rewardTagVerification.update({ where: { id }, data: { nextCheckAt: new Date() } });
      await this.rewards.audit(tx, actor, "tag_retry", id, {});
    });
    return { pending: true };
  }
  async checkBatch() {
    const p = await this.rewards.program(true);
    if (
      !p.enabled ||
      !Object.values(p.settings.tasks).some(
        (task) => activeTask(task) && task.condition === "telegram_tag"
      )
    )
      return;
    // At most three profiles per pass. Leases persist before network I/O.
    const rows = await this.rewards.prisma.$transaction(async (tx) => {
      const selected = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM community.reward_tag_verifications WHERE provider='telegram' AND next_check_at<=NOW() ORDER BY next_check_at,id LIMIT 3 FOR UPDATE SKIP LOCKED`;
      if (!selected.length) return [];
      await tx.rewardTagVerification.updateMany({
        where: { id: { in: selected.map((row) => row.id) } },
        data: { nextCheckAt: new Date(Date.now() + 10 * 60000) }
      });
      return tx.rewardTagVerification.findMany({
        where: { id: { in: selected.map((row) => row.id) } }
      });
    });
    const outcomes = await Promise.allSettled(
      rows.map(async (row) => {
        try {
          const profile = await readTelegramProfile(row.telegramId);
          const name = profile.name;
          const now = new Date(),
            found = containsTag(name, p.settings.tag);
          await this.rewards.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM community.reward_tag_verifications WHERE id=${row.id}::uuid FOR UPDATE`;
            const current = await tx.rewardTagVerification.findUniqueOrThrow({
              where: { id: row.id }
            });
            // A concurrent relink must not inherit a previous profile's check.
            if (
              current.profileId !== row.profileId ||
              current.nextCheckAt.getTime() !== row.nextCheckAt.getTime()
            )
              return;
            const first = found ? (current.firstSeenAt ?? now) : null;
            await tx.rewardTagVerification.update({
              where: { id: row.id },
              data: {
                status: found ? "VERIFIED" : "MISSING",
                firstSeenAt: first,
                checkedAt: now,
                observedName: name.slice(0, 256),
                observedUsername: profile.username,
                observedAt: now,
                attemptedAt: now,
                errorCode: null,
                reason: null,
                nextCheckAt: new Date(now.getTime() + (3 * 3600 + randomInt(3600)) * 1000)
              }
            });
            if (found && first) {
              // An administrator can disable/edit a task during the external request.
              const currentProgram = await tx.rewardProgram.findUniqueOrThrow({
                where: { id: "fdp" }
              });
              if (currentProgram.enabled)
                await this.rewards.creditVerifiedTags(
                  tx,
                  row.telegramId,
                  first,
                  now,
                  normalizeSettings(currentProgram.settings)
                );
            }
            if (row.status === "PENDING")
              await tx.rewardNotice.createMany({
                data: [
                  {
                    key: `tag-check:${row.id}:${row.nextCheckAt.toISOString()}`,
                    telegramId: row.telegramId,
                    payload: {
                      kind: "tag_check",
                      status: found ? "VERIFIED" : "MISSING",
                      tag: p.settings.tag
                    }
                  }
                ],
                skipDuplicates: true
              });
          });
        } catch (error) {
          // Never log provider URLs/tokens, and do not interpret outages as missing tags.
          const updated = await this.rewards.prisma.rewardTagVerification.updateMany({
            where: { id: row.id, profileId: row.profileId, nextCheckAt: row.nextCheckAt },
            data: {
              status: "ERROR",
              attemptedAt: new Date(),
              errorCode: error instanceof TelegramCheckError ? error.code : "INTERNAL",
              reason: "Проверка временно недоступна; повторим автоматически",
              nextCheckAt: new Date(Date.now() + 30 * 60000)
            }
          });
          if (updated.count && row.status === "PENDING")
            await this.rewards.prisma.rewardNotice.createMany({
              data: [
                {
                  key: `tag-check:${row.id}:${row.nextCheckAt.toISOString()}`,
                  telegramId: row.telegramId,
                  payload: { kind: "tag_check", status: "ERROR", tag: p.settings.tag }
                }
              ],
              skipDuplicates: true
            });
        }
      })
    );
    if (outcomes.some((outcome) => outcome.status === "rejected"))
      throw new Error("Telegram check persistence failed; leased work will retry");
  }
}
