import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { EntityChatRepository } from "../repositories/entity-chat.repository.js";
import { ChatRateLimiterService } from "./chat-rate-limiter.service.js";
import { EntityChatService } from "./entity-chat.service.js";
import type { PresenceService } from "./presence.service.js";

const entityId = "22222222-2222-4222-8222-222222222222";
const currentUser: AuthenticatedUser = {
  displayName: "Tester",
  email: "tester@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  role: "USER",
  status: "active",
  username: null
};

describe("EntityChatService", () => {
  it("returns latest messages in chronological order with cursor", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      createdAt: new Date(Date.UTC(2026, 5, 28, 12, 0, 0) + index * 1000),
      entityId,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      isHidden: false,
      hiddenReason: null,
      locale: "ru",
      message: `message-${index}`,
      user: { displayName: `User ${index}` },
      userId: currentUser.id
    })).reverse();

    const service = createService({
      listMessagesWithAuthors: async () => rows
    });

    const page = await service.listMessages(entityId);

    assert.equal(page.messages.length, 100);
    assert.equal(page.messages[0]?.message, "message-0");
    assert.equal(page.messages[99]?.message, "message-99");
    assert.equal(page.nextCursor, rows.at(-1)?.id ?? null);
  });

  it("creates a message after rate limit check", async () => {
    const createdAt = new Date("2026-06-28T12:00:00.000Z");
    const service = createService({
      createMessage: async () => ({
        createdAt,
        entityId,
        id: "66666666-6666-4666-8666-666666666666",
        isHidden: false,
        hiddenReason: null,
        locale: "ru",
        message: "hello chat",
        userId: currentUser.id
      })
    });

    const message = await service.sendMessage(entityId, " hello chat ", currentUser);

    assert.equal(message.message, "hello chat");
    assert.equal(message.displayName, currentUser.displayName);
  });

  it("ranks active now items using message and participant counts", async () => {
    const service = createService({
      findActiveNowAggregates: async () => [
        {
          entityId,
          entitySlug: "github",
          entityTitle: "GitHub",
          lastMessageAt: new Date("2026-06-28T12:00:00.000Z"),
          messageCount: 12n,
          participantCount: 4n,
          previewMessage: "Actions are down"
        }
      ],
      getOnlineCount: async () => 7
    });

    const activeNow = await service.getActiveNow(5);

    assert.equal(activeNow.items.length, 1);
    assert.equal(activeNow.items[0]?.entityTitle, "GitHub");
    assert.equal(activeNow.items[0]?.score, 28);
    assert.equal(activeNow.items[0]?.onlineCount, 7);
  });
});

describe("ChatRateLimiterService", () => {
  it("uses a longer cooldown for low-trust users", async () => {
    const storedTtl: { seconds?: number } = {};
    const service = new ChatRateLimiterService(
      {
        userTrustProfile: {
          findUnique: async () => ({
            trustScore: 0.1
          })
        }
      } as never,
      {
        getClient: async () => ({
          get: async () => null,
          set: async (_key: string, _value: string, options: { EX: number }) => {
            storedTtl.seconds = options.EX;
          },
          ttl: async () => 30
        })
      } as never
    );

    await service.assertCanSendMessage(currentUser.id);

    assert.equal(storedTtl.seconds, 30);
  });

  it("returns remaining cooldown seconds when rate limited", async () => {
    const service = new ChatRateLimiterService(
      {
        userTrustProfile: {
          findUnique: async () => ({
            trustScore: 0.9
          })
        }
      } as never,
      {
        getClient: async () => ({
          get: async () => "1",
          set: async () => undefined,
          ttl: async () => 2
        })
      } as never
    );

    await assert.rejects(
      () => service.assertCanSendMessage(currentUser.id),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /wait/i);

        return true;
      }
    );
  });
});

function createService(overrides: {
  createMessage?: EntityChatRepository["createMessage"];
  findActiveNowAggregates?: EntityChatRepository["findActiveNowAggregates"];
  getOnlineCount?: PresenceService["getOnlineCount"];
  listMessagesWithAuthors?: EntityChatRepository["listMessagesWithAuthors"];
}): EntityChatService {
  const entitiesPort: EntitiesPort = {
    ensureEntityForUrl: async () => {
      throw new Error("not used");
    },
    findEntityById: async () => ({
      canonicalUrl: "https://example.com",
      createdAt: "2026-06-28T00:00:00.000Z",
      createdBy: null,
      description: null,
      logoUrl: null,
      id: entityId,
      parentId: null,
      slug: "example",
      title: "Example",
      type: "website",
      updatedAt: "2026-06-28T00:00:00.000Z",
      visibility: "ACTIVE"
    }),
    findEntityBySlug: async () => null,
    hideEntity: async () => {
      throw new Error("not used");
    },
    listChildEntities: async () => [],
    resolveEntityByUrl: async () => ({
      canonicalUrl: "https://example.com",
      entity: null,
      inputUrl: "https://example.com",
      resolution: "not_found"
    }),
    searchEntities: async () => [],
    searchEntitiesRanked: async () => [],
    unhideEntity: async () => {
      throw new Error("not used");
    }
  };

  const repository = {
    cleanupOldMessages: async () => ({ deletedByAge: 0, trimmedByEntity: 0 }),
    createMessage: overrides.createMessage ?? (async () => {
      throw new Error("not implemented");
    }),
    findActiveNowAggregates:
      overrides.findActiveNowAggregates ??
      (async () => []),
    listMessagesWithAuthors:
      overrides.listMessagesWithAuthors ??
      (async () => [])
  } as unknown as EntityChatRepository;

  const presenceService = {
    getOnlineCount: overrides.getOnlineCount ?? (async () => 0),
    markOffline: async () => 0,
    markOnline: async () => 1
  } as unknown as PresenceService;

  const chatRateLimiterService = {
    assertCanSendMessage: async () => undefined
  } as unknown as ChatRateLimiterService;

  return new EntityChatService(
    entitiesPort,
    repository,
    presenceService,
    chatRateLimiterService,
    { publish: async () => undefined } as never
  );
}
