import { Injectable } from "@nestjs/common";

const MIN_ENTITIES_PER_USER = 5;
const MIN_CLUSTER_SIZE = 5;
const MIN_JACCARD_OVERLAP = 0.4;

export interface UserEntitySet {
  entityIds: Set<string>;
  userId: string;
}

export interface CoordinationCluster {
  memberUserIds: string[];
  overlapScore: number;
}

@Injectable()
export class CoordinationGraphService {
  detectClusters(userEntitySets: UserEntitySet[]): CoordinationCluster[] {
    const eligibleUsers = userEntitySets.filter(
      (entry) => entry.entityIds.size >= MIN_ENTITIES_PER_USER
    );

    if (eligibleUsers.length < MIN_CLUSTER_SIZE) {
      return [];
    }

    const adjacency = new Map<string, Set<string>>();

    for (const user of eligibleUsers) {
      adjacency.set(user.userId, new Set());
    }

    for (let leftIndex = 0; leftIndex < eligibleUsers.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < eligibleUsers.length; rightIndex += 1) {
        const left = eligibleUsers[leftIndex];
        const right = eligibleUsers[rightIndex];

        if (!left || !right) {
          continue;
        }

        const overlapScore = calculateJaccardOverlap(left.entityIds, right.entityIds);

        if (overlapScore < MIN_JACCARD_OVERLAP) {
          continue;
        }

        adjacency.get(left.userId)?.add(right.userId);
        adjacency.get(right.userId)?.add(left.userId);
      }
    }

    const visited = new Set<string>();
    const clusters: CoordinationCluster[] = [];

    for (const user of eligibleUsers) {
      if (visited.has(user.userId)) {
        continue;
      }

      const component = collectComponent(user.userId, adjacency);
      component.forEach((memberId) => visited.add(memberId));

      if (component.length < MIN_CLUSTER_SIZE) {
        continue;
      }

      clusters.push({
        memberUserIds: component,
        overlapScore: calculateAveragePairwiseOverlap(component, eligibleUsers)
      });
    }

    return clusters;
  }
}

export function calculateJaccardOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const entityId of left) {
    if (right.has(entityId)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;

  return union === 0 ? 0 : intersection / union;
}

function collectComponent(startUserId: string, adjacency: Map<string, Set<string>>): string[] {
  const queue = [startUserId];
  const component: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentUserId = queue.shift();

    if (!currentUserId || visited.has(currentUserId)) {
      continue;
    }

    visited.add(currentUserId);
    component.push(currentUserId);

    for (const neighborId of adjacency.get(currentUserId) ?? []) {
      if (!visited.has(neighborId)) {
        queue.push(neighborId);
      }
    }
  }

  return component;
}

function calculateAveragePairwiseOverlap(
  memberUserIds: string[],
  userEntitySets: UserEntitySet[]
): number {
  const entitySetByUserId = new Map(
    userEntitySets.map((entry) => [entry.userId, entry.entityIds] as const)
  );
  let totalOverlap = 0;
  let pairCount = 0;

  for (let leftIndex = 0; leftIndex < memberUserIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < memberUserIds.length; rightIndex += 1) {
      const leftUserId = memberUserIds[leftIndex];
      const rightUserId = memberUserIds[rightIndex];

      if (!leftUserId || !rightUserId) {
        continue;
      }

      const left = entitySetByUserId.get(leftUserId);
      const right = entitySetByUserId.get(rightUserId);

      if (!left || !right) {
        continue;
      }

      totalOverlap += calculateJaccardOverlap(left, right);
      pairCount += 1;
    }
  }

  return pairCount === 0 ? 0 : totalOverlap / pairCount;
}
