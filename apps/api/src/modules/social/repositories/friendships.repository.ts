import { Injectable } from "@nestjs/common";
import type { UserFriendship } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

@Injectable()
export class FriendshipsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findBetweenUsers(userA: string, userB: string): Promise<UserFriendship | null> {
    return this.prismaService.userFriendship.findFirst({
      orderBy: [{ updatedAt: "desc" }],
      where: {
        OR: [
          { addresseeId: userB, requesterId: userA },
          { addresseeId: userA, requesterId: userB }
        ]
      }
    });
  }

  findById(id: string): Promise<UserFriendship | null> {
    return this.prismaService.userFriendship.findUnique({
      where: { id }
    });
  }

  createPending(requesterId: string, addresseeId: string): Promise<UserFriendship> {
    return this.prismaService.userFriendship.create({
      data: {
        addresseeId,
        requesterId,
        status: "PENDING"
      }
    });
  }

  /**
   * Creates or upgrades a bidirectional friendship to ACCEPTED.
   * Collapses any reverse/duplicate edges for the pair.
   */
  async ensureAccepted(inviterUserId: string, inviteeUserId: string): Promise<UserFriendship> {
    return this.prismaService.$transaction(async (tx) => {
      const existing = await tx.userFriendship.findMany({
        where: {
          OR: [
            { addresseeId: inviteeUserId, requesterId: inviterUserId },
            { addresseeId: inviterUserId, requesterId: inviteeUserId }
          ]
        }
      });

      const primary = existing.at(0);

      if (!primary) {
        return tx.userFriendship.create({
          data: {
            addresseeId: inviteeUserId,
            requesterId: inviterUserId,
            status: "ACCEPTED"
          }
        });
      }

      for (const duplicate of existing.slice(1)) {
        await tx.userFriendship.delete({ where: { id: duplicate.id } });
      }

      if (primary.status === "ACCEPTED") {
        return primary;
      }

      return tx.userFriendship.update({
        where: { id: primary.id },
        data: { status: "ACCEPTED" }
      });
    });
  }

  updateStatus(id: string, status: "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED"): Promise<UserFriendship> {
    return this.prismaService.userFriendship.update({
      where: { id },
      data: { status }
    });
  }

  deleteById(id: string): Promise<UserFriendship> {
    return this.prismaService.userFriendship.delete({
      where: { id }
    });
  }

  listAcceptedForUser(userId: string): Promise<UserFriendship[]> {
    return this.prismaService.userFriendship.findMany({
      orderBy: { updatedAt: "desc" },
      where: {
        status: "ACCEPTED",
        OR: [{ addresseeId: userId }, { requesterId: userId }]
      }
    });
  }

  listPendingForUser(userId: string): Promise<UserFriendship[]> {
    return this.prismaService.userFriendship.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        status: "PENDING",
        OR: [{ addresseeId: userId }, { requesterId: userId }]
      }
    });
  }

  async areFriends(userA: string, userB: string): Promise<boolean> {
    const row = await this.prismaService.userFriendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { addresseeId: userB, requesterId: userA },
          { addresseeId: userA, requesterId: userB }
        ]
      }
    });

    return row !== null;
  }
}
