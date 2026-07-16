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

    return this.prismaService.gamePartyMember.findMany({
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
   * Returns the existing membership when already present, or null when the party is full.
   */
  addMemberAtomically(input: {
    maxMembers: number;
    partyId: string;
    userId: string;
  }): Promise<GamePartyMember | null> {
    return this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM social.game_parties WHERE id = ${input.partyId}::uuid FOR UPDATE
      `;

      const memberCount = await tx.gamePartyMember.count({
        where: { partyId: input.partyId }
      });

      if (memberCount >= input.maxMembers) {
        return null;
      }

      const alreadyMember = await tx.gamePartyMember.findFirst({
        where: {
          partyId: input.partyId,
          userId: input.userId
        }
      });

      if (alreadyMember) {
        return alreadyMember;
      }

      return tx.gamePartyMember.create({
        data: {
          partyId: input.partyId,
          role: "MEMBER",
          userId: input.userId
        }
      });
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
  }): Promise<{ closedInvites: GamePartyInvite[]; member: GamePartyMember | null }> {
    return this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM social.game_parties WHERE id = ${input.partyId}::uuid FOR UPDATE
      `;

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
          member: null
        };
      }

      const alreadyMember = await tx.gamePartyMember.findFirst({
        where: {
          partyId: input.partyId,
          userId: input.userId
        }
      });

      if (alreadyMember) {
        await tx.gamePartyInvite.update({
          where: { id: input.inviteId },
          data: { status: "ACCEPTED" }
        });
        return { closedInvites: [], member: alreadyMember };
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
            member: null
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

      await tx.gamePartyInvite.update({
        where: { id: input.inviteId },
        data: { status: "ACCEPTED" }
      });

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

      return { closedInvites, member };
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
   * Returns deleted rows so callers can clear LFG for those owners.
   */
  async deleteExpiredParties(
    now = new Date()
  ): Promise<Array<{ id: string; ownerUserId: string; slug: string }>> {
    const expired = await this.prismaService.gameParty.findMany({
      select: {
        id: true,
        ownerUserId: true,
        slug: true
      },
      where: {
        expiresAt: { lte: now },
        kind: "PARTY"
      }
    });

    if (expired.length === 0) {
      return [];
    }

    await this.prismaService.gameParty.deleteMany({
      where: {
        id: { in: expired.map((party) => party.id) }
      }
    });

    return expired;
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
