import { Injectable } from "@nestjs/common";
import type {
  GameParty,
  GamePartyChatMessage,
  GamePartyInvite,
  GamePartyKind,
  GamePartyMember,
  Prisma
} from "#prisma/client";
import {
  DOTA_ATTRIBUTE_KEYS,
  DOTA_PARTY_VERTICAL,
  DOTA_PARTY_RECRUIT_MMR_SPREAD,
  DOTA_VERTICAL,
  isDotaPositionRole
} from "@reviewo/shared";

import { PrismaService } from "../../../database/prisma.service.js";
import type { DotaPartyMergeCandidate } from "../lib/dota-party-merge.js";
import { planDotaPartyMerge } from "../lib/dota-party-merge.js";

type PartyWithMembers = GameParty & {
  members: Array<GamePartyMember & { user: { displayName: string; id: string } }>;
};

const DEFAULT_CHAT_PAGE_SIZE = 50;
const MAX_CHAT_PAGE_SIZE = 100;

@Injectable()
export class GamePartiesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listActiveRecruitingParties(now: Date): Promise<DotaPartyMergeCandidate[]> {
    const activeLfgAttributes = await this.prismaService.entityAttribute.findMany({
      select: { entityId: true },
      where: {
        key: DOTA_ATTRIBUTE_KEYS.lfgUntil,
        value: { gt: now.toISOString() }
      }
    });
    const lfgEntityIds = [...new Set(activeLfgAttributes.map((attribute) => attribute.entityId))];
    if (lfgEntityIds.length === 0) {
      return [];
    }

    const recruiterProfiles = await this.prismaService.entity.findMany({
      include: { attributes: { select: { key: true, value: true } } },
      where: {
        id: { in: lfgEntityIds },
        ownerUserId: { not: null },
        type: "person",
        visibility: "ACTIVE"
      }
    });
    const profileByOwnerId = new Map(
      recruiterProfiles
        .filter((profile) => profile.ownerUserId)
        .map((profile) => [
          profile.ownerUserId as string,
          {
            entityId: profile.id,
            attributes: Object.fromEntries(
              profile.attributes.map((attribute) => [attribute.key, attribute.value])
            )
          }
        ])
    );
    const recruiters = [...profileByOwnerId.entries()].flatMap(([ownerUserId, profile]) => {
      const attributes = profile.attributes;
      const partySlug = attributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim();
      const recruitedRoles = parseRecruitingRoles(
        attributes[DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]
      );
      const lfgUntil = new Date(attributes[DOTA_ATTRIBUTE_KEYS.lfgUntil] ?? "");

      if (
        attributes[DOTA_ATTRIBUTE_KEYS.vertical] !== DOTA_VERTICAL ||
        !partySlug ||
        recruitedRoles.length === 0 ||
        !Number.isFinite(lfgUntil.getTime()) ||
        lfgUntil.getTime() <= now.getTime()
      ) {
        return [];
      }

      return [{ lfgUntil, ownerUserId, partySlug, recruitedRoles }];
    });

    if (recruiters.length === 0) {
      return [];
    }

    const parties = await this.prismaService.gameParty.findMany({
      include: {
        invites: { select: { id: true }, where: { status: "PENDING" } },
        members: { select: { positionRole: true, userId: true } }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: {
        expiresAt: { gt: now },
        kind: "PARTY",
        mergedIntoSlug: null,
        ownerUserId: { in: recruiters.map((recruiter) => recruiter.ownerUserId) },
        slug: { in: recruiters.map((recruiter) => recruiter.partySlug) },
        vertical: DOTA_PARTY_VERTICAL,
        visibility: "PUBLIC"
      }
    });
    const recruiterBySlug = new Map(
      recruiters.map((recruiter) => [recruiter.partySlug, recruiter])
    );
    const memberUserIds = [
      ...new Set(parties.flatMap((party) => party.members.map((m) => m.userId)))
    ];
    const memberProfiles = await this.prismaService.entity.findMany({
      include: { attributes: { select: { key: true, value: true } } },
      where: {
        ownerUserId: { in: memberUserIds },
        type: "person",
        visibility: "ACTIVE",
        attributes: { some: { key: DOTA_ATTRIBUTE_KEYS.vertical, value: DOTA_VERTICAL } }
      }
    });
    const memberProfileByUserId = new Map(
      memberProfiles.flatMap((profile) =>
        profile.ownerUserId
          ? [
              [
                profile.ownerUserId,
                Object.fromEntries(
                  profile.attributes.map((attribute) => [attribute.key, attribute.value])
                )
              ] as const
            ]
          : []
      )
    );

    return parties.flatMap((party) => {
      const recruiter = recruiterBySlug.get(party.slug);
      if (!recruiter || party.ownerUserId !== recruiter.ownerUserId || party.joinMode !== "OPEN") {
        return [];
      }

      const memberAttributes = party.members.map((member) =>
        memberProfileByUserId.get(member.userId)
      );
      const mmrBounds = memberAttributes.flatMap((attributes) => {
        const bounds = parseMmrBounds(attributes?.[DOTA_ATTRIBUTE_KEYS.mmr]);
        return bounds ? [bounds] : [];
      });
      const servers = memberAttributes.flatMap((attributes) => {
        const server = attributes?.[DOTA_ATTRIBUTE_KEYS.server]?.trim();
        return server ? [server] : [];
      });

      return [
        {
          createdAt: party.createdAt,
          discordChannelId: party.discordChannelId,
          expiresAt: party.expiresAt,
          id: party.id,
          joinMode: party.joinMode,
          lfgUntil: recruiter.lfgUntil,
          maxMembers: party.maxMembers,
          members: party.members,
          mmrBounds,
          ownerUserId: party.ownerUserId,
          pendingInviteCount: party.invites.length,
          recruitedRoles: recruiter.recruitedRoles,
          servers,
          slug: party.slug
        }
      ];
    });
  }

  async mergeRecruitingPartiesAtomically(input: {
    leaderUserId: string;
    now: Date;
    retiredPartyId: string;
    survivorPartyId: string;
  }): Promise<
    | {
        ok: true;
        mergeMessage: GamePartyChatMessage & { user: { displayName: string; id: string } };
        party: PartyWithMembers;
        retiredPartyId: string;
        retiredPartySlug: string;
        memberUserIds: string[];
      }
    | { ok: false; reason: "busy" | "changed" }
  > {
    return this.prismaService.$transaction(async (tx) => {
      const matcherLock = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext('reviewo:dota-recruit-party-merge')) AS locked
      `;
      if (!matcherLock[0]?.locked) {
        return { ok: false as const, reason: "busy" as const };
      }

      const partyIds = [input.survivorPartyId, input.retiredPartyId].sort();
      const firstSnapshot = await tx.gameParty.findMany({
        include: { members: { select: { userId: true } } },
        where: { id: { in: partyIds } }
      });
      if (firstSnapshot.length !== 2) {
        return { ok: false as const, reason: "changed" as const };
      }

      const lockedUserIds = [
        ...new Set(firstSnapshot.flatMap((party) => party.members.map((m) => m.userId)))
      ].sort();
      for (const userId of lockedUserIds) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`${userId}:dota-party-join`}))
        `;
      }

      const lockedParties = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM social.game_parties
        WHERE id = ANY(ARRAY[${partyIds[0]}::uuid, ${partyIds[1]}::uuid])
        ORDER BY id
        FOR UPDATE
      `;
      if (lockedParties.length !== 2) {
        return { ok: false as const, reason: "changed" as const };
      }

      const parties = await tx.gameParty.findMany({
        include: {
          invites: { select: { id: true }, where: { status: "PENDING" } },
          members: { select: { positionRole: true, userId: true } }
        },
        where: { id: { in: partyIds } }
      });
      const survivor = parties.find((party) => party.id === input.survivorPartyId);
      const retired = parties.find((party) => party.id === input.retiredPartyId);
      if (!survivor || !retired) {
        return { ok: false as const, reason: "changed" as const };
      }

      const currentUserIds = [
        ...new Set([...survivor.members, ...retired.members].map((m) => m.userId))
      ].sort();
      if (currentUserIds.some((userId) => !lockedUserIds.includes(userId))) {
        // A concurrent join added a member after the first snapshot. Retry next scan
        // with that user's advisory lock instead of merging an unlocked roster.
        return { ok: false as const, reason: "changed" as const };
      }

      const ownerProfiles = await tx.entity.findMany({
        include: { attributes: { select: { key: true, value: true } } },
        where: {
          ownerUserId: { in: [survivor.ownerUserId, retired.ownerUserId] },
          type: "person",
          visibility: "ACTIVE"
        }
      });
      const ownerProfileByUserId = new Map(
        ownerProfiles.flatMap((profile) =>
          profile.ownerUserId
            ? [
                [
                  profile.ownerUserId,
                  {
                    entityId: profile.id,
                    attributes: Object.fromEntries(
                      profile.attributes.map((attribute) => [attribute.key, attribute.value])
                    )
                  }
                ] as const
              ]
            : []
        )
      );
      const recruiterProfiles = [survivor, retired].map((party) => {
        const profile = ownerProfileByUserId.get(party.ownerUserId);
        const attrs = profile?.attributes ?? {};
        return {
          party,
          profile,
          lfgUntil: new Date(attrs[DOTA_ATTRIBUTE_KEYS.lfgUntil] ?? ""),
          recruitedRoles: parseRecruitingRoles(attrs[DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles])
        };
      });
      const memberProfiles = await tx.entity.findMany({
        include: { attributes: { select: { key: true, value: true } } },
        where: {
          ownerUserId: { in: currentUserIds },
          type: "person",
          visibility: "ACTIVE",
          attributes: { some: { key: DOTA_ATTRIBUTE_KEYS.vertical, value: DOTA_VERTICAL } }
        }
      });
      const memberAttributesByUserId = new Map(
        memberProfiles.flatMap((profile) =>
          profile.ownerUserId
            ? [
                [
                  profile.ownerUserId,
                  Object.fromEntries(
                    profile.attributes.map((attribute) => [attribute.key, attribute.value])
                  )
                ] as const
              ]
            : []
        )
      );
      const toCandidate = (party: (typeof parties)[number]): DotaPartyMergeCandidate | null => {
        const recruiter = recruiterProfiles.find((entry) => entry.party.id === party.id);
        const recruiterAttributes = recruiter?.profile?.attributes;
        if (
          !recruiter?.profile ||
          recruiterAttributes?.[DOTA_ATTRIBUTE_KEYS.vertical] !== DOTA_VERTICAL ||
          recruiterAttributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim() !== party.slug ||
          !recruiter.lfgUntil.getTime() ||
          party.kind !== "PARTY" ||
          party.vertical !== DOTA_PARTY_VERTICAL ||
          party.visibility !== "PUBLIC" ||
          party.mergedIntoSlug
        ) {
          return null;
        }
        const memberAttributes = party.members.map((member) =>
          memberAttributesByUserId.get(member.userId)
        );
        const mmrBounds = memberAttributes.flatMap((attributes) => {
          const bounds = parseMmrBounds(attributes?.[DOTA_ATTRIBUTE_KEYS.mmr]);
          return bounds ? [bounds] : [];
        });
        const servers = memberAttributes.flatMap((attributes) => {
          const server = attributes?.[DOTA_ATTRIBUTE_KEYS.server]?.trim();
          return server ? [server] : [];
        });
        return {
          createdAt: party.createdAt,
          discordChannelId: party.discordChannelId,
          expiresAt: party.expiresAt,
          id: party.id,
          joinMode: party.joinMode,
          lfgUntil: recruiter.lfgUntil,
          maxMembers: party.maxMembers,
          members: party.members,
          mmrBounds,
          ownerUserId: party.ownerUserId,
          pendingInviteCount: party.invites.length,
          recruitedRoles: recruiter.recruitedRoles,
          servers,
          slug: party.slug
        };
      };
      const survivorCandidate = toCandidate(survivor);
      const retiredCandidate = toCandidate(retired);
      if (!survivorCandidate || !retiredCandidate) {
        return { ok: false as const, reason: "changed" as const };
      }
      const plan = planDotaPartyMerge(survivorCandidate, retiredCandidate, input.now);
      if (
        !plan ||
        plan.survivorPartyId !== survivor.id ||
        plan.retiredPartyId !== retired.id ||
        !plan.leaderCandidates.includes(input.leaderUserId)
      ) {
        return { ok: false as const, reason: "changed" as const };
      }

      const recruitedRoles = plan.recruitedRoles;
      const recruitedUntil = new Date(
        Math.max(survivorCandidate.lfgUntil.getTime(), retiredCandidate.lfgUntil.getTime())
      );
      const expiresAt = new Date(
        Math.max(survivor.expiresAt!.getTime(), retired.expiresAt!.getTime())
      );
      const mergedMemberIds = currentUserIds;

      await tx.gamePartyMember.updateMany({
        data: { partyId: survivor.id, role: "MEMBER" },
        where: { partyId: retired.id }
      });
      await tx.gamePartyMember.updateMany({
        data: { role: "MEMBER" },
        where: { partyId: survivor.id, role: "OWNER" }
      });
      await tx.gamePartyMember.update({
        data: { role: "OWNER" },
        where: { partyId_userId: { partyId: survivor.id, userId: input.leaderUserId } }
      });
      await tx.gameParty.update({
        data: {
          expiresAt,
          ownerUserId: input.leaderUserId,
          updatedAt: input.now
        },
        where: { id: survivor.id }
      });
      await tx.gameParty.update({
        data: {
          joinMode: "CONFIRM",
          expiresAt,
          mergedIntoSlug: survivor.slug,
          visibility: "PRIVATE"
        },
        where: { id: retired.id }
      });
      await tx.gameParty.updateMany({
        data: { mergedIntoSlug: survivor.slug },
        where: { mergedIntoSlug: retired.slug }
      });
      await tx.gamePartyChatMessage.updateMany({
        data: { partyId: survivor.id },
        where: { partyId: retired.id }
      });
      const retiredBlocks = await tx.gamePartyJoinBlock.findMany({
        select: { userId: true },
        where: { partyId: retired.id }
      });
      const outsideBlocks = retiredBlocks
        .map((block) => block.userId)
        .filter((userId) => !mergedMemberIds.includes(userId));
      if (outsideBlocks.length > 0) {
        await tx.gamePartyJoinBlock.createMany({
          data: [...new Set(outsideBlocks)].map((userId) => ({ partyId: survivor.id, userId })),
          skipDuplicates: true
        });
      }
      await tx.gamePartyJoinBlock.deleteMany({ where: { partyId: retired.id } });
      await tx.gamePartyJoinBlock.deleteMany({
        where: { partyId: survivor.id, userId: { in: mergedMemberIds } }
      });

      const clearLfg = {
        [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: "",
        [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: "",
        [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: "",
        [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: "",
        [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: "",
        [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: "",
        [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: "",
        [DOTA_ATTRIBUTE_KEYS.lfgUntil]: new Date(0).toISOString(),
        [DOTA_ATTRIBUTE_KEYS.vertical]: DOTA_VERTICAL
      };
      for (const ownerProfile of ownerProfiles) {
        for (const [key, value] of Object.entries(clearLfg)) {
          await tx.entityAttribute.upsert({
            create: { entityId: ownerProfile.id, key, value },
            update: { value },
            where: { entityId_key: { entityId: ownerProfile.id, key } }
          });
        }
      }
      if (recruitedRoles.length > 0) {
        const leaderProfile = ownerProfileByUserId.get(input.leaderUserId);
        if (!leaderProfile) {
          throw new Error("Merged Dota party captain profile disappeared");
        }
        const activeLfg = {
          ...clearLfg,
          [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: String(survivor.maxMembers),
          [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: String(survivor.maxMembers),
          [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: String(mergedMemberIds.length),
          [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: survivor.kind,
          [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: survivor.name,
          [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: survivor.slug,
          [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: recruitedRoles.join(","),
          [DOTA_ATTRIBUTE_KEYS.lfgUntil]: recruitedUntil.toISOString()
        };
        for (const [key, value] of Object.entries(activeLfg)) {
          await tx.entityAttribute.upsert({
            create: { entityId: leaderProfile.entityId, key, value },
            update: { value },
            where: { entityId_key: { entityId: leaderProfile.entityId, key } }
          });
        }
      }

      const mergeMessage = await tx.gamePartyChatMessage.create({
        data: {
          message: "__system__:party_merged",
          partyId: survivor.id,
          userId: input.leaderUserId
        },
        include: { user: { select: { displayName: true, id: true } } }
      });

      const party = await tx.gameParty.findUnique({
        include: {
          members: {
            include: { user: { select: { displayName: true, id: true } } },
            orderBy: [{ role: "asc" }, { joinedAt: "asc" }]
          }
        },
        where: { id: survivor.id }
      });
      if (!party) {
        throw new Error("Merged party disappeared during transaction");
      }

      return {
        ok: true as const,
        mergeMessage,
        party,
        retiredPartyId: retired.id,
        retiredPartySlug: retired.slug,
        memberUserIds: mergedMemberIds
      };
    });
  }

  createParty(input: {
    expiresAt: Date | null;
    kind: GamePartyKind;
    maxMembers: number;
    name: string;
    ownerUserId: string;
    slug: string;
    vertical: string;
  }): Promise<GameParty> {
    return this.prismaService.$transaction(async (tx) => {
      if (input.kind === "PARTY") {
        // Serialize party creation with solo-search group formation and joins.
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${`${input.ownerUserId}:dota-party-join`})
          )
        `;
      }

      const party = await tx.gameParty.create({
        data: {
          expiresAt: input.expiresAt,
          kind: input.kind,
          maxMembers: input.maxMembers,
          name: input.name,
          ownerUserId: input.ownerUserId,
          slug: input.slug,
          vertical: input.vertical,
          visibility: "PUBLIC"
        }
      });

      await tx.gamePartyMember.create({
        data: {
          partyId: party.id,
          role: "OWNER",
          userId: input.ownerUserId
        }
      });

      return party;
    });
  }

  async createAutoMatchedPartyAtomically(input: {
    expiresAt: Date;
    leaderUserId: string;
    lfgExpiresAt: Date;
    maxMembers: number;
    members: Array<{ positionRole: string; userId: string }>;
    searchSource: "telegram" | "web";
    name: string;
    now: Date;
    partySafetyMessage: string;
    slug: string;
    vertical: string;
  }): Promise<
    | { ok: true; party: PartyWithMembers; telegramSearchUserIds: string[] }
    | {
        ok: false;
        reason:
          | "already_grouped"
          | "invalid_profile"
          | "mmr_spread"
          | "party_slug_taken"
          | "search_expired";
      }
  > {
    try {
      return await this.prismaService.$transaction(async (tx) => {
        const userIds = input.members.map((member) => member.userId).sort();

        // Match the lock used by regular party joins and solo LFG updates.
        // Sorting makes overlapping multi-user groups acquire locks consistently.
        for (const userId of userIds) {
          await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${`${userId}:dota-party-join`})
          )
        `;
        }

        const profileRows = await tx.entity.findMany({
          include: {
            attributes: {
              select: { key: true, value: true }
            }
          },
          where: {
            attributes: {
              some: {
                key: DOTA_ATTRIBUTE_KEYS.vertical,
                value: DOTA_VERTICAL
              }
            },
            ownerUserId: { in: userIds },
            type: "person",
            visibility: "ACTIVE"
          }
        });
        const profilesByUserId = new Map(
          profileRows
            .filter((profile) => profile.ownerUserId)
            .map((profile) => [
              profile.ownerUserId as string,
              {
                entityId: profile.id,
                attributes: Object.fromEntries(
                  profile.attributes.map((attribute) => [attribute.key, attribute.value])
                )
              }
            ])
        );

        if (profilesByUserId.size !== userIds.length) {
          return { ok: false as const, reason: "invalid_profile" as const };
        }

        const memberships = await tx.gamePartyMember.findMany({
          select: { userId: true },
          where: {
            party: {
              kind: "PARTY",
              OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
              vertical: input.vertical
            },
            userId: { in: userIds }
          }
        });

        if (memberships.length > 0) {
          return { ok: false as const, reason: "already_grouped" as const };
        }

        const telegramSearchUserIds = input.members
          .filter((member) => {
            const source = profilesByUserId.get(member.userId)?.attributes[
              DOTA_ATTRIBUTE_KEYS.lfgSource
            ];
            return source === "telegram";
          })
          .map((member) => member.userId);

        const mmrBounds: Array<{ high: number; low: number }> = [];
        const servers = new Set<string>();

        for (const member of input.members) {
          if (!isDotaPositionRole(member.positionRole)) {
            return { ok: false as const, reason: "invalid_profile" as const };
          }

          const profile = profilesByUserId.get(member.userId);
          const attributes = profile?.attributes;
          if (!profile || attributes?.[DOTA_ATTRIBUTE_KEYS.vertical] !== DOTA_VERTICAL) {
            return { ok: false as const, reason: "invalid_profile" as const };
          }

          const lfgUntil = Date.parse(attributes[DOTA_ATTRIBUTE_KEYS.lfgUntil] ?? "");
          if (
            !Number.isFinite(lfgUntil) ||
            lfgUntil <= input.now.getTime() ||
            attributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim()
          ) {
            return { ok: false as const, reason: "search_expired" as const };
          }

          const roles = parseDotaRoles(attributes[DOTA_ATTRIBUTE_KEYS.roles]);
          if (!roles.includes(member.positionRole)) {
            return { ok: false as const, reason: "invalid_profile" as const };
          }

          const bounds = parseMmrBounds(attributes[DOTA_ATTRIBUTE_KEYS.mmr]);
          if (!bounds) {
            return { ok: false as const, reason: "invalid_profile" as const };
          }
          mmrBounds.push(bounds);

          const server = attributes[DOTA_ATTRIBUTE_KEYS.server]?.trim();
          if (server) {
            servers.add(server);
          }
        }

        if (
          Math.max(...mmrBounds.map((bounds) => bounds.high)) -
            Math.min(...mmrBounds.map((bounds) => bounds.low)) >
          DOTA_PARTY_RECRUIT_MMR_SPREAD
        ) {
          return { ok: false as const, reason: "mmr_spread" as const };
        }
        if (servers.size > 1) {
          return { ok: false as const, reason: "invalid_profile" as const };
        }

        const party = await tx.gameParty.create({
          data: {
            expiresAt: input.expiresAt,
            kind: "PARTY",
            joinMode: "OPEN",
            maxMembers: input.maxMembers,
            name: input.name,
            ownerUserId: input.leaderUserId,
            slug: input.slug,
            vertical: input.vertical,
            visibility: "PUBLIC"
          }
        });

        await tx.gamePartyMember.createMany({
          data: input.members.map((member) => ({
            partyId: party.id,
            positionRole: member.positionRole,
            role: member.userId === input.leaderUserId ? "OWNER" : "MEMBER",
            userId: member.userId
          }))
        });

        await tx.gamePartyChatMessage.create({
          data: {
            message: input.partySafetyMessage,
            partyId: party.id,
            userId: input.leaderUserId
          }
        });

        const occupiedRoles = new Set(input.members.map((member) => member.positionRole));
        const recruitedRoles = (["1", "2", "3", "4", "5"] as const)
          .filter((role) => !occupiedRoles.has(role))
          .join(",");

        for (const member of input.members) {
          const profile = profilesByUserId.get(member.userId);
          if (!profile) {
            throw new Error("Auto-match profile disappeared during transaction");
          }

          const attributes =
            member.userId === input.leaderUserId && recruitedRoles.length > 0
              ? {
                  [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: String(input.maxMembers),
                  [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: String(input.maxMembers),
                  [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: String(input.members.length),
                  [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: "PARTY",
                  [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: input.name,
                  [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: input.slug,
                  [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: recruitedRoles,
                  [DOTA_ATTRIBUTE_KEYS.lfgUntil]: input.lfgExpiresAt.toISOString(),
                  [DOTA_ATTRIBUTE_KEYS.lfgSource]: input.searchSource,
                  [DOTA_ATTRIBUTE_KEYS.vertical]: DOTA_VERTICAL
                }
              : {
                  [DOTA_ATTRIBUTE_KEYS.lfgDesiredSize]: "",
                  [DOTA_ATTRIBUTE_KEYS.lfgMaxMembers]: "",
                  [DOTA_ATTRIBUTE_KEYS.lfgMemberCount]: "",
                  [DOTA_ATTRIBUTE_KEYS.lfgPartyKind]: "",
                  [DOTA_ATTRIBUTE_KEYS.lfgPartyName]: "",
                  [DOTA_ATTRIBUTE_KEYS.lfgPartySlug]: "",
                  [DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles]: "",
                  [DOTA_ATTRIBUTE_KEYS.lfgUntil]: new Date(0).toISOString(),
                  [DOTA_ATTRIBUTE_KEYS.lfgSource]: "",
                  [DOTA_ATTRIBUTE_KEYS.vertical]: DOTA_VERTICAL
                };

          for (const [key, value] of Object.entries(attributes)) {
            await tx.entityAttribute.upsert({
              create: { entityId: profile.entityId, key, value },
              update: { value },
              where: { entityId_key: { entityId: profile.entityId, key } }
            });
          }
        }

        const fullParty = await tx.gameParty.findUnique({
          include: {
            members: {
              include: { user: { select: { displayName: true, id: true } } },
              orderBy: [{ role: "asc" }, { joinedAt: "asc" }]
            }
          },
          where: { id: party.id }
        });

        if (!fullParty) {
          throw new Error("Auto-matched party was not created");
        }

        return { ok: true as const, party: fullParty, telegramSearchUserIds };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return { ok: false as const, reason: "party_slug_taken" as const };
      }
      throw error;
    }
  }

  findByVerticalAndSlug(vertical: string, slug: string): Promise<PartyWithMembers | null> {
    return this.findByVerticalAndSlugFollowingMerges(vertical, slug);
  }

  private async findByVerticalAndSlugFollowingMerges(
    vertical: string,
    initialSlug: string
  ): Promise<PartyWithMembers | null> {
    let slug = initialSlug;
    const visited = new Set<string>();

    for (let step = 0; step < 12; step += 1) {
      if (visited.has(slug)) {
        return null;
      }
      visited.add(slug);

      const party = await this.prismaService.gameParty.findUnique({
        include: {
          members: {
            include: {
              user: {
                select: {
                  displayName: true,
                  id: true
                }
              }
            },
            orderBy: [{ role: "asc" }, { joinedAt: "asc" }]
          }
        },
        where: {
          vertical_slug: {
            slug,
            vertical
          }
        }
      });

      if (!party?.mergedIntoSlug) {
        return party;
      }
      slug = party.mergedIntoSlug;
    }

    return null;
  }

  findById(id: string): Promise<PartyWithMembers | null> {
    return this.prismaService.gameParty.findUnique({
      include: {
        members: {
          include: {
            user: {
              select: {
                displayName: true,
                id: true
              }
            }
          },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }]
        }
      },
      where: { id }
    });
  }

  findActiveMembershipForUserInVerticalByKind(
    userId: string,
    vertical: string,
    kind: GamePartyKind
  ): Promise<(GamePartyMember & { party: GameParty }) | null> {
    if (kind === "PARTY") {
      const now = new Date();

      return this.prismaService.gamePartyMember.findFirst({
        include: {
          party: true
        },
        orderBy: { joinedAt: "desc" },
        where: {
          party: {
            kind: "PARTY",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            vertical
          },
          userId
        }
      });
    }

    return this.prismaService.gamePartyMember.findFirst({
      include: {
        party: true
      },
      orderBy: { joinedAt: "desc" },
      where: {
        party: {
          kind: "TEAM",
          vertical
        },
        userId
      }
    });
  }

  findActiveMembershipsForUserInVerticalByKind(
    userId: string,
    vertical: string,
    kind: GamePartyKind
  ): Promise<Array<GamePartyMember & { party: GameParty }>> {
    if (kind === "PARTY") {
      const now = new Date();

      return this.prismaService.gamePartyMember.findMany({
        include: {
          party: true
        },
        // Oldest join first — newest memberships render at the bottom of roster lists.
        orderBy: { joinedAt: "asc" },
        where: {
          party: {
            kind: "PARTY",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            vertical
          },
          userId
        }
      });
    }

    return this.prismaService.gamePartyMember.findMany({
      include: {
        party: true
      },
      orderBy: { joinedAt: "asc" },
      where: {
        party: {
          kind: "TEAM",
          vertical
        },
        userId
      }
    });
  }

  findSlug(vertical: string, slug: string): Promise<GameParty | null> {
    return this.prismaService.gameParty.findUnique({
      where: {
        vertical_slug: {
          slug,
          vertical
        }
      }
    });
  }

  countMembers(partyId: string): Promise<number> {
    return this.prismaService.gamePartyMember.count({
      where: { partyId }
    });
  }

  createInvite(input: {
    inviteeUserId: string;
    inviteKind?: "INVITE" | "APPLICATION";
    inviterUserId: string;
    partyId: string;
    positionRole?: string | null;
  }): Promise<GamePartyInvite> {
    return this.prismaService.$transaction(async (tx) => {
      const partyRows = await tx.$queryRaw<Array<{ mergedIntoSlug: string | null }>>`
        SELECT merged_into_slug AS "mergedIntoSlug"
        FROM social.game_parties
        WHERE id = ${input.partyId}::uuid
        FOR UPDATE
      `;
      if (!partyRows[0] || partyRows[0].mergedIntoSlug) {
        throw new Error("PARTY_MERGED");
      }

      return tx.gamePartyInvite.create({
        data: {
          inviteeUserId: input.inviteeUserId,
          inviterUserId: input.inviterUserId,
          kind: input.inviteKind ?? "INVITE",
          partyId: input.partyId,
          positionRole: input.positionRole ?? null,
          status: "PENDING"
        }
      });
    });
  }

  findPendingInvite(partyId: string, inviteeUserId: string): Promise<GamePartyInvite | null> {
    return this.prismaService.gamePartyInvite.findFirst({
      where: {
        inviteeUserId,
        partyId,
        status: "PENDING"
      }
    });
  }

  hasDeclinedPartyInvite(
    partyId: string,
    inviteeUserId: string,
    kind: "INVITE" | "APPLICATION" = "INVITE"
  ): Promise<boolean> {
    return this.prismaService.gamePartyInvite
      .findFirst({
        where: {
          inviteeUserId,
          kind,
          partyId,
          status: "DECLINED"
        },
        select: { id: true }
      })
      .then((row) => row !== null);
  }

  findInviteById(id: string): Promise<GamePartyInvite | null> {
    return this.prismaService.gamePartyInvite.findUnique({
      where: { id }
    });
  }

  updateInviteStatus(
    id: string,
    status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED"
  ): Promise<GamePartyInvite> {
    return this.prismaService.gamePartyInvite.update({
      where: { id },
      data: { status }
    });
  }

  /**
   * CAS decline: only PENDING → DECLINED. Returns false if invite was already resolved.
   */
  async declinePendingInvite(id: string): Promise<boolean> {
    const result = await this.prismaService.gamePartyInvite.updateMany({
      where: {
        id,
        status: "PENDING"
      },
      data: { status: "DECLINED" }
    });

    return result.count > 0;
  }

  /**
   * CAS cancel: only PENDING → CANCELLED. Returns false if invite was already resolved.
   */
  async cancelPendingInvite(id: string): Promise<boolean> {
    const result = await this.prismaService.gamePartyInvite.updateMany({
      where: {
        id,
        status: "PENDING"
      },
      data: { status: "CANCELLED" }
    });

    return result.count > 0;
  }

  /**
   * Cancel all pending invites for a party. Returns the rows that were pending
   * so callers can emit realtime notifications.
   */
  async cancelPendingInvitesForParty(partyId: string): Promise<GamePartyInvite[]> {
    const pending = await this.prismaService.gamePartyInvite.findMany({
      where: {
        partyId,
        status: "PENDING"
      }
    });

    if (pending.length === 0) {
      return [];
    }

    await this.prismaService.gamePartyInvite.updateMany({
      data: { status: "CANCELLED" },
      where: {
        partyId,
        status: "PENDING"
      }
    });

    return pending.map((invite) => ({ ...invite, status: "CANCELLED" as const }));
  }

  /**
   * Decline/cancel pending invites for a role (e.g. after the slot is claimed).
   */
  async closePendingInvitesForPosition(
    partyId: string,
    positionRole: string,
    options?: { exceptInviteId?: string; status?: "DECLINED" | "CANCELLED" }
  ): Promise<GamePartyInvite[]> {
    const status = options?.status ?? "DECLINED";
    const pending = await this.prismaService.gamePartyInvite.findMany({
      where: {
        partyId,
        positionRole,
        status: "PENDING",
        ...(options?.exceptInviteId ? { id: { not: options.exceptInviteId } } : {})
      }
    });

    if (pending.length === 0) {
      return [];
    }

    await this.prismaService.gamePartyInvite.updateMany({
      data: { status },
      where: {
        partyId,
        positionRole,
        status: "PENDING",
        ...(options?.exceptInviteId ? { id: { not: options.exceptInviteId } } : {})
      }
    });

    return pending.map((invite) => ({ ...invite, status }));
  }

  addMember(partyId: string, userId: string): Promise<GamePartyMember> {
    return this.prismaService.gamePartyMember.create({
      data: {
        partyId,
        role: "MEMBER",
        userId
      }
    });
  }

  /**
   * Atomically add a member if capacity remains.
   * Returns existing membership when already present; otherwise ok/reason for callers.
   */
  addMemberAtomically(input: {
    maxMembers: number;
    partyId: string;
    positionRole?: string | null;
    userId: string;
  }): Promise<
    | { cancelledApplications: GamePartyInvite[]; member: GamePartyMember; ok: true }
    | {
        ok: false;
        reason: "full" | "role_taken" | "already_on_other_team" | "party_gone" | "join_blocked";
      }
  > {
    return this.prismaService.$transaction(async (tx) => {
      // Serialize joins for this user so concurrent accepts cannot both keep foreign applications.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`${input.userId}:dota-party-join`})
        )
      `;

      const partyRows = await tx.$queryRaw<
        Array<{ kind: string; mergedIntoSlug: string | null; vertical: string }>
      >`
        SELECT kind::text AS kind, merged_into_slug AS "mergedIntoSlug", vertical
        FROM social.game_parties
        WHERE id = ${input.partyId}::uuid
        FOR UPDATE
      `;
      const partyMeta = partyRows[0];

      if (!partyMeta || partyMeta.mergedIntoSlug) {
        return { ok: false as const, reason: "party_gone" as const };
      }

      const joinBlock = await tx.gamePartyJoinBlock.findUnique({
        select: { id: true },
        where: {
          partyId_userId: {
            partyId: input.partyId,
            userId: input.userId
          }
        }
      });

      if (joinBlock) {
        return { ok: false as const, reason: "join_blocked" as const };
      }

      if (partyMeta.kind === "TEAM") {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${`${input.userId}:TEAM:${partyMeta.vertical}`})
          )
        `;

        const otherTeam = await tx.gamePartyMember.findFirst({
          where: {
            partyId: { not: input.partyId },
            party: {
              kind: "TEAM",
              vertical: partyMeta.vertical
            },
            userId: input.userId
          },
          select: { id: true }
        });

        if (otherTeam) {
          return { ok: false as const, reason: "already_on_other_team" as const };
        }
      }

      const memberCount = await tx.gamePartyMember.count({
        where: { partyId: input.partyId }
      });

      if (memberCount >= input.maxMembers) {
        return { ok: false as const, reason: "full" as const };
      }

      const alreadyMember = await tx.gamePartyMember.findFirst({
        where: {
          partyId: input.partyId,
          userId: input.userId
        }
      });

      if (alreadyMember) {
        const cancelledApplications = await this.cancelOtherPendingApplicationsForInvitee(
          tx,
          input.userId
        );
        return { cancelledApplications, member: alreadyMember, ok: true as const };
      }

      const positionRole = input.positionRole ?? null;

      if (positionRole) {
        const taken = await tx.gamePartyMember.findFirst({
          where: {
            partyId: input.partyId,
            positionRole
          }
        });

        if (taken) {
          return { ok: false as const, reason: "role_taken" as const };
        }
      }

      const member = await tx.gamePartyMember.create({
        data: {
          partyId: input.partyId,
          positionRole,
          role: "MEMBER",
          userId: input.userId
        }
      });

      const cancelledApplications = await this.cancelOtherPendingApplicationsForInvitee(
        tx,
        input.userId
      );

      return { cancelledApplications, member, ok: true as const };
    });
  }

  /**
   * Atomically accept a pending invite if capacity remains and the user is not already a member.
   * Returns null member when the party is full / role taken (caller maps to a validation error).
   * Also returns invites auto-closed for the same role or because the roster became full.
   */
  acceptInviteAtomically(input: {
    inviteId: string;
    partyId: string;
    userId: string;
    maxMembers: number;
    positionRole?: string | null;
  }): Promise<{
    closedInvites: GamePartyInvite[];
    member: GamePartyMember | null;
    reason?: "full" | "role_taken" | "already_on_other_team";
    staleInvite: boolean;
  }> {
    return this.prismaService.$transaction(async (tx) => {
      // User lock first (before party) — consistent order avoids deadlocks with addMemberAtomically.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`${input.userId}:dota-party-join`})
        )
      `;

      const partyRows = await tx.$queryRaw<
        Array<{ kind: string; mergedIntoSlug: string | null; vertical: string }>
      >`
        SELECT kind::text AS kind, merged_into_slug AS "mergedIntoSlug", vertical
        FROM social.game_parties
        WHERE id = ${input.partyId}::uuid
        FOR UPDATE
      `;
      const partyMeta = partyRows[0];

      if (!partyMeta || partyMeta.mergedIntoSlug) {
        return { closedInvites: [], member: null, staleInvite: true };
      }

      await tx.$executeRaw`
        SELECT id FROM social.game_party_invites WHERE id = ${input.inviteId}::uuid FOR UPDATE
      `;

      const inviteRow = await tx.gamePartyInvite.findUnique({
        where: { id: input.inviteId }
      });

      if (
        !inviteRow ||
        inviteRow.partyId !== input.partyId ||
        inviteRow.inviteeUserId !== input.userId ||
        inviteRow.status !== "PENDING"
      ) {
        return { closedInvites: [], member: null, staleInvite: true };
      }

      if (partyMeta.kind === "TEAM") {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${`${input.userId}:TEAM:${partyMeta.vertical}`})
          )
        `;

        const otherTeam = await tx.gamePartyMember.findFirst({
          where: {
            partyId: { not: input.partyId },
            party: {
              kind: "TEAM",
              vertical: partyMeta.vertical
            },
            userId: input.userId
          },
          select: { id: true }
        });

        if (otherTeam) {
          return {
            closedInvites: [],
            member: null,
            reason: "already_on_other_team" as const,
            staleInvite: false
          };
        }
      }

      const memberCount = await tx.gamePartyMember.count({
        where: { partyId: input.partyId }
      });

      if (memberCount >= input.maxMembers) {
        const pending = await tx.gamePartyInvite.findMany({
          where: {
            partyId: input.partyId,
            status: "PENDING"
          }
        });
        await tx.gamePartyInvite.updateMany({
          data: { status: "CANCELLED" },
          where: {
            partyId: input.partyId,
            status: "PENDING"
          }
        });
        return {
          closedInvites: pending.map((invite) => ({ ...invite, status: "CANCELLED" as const })),
          member: null,
          reason: "full" as const,
          staleInvite: false
        };
      }

      const alreadyMember = await tx.gamePartyMember.findFirst({
        where: {
          partyId: input.partyId,
          userId: input.userId
        }
      });

      if (alreadyMember) {
        await tx.gamePartyInvite.updateMany({
          data: { status: "ACCEPTED" },
          where: {
            id: input.inviteId,
            status: "PENDING"
          }
        });
        const cancelledApplications = await this.cancelOtherPendingApplicationsForInvitee(
          tx,
          input.userId,
          input.inviteId
        );
        return {
          closedInvites: cancelledApplications,
          member: alreadyMember,
          staleInvite: false
        };
      }

      const positionRole = input.positionRole ?? null;

      if (positionRole) {
        const taken = await tx.gamePartyMember.findFirst({
          where: {
            partyId: input.partyId,
            positionRole
          }
        });

        if (taken) {
          const pendingSameRole = await tx.gamePartyInvite.findMany({
            where: {
              partyId: input.partyId,
              positionRole,
              status: "PENDING"
            }
          });
          await tx.gamePartyInvite.updateMany({
            data: { status: "CANCELLED" },
            where: {
              partyId: input.partyId,
              positionRole,
              status: "PENDING"
            }
          });
          return {
            closedInvites: pendingSameRole.map((invite) => ({
              ...invite,
              status: "CANCELLED" as const
            })),
            member: null,
            reason: "role_taken" as const,
            staleInvite: false
          };
        }
      }

      const member = await tx.gamePartyMember.create({
        data: {
          partyId: input.partyId,
          positionRole,
          role: "MEMBER",
          userId: input.userId
        }
      });

      const accepted = await tx.gamePartyInvite.updateMany({
        data: { status: "ACCEPTED" },
        where: {
          id: input.inviteId,
          status: "PENDING"
        }
      });

      if (accepted.count === 0) {
        // Concurrent decline/cancel won — roll back by aborting transaction via throw.
        throw new Error("INVITE_NO_LONGER_PENDING");
      }

      const closedInvites: GamePartyInvite[] = [];

      if (positionRole) {
        const sameRolePending = await tx.gamePartyInvite.findMany({
          where: {
            id: { not: input.inviteId },
            partyId: input.partyId,
            positionRole,
            status: "PENDING"
          }
        });
        if (sameRolePending.length > 0) {
          await tx.gamePartyInvite.updateMany({
            data: { status: "DECLINED" },
            where: {
              id: { not: input.inviteId },
              partyId: input.partyId,
              positionRole,
              status: "PENDING"
            }
          });
          closedInvites.push(
            ...sameRolePending.map((invite) => ({ ...invite, status: "DECLINED" as const }))
          );
        }
      }

      if (memberCount + 1 >= input.maxMembers) {
        const remainingPending = await tx.gamePartyInvite.findMany({
          where: {
            partyId: input.partyId,
            status: "PENDING"
          }
        });
        if (remainingPending.length > 0) {
          await tx.gamePartyInvite.updateMany({
            data: { status: "CANCELLED" },
            where: {
              partyId: input.partyId,
              status: "PENDING"
            }
          });
          closedInvites.push(
            ...remainingPending.map((invite) => ({ ...invite, status: "CANCELLED" as const }))
          );
        }
      }

      const cancelledApplications = await this.cancelOtherPendingApplicationsForInvitee(
        tx,
        input.userId,
        input.inviteId
      );
      closedInvites.push(...cancelledApplications);

      return { closedInvites, member, staleInvite: false };
    });
  }

  /** Remove a member, block public rejoining, and cancel party invites atomically. */
  async removeMemberAndBlockJoinAtomically(partyId: string, userId: string): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM social.game_parties WHERE id = ${partyId}::uuid FOR UPDATE
      `;

      await tx.gamePartyMember.deleteMany({
        where: {
          partyId,
          userId
        }
      });

      await tx.$executeRaw`
        INSERT INTO social.game_party_join_blocks (id, party_id, user_id, created_at)
        VALUES (gen_random_uuid(), ${partyId}::uuid, ${userId}::uuid, NOW())
        ON CONFLICT (party_id, user_id) DO NOTHING
      `;

      await tx.gamePartyInvite.updateMany({
        where: {
          inviteeUserId: userId,
          partyId,
          status: "PENDING"
        },
        data: {
          status: "CANCELLED"
        }
      });
    });
  }

  async upsertJoinBlock(partyId: string, userId: string): Promise<void> {
    await this.prismaService.$executeRaw`
      INSERT INTO social.game_party_join_blocks (id, party_id, user_id, created_at)
      VALUES (gen_random_uuid(), ${partyId}::uuid, ${userId}::uuid, NOW())
      ON CONFLICT (party_id, user_id) DO NOTHING
    `;
  }

  async deleteJoinBlock(partyId: string, userId: string): Promise<void> {
    await this.prismaService.$executeRaw`
      DELETE FROM social.game_party_join_blocks
      WHERE party_id = ${partyId}::uuid AND user_id = ${userId}::uuid
    `;
  }

  async findJoinBlock(partyId: string, userId: string): Promise<{ id: string } | null> {
    const rows = await this.prismaService.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id
      FROM social.game_party_join_blocks
      WHERE party_id = ${partyId}::uuid AND user_id = ${userId}::uuid
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async listBlockedPartyIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prismaService.$queryRaw<Array<{ party_id: string }>>`
      SELECT party_id::text AS party_id
      FROM social.game_party_join_blocks
      WHERE user_id = ${userId}::uuid
    `;

    return rows.map((row) => row.party_id);
  }

  async listBlockedPartySlugsForUser(userId: string): Promise<string[]> {
    const rows = await this.prismaService.$queryRaw<Array<{ slug: string }>>`
      SELECT p.slug AS slug
      FROM social.game_party_join_blocks b
      INNER JOIN social.game_parties p ON p.id = b.party_id
      WHERE b.user_id = ${userId}::uuid
    `;

    return rows.map((row) => row.slug);
  }

  cancelPendingInvitesForUser(partyId: string, userId: string): Promise<Prisma.BatchPayload> {
    return this.prismaService.gamePartyInvite.updateMany({
      where: {
        inviteeUserId: userId,
        partyId,
        status: "PENDING"
      },
      data: {
        status: "CANCELLED"
      }
    });
  }

  /**
   * After a user joins any party: cancel their other PENDING APPLICATIONS (all parties).
   * CAS on status=PENDING — concurrent accept of those invites loses and sees staleInvite.
   */
  private async cancelOtherPendingApplicationsForInvitee(
    tx: Prisma.TransactionClient,
    inviteeUserId: string,
    exceptInviteId?: string
  ): Promise<GamePartyInvite[]> {
    const where = {
      inviteeUserId,
      kind: "APPLICATION" as const,
      status: "PENDING" as const,
      ...(exceptInviteId ? { id: { not: exceptInviteId } } : {})
    };

    const pending = await tx.gamePartyInvite.findMany({ where });

    if (pending.length === 0) {
      return [];
    }

    await tx.gamePartyInvite.updateMany({
      data: { status: "CANCELLED" },
      where
    });

    return pending.map((invite) => ({ ...invite, status: "CANCELLED" as const }));
  }

  async updateMemberPositionRole(
    partyId: string,
    userId: string,
    positionRole: string | null
  ): Promise<void> {
    await this.prismaService.gamePartyMember.update({
      where: {
        partyId_userId: {
          partyId,
          userId
        }
      },
      data: {
        positionRole
      }
    });
  }

  async updateMemberRole(
    partyId: string,
    userId: string,
    role: "OFFICER" | "MEMBER"
  ): Promise<void> {
    await this.prismaService.gamePartyMember.update({
      where: {
        partyId_userId: {
          partyId,
          userId
        }
      },
      data: { role }
    });
  }

  /**
   * Pending invites received by the user, plus recently resolved ones
   * so the client can toast accepted/declined feedback.
   */
  listIncomingInvitesForUser(
    userId: string,
    recentResolvedWithinMs = 30_000
  ): Promise<
    Array<
      GamePartyInvite & {
        party: {
          _count: { members: number };
          expiresAt: Date | null;
          id: string;
          kind: GamePartyKind;
          maxMembers: number;
          name: string;
          ownerUserId: string;
          slug: string;
        };
        invitee: {
          displayName: string;
          id: string;
        };
      }
    >
  > {
    const recentSince = new Date(Date.now() - recentResolvedWithinMs);

    return this.prismaService.gamePartyInvite.findMany({
      include: {
        invitee: {
          select: {
            displayName: true,
            id: true
          }
        },
        party: {
          select: {
            _count: {
              select: { members: true }
            },
            expiresAt: true,
            id: true,
            kind: true,
            maxMembers: true,
            name: true,
            ownerUserId: true,
            slug: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      where: {
        inviteeUserId: userId,
        OR: [
          { status: "PENDING" },
          {
            status: { in: ["ACCEPTED", "DECLINED", "CANCELLED"] },
            updatedAt: { gte: recentSince }
          }
        ]
      }
    });
  }

  /** @deprecated Use listIncomingInvitesForUser */
  listPendingInvitesForUser(userId: string) {
    return this.listIncomingInvitesForUser(userId);
  }

  /**
   * Pending stack invites sent by the user, plus recently resolved ones
   * so the client can briefly show accepted/declined feedback.
   */
  listOutgoingInvitesForUser(
    userId: string,
    recentResolvedWithinMs = 30_000
  ): Promise<
    Array<
      GamePartyInvite & {
        party: {
          _count: { members: number };
          expiresAt: Date | null;
          id: string;
          kind: GamePartyKind;
          maxMembers: number;
          name: string;
          ownerUserId: string;
          slug: string;
        };
        invitee: {
          displayName: string;
          id: string;
        };
      }
    >
  > {
    const recentSince = new Date(Date.now() - recentResolvedWithinMs);

    return this.prismaService.gamePartyInvite.findMany({
      include: {
        invitee: {
          select: {
            displayName: true,
            id: true
          }
        },
        party: {
          select: {
            _count: {
              select: { members: true }
            },
            expiresAt: true,
            id: true,
            kind: true,
            maxMembers: true,
            name: true,
            ownerUserId: true,
            slug: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      where: {
        inviterUserId: userId,
        OR: [
          { status: "PENDING" },
          {
            status: { in: ["ACCEPTED", "DECLINED", "CANCELLED"] },
            updatedAt: { gte: recentSince }
          }
        ]
      }
    });
  }

  /** Pending applications for parties an officer manages (inviter is usually the captain). */
  listPendingApplicationsForParties(partyIds: string[]): Promise<
    Array<
      GamePartyInvite & {
        party: {
          _count: { members: number };
          expiresAt: Date | null;
          id: string;
          kind: GamePartyKind;
          maxMembers: number;
          name: string;
          ownerUserId: string;
          slug: string;
        };
        invitee: {
          displayName: string;
          id: string;
        };
      }
    >
  > {
    if (partyIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.prismaService.gamePartyInvite.findMany({
      include: {
        invitee: {
          select: {
            displayName: true,
            id: true
          }
        },
        party: {
          select: {
            _count: {
              select: { members: true }
            },
            expiresAt: true,
            id: true,
            kind: true,
            maxMembers: true,
            name: true,
            ownerUserId: true,
            slug: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      where: {
        kind: "APPLICATION",
        partyId: { in: partyIds },
        status: "PENDING"
      }
    });
  }

  /** Cancel PENDING invites older than the cutoff (age-based TTL). */
  async cancelStalePendingInvites(olderThan: Date): Promise<number> {
    const result = await this.prismaService.gamePartyInvite.updateMany({
      data: { status: "CANCELLED" },
      where: {
        createdAt: { lt: olderThan },
        status: "PENDING"
      }
    });

    return result.count;
  }

  deleteParty(partyId: string): Promise<GameParty> {
    return this.prismaService.gameParty.delete({
      where: { id: partyId }
    });
  }

  /**
   * Hard-delete temporary parties past TTL (members/invites/chat cascade).
   * Prefer deleting Discord channels first via the service, then call this.
   */
  async findExpiredParties(now = new Date()): Promise<
    Array<{
      discordChannelId: string | null;
      discordVoiceExpiresAt: Date | null;
      expiresAt: Date | null;
      id: string;
      mergedIntoSlug: string | null;
      ownerUserId: string;
      slug: string;
    }>
  > {
    return this.prismaService.gameParty.findMany({
      select: {
        discordChannelId: true,
        discordVoiceExpiresAt: true,
        expiresAt: true,
        id: true,
        mergedIntoSlug: true,
        ownerUserId: true,
        slug: true
      },
      where: {
        expiresAt: { lte: now },
        kind: "PARTY"
      }
    });
  }

  async deletePartiesByIds(partyIds: string[]): Promise<number> {
    if (partyIds.length === 0) {
      return 0;
    }

    const result = await this.prismaService.gameParty.deleteMany({
      where: {
        id: { in: partyIds }
      }
    });

    return result.count;
  }

  /**
   * @deprecated Prefer findExpiredParties + Discord delete + deletePartiesByIds.
   * Kept for any external callers; deletes DB rows before Discord cleanup.
   */
  async deleteExpiredParties(
    now = new Date()
  ): Promise<
    Array<{ discordChannelId: string | null; id: string; ownerUserId: string; slug: string }>
  > {
    const expired = await this.findExpiredParties(now);

    if (expired.length === 0) {
      return [];
    }

    await this.deletePartiesByIds(expired.map((party) => party.id));
    return expired;
  }

  updateDiscordVoice(
    partyId: string,
    input: {
      discordChannelId: string;
      discordInviteUrl: string;
      discordVoiceCreatedAt: Date;
      discordVoiceExpiresAt: Date | null;
    }
  ): Promise<GameParty> {
    return this.prismaService.gameParty.update({
      data: {
        discordChannelId: input.discordChannelId,
        discordInviteUrl: input.discordInviteUrl,
        discordVoiceCreatedAt: input.discordVoiceCreatedAt,
        discordVoiceExpiresAt: input.discordVoiceExpiresAt
      },
      where: { id: partyId }
    });
  }

  /** Returns true when this caller claimed the empty discord voice slot. */
  async claimDiscordVoice(
    partyId: string,
    input: {
      discordChannelId: string;
      discordInviteUrl: string;
      discordVoiceCreatedAt: Date;
      discordVoiceExpiresAt: Date | null;
    }
  ): Promise<boolean> {
    const result = await this.prismaService.gameParty.updateMany({
      data: {
        discordChannelId: input.discordChannelId,
        discordInviteUrl: input.discordInviteUrl,
        discordVoiceCreatedAt: input.discordVoiceCreatedAt,
        discordVoiceExpiresAt: input.discordVoiceExpiresAt
      },
      where: {
        discordChannelId: null,
        id: partyId,
        mergedIntoSlug: null
      }
    });

    return result.count > 0;
  }

  async clearDiscordVoice(partyId: string): Promise<void> {
    await this.prismaService.gameParty.update({
      data: {
        discordChannelId: null,
        discordInviteUrl: null,
        discordVoiceCreatedAt: null,
        discordVoiceExpiresAt: null
      },
      where: { id: partyId }
    });
  }

  async listExpiredDiscordVoices(
    now: Date,
    legacyCreatedBefore?: Date
  ): Promise<
    Array<{
      discordChannelId: string;
      discordVoiceExpiresAt: Date | null;
      id: string;
      kind: GamePartyKind;
      slug: string;
    }>
  > {
    const rows = await this.prismaService.gameParty.findMany({
      select: {
        discordChannelId: true,
        discordVoiceExpiresAt: true,
        id: true,
        kind: true,
        slug: true
      },
      where: {
        discordChannelId: { not: null },
        OR: [
          { discordVoiceExpiresAt: { lte: now } },
          ...(legacyCreatedBefore
            ? [
                {
                  discordVoiceCreatedAt: { lte: legacyCreatedBefore },
                  discordVoiceExpiresAt: null
                }
              ]
            : [])
        ]
      }
    });

    return rows.flatMap((row) =>
      row.discordChannelId
        ? [
            {
              discordChannelId: row.discordChannelId,
              discordVoiceExpiresAt: row.discordVoiceExpiresAt,
              id: row.id,
              kind: row.kind,
              slug: row.slug
            }
          ]
        : []
    );
  }

  /** Non-CAS expiry bump (cleanup auto-extend while voice occupied). */
  setPartyExpiry(
    partyId: string,
    expiresAt: Date,
    discordInviteUrl?: string | null
  ): Promise<GameParty> {
    return this.prismaService.$transaction(async (tx) => {
      const party = await tx.gameParty.update({
        data: {
          expiresAt,
          discordVoiceExpiresAt: expiresAt,
          ...(discordInviteUrl !== undefined ? { discordInviteUrl } : {})
        },
        where: { id: partyId }
      });
      await tx.gameParty.updateMany({
        data: { expiresAt },
        where: { mergedIntoSlug: party.slug }
      });
      return party;
    });
  }

  setDiscordVoiceExpiry(
    partyId: string,
    discordVoiceExpiresAt: Date,
    discordInviteUrl?: string | null
  ): Promise<GameParty> {
    return this.prismaService.gameParty.update({
      data: {
        discordVoiceExpiresAt,
        ...(discordInviteUrl !== undefined ? { discordInviteUrl } : {})
      },
      where: { id: partyId }
    });
  }

  async updateDiscordVoiceExpiry(
    partyId: string,
    discordVoiceExpiresAt: Date,
    expectedExpiresAt: Date | null,
    discordInviteUrl?: string | null
  ): Promise<boolean> {
    const result = await this.prismaService.gameParty.updateMany({
      data: {
        discordVoiceExpiresAt,
        ...(discordInviteUrl !== undefined ? { discordInviteUrl } : {})
      },
      where: {
        discordVoiceExpiresAt: expectedExpiresAt,
        id: partyId
      }
    });

    return result.count > 0;
  }

  /** Drop terminal invite rows older than the cutoff (PENDING kept). */
  async deleteStaleTerminalInvites(olderThan: Date): Promise<number> {
    const result = await this.prismaService.gamePartyInvite.deleteMany({
      where: {
        status: { in: ["ACCEPTED", "DECLINED", "CANCELLED"] },
        updatedAt: { lt: olderThan }
      }
    });

    return result.count;
  }

  updatePartyName(partyId: string, name: string): Promise<GameParty> {
    return this.prismaService.gameParty.update({
      data: { name },
      where: { id: partyId }
    });
  }

  updatePartyJoinMode(partyId: string, joinMode: "OPEN" | "CONFIRM"): Promise<GameParty> {
    return this.prismaService.gameParty.update({
      data: { joinMode },
      where: { id: partyId }
    });
  }

  async updatePartyExpiry(
    partyId: string,
    expiresAt: Date,
    expectedExpiresAt: Date,
    discordInviteUrl?: string | null
  ): Promise<boolean> {
    return this.prismaService.$transaction(async (tx) => {
      const result = await tx.gameParty.updateMany({
        data: {
          expiresAt,
          discordVoiceExpiresAt: expiresAt,
          ...(discordInviteUrl !== undefined ? { discordInviteUrl } : {})
        },
        where: {
          expiresAt: expectedExpiresAt,
          id: partyId
        }
      });
      if (result.count > 0) {
        const party = await tx.gameParty.findUnique({
          select: { slug: true },
          where: { id: partyId }
        });
        if (party) {
          await tx.gameParty.updateMany({
            data: { expiresAt },
            where: { mergedIntoSlug: party.slug }
          });
        }
      }

      return result.count > 0;
    });
  }

  createChatMessage(input: {
    message: string;
    partyId: string;
    userId: string;
  }): Promise<GamePartyChatMessage & { user: { displayName: string; id: string } }> {
    return this.prismaService.gamePartyChatMessage.create({
      data: {
        message: input.message.trim(),
        partyId: input.partyId,
        userId: input.userId
      },
      include: {
        user: {
          select: {
            displayName: true,
            id: true
          }
        }
      }
    });
  }

  findChatMessageByExactText(
    partyId: string,
    message: string
  ): Promise<GamePartyChatMessage | null> {
    return this.prismaService.gamePartyChatMessage.findFirst({
      where: {
        message,
        partyId
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async listChatMessages(
    partyId: string,
    beforeMessageId?: string,
    limit = DEFAULT_CHAT_PAGE_SIZE
  ): Promise<Array<GamePartyChatMessage & { user: { displayName: string; id: string } }>> {
    const pageSize = Math.min(Math.max(limit, 1), MAX_CHAT_PAGE_SIZE);

    if (beforeMessageId) {
      const cursor = await this.prismaService.gamePartyChatMessage.findUnique({
        where: { id: beforeMessageId }
      });

      if (!cursor || cursor.partyId !== partyId) {
        return [];
      }

      return this.prismaService.gamePartyChatMessage.findMany({
        include: {
          user: {
            select: {
              displayName: true,
              id: true
            }
          }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize,
        where: {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            {
              createdAt: cursor.createdAt,
              id: { lt: cursor.id }
            }
          ],
          partyId
        }
      });
    }

    return this.prismaService.gamePartyChatMessage.findMany({
      include: {
        user: {
          select: {
            displayName: true,
            id: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      where: { partyId }
    });
  }
}

function parseDotaRoles(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((role): role is string => typeof role === "string")
      : [];
  } catch {
    return [];
  }
}

function parseRecruitingRoles(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((role) => role.trim())
      .filter(isDotaPositionRole) ?? []
  );
}

function parseMmrBounds(value: string | undefined): { high: number; low: number } | null {
  if (!value?.trim()) {
    return null;
  }

  const parts = value.trim().replace(/\s/g, "").replace("–", "-").split("-", 2);
  const values = parts.map(Number);
  if (
    values.some((number) => !Number.isFinite(number) || number < 0 || number > 18_000) ||
    values.length < 1 ||
    values.length > 2
  ) {
    return null;
  }

  return {
    high: Math.max(...values),
    low: Math.min(...values)
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
