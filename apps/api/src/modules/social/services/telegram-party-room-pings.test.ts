import assert from "node:assert/strict";
import { it } from "node:test";
import { ConfigService } from "@nestjs/config";
import type { TelegramPartyChatRoom } from "#prisma/client";
import type { PrismaService } from "../../../database/prisma.service.js";
import type { EnvironmentVariables } from "../../../config/environment.validation.js";
import type { GamePartiesService } from "./game-parties.service.js";
import type { PartyCoordinationService } from "./party-coordination.service.js";
import type { DiscordVoiceService } from "./discord-voice.service.js";
import type { PartyChatPingsService } from "./party-chat-pings.service.js";
import type { DotaProfileService } from "../../dota/services/dota-profile.service.js";
import { TelegramPartyRoomsService } from "./telegram-party-rooms.service.js";

function fixture() {
  const calls: unknown[][] = [];
  const room = { botId: "12345", generation: 4, state: "ACTIVE", partyId: "party", data: {
    partySlug: "current-party", partyName: "Current", expiresAt: new Date(Date.now() + 60_000).toISOString(), presentIds: ["11"], staffIds: [],
    roster: [{ membershipId: "own", userId: "sender", telegramId: "11", name: "Alice" },
      { membershipId: "other", userId: "target", telegramId: "22", name: "Bob" },
      { membershipId: "web-only", userId: "web", telegramId: null, name: "Web" }]
  } } as unknown as TelegramPartyChatRoom;
  const db = { telegramBotStart: { findMany: async () => [{ telegramUserId: "22" }] } } as unknown as PrismaService;
  const pings = { create: async (...args: unknown[]) => { calls.push(args); return { queued: true }; } } as unknown as PartyChatPingsService;
  const service = new TelegramPartyRoomsService(db, new ConfigService<EnvironmentVariables, true>(), {} as GamePartiesService,
    {} as PartyCoordinationService, {} as DiscordVoiceService, {} as DotaProfileService, pings);
  service.reconcile = async () => room;
  return { service, calls, room };
}

it("lists only other linked bot players for a current present sender", async () => {
  const { service } = fixture();
  const result = await service.pingTargets("room", "12345", "11", 4);
  assert.deepEqual(result.targets, [{ membershipId: "other", name: "Bob", role: undefined, inChat: false }]);
});
it("uses the existing fenced ping outbox, actor identity and recipient cooldown", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.ping("room", "12345", "11", 4, "other"), { queued: true });
  assert.deepEqual(calls, [["current-party", "sender", { partyId: "party", membershipId: "own", targetMembershipId: "other", telegramUserId: "11" }]]);
});
it("rejects stale generation, wrong helper and non-members before enqueuing", async () => {
  const { service, calls } = fixture();
  for (const [bot, sender, generation] of [["99999", "11", 4], ["12345", "999", 4], ["12345", "11", 3]] as const) {
    await assert.rejects(service.ping("room", bot, sender, generation, "other"));
  }
  assert.equal(calls.length, 0);
});
it("rejects private callers not yet in the group and expired parties", async () => {
  const { service, calls, room } = fixture();
  await assert.rejects(service.ping("room", "12345", "22", 4, "own"));
  (room.data as { expiresAt: string }).expiresAt = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(service.ping("room", "12345", "11", 4, "other"));
  assert.equal(calls.length, 0);
});
it("rejects self-pings and a removed target", async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.ping("room", "12345", "11", 4, "own"));
  await assert.rejects(service.ping("room", "12345", "11", 4, "gone"));
  assert.equal(calls.length, 0);
});
it("leaves present players and party administrators out of the invitation list", async () => {
  for (const field of ["presentIds", "staffIds"] as const) {
    const { service, calls, room } = fixture();
    (room.data as unknown as Record<string, string[]>)[field]!.push("22");
    assert.deepEqual((await service.pingTargets("room", "12345", "11", 4)).targets, []);
    await assert.rejects(service.ping("room", "12345", "11", 4, "other"), /Игрок уже в чате/);
    assert.equal(calls.length, 0);
  }
});
it("rechecks a target who joined after the invitation menu was opened", async () => {
  const { service, calls, room } = fixture();
  assert.equal((await service.pingTargets("room", "12345", "11", 4)).targets.length, 1);
  (room.data as { presentIds: string[] }).presentIds.push("22");
  await assert.rejects(service.ping("room", "12345", "11", 4, "other"), /Игрок уже в чате/);
  assert.equal(calls.length, 0);
});
