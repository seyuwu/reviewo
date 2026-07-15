import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Entity } from "#prisma/client";

import type { RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { AuthService } from "../../auth/services/auth.service.js";
import type { EntitiesRepository } from "../../entities/repositories/entities.repository.js";
import type { UsersRepository } from "../../users/repositories/users.repository.js";
import type { FriendshipsService } from "../../social/services/friendships.service.js";
import type { EntityAttributesRepository } from "../repositories/entity-attributes.repository.js";
import type { EntityQualityConfirmationsRepository } from "../repositories/entity-quality-confirmations.repository.js";
import { DotaProfileService } from "./dota-profile.service.js";

const owner: AuthenticatedUser = {
  avatarUrl: null,
  displayName: "Fivii",
  email: "fivii@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  role: "USER",
  status: "active",
  username: "fivii"
};

const friend: AuthenticatedUser = {
  avatarUrl: null,
  displayName: "Friend",
  email: "friend@example.com",
  id: "22222222-2222-4222-8222-222222222222",
  role: "USER",
  status: "active",
  username: "friend"
};

const entity: Entity = {
  canonicalUrl: null,
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
  createdBy: owner.id,
  description: null,
  id: "33333333-3333-4333-8333-333333333333",
  logoUrl: null,
  ownerUserId: owner.id,
  parentId: null,
  slug: "fivii",
  title: "Fivii",
  type: "person",
  updatedAt: new Date("2026-07-13T00:00:00.000Z"),
  visibility: "ACTIVE"
};

const request = {
  headers: {
    "user-agent": "node-test"
  },
  ip: "127.0.0.1"
} as RequestLike;

function createService(overrides?: {
  attributes?: Record<string, string>;
  distinctConfirmers?: number;
  qualities?: Record<string, number>;
}) {
  const attributes = {
    dota_account_id: "123456789",
    vertical: "dota",
    ...(overrides?.attributes ?? {})
  };

  const entitiesRepository = {
    create: async () => entity,
    findById: async () => entity,
    findByOwnerUserId: async (userId: string) => (userId === owner.id ? entity : null),
    findBySlug: async (slug: string) => (slug === entity.slug ? entity : null),
    isUniqueConstraintError: () => false,
    updateTitle: async (_id: string, title: string) => ({ ...entity, title })
  } as unknown as EntitiesRepository;

  const entityAttributesRepository = {
    findByEntityId: async () => attributes,
    findEntityIdByDotaAccountId: async () => entity.id,
    isUniqueConstraintError: () => false,
    upsertMany: async () => undefined
  } as unknown as EntityAttributesRepository;

  const entityQualityConfirmationsRepository = {
    countByQualityKey: async () => overrides?.qualities ?? {},
    countDistinctConfirmers: async () => overrides?.distinctConfirmers ?? 0,
    deleteConfirmation: async () => undefined,
    hasConfirmerForEntity: async () => false,
    listConfirmerQualityKeys: async () => [],
    upsertConfirmations: async () => undefined
  } as unknown as EntityQualityConfirmationsRepository;

  const usersRepository = {
    findById: async () => ({
      displayName: owner.displayName,
      username: owner.username
    })
  } as unknown as UsersRepository;

  const friendshipsService = {
    getStatusBetween: async (viewerUserId?: string, otherUserId?: string | null) => {
      if (!otherUserId) {
        return null;
      }

      if (!viewerUserId) {
        return "none";
      }

      if (viewerUserId === otherUserId) {
        return "self";
      }

      return "none";
    },
    getStatusDetails: async (viewerUserId?: string, otherUserId?: string | null) => {
      if (!otherUserId) {
        return { requestId: null, status: null };
      }

      if (!viewerUserId) {
        return { requestId: null, status: "none" as const };
      }

      if (viewerUserId === otherUserId) {
        return { requestId: null, status: "self" as const };
      }

      return { requestId: null, status: "none" as const };
    }
  } as unknown as FriendshipsService;

  const authService = {} as unknown as AuthService;

  return new DotaProfileService(
    authService,
    entitiesRepository,
    entityAttributesRepository,
    entityQualityConfirmationsRepository,
    friendshipsService,
    {} as never,
    usersRepository
  );
}

describe("DotaProfileService", () => {
  it("returns public profile with progress milestone", async () => {
    const service = createService({ distinctConfirmers: 1, qualities: { chill: 1 } });
    const profile = await service.getPublicProfileBySlug("fivii");

    assert.equal(profile.slug, "fivii");
    assert.equal(profile.progress.current, 1);
    assert.equal(profile.progress.target, 3);
    assert.equal(profile.qualities.chill, 1);
  });

  it("blocks self-confirmation for profile owner", async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.confirmQualities(
          "fivii",
          { qualityKeys: ["chill"], visitorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
          request,
          owner
        ),
      /cannot confirm your own profile/i
    );
  });

  it("accepts anonymous confirmation from another visitor", async () => {
    const service = createService({ distinctConfirmers: 1, qualities: { chill: 1 } });
    const profile = await service.confirmQualities(
      "fivii",
      { qualityKeys: ["chill", "has_mic"], visitorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      request
    );

    assert.equal(profile.slug, "fivii");
    assert.equal(profile.isOwner, false);
  });

  it("marks profile as owner for authenticated viewer", async () => {
    const service = createService();
    const profile = await service.getPublicProfileBySlug("fivii", owner.id);

    assert.equal(profile.isOwner, true);
  });
});

