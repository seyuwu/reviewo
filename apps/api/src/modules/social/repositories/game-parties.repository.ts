import { Injectable } from "@nestjs/common";
import type {
  GameParty,
  GamePartyChatMessage,
  GamePartyInvite,
  GamePartyKind,
  GamePartyMember,
  Prisma
} from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

type PartyWithMembers = GameParty & {
  members: Array<GamePartyMember & { user: { displayName: string; id: string } }>;
};

const DEFAULT_CHAT_PAGE_SIZE = 50;
const MAX_CHAT_PAGE_SIZE = 100;

@Injectable()
export class GamePartiesRepository {
  constructor(private readonly prismaService: PrismaService) {}

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

  findByVerticalAndSlug(vertical: string, slug: string): Promise<PartyWithMembers | null> {
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
      where: {
        vertical_slug: {
          slug,
          vertical
        }
      }
    });
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
    return this.prismaService.gamePartyInvite.create({
      data: {
        inviteeUserId: input.inviteeUserId,
        inviterUserId: input.inviterUserId,
        kind: input.inviteKind ?? "INVITE",
        partyId: input.partyId,
        positionRole: input.positionRole ?? null,
        status: "PENDING"
      }
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
    | { ok: false; reason: "full" | "role_taken" | "already_on_other_team" | "party_gone" }
  > {
    return this.prismaService.$transaction(async (tx) => {
      // Serialize joins for this user so concurrent accepts cannot both keep foreign applications.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`${input.userId}:dota-party-join`})
        )
      `;

      const partyRows = await tx.$queryRaw<Array<{ kind: string; vertical: string }>>`
        SELECT kind::text AS kind, vertical
        FROM social.game_parties
        WHERE id = ${input.partyId}::uuid
        FOR UPDATE
      `;
      const partyMeta = partyRows[0];

      if (!partyMeta) {
        return { ok: false as const, reason: "party_gone" as const };
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

      const partyRows = await tx.$queryRaw<Array<{ kind: string; vertical: string }>>`
        SELECT kind::text AS kind, vertical
        FROM social.game_parties
        WHERE id = ${input.partyId}::uuid
        FOR UPDATE
      `;
      const partyMeta = partyRows[0];

      if (!partyMeta) {
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

  /**
   * Kick member + join-block + cancel their pending invites in one locked transaction.
   */
  async kickMemberAtomically(partyId: string, userId: string): Promise<void> {
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

  removeMember(partyId: string, userId: string): Promise<Prisma.BatchPayload> {
    return this.prismaService.gamePartyMember.deleteMany({
      where: {
        partyId,
        userId
      }
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

  cancelPendingInvitesForUser(
    partyId: string,
    userId: string
  ): Promise<Prisma.BatchPayload> {
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
  async findExpiredParties(
    now = new Date()
  ): Promise<
    Array<{
      discordChannelId: string | null;
      discordVoiceExpiresAt: Date | null;
      expiresAt: Date | null;
      id: string;
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
  ): Promise<Array<{ discordChannelId: string | null; id: string; ownerUserId: string; slug: string }>> {
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
        id: partyId
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
    return this.prismaService.gameParty.update({
      data: {
        expiresAt,
        discordVoiceExpiresAt: expiresAt,
        ...(discordInviteUrl !== undefined ? { discordInviteUrl } : {})
      },
      where: { id: partyId }
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

  updatePartyJoinMode(
    partyId: string,
    joinMode: "OPEN" | "CONFIRM"
  ): Promise<GameParty> {
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
    const result = await this.prismaService.gameParty.updateMany({
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

    return result.count > 0;
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
