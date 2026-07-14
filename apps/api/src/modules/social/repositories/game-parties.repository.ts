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
    inviterUserId: string;
    partyId: string;
  }): Promise<GamePartyInvite> {
    return this.prismaService.gamePartyInvite.create({
      data: {
        inviteeUserId: input.inviteeUserId,
        inviterUserId: input.inviterUserId,
        partyId: input.partyId,
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
   * Atomically accept a pending invite if capacity remains and the user is not already a member.
   * Returns null when the party is full (caller maps to a validation error).
   */
  acceptInviteAtomically(input: {
    inviteId: string;
    partyId: string;
    userId: string;
    maxMembers: number;
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
        await tx.gamePartyInvite.update({
          where: { id: input.inviteId },
          data: { status: "ACCEPTED" }
        });
        return alreadyMember;
      }

      const member = await tx.gamePartyMember.create({
        data: {
          partyId: input.partyId,
          role: "MEMBER",
          userId: input.userId
        }
      });

      await tx.gamePartyInvite.update({
        where: { id: input.inviteId },
        data: { status: "ACCEPTED" }
      });

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

  listPendingInvitesForUser(userId: string): Promise<
    Array<
      GamePartyInvite & {
        party: {
          expiresAt: Date | null;
          kind: GamePartyKind;
          name: string;
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
            expiresAt: true,
            kind: true,
            name: true,
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

  deleteParty(partyId: string): Promise<GameParty> {
    return this.prismaService.gameParty.delete({
      where: { id: partyId }
    });
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
