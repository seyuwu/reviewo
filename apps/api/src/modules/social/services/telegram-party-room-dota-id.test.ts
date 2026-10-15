import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { TelegramPartyChatRoom } from "#prisma/client";
import type { PrismaService } from "../../../database/prisma.service.js";
import type { EnvironmentVariables } from "../../../config/environment.validation.js";
import type { DotaProfileService } from "../../dota/services/dota-profile.service.js";
import type { TelegramBotService } from "../../telegram/telegram-bot.service.js";
import { TelegramPartyRoomsController } from "../controllers/telegram-party-rooms.controller.js";
import { RoomDotaIdDto } from "../dto/telegram-party-rooms.dto.js";
import type { GamePartiesService } from "./game-parties.service.js";
import type { PartyCoordinationService } from "./party-coordination.service.js";
import type { DiscordVoiceService } from "./discord-voice.service.js";
import { TelegramPartyRoomsService } from "./telegram-party-rooms.service.js";

function fixture() {
  const owner = {
    id: randomUUID(),
    displayName: "QA",
    status: "active",
    role: "USER",
    email: null,
    avatarUrl: null,
    username: null
  };
  const membershipId = randomUUID(),
    partyId = randomUUID(),
    roomId = randomUUID();
  const room = {
    id: roomId,
    botId: "12345",
    generation: 4,
    state: "ACTIVE",
    partyId,
    data: {
      partySlug: "qa-party",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      presentIds: ["11"],
      staffIds: [],
      roster: [{ membershipId, userId: owner.id, telegramId: "11" }]
    }
  } as unknown as TelegramPartyChatRoom;
  const writes: unknown[][] = [],
    ready: unknown[][] = [];
  const db = { user: { findUniqueOrThrow: async () => owner } } as unknown as PrismaService;
  const profiles = {
    updateMyProfile: async (...args: unknown[]) => {
      writes.push(args);
    }
  } as unknown as DotaProfileService;
  const service = new TelegramPartyRoomsService(
    db,
    new ConfigService<EnvironmentVariables, true>(),
    {} as GamePartiesService,
    {} as PartyCoordinationService,
    {} as DiscordVoiceService,
    profiles
  );
  service.reconcile = async () => room;
  const realReady = service.ready.bind(service);
  service.ready = async (...args) => {
    ready.push(args);
    return { changed: true, coordination: {} as never };
  };
  const save = () =>
    service.saveDotaId(roomId, "12345", "11", 4, partyId, membershipId, "123456789");
  return {
    owner,
    room,
    roomId,
    partyId,
    membershipId,
    service,
    profiles,
    writes,
    ready,
    realReady,
    save
  };
}

it("returns a fresh membership context and saves only the sender's own profile", async () => {
  const f = fixture();
  assert.deepEqual(await f.service.dotaIdContext(f.roomId, "12345", "11", 4), {
    partyId: f.partyId,
    membershipId: f.membershipId,
    generation: 4
  });
  assert.deepEqual(await f.save(), { saved: true, ready: true });
  assert.deepEqual(f.writes, [[{ dotaAccountId: "123456789" }, f.owner]]);
  assert.deepEqual(f.ready, [[f.roomId, "12345", "11", true, 4, f.membershipId]]);
});
it("rejects stale parties/memberships and invalid IDs before writing a profile", async () => {
  const f = fixture();
  for (const [party, member, id] of [
    [randomUUID(), f.membershipId, "123456789"],
    [f.partyId, randomUUID(), "123456789"],
    [f.partyId, f.membershipId, "１２３４５６７８９"],
    [f.partyId, f.membershipId, "123"]
  ])
    await assert.rejects(f.service.saveDotaId(f.roomId, "12345", "11", 4, party!, member!, id!));
  assert.equal(f.writes.length, 0);
  assert.equal(f.ready.length, 0);
});
it("rejects another helper, outsider, old generation, expired and absent members", async () => {
  const f = fixture();
  for (const [bot, user, generation] of [
    ["99999", "11", 4],
    ["12345", "22", 4],
    ["12345", "11", 3]
  ] as const)
    await assert.rejects(
      f.service.saveDotaId(f.roomId, bot, user, generation, f.partyId, f.membershipId, "123456789")
    );
  const data = f.room.data as { presentIds: string[]; expiresAt: string };
  data.presentIds = [];
  await assert.rejects(f.save());
  data.presentIds = ["11"];
  data.expiresAt = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(f.save());
  assert.equal(f.writes.length, 0);
});
it("preserves the normal profile conflict rules and never marks a rejected ID ready", async () => {
  const f = fixture();
  f.profiles.updateMyProfile = async () => {
    throw new ConflictException("This Dota Account ID is already linked to another profile");
  };
  await assert.rejects(f.save(), { status: 409 });
  assert.equal(f.ready.length, 0);
});
it("reports a saved ID separately if the party changes before readiness", async () => {
  const f = fixture();
  f.service.ready = async () => {
    throw new ForbiddenException();
  };
  assert.deepEqual(await f.save(), { saved: true, ready: false });
  assert.equal(f.writes.length, 1);
});
it("fences readiness against a replacement membership even for the same account", async () => {
  const f = fixture();
  await assert.rejects(f.realReady(f.roomId, "12345", "11", true, 4, randomUUID()), {
    status: 403
  });
});
it("rejects inactive accounts without saving the ID", async () => {
  const f = fixture();
  f.owner.status = "blocked";
  await assert.rejects(f.save(), { status: 403 });
  assert.equal(f.writes.length, 0);
});
it("validates the complete room identity and an ASCII numeric ID at the HTTP boundary", async () => {
  const f = fixture();
  const body = {
    botId: "12345",
    userId: "11",
    generation: 4,
    partyId: f.partyId,
    membershipId: f.membershipId,
    dotaAccountId: "123456789"
  };
  assert.equal((await validate(plainToInstance(RoomDotaIdDto, body))).length, 0);
  for (const patch of [
    { membershipId: undefined },
    { generation: 0 },
    { dotaAccountId: "https://steamcommunity.com/test" },
    { partyId: "bad" }
  ])
    assert.ok((await validate(plainToInstance(RoomDotaIdDto, { ...body, ...patch }))).length > 0);
});
it("requires the existing bot secret before either new room action", () => {
  const f = fixture();
  const controller = new TelegramPartyRoomsController(
    {
      assertBotSecret: () => {
        throw new ForbiddenException();
      }
    } as unknown as TelegramBotService,
    f.service
  );
  const input = {
    botId: "12345",
    userId: "11",
    generation: 4,
    partyId: f.partyId,
    membershipId: f.membershipId,
    dotaAccountId: "123456789"
  };
  assert.throws(() => controller.dotaIdContext(f.roomId, input, "wrong"), { status: 403 });
  assert.throws(() => controller.saveDotaId(f.roomId, input, "wrong"), { status: 403 });
  assert.equal(f.writes.length, 0);
});

it("quarantines newly connected groups with visible history until the owner confirms cleanup", async () => {
  let created: Record<string, unknown> | undefined;
  const db = {
    telegramPartyChatRoom: {
      findUnique: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        created = args.data;
        return args.data;
      }
    }
  } as unknown as PrismaService;
  const service = new TelegramPartyRoomsService(
    db,
    new ConfigService<EnvironmentVariables, true>({ DOTA_BOT_ADMIN_IDS: "1" }),
    {} as GamePartiesService,
    {} as PartyCoordinationService,
    {} as DiscordVoiceService,
    {} as DotaProfileService
  );
  await service.register({
    botId: "12345",
    adminId: "1",
    chatId: "-10012345678",
    title: "QA",
    staffIds: ["1"],
    historyVisible: true
  });
  assert.equal(created?.state, "REVIEW");
  assert.equal((created?.data as { errorCode: string }).errorCode, "history_baseline");
  assert.equal((created?.data as { cleanupUncertain: boolean }).cleanupUncertain, true);
});
