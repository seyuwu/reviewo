import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType, EntityVisibility } from "#prisma/client";

import { AppException } from "../../../common/exceptions/app.exception.js";
import { EntityClusterRepository } from "../repositories/entity-cluster.repository.js";
import { EntityClusterService } from "./entity-cluster.service.js";
function createEntity(id: string, title: string) {
  return {
    canonicalUrl: null,
    createdAt: new Date(),
    createdBy: null,
    description: null,
    id,
    logoUrl: null,
    parentId: null,
    slug: title.toLowerCase(),
    title,
    type: EntityType.other,
    updatedAt: new Date(),
    visibility: EntityVisibility.ACTIVE
  };
}

function createRepositoryStub(overrides: Partial<EntityClusterRepository> = {}): EntityClusterRepository {
  const stub: EntityClusterRepository = {
    addMember: async () => {},
    countClusterMembers: async () => 0,
    createClusterWithMembers: async () => "cluster-1",
    deleteCluster: async () => {},
    findActiveEntitiesByIds: async (entityIds: string[]) =>
      entityIds.map((entityId) => createEntity(entityId, entityId)),
    findClusterMembers: async () => [],
    findMemberByEntityId: async () => null,
    listClusterMemberEntityIds: async () => [],
    moveMembersToCluster: async () => {},
    removeAllClusterMembers: async () => {},
    removeMember: async () => {},
    runInTransaction: async <T>(callback: (transaction: EntityClusterRepository) => Promise<T>) =>
      callback(stub),
    ...overrides
  } as EntityClusterRepository;

  return stub;
}

describe("EntityClusterService", () => {
  it("creates a cluster when neither entity belongs to one", async () => {
    let createdMembers: string[] | null = null;
    const repository = createRepositoryStub({
      createClusterWithMembers: async (entityIds) => {
        createdMembers = entityIds;
        return "cluster-new";
      }
    });
    const service = new EntityClusterService(repository);

    await service.linkEntities("entity-a", "entity-b");

    assert.deepEqual(createdMembers, ["entity-a", "entity-b"]);
  });

  it("adds the second entity to an existing cluster", async () => {
    const added: Array<{ clusterId: string; entityId: string }> = [];
    const repository = createRepositoryStub({
      findMemberByEntityId: async (entityId) =>
        entityId === "entity-a"
          ? {
              clusterId: "cluster-1",
              createdAt: new Date(),
              entityId,
              id: "member-a"
            }
          : null,
      addMember: async (clusterId, entityId) => {
        added.push({ clusterId, entityId });
      }
    });
    const service = new EntityClusterService(repository);

    await service.linkEntities("entity-a", "entity-b");

    assert.deepEqual(added, [{ clusterId: "cluster-1", entityId: "entity-b" }]);
  });

  it("moves target into source cluster after merge when target was unclustered", async () => {
    const calls: string[] = [];
    const repository = createRepositoryStub({
      findMemberByEntityId: async (entityId) =>
        entityId === "source"
          ? {
              clusterId: "cluster-source",
              createdAt: new Date(),
              entityId,
              id: "member-source"
            }
          : null,
      removeMember: async (entityId) => {
        calls.push(`remove:${entityId}`);
      },
      addMember: async (clusterId, entityId) => {
        calls.push(`add:${clusterId}:${entityId}`);
      },
      countClusterMembers: async () => 1
    });
    const service = new EntityClusterService(repository);

    await service.handleEntityMerge("source", "target");

    assert.deepEqual(calls, ["remove:source", "add:cluster-source:target"]);
  });

  it("removes a linked entity and dissolves a two-member cluster", async () => {
    const removed: string[] = [];
    const repository = createRepositoryStub({
      findMemberByEntityId: async (entityId) =>
        entityId === "entity-a" || entityId === "entity-b"
          ? {
              clusterId: "cluster-1",
              createdAt: new Date(),
              entityId,
              id: `member-${entityId}`
            }
          : null,
      removeMember: async (entityId) => {
        removed.push(entityId);
      },
      countClusterMembers: async () => 1,
      removeAllClusterMembers: async () => {},
      deleteCluster: async () => {}
    });
    const service = new EntityClusterService(repository);

    await service.unlinkEntities("entity-a", "entity-b");

    assert.deepEqual(removed, ["entity-b"]);
  });

  it("rejects links that would exceed the cluster member limit", async () => {
    const repository = createRepositoryStub({
      findMemberByEntityId: async (entityId) =>
        entityId === "entity-a"
          ? {
              clusterId: "cluster-1",
              createdAt: new Date(),
              entityId,
              id: "member-a"
            }
          : null,
      countClusterMembers: async () => 20
    });
    const service = new EntityClusterService(repository);

    await assert.rejects(
      () => service.linkEntities("entity-a", "entity-b"),
      (error: unknown) =>
        error instanceof AppException &&
        error.getErrorResponse().message.includes("20 members")
    );
  });
});
