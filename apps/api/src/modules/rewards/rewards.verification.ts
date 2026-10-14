import { BadRequestException, Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { RewardsService } from "./rewards.service.js";
import { activeTask, containsTag } from "./rewards.rules.js";

@Injectable()
export class RewardVerificationService {
  constructor(private readonly rewards: RewardsService) {}
  async enroll(telegramId: string, provider: string) {
    await this.rewards.requireEnabled();
    if (provider !== "telegram") throw new BadRequestException("Задание Steam убрано");
    await this.rewards.prisma.rewardTagVerification.upsert({
      where: { telegramId_provider: { telegramId, provider } },
      create: { telegramId, provider },
      update: { nextCheckAt: new Date() }
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
    // Claim one external request per pass. Lease is persisted before network I/O.
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
    for (const row of rows) {
      try {
        const token = process.env["DOTA_BOT_TOKEN"];
        if (!token) throw new Error("Telegram verification is not configured");
        const response = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: row.telegramId }),
          signal: AbortSignal.timeout(5000),
          redirect: "error"
        });
        const data = (await response.json()) as {
          ok?: boolean;
          result?: { id: number; first_name?: string; last_name?: string };
        };
        if (!response.ok || !data.ok || String(data.result?.id) !== row.telegramId)
          throw new Error("Telegram verification unavailable");
        const name = `${data.result?.first_name ?? ""} ${data.result?.last_name ?? ""}`;
        const now = new Date(),
          found = containsTag(name, p.settings.tag);
        await this.rewards.prisma.$transaction(async (tx) => {
          const current = await tx.rewardTagVerification.findUniqueOrThrow({
            where: { id: row.id }
          });
          // A concurrent relink must not inherit a previous profile's check.
          if (current.profileId !== row.profileId) return;
          const first = found ? (current.firstSeenAt ?? now) : null;
          await tx.rewardTagVerification.update({
            where: { id: row.id },
            data: {
              status: found ? "VERIFIED" : "MISSING",
              firstSeenAt: first,
              checkedAt: now,
              observedName: name.slice(0, 256),
              reason: null,
              nextCheckAt: new Date(now.getTime() + (3 * 3600 + randomInt(3600)) * 1000)
            }
          });
          if (found && first)
            await this.rewards.creditVerifiedTags(tx, row.telegramId, first, now, p.settings);
        });
      } catch {
        // Never log provider URLs/tokens, and do not interpret outages as missing tags.
        await this.rewards.prisma.rewardTagVerification.updateMany({
          where: { id: row.id, profileId: row.profileId },
          data: {
            status: "ERROR",
            reason: "Проверка временно недоступна; повторим автоматически",
            nextCheckAt: new Date(Date.now() + 30 * 60000)
          }
        });
      }
    }
  }
}
