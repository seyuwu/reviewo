import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Entity } from "#prisma/client";

import type { RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { DotaSearchHistoryService } from "../../analytics/services/dota-search-history.service.js";
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

const _friend: AuthenticatedUser = {
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
  hasProfile?: boolean;
  lookingAttributes?: Record<string, string>;
  onPersist?: (attributes: Record<string, string>) => void;
  onSearchStart?: (input: { expiresAt: Date; source: "telegram" | "web" }) => void;
  onSearchStop?: () => void;
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
    findByOwnerUserId: async (userId: string) =>
      userId === owner.id && overrides?.hasProfile !== false ? entity : null,
    findBySlug: async (slug: string) => (slug === entity.slug ? entity : null),
    isUniqueConstraintError: () => false,
    updateTitle: async (_id: string, title: string) => ({ ...entity, title })
  } as unknown as EntitiesRepository;

  const entityAttributesRepository = {
    findByEntityId: async () => attributes,
    findEntityIdByDotaAccountId: async () => entity.id,
    isUniqueConstraintError: () => false,
    listLookingDotaProfiles: async () => [
      {
        ...entity,
        attributes: Object.entries({ ...attributes, ...overrides?.lookingAttributes }).map(
          ([key, value]) => ({ key, value })
        )
      }
    ],
    upsertMany: async (_entityId: string, next: Record<string, string>) => {
      Object.assign(attributes, next);
      overrides?.onPersist?.(next);
    },
    upsertManyWithDotaMatchLock: async (
      _userId: string,
      _entityId: string,
      next: Record<string, string>
    ) => {
      Object.assign(attributes, next);
      overrides?.onPersist?.(next);
      return true;
    }
  } as unknown as EntityAttributesRepository;

  const entityQualityConfirmationsRepository = {
    countByQualityKey: async () => overrides?.qualities ?? {},
    countByQualityKeyForEntities: async () => ({}),
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
    }),
    updateDisplayName: async (_id: string, displayName: string) => ({
      displayName,
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
  const dotaSearchHistoryService = {
    startSoloSearch: overrides?.onSearchStart ?? (() => undefined),
    startPartyRecruitSearch: overrides?.onSearchStart ?? (() => undefined),
    finishSoloSearch: overrides?.onSearchStop ?? (() => undefined),
    stopPartyRecruitSearch: overrides?.onSearchStop ?? (() => undefined)
  } as unknown as DotaSearchHistoryService;

  return new DotaProfileService(
    authService,
    dotaSearchHistoryService,
    entitiesRepository,
    entityAttributesRepository,
    entityQualityConfirmationsRepository,
    friendshipsService,
    {
      listBlockedPartySlugsForUser: async () => [],
      findByVerticalAndSlug: async () => ({
        id: "44444444-4444-4444-8444-444444444444",
        ownerUserId: owner.id,
        slug: "website-party",
        name: "Website party",
        kind: "PARTY",
        joinMode: "OPEN",
        maxMembers: 5,
        expiresAt: new Date(Date.now() + 60_000),
        members: [{ userId: owner.id, positionRole: "3" }]
      })
    } as never,
    { broadcastPartyRecruitUpdated: () => undefined } as never,
    usersRepository
  );
}

describe("DotaProfileService", () => {
  it("keeps Telegram solo and party searches active for 30 minutes, with matching analytics deadlines", async () => {
    for (const source of [undefined, "telegram", "web"] as const) {
      for (const partySlug of [undefined, "website-party"]) {
        let deadline = "";
        let historyDeadline = "";
        let stopped = false;
        const service = createService({
          onPersist: (attributes) => {
            deadline = attributes.lfg_until ?? "";
          },
          onSearchStart: (input) => {
            historyDeadline = input.expiresAt.toISOString();
            assert.equal(input.source, source ?? "telegram");
          },
          onSearchStop: () => {
            stopped = true;
          }
        });
        const before = Date.now();
        const options = { ...(source ? { source } : {}), ...(partySlug ? { partySlug } : {}) };
        const profile = await service.setLooking(true, owner, options);
        const after = Date.now();
        const duration = (source === "web" ? 20 : 30) * 60 * 1000;
        assert.ok(Date.parse(deadline) >= before + duration);
        assert.ok(Date.parse(deadline) <= after + duration);
        assert.equal(historyDeadline, deadline);
        assert.equal(profile.looking, true);
        const stoppedProfile = await service.setLooking(false, owner, options);
        assert.equal(deadline, new Date(0).toISOString());
        assert.equal(stoppedProfile.looking, false);
        assert.equal(stopped, true);
      }
    }
  });

  it("stores EU for new profiles even when the client omits region or sends a legacy region", async () => {
    for (const server of [undefined, "RU"]) {
      let persisted: Record<string, string> = {};
      const service = createService({
        hasProfile: false,
        onPersist: (attributes) => {
          persisted = attributes;
        }
      });
      const profile = await service.createProfile(
        {
          dotaAccountId: "123456789",
          mmr: "3500",
          roles: ["1"],
          ...(server ? { server } : {})
        },
        owner
      );

      assert.equal(profile.server, "EU");
      assert.equal(persisted.server, "EU");
      assert.equal(persisted.mmr, "3500");
      assert.deepEqual(profile.roles, ["1"]);
    }
  });

  it("normalizes legacy profiles on read and profile updates without changing roles or MMR", async () => {
    for (const legacyServer of [undefined, "SEA"]) {
      let persisted: Record<string, string> = {};
      const service = createService({
        attributes: {
          mmr: "4256",
          roles: '["1","2"]',
          ...(legacyServer ? { server: legacyServer } : {})
        },
        onPersist: (attributes) => {
          persisted = attributes;
        }
      });

      assert.equal((await service.getMyProfile(owner)).server, "EU");
      const profile = await service.updateMyProfile({ server: "RU" }, owner);
      assert.equal(profile.server, "EU");
      assert.equal(persisted.server, "EU");
      assert.equal(profile.mmr, "4256");
      assert.deepEqual(profile.roles, ["1", "2"]);
    }
  });

  it("includes website recruiting parties without a region in the bot's EU search", async () => {
    const service = createService({
      attributes: { mmr: "3500", roles: '["3"]' },
      lookingAttributes: {
        lfg_until: new Date(Date.now() + 60_000).toISOString(),
        lfg_party_slug: "website-party",
        lfg_recruited_roles: "1,2"
      }
    });

    for (const server of ["EU", "RU"]) {
      const feed = await service.listLookingPlayers({
        roles: ["1"],
        server,
        viewerUserId: owner.id
      });
      assert.equal(feed.results.length, 1);
      assert.equal(feed.results[0]?.partySlug, "website-party");
      assert.equal(feed.results[0]?.server, "EU");
      assert.deepEqual(feed.results[0]?.recruitedRoles, ["1", "2"]);
      assert.equal(feed.results[0]?.joinMode, "OPEN");
    }

    const incompatibleRoles = await service.listLookingPlayers({ roles: ["4"], server: "EU" });
    assert.equal(incompatibleRoles.results.length, 0);
  });

  it("returns public profile with progress milestone", async () => {
    const service = createService({ distinctConfirmers: 1, qualities: { play_again: 1 } });
    const profile = await service.getPublicProfileBySlug("fivii");

    assert.equal(profile.slug, "fivii");
    assert.equal(profile.progress.current, 1);
    assert.equal(profile.progress.target, 3);
    assert.equal(profile.qualities.play_again, 1);
  });

  it("blocks self-confirmation for profile owner", async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.confirmQualities(
          "fivii",
          { qualityKeys: ["play_again"], visitorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
          request,
          owner
        ),
      /cannot confirm your own profile/i
    );
  });

  it("accepts anonymous confirmation from another visitor", async () => {
    const service = createService({ distinctConfirmers: 1, qualities: { play_again: 1 } });
    const profile = await service.confirmQualities(
      "fivii",
      { qualityKeys: ["play_again", "has_mic"], visitorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
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
