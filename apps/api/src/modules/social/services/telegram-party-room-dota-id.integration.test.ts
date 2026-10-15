import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import { DOTA_ATTRIBUTE_KEYS } from "@reviewo/shared";
import type { PrismaService } from "../../../database/prisma.service.js";
import type { EnvironmentVariables } from "../../../config/environment.validation.js";
import type { AuthService } from "../../auth/services/auth.service.js";
import type { DotaSearchHistoryService } from "../../analytics/services/dota-search-history.service.js";
import { DotaProfileService } from "../../dota/services/dota-profile.service.js";
import { EntityAttributesRepository } from "../../dota/repositories/entity-attributes.repository.js";
import { EntityQualityConfirmationsRepository } from "../../dota/repositories/entity-quality-confirmations.repository.js";
import { EntitiesRepository } from "../../entities/repositories/entities.repository.js";
import { UsersRepository } from "../../users/repositories/users.repository.js";
import type { FriendshipsService } from "./friendships.service.js";
import type { PartyRealtimePublisher } from "../party-realtime.types.js";
import { GamePartiesRepository } from "../repositories/game-parties.repository.js";
import type { GamePartiesService } from "./game-parties.service.js";
import type { DiscordVoiceService } from "./discord-voice.service.js";
import { PartyCoordinationService } from "./party-coordination.service.js";
import { TelegramPartyRoomsService } from "./telegram-party-rooms.service.js";

const url = process.env["PARTY_COORDINATION_TEST_DATABASE_URL"];
describe("Group Dota ID and lifecycle with isolated PostgreSQL", { skip: !url }, () => {
  let db: PrismaClient, rooms: TelegramPartyRoomsService;
  let ids: string[],
    entityId: string,
    partyId: string,
    roomId: string,
    membershipId: string,
    telegramId: string,
    takenId: string,
    newId: string;
  before(() => {
    const parsed = new URL(url!);
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.port, "55439");
    assert.equal(parsed.pathname, "/fdp_rooms_qa");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const prisma = db as PrismaService,
      parties = new GamePartiesRepository(prisma);
    const profile = new DotaProfileService(
      {} as AuthService,
      {} as DotaSearchHistoryService,
      new EntitiesRepository(prisma),
      new EntityAttributesRepository(prisma),
      new EntityQualityConfirmationsRepository(prisma),
      {
        getStatusDetails: async () => ({ status: "self", requestId: null })
      } as unknown as FriendshipsService,
      parties,
      {} as PartyRealtimePublisher,
      new UsersRepository(prisma)
    );
    rooms = new TelegramPartyRoomsService(
      prisma,
      new ConfigService<EnvironmentVariables, true>({ DOTA_BOT_ADMIN_IDS: "1" }),
      {} as GamePartiesService,
      new PartyCoordinationService(prisma, parties),
      {} as DiscordVoiceService,
      profile
    );
  });
  beforeEach(async () => {
    const suffix = randomInt(10000000);
    telegramId = String(810000000 + suffix);
    takenId = String(820000000 + suffix);
    newId = String(830000000 + suffix);
    const users = await Promise.all(
      [telegramId, String(Number(telegramId) + 1)].map((tg, i) =>
        db.user.create({
          data: {
            displayName: i ? "Peer QA" : "Player QA",
            authIdentities: { create: { provider: "telegram", providerUserId: tg } }
          }
        })
      )
    );
    ids = users.map((u) => u.id);
    const entities = await Promise.all(
      users.map((u, i) =>
        db.entity.create({
          data: {
            title: u.displayName,
            slug: "group-id-" + randomUUID(),
            type: "person",
            ownerUserId: u.id,
            attributes: {
              create: Object.entries({
                [DOTA_ATTRIBUTE_KEYS.vertical]: "dota",
                [DOTA_ATTRIBUTE_KEYS.mmr]: "4500",
                [DOTA_ATTRIBUTE_KEYS.roles]: '["1"]',
                ...(i ? { [DOTA_ATTRIBUTE_KEYS.dotaAccountId]: takenId } : {})
              }).map(([key, value]) => ({ key, value }))
            }
          }
        })
      )
    );
    entityId = entities[0]!.id;
    const party = await db.gameParty.create({
      data: {
        name: "Group ID QA",
        slug: "group-id-" + randomUUID(),
        ownerUserId: ids[0]!,
        kind: "PARTY",
        vertical: "dota",
        expiresAt: new Date(Date.now() + 3600000),
        members: {
          create: users.map((u, i) => ({
            userId: u.id,
            role: i ? "MEMBER" : "OWNER",
            positionRole: i ? "2" : "1"
          }))
        }
      },
      include: { members: true }
    });
    partyId = party.id;
    membershipId = party.members.find((m) => m.userId === ids[0])!.id;
    const room = await db.telegramPartyChatRoom.create({
      data: {
        chatId: "-100" + String(9100000000 + suffix),
        botId: "12345",
        title: "Group ID QA",
        partyId,
        state: "ACTIVE",
        generation: 4,
        data: {
          roster: [],
          staffIds: [],
          presentIds: [telegramId],
          seenIds: [],
          links: [],
          partySlug: party.slug,
          expiresAt: party.expiresAt!.toISOString()
        }
      }
    });
    roomId = room.id;
  });
  afterEach(async () => {
    await db.telegramPartyChatRoom.deleteMany({ where: { id: roomId } });
    await db.gameParty.deleteMany({ where: { id: partyId } });
    await db.entity.deleteMany({ where: { ownerUserId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });
  after(async () => {
    await db.$disconnect();
  });
  it("saves a reply into the ordinary profile and marks only its current membership ready", async () => {
    await assert.rejects(rooms.ready(roomId, "12345", telegramId, true, 4), { status: 400 });
    assert.deepEqual(await rooms.dotaIdContext(roomId, "12345", telegramId, 4), {
      partyId,
      membershipId,
      generation: 4
    });
    assert.deepEqual(
      await rooms.saveDotaId(roomId, "12345", telegramId, 4, partyId, membershipId, newId),
      { saved: true, ready: true }
    );
    const attrs = await db.entityAttribute.findMany({ where: { entityId } });
    const values = Object.fromEntries(attrs.map((a) => [a.key, a.value]));
    assert.equal(values[DOTA_ATTRIBUTE_KEYS.dotaAccountId], newId);
    assert.equal(values[DOTA_ATTRIBUTE_KEYS.mmr], "4500");
    assert.equal(values[DOTA_ATTRIBUTE_KEYS.roles], '["1"]');
    const members = await db.gamePartyMember.findMany({ where: { partyId } });
    assert.equal(members.length, 2);
    assert.ok(members.find((m) => m.id === membershipId)!.readyAt);
    assert.equal(members.find((m) => m.userId === ids[1])!.readyAt, null);
    await rooms.reconcile(roomId);
    const room = await db.telegramPartyChatRoom.findUniqueOrThrow({ where: { id: roomId } });
    assert.equal(
      (room.data as { roster: { membershipId: string; ready: boolean }[] }).roster.find(
        (m) => m.membershipId === membershipId
      )!.ready,
      true
    );
  });
  it("keeps a conflicting ID out of the profile and does not mark readiness", async () => {
    await assert.rejects(
      rooms.saveDotaId(roomId, "12345", telegramId, 4, partyId, membershipId, takenId),
      { status: 409 }
    );
    assert.equal(
      await db.entityAttribute.count({
        where: { entityId, key: DOTA_ATTRIBUTE_KEYS.dotaAccountId }
      }),
      0
    );
    assert.equal(
      (await db.gamePartyMember.findUniqueOrThrow({ where: { id: membershipId } })).readyAt,
      null
    );
  });
  it("starts closing at expiry even before the party cleanup job deletes the row", async () => {
    await db.gameParty.update({
      where: { id: partyId },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    const room = await rooms.reconcile(roomId);
    assert.equal(room.state, "CLOSING");
    assert.equal(room.generation, 5);
    assert.ok(await db.gameParty.findUnique({ where: { id: partyId } }));
  });
  it("closes a deleted or orphaned party assignment without losing its room", async () => {
    await db.gameParty.delete({ where: { id: partyId } });
    assert.equal((await rooms.reconcile(roomId)).state, "CLOSING");
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: { state: "ACTIVE", partyId: null }
    });
    assert.equal((await rooms.reconcile(roomId)).state, "CLOSING");
  });
  it("keeps the existing Discord occupancy extension policy in control of voice-backed parties", async () => {
    await db.gameParty.update({
      where: { id: partyId },
      data: { expiresAt: new Date(Date.now() - 1000), discordChannelId: "123456789012345678" }
    });
    assert.equal((await rooms.reconcile(roomId)).state, "ACTIVE");
    await db.gameParty.delete({ where: { id: partyId } });
    assert.equal((await rooms.reconcile(roomId)).state, "CLOSING");
  });
  it("closes a merged party and an empty roster", async () => {
    await db.gameParty.update({
      where: { id: partyId },
      data: { mergedIntoSlug: "merged-" + randomUUID() }
    });
    assert.equal((await rooms.reconcile(roomId)).state, "CLOSING");
    await db.gameParty.update({ where: { id: partyId }, data: { mergedIntoSlug: null } });
    await db.telegramPartyChatRoom.update({ where: { id: roomId }, data: { state: "ACTIVE" } });
    await db.gamePartyMember.deleteMany({ where: { partyId } });
    assert.equal((await rooms.reconcile(roomId)).state, "CLOSING");
  });
  it("requires a post-cleanup poll and acknowledgement of every pending message before reuse", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "CLOSING",
        data: {
          staffIds: [],
          presentIds: [],
          possibleIds: [],
          links: [],
          historyBaselineAt: "2026-01-01T00:00:00.000Z"
        }
      }
    });
    const claim = await rooms.claim(roomId, "12345");
    assert.ok(claim);
    const lease = { botId: "12345", generation: claim.generation, leaseToken: claim.leaseToken };
    await assert.rejects(
      rooms.report(roomId, { ...lease, event: "closed", pollStartedAt: Date.now() }),
      { status: 409 }
    );
    await rooms.report(roomId, { ...lease, event: "cleanup-fenced" });
    await assert.rejects(rooms.report(roomId, { ...lease, event: "closed", pollStartedAt: 1 }), {
      status: 409
    });
    await db.telegramPartyChatMessage.create({
      data: { roomId, messageId: 101, generation: 4, sentAt: new Date() }
    });
    await assert.rejects(
      rooms.report(roomId, { ...lease, event: "closed", pollStartedAt: Date.now() }),
      { status: 409 }
    );
    assert.equal(
      (await rooms.deletions(roomId, "12345", lease.generation, lease.leaseToken)).length,
      1
    );
    await rooms.deleted(roomId, "12345", lease.generation, lease.leaseToken, [101]);
    const closed = await rooms.report(roomId, {
      ...lease,
      event: "closed",
      pollStartedAt: Date.now()
    });
    assert.equal(closed.state, "FREE");
    assert.equal(closed.partyId, null);
    assert.equal(
      (closed.data as { historyBaselineAt: string }).historyBaselineAt,
      "2026-01-01T00:00:00.000Z"
    );
    assert.equal(await db.telegramPartyChatMessage.count({ where: { roomId } }), 0);
  });
  it("cleans late messages in a free group and ignores immutable creation notices", async () => {
    const chatId = (await db.telegramPartyChatRoom.findUniqueOrThrow({ where: { id: roomId } }))
      .chatId;
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: { state: "FREE", partyId: null, assignedAt: null, data: {} }
    });
    await rooms.track({
      botId: "12345",
      messages: [{ chatId, messageId: 111, sentAt: Math.floor(Date.now() / 1000), service: true }]
    });
    assert.equal(
      (await db.telegramPartyChatRoom.findUniqueOrThrow({ where: { id: roomId } })).state,
      "FREE"
    );
    await rooms.track({
      botId: "12345",
      messages: [{ chatId, messageId: 112, sentAt: Math.floor(Date.now() / 1000) }]
    });
    assert.equal(
      (await db.telegramPartyChatRoom.findUniqueOrThrow({ where: { id: roomId } })).state,
      "CLOSING"
    );
    assert.equal(
      await db.telegramPartyChatMessage.count({ where: { roomId, deletedAt: null } }),
      1
    );
  });
  it("queues previously saved pending messages in a free room during worker sync", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: { state: "FREE", partyId: null, assignedAt: null, data: {} }
    });
    await db.telegramPartyChatMessage.create({
      data: { roomId, messageId: 501, generation: 3, sentAt: new Date(Date.now() - 86400000) }
    });
    await db.telegramPartyChatWorker.upsert({
      where: { botId: "12345" },
      create: { botId: "12345", heartbeatAt: new Date() },
      update: { heartbeatAt: new Date() }
    });
    assert.equal(
      (await rooms.adminList("1")).rooms.find((room) => room.id === roomId)?.available,
      false
    );
    const result = await rooms.workerRooms("12345");
    assert.equal(result.find((room) => room.id === roomId)?.state, "CLOSING");
    const claim = await rooms.claim(roomId, "12345");
    assert.ok(claim);
    const lease = { botId: "12345", generation: claim.generation, leaseToken: claim.leaseToken };
    await rooms.report(roomId, { ...lease, event: "cleanup-fenced" });
    await rooms.deleted(roomId, "12345", lease.generation, lease.leaseToken, [501]);
    await rooms.report(roomId, { ...lease, event: "closed", pollStartedAt: Date.now() });
    assert.equal(
      (await db.telegramPartyChatRoom.findUniqueOrThrow({ where: { id: roomId } })).state,
      "FREE"
    );
    assert.equal(
      await db.telegramPartyChatMessage.count({ where: { roomId, deletedAt: null } }),
      0
    );
    assert.equal(
      (await rooms.adminList("1")).rooms.find((room) => room.id === roomId)?.available,
      true
    );
    const reservation = new TelegramPartyRoomsService(
      db as PrismaService,
      new ConfigService<EnvironmentVariables, true>(),
      {
        getPartyBySlug: async () => ({
          id: partyId,
          kind: "PARTY",
          isMember: true,
          mergedIntoSlug: null,
          members: [{ userId: ids[0], dotaAccountId: null }]
        })
      } as unknown as GamePartiesService,
      {} as PartyCoordinationService,
      {} as DiscordVoiceService,
      {} as DotaProfileService
    );
    await db.telegramPartyChatPool.upsert({
      where: { id: "default" },
      create: { id: "default", capacity: 10 },
      update: {}
    });
    await db.telegramPartyChatWorker.upsert({
      where: { botId: "12345" },
      create: { botId: "12345", heartbeatAt: new Date() },
      update: { heartbeatAt: new Date() }
    });
    const party = await db.gameParty.findUniqueOrThrow({ where: { id: partyId } });
    const reserved = await reservation.reserve("12345", telegramId, party.slug);
    assert.equal(reserved?.id, roomId);
    assert.equal(reserved?.state, "PREPARING");
  });
  it("recovers a removal review into the current live roster without erasing history uncertainty", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "REVIEW",
        data: {
          errorCode: "participant_removal",
          cleanupUncertain: true,
          presentIds: [telegramId],
          roster: [],
          evictIds: [telegramId]
        }
      }
    });
    const room = await rooms.reconcile(roomId);
    assert.equal(room.state, "ROTATING");
    const data = room.data as { roster: unknown[]; evictIds: string[]; cleanupUncertain: boolean };
    assert.equal(data.roster.length, 2);
    assert.deepEqual(data.evictIds, []);
    assert.equal(data.cleanupUncertain, true);
  });
  it("protects a live party from closing after an administrative retry", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: { state: "REVIEW", data: { errorCode: "participant_removal" } }
    });
    assert.equal((await rooms.adminAction(roomId, "1", "retry")).state, "ROTATING");
  });
  it("resumes an interrupted closing pass when the assigned party is still alive", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "CLOSING",
        data: { presentIds: [telegramId], roster: [], cleanupFenceAt: new Date().toISOString() }
      }
    });
    const room = await rooms.reconcile(roomId);
    assert.equal(room.state, "ROTATING");
    assert.equal((room.data as { cleanupFenceAt?: string }).cleanupFenceAt, undefined);
  });
  it("never permits removal of a current member or an administrator from a live party", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: { state: "ROTATING", data: { staffIds: ["1"], evictIds: [telegramId], roster: [] } }
    });
    const eligible = await rooms.eligible(roomId, "12345", telegramId, 4);
    assert.equal(eligible.allowed, true);
    assert.equal((eligible as { mayRemove?: boolean }).mayRemove, false);
    assert.equal(
      ((await rooms.eligible(roomId, "12345", "1", 4)) as { mayRemove?: boolean }).mayRemove,
      false
    );
    assert.equal(
      ((await rooms.eligible(roomId, "12345", "999", 4)) as { mayRemove?: boolean }).mayRemove,
      true
    );
    assert.equal(
      ((await rooms.eligible(roomId, "12345", "999", 3)) as { mayRemove?: boolean }).mayRemove,
      false
    );
  });
  it("does not auto-clear a history-gap review on an active party", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: { state: "REVIEW", data: { errorCode: "history_gap", cleanupUncertain: true } }
    });
    assert.equal((await rooms.reconcile(roomId)).state, "REVIEW");
  });
  it("a preparation timeout cannot freeze an already present current party member", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "PREPARING",
        assignedAt: new Date(Date.now() - 660000),
        data: { presentIds: [telegramId], roster: [] }
      }
    });
    assert.equal((await rooms.reconcile(roomId)).state, "ROTATING");
  });
  it("an empty timed-out preparation still closes without restarting indefinitely", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "PREPARING",
        assignedAt: new Date(Date.now() - 660000),
        data: { presentIds: [], roster: [] }
      }
    });
    assert.equal((await rooms.reconcile(roomId)).state, "CLOSING");
    assert.equal((await rooms.reconcile(roomId)).state, "CLOSING");
  });
  it("preserves real history uncertainty instead of freeing an unverified group", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "CLOSING",
        data: { cleanupUncertain: true, staffIds: [], presentIds: [], possibleIds: [], links: [] }
      }
    });
    const claim = await rooms.claim(roomId, "12345");
    assert.ok(claim);
    const lease = { botId: "12345", generation: claim.generation, leaseToken: claim.leaseToken };
    await rooms.report(roomId, { ...lease, event: "cleanup-fenced" });
    const result = await rooms.report(roomId, {
      ...lease,
      event: "closed",
      pollStartedAt: Date.now()
    });
    assert.equal(result.state, "REVIEW");
    assert.equal((result.data as { cleanupUncertain: boolean }).cleanupUncertain, true);
  });
  it("records the one-time history baseline only after explicit manual confirmation", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "REVIEW",
        data: {
          staffIds: ["1"],
          presentIds: [],
          links: [],
          cleanupUncertain: true,
          errorCode: "history_baseline"
        }
      }
    });
    const result = await rooms.adminAction(roomId, "1", "confirm-clean", ["1"]);
    assert.equal(result.state, "FREE");
    assert.ok((result.data as { historyBaselineAt: string }).historyBaselineAt);
    assert.equal((result.data as { cleanupUncertain?: boolean }).cleanupUncertain, undefined);
  });
  it("a manual retry starts a new closing pass rather than trusting an old fence", async () => {
    await db.gameParty.update({
      where: { id: partyId },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "REVIEW",
        data: { cleanupFenceAt: new Date().toISOString(), cleanupUncertain: true }
      }
    });
    const result = await rooms.adminAction(roomId, "1", "retry");
    assert.equal(result.state, "CLOSING");
    assert.equal((result.data as { cleanupFenceAt?: string }).cleanupFenceAt, undefined);
    assert.equal((result.data as { cleanupUncertain: boolean }).cleanupUncertain, true);
  });
  it("removes a retired room from the pool only after pending messages are acknowledged", async () => {
    await db.telegramPartyChatRoom.update({
      where: { id: roomId },
      data: {
        state: "CLOSING",
        removeWhenFree: true,
        data: { staffIds: [], presentIds: [], possibleIds: [], links: [] }
      }
    });
    const claim = await rooms.claim(roomId, "12345");
    assert.ok(claim);
    const lease = { botId: "12345", generation: claim.generation, leaseToken: claim.leaseToken };
    await rooms.report(roomId, { ...lease, event: "cleanup-fenced" });
    await db.telegramPartyChatMessage.create({
      data: { roomId, messageId: 200, generation: 4, sentAt: new Date() }
    });
    await assert.rejects(
      rooms.report(roomId, { ...lease, event: "closed", pollStartedAt: Date.now() }),
      { status: 409 }
    );
    assert.ok(await db.telegramPartyChatRoom.findUnique({ where: { id: roomId } }));
    await rooms.deleted(roomId, "12345", lease.generation, lease.leaseToken, [200]);
    await rooms.report(roomId, { ...lease, event: "closed", pollStartedAt: Date.now() });
    assert.equal(await db.telegramPartyChatRoom.findUnique({ where: { id: roomId } }), null);
  });
  it("rejects a reply from before the same user left and rejoined", async () => {
    await rooms.dotaIdContext(roomId, "12345", telegramId, 4);
    await db.gamePartyMember.delete({ where: { id: membershipId } });
    await db.gamePartyMember.create({
      data: { partyId, userId: ids[0]!, role: "OWNER", positionRole: "1" }
    });
    await assert.rejects(
      rooms.saveDotaId(roomId, "12345", telegramId, 4, partyId, membershipId, newId)
    );
    assert.equal(
      await db.entityAttribute.count({
        where: { entityId, key: DOTA_ATTRIBUTE_KEYS.dotaAccountId }
      }),
      0
    );
  });
});
