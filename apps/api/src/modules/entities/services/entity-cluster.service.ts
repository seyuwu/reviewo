import { HttpStatus, Injectable } from "@nestjs/common";
import { EntityVisibility } from "#prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { MAX_ENTITY_CLUSTER_MEMBERS } from "../constants/entity-cluster-limits.js";
import {
  EntityClusterRepository,
  type PrismaClientOrTransaction
} from "../repositories/entity-cluster.repository.js";

export interface RelatedPresenceSummary {
  canonicalUrl: string | null;
  id: string;
  logoUrl: string | null;
  slug: string;
  title: string;
  type: string;
  rating: {
    avgScore: number;
    votesCount: number;
  } | null;
}

@Injectable()
export class EntityClusterService {
  constructor(private readonly entityClusterRepository: EntityClusterRepository) {}

  async linkEntities(leftEntityId: string, rightEntityId: string): Promise<void> {
    await this.entityClusterRepository.runInTransaction(async (transaction) => {
      await this.linkEntitiesWithClient(transaction, leftEntityId, rightEntityId);
    });
  }

  async linkEntitiesWithClient(
    client: PrismaClientOrTransaction,
    leftEntityId: string,
    rightEntityId: string
  ): Promise<void> {
    if (leftEntityId === rightEntityId) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Cannot link entity to itself",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const entities = await this.entityClusterRepository.findActiveEntitiesByIds(
      [leftEntityId, rightEntityId],
      client
    );

    if (entities.length !== 2) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "One or both entities were not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const [leftMember, rightMember] = await Promise.all([
      this.entityClusterRepository.findMemberByEntityId(leftEntityId, client),
      this.entityClusterRepository.findMemberByEntityId(rightEntityId, client)
    ]);

    if (!leftMember && !rightMember) {
      await this.assertLinkWouldFitCluster(leftEntityId, rightEntityId, client);
      await this.entityClusterRepository.createClusterWithMembers(
        [leftEntityId, rightEntityId],
        client
      );
      return;
    }

    if (leftMember && !rightMember) {
      await this.assertLinkWouldFitCluster(leftEntityId, rightEntityId, client);
      await this.entityClusterRepository.addMember(leftMember.clusterId, rightEntityId, client);
      return;
    }

    if (!leftMember && rightMember) {
      await this.assertLinkWouldFitCluster(leftEntityId, rightEntityId, client);
      await this.entityClusterRepository.addMember(rightMember.clusterId, leftEntityId, client);
      return;
    }

    if (!leftMember || !rightMember || leftMember.clusterId === rightMember.clusterId) {
      return;
    }

    await this.assertLinkWouldFitCluster(leftEntityId, rightEntityId, client);

    await this.entityClusterRepository.moveMembersToCluster(
      rightMember.clusterId,
      leftMember.clusterId,
      client
    );
    await this.entityClusterRepository.deleteCluster(rightMember.clusterId, client);
  }

  async listRelatedPresenceEntities(entityId: string): Promise<
    Array<{
      canonicalUrl: string | null;
      id: string;
      logoUrl: string | null;
      slug: string;
      title: string;
      type: string;
    }>
  > {
    const member = await this.entityClusterRepository.findMemberByEntityId(entityId);

    if (!member) {
      return [];
    }

    const members = await this.entityClusterRepository.findClusterMembers(
      member.clusterId,
      entityId
    );

    return members.map((item) => ({
      canonicalUrl: item.entity.canonicalUrl,
      id: item.entity.id,
      logoUrl: item.entity.logoUrl,
      slug: item.entity.slug,
      title: item.entity.title,
      type: item.entity.type
    }));
  }

  async areEntitiesInSameCluster(leftEntityId: string, rightEntityId: string): Promise<boolean> {
    const [leftMember, rightMember] = await Promise.all([
      this.entityClusterRepository.findMemberByEntityId(leftEntityId),
      this.entityClusterRepository.findMemberByEntityId(rightEntityId)
    ]);

    return Boolean(
      leftMember && rightMember && leftMember.clusterId === rightMember.clusterId
    );
  }

  async unlinkEntities(entityId: string, relatedEntityId: string): Promise<void> {
    await this.entityClusterRepository.runInTransaction(async (transaction) => {
      await this.unlinkEntitiesWithClient(transaction, entityId, relatedEntityId);
    });
  }

  async unlinkEntitiesWithClient(
    client: PrismaClientOrTransaction,
    entityId: string,
    relatedEntityId: string
  ): Promise<void> {
    if (entityId === relatedEntityId) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Cannot unlink entity from itself",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const [leftMember, rightMember] = await Promise.all([
      this.entityClusterRepository.findMemberByEntityId(entityId, client),
      this.entityClusterRepository.findMemberByEntityId(relatedEntityId, client)
    ]);

    if (!leftMember || !rightMember || leftMember.clusterId !== rightMember.clusterId) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entities are not linked",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const clusterId = leftMember.clusterId;

    await this.entityClusterRepository.removeMember(relatedEntityId, client);

    const remainingCount = await this.entityClusterRepository.countClusterMembers(clusterId, client);

    if (remainingCount <= 1) {
      await this.entityClusterRepository.removeAllClusterMembers(clusterId, client);
      await this.entityClusterRepository.deleteCluster(clusterId, client);
    }
  }

  async handleEntityMerge(sourceEntityId: string, targetEntityId: string): Promise<void> {
    await this.entityClusterRepository.runInTransaction(async (transaction) => {
      await this.handleEntityMergeWithClient(transaction, sourceEntityId, targetEntityId);
    });
  }

  async handleEntityMergeWithClient(
    client: PrismaClientOrTransaction,
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    const [sourceMember, targetMember] = await Promise.all([
      this.entityClusterRepository.findMemberByEntityId(sourceEntityId, client),
      this.entityClusterRepository.findMemberByEntityId(targetEntityId, client)
    ]);

    if (!sourceMember) {
      return;
    }

    const sourceClusterId = sourceMember.clusterId;

    await this.entityClusterRepository.removeMember(sourceEntityId, client);

    if (!targetMember) {
      await this.entityClusterRepository.addMember(sourceClusterId, targetEntityId, client);
    } else if (targetMember.clusterId !== sourceClusterId) {
      await this.entityClusterRepository.moveMembersToCluster(
        sourceClusterId,
        targetMember.clusterId,
        client
      );
    }

    const remainingMembers = await this.entityClusterRepository.countClusterMembers(
      sourceClusterId,
      client
    );

    if (remainingMembers === 0) {
      await this.entityClusterRepository.deleteCluster(sourceClusterId, client);
    }
  }

  async assertEntitiesCanBeLinked(leftEntityId: string, rightEntityId: string): Promise<void> {
    const entities = await this.entityClusterRepository.findActiveEntitiesByIds([
      leftEntityId,
      rightEntityId
    ]);

    if (entities.length !== 2) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "One or both entities were not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const inactive = entities.find((entity) => entity.visibility !== EntityVisibility.ACTIVE);

    if (inactive) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Only active entities can be linked",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
  }

  async assertEntitiesCanBeUnlinked(leftEntityId: string, rightEntityId: string): Promise<void> {
    await this.assertEntitiesCanBeLinked(leftEntityId, rightEntityId);

    const linked = await this.areEntitiesInSameCluster(leftEntityId, rightEntityId);

    if (!linked) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entities are not linked",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
  }

  async assertClusterCapacityForLink(leftEntityId: string, rightEntityId: string): Promise<void> {
    await this.entityClusterRepository.runInTransaction(async (client) => {
      await this.assertLinkWouldFitCluster(leftEntityId, rightEntityId, client);
    });
  }

  private async assertLinkWouldFitCluster(
    leftEntityId: string,
    rightEntityId: string,
    client: PrismaClientOrTransaction
  ): Promise<void> {
    const resultingSize = await this.estimateResultingClusterSize(leftEntityId, rightEntityId, client);

    if (resultingSize > MAX_ENTITY_CLUSTER_MEMBERS) {
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: `Cluster cannot exceed ${MAX_ENTITY_CLUSTER_MEMBERS} members`,
        statusCode: HttpStatus.BAD_REQUEST
      });
    }
  }

  private async estimateResultingClusterSize(
    leftEntityId: string,
    rightEntityId: string,
    client: PrismaClientOrTransaction
  ): Promise<number> {
    const [leftMember, rightMember] = await Promise.all([
      this.entityClusterRepository.findMemberByEntityId(leftEntityId, client),
      this.entityClusterRepository.findMemberByEntityId(rightEntityId, client)
    ]);

    if (!leftMember && !rightMember) {
      return 2;
    }

    if (leftMember && rightMember) {
      if (leftMember.clusterId === rightMember.clusterId) {
        return this.entityClusterRepository.countClusterMembers(leftMember.clusterId, client);
      }

      const [leftCount, rightCount] = await Promise.all([
        this.entityClusterRepository.countClusterMembers(leftMember.clusterId, client),
        this.entityClusterRepository.countClusterMembers(rightMember.clusterId, client)
      ]);

      return leftCount + rightCount;
    }

    const clusterId = leftMember?.clusterId ?? rightMember?.clusterId;

    if (!clusterId) {
      return 2;
    }

    return (await this.entityClusterRepository.countClusterMembers(clusterId, client)) + 1;
  }
}
