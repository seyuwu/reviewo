import { Injectable } from "@nestjs/common";
import type { Entity, EntityClusterMember, EntityVisibility, Prisma } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export type PrismaClientOrTransaction = Prisma.TransactionClient | PrismaService;

export interface EntityClusterMemberWithEntity extends EntityClusterMember {
  entity: Entity;
}

@Injectable()
export class EntityClusterRepository {
  constructor(private readonly prismaService: PrismaService) {}

  runInTransaction<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prismaService.$transaction(callback);
  }

  async findMemberByEntityId(
    entityId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<EntityClusterMember | null> {
    return client.entityClusterMember.findUnique({
      where: { entityId }
    });
  }

  async findClusterMembers(
    clusterId: string,
    excludeEntityId: string | undefined,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<EntityClusterMemberWithEntity[]> {
    return client.entityClusterMember.findMany({
      include: {
        entity: true
      },
      where: {
        clusterId,
        ...(excludeEntityId ? { entityId: { not: excludeEntityId } } : {}),
        entity: {
          visibility: "ACTIVE" satisfies EntityVisibility
        }
      }
    });
  }

  async createClusterWithMembers(
    entityIds: string[],
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<string> {
    const cluster = await client.entityCluster.create({
      data: {
        members: {
          create: entityIds.map((entityId) => ({ entityId }))
        }
      }
    });

    return cluster.id;
  }

  async addMember(
    clusterId: string,
    entityId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<void> {
    await client.entityClusterMember.create({
      data: {
        clusterId,
        entityId
      }
    });
  }

  async moveMembersToCluster(
    fromClusterId: string,
    toClusterId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<void> {
    await client.entityClusterMember.updateMany({
      data: {
        clusterId: toClusterId
      },
      where: {
        clusterId: fromClusterId
      }
    });
  }

  async deleteCluster(
    clusterId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<void> {
    await client.entityCluster.delete({
      where: { id: clusterId }
    });
  }

  async removeMember(
    entityId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<void> {
    await client.entityClusterMember.deleteMany({
      where: { entityId }
    });
  }

  async countClusterMembers(
    clusterId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<number> {
    return client.entityClusterMember.count({
      where: { clusterId }
    });
  }

  async findActiveEntitiesByIds(
    entityIds: string[],
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<Entity[]> {
    if (entityIds.length === 0) {
      return [];
    }

    return client.entity.findMany({
      where: {
        id: { in: entityIds },
        visibility: "ACTIVE"
      }
    });
  }

  async listClusterMemberEntityIds(
    clusterId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<string[]> {
    const members = await client.entityClusterMember.findMany({
      select: { entityId: true },
      where: { clusterId }
    });

    return members.map((member) => member.entityId);
  }

  async removeAllClusterMembers(
    clusterId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<void> {
    await client.entityClusterMember.deleteMany({
      where: { clusterId }
    });
  }
}
