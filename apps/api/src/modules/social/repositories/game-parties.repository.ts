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

  cancelPendingInvitesForParty(partyId: string): Promise<Prisma.BatchPayload> {
    return this.prismaService.gamePartyInvite.updateMany({
      data: { status: "CANCELLED" },
      where: {
        partyId,
        status: "PENDING"
      }
    });
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
   * Returns null when the party is full (caller maps to a validation error).
   */
  acceptInviteAtomically(input: {
    inviteId: string;
    partyId: string;
    userId: string;
    maxMembers: number;
    positionRole?: string | null;
  }): Promise<GamePartyMember | null> {
    return this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM social.game_parties WHERE id = ${input.partyId}::uuid FOR UPDATE
      `;

      const memberCount = await tx.gamePartyMember.count({
        where: { partyId: input.partyId }
      });

      if (memberCount >= input.maxMembers) {
        await tx.gamePartyInvite.update({
          where: { id: input.inviteId },
          data: { status: "CANCELLED" }
        });
        await tx.gamePartyInvite.updateMany({
          data: { status: "CANCELLED" },
          where: {
            partyId: input.partyId,
            status: "PENDING"
          }
        });
        return null;
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
        return alreadyMember;
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
          await tx.gamePartyInvite.update({
            where: { id: input.inviteId },
            data: { status: "CANCELLED" }
          });
          return null;
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

      if (positionRole) {
        await tx.gamePartyInvite.updateMany({
          data: { status: "DECLINED" },
          where: {
            id: { not: input.inviteId },
            partyId: input.partyId,
            positionRole,
            status: "PENDING"
          }
        });
      }

      if (memberCount + 1 >= input.maxMembers) {
        await tx.gamePartyInvite.updateMany({
          data: { status: "CANCELLED" },
          where: {
            partyId: input.partyId,
            status: "PENDING"
          }
        });
      }

      return member;
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

  listPendingInvitesForUser(userId: string): Promise<
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
      orderBy: { createdAt: "desc" },
      where: {
        inviteeUserId: userId,
        status: "PENDING"
      }
    });
  }

  /**
   * Pending stack invites sent by the user, plus recently resolved ones
   * so the client can briefly show accepted/declined feedback.
   */
  listOutgoingInvitesForUser(
    userId: string,
    recentResolvedWithinMs = 20_000
  ): Promise<
    Array<
      GamePartyInvite & {
        party: {
          expiresAt: Date | null;
          id: string;
          kind: GamePartyKind;
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
            expiresAt: true,
            id: true,
            kind: true,
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
