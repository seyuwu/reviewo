import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { Prisma, TelegramPartyChatRoom } from "#prisma/client";
import { DOTA_PARTY_VERTICAL } from "@reviewo/shared";
import type { EnvironmentVariables } from "../../../config/environment.validation.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { GamePartiesService } from "./game-parties.service.js";
import { PartyCoordinationService } from "./party-coordination.service.js";
import type { RegisterRoomDto, RoomReportDto, RoomMessagesDto } from "../dto/telegram-party-rooms.dto.js";

type RosterMember = { membershipId: string; userId: string; telegramId: string | null; name: string; role: string | null; ready: boolean };
type RoomData = {
  staffIds: string[]; links: Array<{ url: string; revoked: boolean }>;
  presentIds: string[]; seenIds: string[]; evictIds: string[]; roster: RosterMember[];
  partyName?: string; partySlug?: string; expiresAt?: string | null;
  cardId?: number; cardHash?: string; cardDirty?: boolean; error?: string;
  botBannedIds?: string[];
  presenceUpdates?: Record<string, { sentAt: number; updateId: number; status?: string; actorId?: string }>;
  cleanupUncertain?: boolean;
  purgedThrough?: Record<string, number>;
  cleanupDoneIds?: string[];
  possibleIds?: string[];
};
function dataOf(room: TelegramPartyChatRoom): RoomData {
  return { staffIds: [], links: [], presentIds: [], seenIds: [], evictIds: [], roster: [], ...(room.data as object) } as RoomData;
}
const json = (data: RoomData) => JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
const unique = (values: string[]) => [...new Set(values)];
const partyInclude = { members: { include: { user: { select: { id: true, displayName: true, status: true,
  authIdentities: { where: { provider: "telegram" }, select: { providerUserId: true } } } } } } } as const;

@Injectable()
export class TelegramPartyRoomsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly parties: GamePartiesService, private readonly coordination: PartyCoordinationService) {}

  assertAdmin(adminId: string) {
    const allowed = new Set((this.config.get("DOTA_BOT_ADMIN_IDS", { infer: true }) ?? "").split(",").map(id => id.trim()));
    if (!allowed.has(adminId)) throw new ForbiddenException("FDP administrator required");
  }

  private async locked<T>(roomId: string, action: (tx: Prisma.TransactionClient, room: TelegramPartyChatRoom) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "social"."telegram_party_chat_rooms" WHERE "id"=${roomId}::uuid FOR UPDATE`;
      const room = await tx.telegramPartyChatRoom.findUnique({ where: { id: roomId } });
      if (!room) throw new NotFoundException("Group not registered");
      return action(tx, room);
    });
  }

  async adminList(adminId: string) {
    this.assertAdmin(adminId);
    const [pool, rooms] = await Promise.all([
      this.prisma.telegramPartyChatPool.findUniqueOrThrow({ where: { id: "default" } }),
      this.prisma.telegramPartyChatRoom.findMany({ orderBy: { createdAt: "asc" } })
    ]);
    return { capacity: pool.capacity, rooms: rooms.map(room => ({
      id: room.id, chatId: room.chatId, botId: room.botId, title: room.title, state: room.state,
      enabled: room.enabled, removeWhenFree: room.removeWhenFree, generation: room.generation,
      partyId: room.partyId, partyName: dataOf(room).partyName ?? null, error: dataOf(room).error ?? null,
      inviteLink: room.state === "ACTIVE" ? dataOf(room).links.find(link => !link.revoked)?.url ?? null : null
    })) };
  }

  async register(input: RegisterRoomDto) {
    this.assertAdmin(input.adminId);
    if (!input.staffIds.includes(input.adminId)) throw new ForbiddenException("Group owner must be an FDP administrator");
    const existing = await this.prisma.telegramPartyChatRoom.findUnique({ where: { chatId: input.chatId } });
    if (existing) {
      if (existing.botId !== input.botId) throw new ConflictException("Group belongs to another bot");
      return existing;
    }
    return this.prisma.telegramPartyChatRoom.create({ data: {
      chatId: input.chatId, botId: input.botId, title: input.title.trim().slice(0, 128),
      data: json({ staffIds: unique(input.staffIds), links: [], presentIds: [], seenIds: [], evictIds: [], roster: [] })
    } });
  }

  async capacity(adminId: string, capacity: number) {
    this.assertAdmin(adminId);
    return this.prisma.telegramPartyChatPool.update({ where: { id: "default" }, data: { capacity } });
  }

  async adminAction(roomId: string, adminId: string, action: string, staffIds?: string[]) {
    this.assertAdmin(adminId);
    return this.locked(roomId, async (tx, room) => {
      if (action === "remove" && room.state === "FREE") return tx.telegramPartyChatRoom.delete({ where: { id: roomId } });
      if (action === "confirm-clean") {
        if (room.state !== "REVIEW" || !staffIds?.includes(adminId)) throw new ConflictException("Owner must confirm manual cleanup");
        if (dataOf(room).links.some(link => !link.revoked) || dataOf(room).presentIds.some(id => !dataOf(room).staffIds.includes(id))) throw new ConflictException("Revoke invitations and remove players first");
        await tx.telegramPartyChatMessage.deleteMany({ where: { roomId } });
        return tx.telegramPartyChatRoom.update({ where: { id: roomId }, data: {
          state: "FREE", generation: { increment: 1 }, leaseToken: null, leaseUntil: null, retryAt: null,
          partyId: null, assignedAt: null,
          data: json({ staffIds: unique(staffIds), links: [], presentIds: [], seenIds: [], evictIds: [], roster: [],
            botBannedIds: dataOf(room).botBannedIds ?? [], presenceUpdates: dataOf(room).presenceUpdates ?? {} })
        } });
      }
      if (action === "retry") {
        if (room.state !== "REVIEW") throw new ConflictException("Group does not require review");
        return tx.telegramPartyChatRoom.update({ where: { id: roomId }, data: {
          state: "CLOSING", generation: { increment: 1 }, leaseToken: null, leaseUntil: null, retryAt: null
        } });
      }
      return tx.telegramPartyChatRoom.update({ where: { id: roomId }, data: {
        enabled: action === "enable", removeWhenFree: action === "remove" ? true : action === "enable" ? false : room.removeWhenFree
      } });
    });
  }

  private roster(party: Prisma.GamePartyGetPayload<{ include: typeof partyInclude }>): RosterMember[] {
    return party.members.filter(member => member.user.status === "active").map(member => ({
      membershipId: member.id, userId: member.userId, telegramId: member.user.authIdentities[0]?.providerUserId ?? null,
      name: member.user.displayName, role: member.positionRole, ready: Boolean(member.readyAt)
    }));
  }

  async reserve(botId: string, telegramId: string, slug: string) {
    // Resolution uses the trusted Telegram ID, never a username or a link parameter.
    const identity = await this.prisma.userAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: "telegram", providerUserId: telegramId } }
    });
    if (!identity) throw new ForbiddenException("Link Telegram to FDP first");
    const canonical = await this.parties.getPartyBySlug(slug, identity.userId);
    if (!canonical.isMember || canonical.kind !== "PARTY" || canonical.mergedIntoSlug) return null;
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "social"."telegram_party_chat_pool" WHERE "id"='default' FOR UPDATE`;
      const party = await tx.gameParty.findUnique({ where: { id: canonical.id }, include: partyInclude });
      if (!party || party.kind !== "PARTY" || party.mergedIntoSlug || !party.expiresAt || party.expiresAt <= new Date()
        || !party.members.some(member => member.userId === identity.userId && member.user.status === "active")) return null;
      const existing = await tx.telegramPartyChatRoom.findUnique({ where: { partyId: party.id } });
      if (existing) return this.publicRoom(existing);
      const pool = await tx.telegramPartyChatPool.findUniqueOrThrow({ where: { id: "default" } });
      const busy = await tx.telegramPartyChatRoom.count({ where: { state: { in: ["PREPARING", "ACTIVE", "ROTATING"] } } });
      if (busy >= pool.capacity) return null;
      // The main bot may assign a room served by a helper; only its owner bot operates that room.
      const live = await tx.telegramPartyChatWorker.findMany({ where: { heartbeatAt: { gte: new Date(Date.now() - 90_000) } }, select: { botId: true } });
      const free = await tx.telegramPartyChatRoom.findFirst({ where: { enabled: true, removeWhenFree: false, state: "FREE", botId: { in: live.map(worker => worker.botId) } }, orderBy: { createdAt: "asc" } });
      if (!free) return null;
      const data = dataOf(free);
      data.roster = this.roster(party); data.partyName = party.name; data.partySlug = party.slug;
      data.expiresAt = party.expiresAt.toISOString(); data.cardDirty = true;
      const reserved = await tx.telegramPartyChatRoom.update({ where: { id: free.id }, data: {
        state: "PREPARING", partyId: party.id, generation: { increment: 1 }, assignedAt: new Date(),
        retryAt: null, data: json(data)
      } });
      return this.publicRoom(reserved);
    });
  }

  private publicRoom(room: TelegramPartyChatRoom) {
    const data = dataOf(room);
    return { id: room.id, partyId: room.partyId, state: room.state, generation: room.generation,
      inviteLink: room.state === "ACTIVE" ? data.links.find(link => !link.revoked)?.url ?? null : null };
  }

  async reconcile(roomId: string) {
    return this.locked(roomId, async (tx, room) => {
      if (!room.partyId || ["FREE", "REVIEW", "CLOSING"].includes(room.state)) return room;
      const data = dataOf(room);
      const party = await tx.gameParty.findUnique({ where: { id: room.partyId }, include: partyInclude });
      if (!party || party.kind !== "PARTY" || party.mergedIntoSlug) {
        data.evictIds = unique([...data.evictIds, ...data.presentIds, ...(data.possibleIds ?? [])].filter(id => !data.staffIds.includes(id)));
        return tx.telegramPartyChatRoom.update({ where: { id: room.id }, data: {
          state: "CLOSING", generation: { increment: 1 }, data: json(data)
        } });
      }
      const roster = this.roster(party);
      const removed = data.roster.some(old => !roster.some(member => member.membershipId === old.membershipId && member.telegramId === old.telegramId));
      const allowed = new Set(roster.map(member => member.telegramId).filter(Boolean));
      data.evictIds = unique([...data.evictIds, ...data.presentIds, ...(data.possibleIds ?? [])].filter(id => !allowed.has(id) && !data.staffIds.includes(id)));
      data.cardDirty ||= JSON.stringify(roster) !== JSON.stringify(data.roster) || data.partyName !== party.name;
      data.roster = roster; data.partyName = party.name; data.partySlug = party.slug; data.expiresAt = party.expiresAt?.toISOString() ?? null;
      const preparationTimedOut = room.state === "PREPARING" && room.assignedAt && Date.now() - room.assignedAt.getTime() >= 10 * 60_000;
      return tx.telegramPartyChatRoom.update({ where: { id: room.id }, data: {
        ...(preparationTimedOut ? { state: "CLOSING", generation: { increment: 1 } }
          : removed && room.state !== "ROTATING" ? { state: "ROTATING", generation: { increment: 1 } } : {}), data: json(data)
      } });
    });
  }

  async workerRooms(botId: string, lastPolledAt?: string) {
    const polled = Number(lastPolledAt ?? 0) * 1000;
    if (Number.isFinite(polled) && polled > Date.now() - 90_000 && polled <= Date.now() + 5000) {
      await this.prisma.telegramPartyChatWorker.upsert({ where: { botId },
        create: { botId, heartbeatAt: new Date() }, update: { heartbeatAt: new Date() } });
    }
    const rooms = await this.prisma.telegramPartyChatRoom.findMany({ where: { botId }, orderBy: { createdAt: "asc" } });
    const refreshed = [];
    for (const room of rooms) refreshed.push(await this.reconcile(room.id));
    return refreshed;
  }

  async notices() {
    return this.prisma.telegramPartyChatRoom.findMany({ where: { OR: [{ partyId: { not: null } }, { state: "REVIEW" }] }, orderBy: { updatedAt: "asc" } });
  }

  async claim(roomId: string, botId: string) {
    const token = randomUUID(); const now = new Date();
    const claimed = await this.prisma.telegramPartyChatRoom.updateMany({ where: {
      id: roomId, botId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      AND: [{ OR: [{ retryAt: null }, { retryAt: { lte: now } }] }]
    }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 90_000) } });
    if (!claimed.count) return null;
    const room = await this.prisma.telegramPartyChatRoom.findUniqueOrThrow({ where: { id: roomId } });
    return { ...room, leaseToken: token };
  }

  private assertLease(room: TelegramPartyChatRoom, input: { botId: string; generation: number; leaseToken: string }) {
    if (room.botId !== input.botId || room.generation !== input.generation || room.leaseToken !== input.leaseToken
      || !room.leaseUntil || room.leaseUntil <= new Date()) throw new ConflictException("Group operation lease expired");
  }

  async release(roomId: string, botId: string, leaseToken: string) {
    await this.prisma.telegramPartyChatRoom.updateMany({ where: { id: roomId, botId, leaseToken }, data: { leaseToken: null, leaseUntil: null } });
  }

  async report(roomId: string, input: RoomReportDto) {
    return this.locked(roomId, async (tx, room) => {
      this.assertLease(room, input); const data = dataOf(room);
      let state = room.state;
      if (input.event === "prepared" || input.event === "rotated") {
        if (!input.inviteLink || data.links.some(link => !link.revoked) || data.evictIds.length
          || !["PREPARING", "ROTATING"].includes(room.state)) throw new ConflictException("Group preparation incomplete");
        data.links.push({ url: input.inviteLink, revoked: false }); delete data.error; state = "ACTIVE";
      } else if (input.event === "link-revoked") {
        for (const link of data.links) if (link.url === input.inviteLink) link.revoked = true;
        data.links = data.links.filter(link => !link.revoked);
      } else if (input.event === "member-removed" && input.userId) {
        data.presentIds = data.presentIds.filter(id => id !== input.userId);
        data.possibleIds = (data.possibleIds ?? []).filter(id => id !== input.userId);
        data.evictIds = data.evictIds.filter(id => id !== input.userId);
        data.cleanupDoneIds = unique([...(data.cleanupDoneIds ?? []), input.userId]);
        if (input.ownedBan) {
          const before = input.purgedBefore ?? Math.floor(Date.now() / 1000);
          const latest = data.presenceUpdates?.[input.userId];
          if (!(latest?.status === "kicked" && latest.actorId && latest.actorId !== input.botId && latest.sentAt >= before)) {
            data.botBannedIds = unique([...(data.botBannedIds ?? []), input.userId]);
          }
          data.purgedThrough = { ...(data.purgedThrough ?? {}), [input.userId]: before };
          await tx.telegramPartyChatMessage.updateMany({ where: {
            roomId, senderId: input.userId, deletedAt: null, sentAt: { lt: new Date(before * 1000) }
          }, data: { deletedAt: new Date() } });
        }
      } else if (input.event === "admitting" && input.userId) {
        const party = room.partyId ? await tx.gameParty.findUnique({ where: { id: room.partyId }, include: partyInclude }) : null;
        if (room.state !== "ACTIVE" || !party || party.kind !== "PARTY" || party.mergedIntoSlug || !party.expiresAt || party.expiresAt <= new Date()
          || !this.roster(party).some(member => member.telegramId === input.userId)) throw new ForbiddenException();
        data.possibleIds = unique([...(data.possibleIds ?? []), input.userId]);
      } else if (input.event === "joined" && input.userId) {
        data.presentIds = unique([...data.presentIds, input.userId]); data.seenIds = unique([...data.seenIds, input.userId]);
        data.possibleIds = (data.possibleIds ?? []).filter(id => id !== input.userId);
        data.cleanupDoneIds = (data.cleanupDoneIds ?? []).filter(id => id !== input.userId);
      } else if (input.event === "member-unbanned" && input.userId) {
        data.botBannedIds = (data.botBannedIds ?? []).filter(id => id !== input.userId);
      } else if (input.event === "card" && input.messageId) {
        data.cardId = input.messageId; data.cardDirty = false;
      } else if (input.event === "review") { state = "REVIEW"; data.cleanupUncertain = true; data.error = input.reason ?? "Telegram operation could not be confirmed";
      } else if (input.event === "closed") {
        if (room.state !== "CLOSING" || data.links.some(link => !link.revoked) || [...data.presentIds, ...(data.possibleIds ?? [])].some(id => !data.staffIds.includes(id))) throw new ConflictException("Group cleanup incomplete");
        if (await tx.telegramPartyChatMessage.count({ where: { roomId, deletedAt: null } })) throw new ConflictException("Messages still pending deletion");
        if (data.cleanupUncertain) return tx.telegramPartyChatRoom.update({ where: { id: roomId }, data: {
          state: "REVIEW", data: json({ ...data, error: "Manual confirmation of complete history cleanup required" })
        } });
        if (room.removeWhenFree) return tx.telegramPartyChatRoom.delete({ where: { id: roomId } });
        await tx.telegramPartyChatMessage.deleteMany({ where: { roomId } });
        return tx.telegramPartyChatRoom.update({ where: { id: roomId }, data: {
          state: "FREE", partyId: null, assignedAt: null, generation: { increment: 1 }, retryAt: null,
          leaseToken: null, leaseUntil: null,
          data: json({ staffIds: data.staffIds, links: [], presentIds: [], seenIds: [], evictIds: [], roster: [],
            botBannedIds: data.botBannedIds ?? [], presenceUpdates: data.presenceUpdates ?? {} })
        } });
      }
      return tx.telegramPartyChatRoom.update({ where: { id: roomId }, data: {
        state, data: json(data), leaseUntil: new Date(Date.now() + 90_000),
        ...(input.event === "retry" ? { retryAt: new Date(Date.now() + (input.retrySeconds ?? 30) * 1000) } : {})
      } });
    });
  }

  async admission(roomId: string, botId: string, telegramId: string, inviteLink: string) {
    const room = await this.reconcile(roomId); const data = dataOf(room);
    if (room.botId !== botId || room.state !== "ACTIVE" || !data.links.some(link => !link.revoked && link.url === inviteLink)) return { allowed: false };
    if (!data.expiresAt || new Date(data.expiresAt) <= new Date()) return { allowed: false };
    const member = data.roster.find(member => member.telegramId === telegramId);
    return { allowed: Boolean(member), generation: room.generation, membershipId: member?.membershipId ?? null, userId: member?.userId ?? null };
  }

  async eligible(roomId: string, botId: string, telegramId: string, generation?: number) {
    const room = await this.reconcile(roomId); const data = dataOf(room);
    const current = room.botId === botId && room.generation === generation;
    return { botOwnedBan: current && Boolean(data.botBannedIds?.includes(telegramId)), allowed: current
      && ["PREPARING", "ACTIVE", "ROTATING"].includes(room.state) && Boolean(data.expiresAt && new Date(data.expiresAt) > new Date())
      && data.roster.some(member => member.telegramId === telegramId), generation: room.generation };
  }

  async presence(botId: string, chatId: string, userId: string, event: string, actorId?: string,
    status?: string, sentAt?: number, updateId?: number, wasPresent?: boolean) {
    const found = await this.prisma.telegramPartyChatRoom.findUnique({ where: { chatId } });
    if (!found || found.botId !== botId) return;
    return this.locked(found.id, async (tx, room) => {
      const data = dataOf(room);
      if (data.staffIds.includes(userId) || userId === botId) return room;
      if (sentAt !== undefined && updateId !== undefined) {
        const previous = data.presenceUpdates?.[userId];
        if (previous && (sentAt < previous.sentAt || sentAt === previous.sentAt && updateId <= previous.updateId)) return room;
        data.presenceUpdates = { ...(data.presenceUpdates ?? {}), [userId]: { sentAt, updateId,
          ...(status !== undefined ? { status } : {}), ...(actorId !== undefined ? { actorId } : {}) } };
      }
      // Telegram's actor is the authoritative source if the removal report was lost.
      // A delayed leave event must not erase a newer service ban or a moderator ban.
      if (status === "kicked" && actorId === botId) {
        data.botBannedIds = unique([...(data.botBannedIds ?? []), userId]);
      } else if (status === "left" || status === "kicked" && actorId && actorId !== botId
        || status === undefined && actorId && actorId !== botId) {
        data.botBannedIds = (data.botBannedIds ?? []).filter(id => id !== userId);
      }
      if (event === "joined") {
        data.presentIds = unique([...data.presentIds, userId]); data.seenIds = unique([...data.seenIds, userId]);
        data.possibleIds = (data.possibleIds ?? []).filter(id => id !== userId);
        data.cleanupDoneIds = (data.cleanupDoneIds ?? []).filter(id => id !== userId);
        if (!data.roster.some(member => member.telegramId === userId) || room.state !== "ACTIVE") data.evictIds = unique([...data.evictIds, userId]);
      } else {
        data.presentIds = data.presentIds.filter(id => id !== userId);
        data.evictIds = data.evictIds.filter(id => id !== userId);
      }
      return tx.telegramPartyChatRoom.update({ where: { id: room.id }, data: {
        ...(event === "left" && wasPresent !== false && room.state === "ACTIVE" ? { state: "ROTATING", generation: { increment: 1 } } : {}), data: json(data)
      } });
    });
  }

  async track(input: RoomMessagesDto) {
    const rooms = await this.prisma.telegramPartyChatRoom.findMany({ where: { botId: input.botId, chatId: { in: unique(input.messages.map(item => item.chatId)) } } });
    for (const registered of rooms) {
      await this.locked(registered.id, async (tx, room) => {
        const items = input.messages.filter(item => item.chatId === room.chatId && !item.service);
        const data = dataOf(room);
        let changed = false;
        for (const item of items) {
          if (room.state === "ACTIVE" && room.assignedAt && item.sentAt * 1000 < room.assignedAt.getTime() - 1000) {
            data.cleanupUncertain = true; data.error = "Delayed history metadata arrived after group reuse"; changed = true;
          }
          if (item.userId && room.partyId && data.roster.some(member => member.telegramId === item.userId)) {
            if (!data.seenIds.includes(item.userId)) { data.seenIds.push(item.userId); changed = true; }
          }
        }
        if (items.length) await tx.telegramPartyChatMessage.createMany({ data: items.map(item => ({
          roomId: room.id, generation: room.generation, messageId: item.messageId, sentAt: new Date(item.sentAt * 1000),
          senderId: item.userId ?? null,
          deletedAt: item.userId && item.sentAt < (data.purgedThrough?.[item.userId] ?? 0) ? new Date() : null
        })), skipDuplicates: true });
        if (changed) await tx.telegramPartyChatRoom.update({ where: { id: room.id }, data: {
          ...(data.cleanupUncertain ? { state: "REVIEW" } : {}), data: json(data)
        } });
      });
    }
    return { accepted: input.messages.length };
  }

  async deletions(roomId: string, botId: string, generation: number, leaseToken: string) {
    const room = await this.prisma.telegramPartyChatRoom.findUniqueOrThrow({ where: { id: roomId } });
    this.assertLease(room, { botId, generation, leaseToken });
    return this.prisma.telegramPartyChatMessage.findMany({ where: {
      roomId, deletedAt: null, ...(["CLOSING", "PREPARING"].includes(room.state) ? {} : { sentAt: { lte: new Date(Date.now() - 12 * 3600_000) } })
    }, orderBy: { messageId: "asc" }, take: 100 });
  }

  async deleted(roomId: string, botId: string, generation: number, leaseToken: string, messageIds: number[]) {
    return this.locked(roomId, async (tx, room) => {
      this.assertLease(room, { botId, generation, leaseToken });
      await tx.telegramPartyChatRoom.update({ where: { id: roomId }, data: { leaseUntil: new Date(Date.now() + 90_000) } });
      return tx.telegramPartyChatMessage.updateMany({ where: { roomId, messageId: { in: messageIds } }, data: { deletedAt: new Date() } });
    });
  }

  async card(roomId: string, botId: string) {
    const room = await this.prisma.telegramPartyChatRoom.findUniqueOrThrow({ where: { id: roomId } });
    if (room.botId !== botId || !room.partyId) throw new ForbiddenException();
    const data = dataOf(room);
    let members = data.roster.map(member => ({ ...member, dotaAccountId: null as string | null, mmr: null as string | null }));
    try {
      const party = await this.parties.getPartyBySlug(data.partySlug!, data.roster[0]?.userId);
      members = members.map(member => ({ ...member, dotaAccountId: party.members.find(player => player.userId === member.userId)?.dotaAccountId ?? null,
        mmr: party.members.find(player => player.userId === member.userId)?.mmr ?? null }));
      return { name: party.name, members, discordUrl: party.discordInviteUrl, generation: room.generation };
    } catch { return { name: data.partyName, members, discordUrl: null, generation: room.generation }; }
  }

  async ready(roomId: string, botId: string, telegramId: string, ready: boolean, generation?: number) {
    const room = await this.reconcile(roomId); const data = dataOf(room);
    const member = data.roster.find(member => member.telegramId === telegramId);
    if (room.botId !== botId || room.state !== "ACTIVE" || room.generation !== generation || !member
      || (!data.presentIds.includes(telegramId) && !data.staffIds.includes(telegramId))) throw new ForbiddenException();
    const result = await this.coordination.update(data.partySlug!, member.userId, member.membershipId, { ready });
    await this.locked(roomId, async (tx, current) => {
      if (current.generation === generation && current.state === "ACTIVE") {
        const latest = dataOf(current);
        if (!latest.seenIds.includes(telegramId)) await tx.telegramPartyChatRoom.update({ where: { id: roomId }, data: {
          data: json({ ...latest, seenIds: unique([...latest.seenIds, telegramId]) })
        } });
      }
    });
    return result;
  }
}
