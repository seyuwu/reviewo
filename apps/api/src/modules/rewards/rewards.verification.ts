import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { Prisma } from "#prisma/client";
import { RewardsService } from "./rewards.service.js";
import { containsTag, moscowDay } from "./rewards.rules.js";

export const steamCallbackUrl = () =>
  process.env["REWARDS_STEAM_RETURN_URL"] ?? "https://api.opinia.ru/rewards/steam/callback";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const STEAM_ENDPOINT = "https://steamcommunity.com/openid/login";

@Injectable()
export class RewardVerificationService {
  constructor(private readonly rewards: RewardsService) {}
  async enroll(telegramId: string, provider: "telegram" | "steam", relink = false) {
    await this.rewards.requireEnabled();
    if (provider === "steam") {
      const linked = await this.rewards.prisma.rewardTagVerification.findUnique({
        where: { telegramId_provider: { telegramId, provider } }
      });
      if (relink || !linked?.profileId) return this.steamStart(telegramId);
    }
    await this.rewards.prisma.rewardTagVerification.upsert({
      where: { telegramId_provider: { telegramId, provider } },
      create: { telegramId, provider },
      update: { nextCheckAt: new Date() }
    });
    return { pending: true };
  }
  async steamStart(telegramId: string) {
    if (!process.env["STEAM_WEB_API_KEY"])
      throw new ServiceUnavailableException("Проверка Steam ещё не настроена администратором");
    const callback = new URL(steamCallbackUrl());
    if (callback.protocol !== "https:" && callback.hostname !== "localhost")
      throw new ServiceUnavailableException("Не настроен безопасный адрес входа Steam");
    const token = randomBytes(24).toString("hex");
    await this.rewards.prisma.rewardSteamLink.create({
      data: { tokenHash: hash(token), telegramId, expiresAt: new Date(Date.now() + 10 * 60000) }
    });
    callback.searchParams.set("state", token);
    const target = new URL(STEAM_ENDPOINT);
    for (const [key, value] of Object.entries({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "checkid_setup",
      "openid.return_to": callback.href,
      "openid.realm": callback.origin,
      "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select"
    }))
      target.searchParams.set(key, value);
    return { url: target.href };
  }
  async steamCallback(query: Record<string, string>) {
    await this.rewards.requireEnabled();
    const state = query["state"] ?? "",
      link = await this.rewards.prisma.rewardSteamLink.findUnique({
        where: { tokenHash: hash(state) }
      });
    if (!/^[a-f0-9]{48}$/.test(state) || !link || link.usedAt || link.expiresAt < new Date())
      throw new BadRequestException("Ссылка подключения истекла. Откройте новую в боте.");
    const expected = new URL(steamCallbackUrl());
    expected.searchParams.set("state", state);
    const signed = new Set((query["openid.signed"] ?? "").split(","));
    const required = ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce"];
    const claimed = query["openid.claimed_id"] ?? "";
    const match = /^https?:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/.exec(claimed);
    const nonce = query["openid.response_nonce"] ?? "",
      nonceTime = Date.parse(nonce.slice(0, 20));
    if (
      !match ||
      query["openid.identity"] !== claimed ||
      query["openid.op_endpoint"] !== STEAM_ENDPOINT ||
      query["openid.return_to"] !== expected.href ||
      query["openid.ns"] !== "http://specs.openid.net/auth/2.0" ||
      query["openid.mode"] !== "id_res" ||
      required.some((field) => !signed.has(field)) ||
      !Number.isFinite(nonceTime) ||
      Math.abs(Date.now() - nonceTime) > 10 * 60000
    )
      throw new BadRequestException("Не удалось подтвердить ответ Steam");
    const payload = new URLSearchParams(
      Object.entries(query).filter(([key]) => key.startsWith("openid."))
    );
    payload.set("openid.mode", "check_authentication");
    const response = await fetch(STEAM_ENDPOINT, {
      method: "POST",
      body: payload,
      signal: AbortSignal.timeout(5000),
      redirect: "error"
    });
    const valid = await response.text();
    if (!response.ok || !/^is_valid:true\r?$/m.test(valid))
      throw new BadRequestException("Steam не подтвердил вход");
    try {
      await this.rewards.prisma.$transaction(async (tx) => {
        const consumed = await tx.rewardSteamLink.updateMany({
          where: { tokenHash: link.tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() }
        });
        if (!consumed.count) throw new ConflictException("Ссылка уже использована");
        await tx.rewardTagVerification.upsert({
          where: { telegramId_provider: { telegramId: link.telegramId, provider: "steam" } },
          create: { telegramId: link.telegramId, provider: "steam", profileId: match[1]! },
          update: {
            profileId: match[1]!,
            status: "PENDING",
            firstSeenAt: null,
            checkedAt: null,
            nextCheckAt: new Date(),
            reason: null
          }
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Этот Steam уже подключён к другому участнику");
      throw error;
    }
    return { ok: true };
  }
  async checkBatch() {
    const p = await this.rewards.program(true);
    if (!p.enabled) return;
    // Claim one external request per pass. Lease is persisted before network I/O.
    const rows = await this.rewards.prisma.$transaction(async (tx) => {
      const selected = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM community.reward_tag_verifications WHERE next_check_at<=NOW() ORDER BY next_check_at,id LIMIT 3 FOR UPDATE SKIP LOCKED`;
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
      if (!p.settings.tasks[row.provider === "telegram" ? "telegram_tag" : "steam_tag"].enabled) {
        await this.rewards.prisma.rewardTagVerification.update({
          where: { id: row.id },
          data: { nextCheckAt: new Date(Date.now() + 86400000) }
        });
        continue;
      }
      try {
        let name: string;
        if (row.provider === "telegram") {
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
          name = `${data.result?.first_name ?? ""} ${data.result?.last_name ?? ""}`;
        } else {
          const key = process.env["STEAM_WEB_API_KEY"];
          if (!key || !row.profileId) throw new Error("Steam verification is not configured");
          const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
          url.searchParams.set("key", key);
          url.searchParams.set("steamids", row.profileId);
          const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            redirect: "error"
          });
          const data = (await response.json()) as {
            response?: { players?: { steamid: string; personaname: string }[] };
          };
          const player = data.response?.players?.find((player) => player.steamid === row.profileId);
          if (!response.ok || !player) throw new Error("Steam verification unavailable");
          name = player.personaname;
        }
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
          if (found && first && now.getTime() - first.getTime() >= 86400000) {
            const task = row.provider === "telegram" ? "telegram_tag" : "steam_tag",
              rule = p.settings.tasks[task];
            await this.rewards.grant(
              tx,
              row.telegramId,
              task,
              `${task}:${row.telegramId}:${moscowDay(now)}`,
              rule.amount,
              { title: rule.title, at: now.toISOString(), ruleVersion: 1 }
            );
          }
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
