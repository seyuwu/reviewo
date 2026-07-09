import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "reflect-metadata";

import {
  assertCreated,
  assertOk,
  authHeaders,
  createTestApplication,
  provisionTestUser,
  readJson,
  type TestApplicationContext
} from "../../test/integration/test-app.harness.js";
import { PrismaService } from "../../database/prisma.service.js";

const shouldRunIntegrationTests = process.env.INTEGRATION_TESTS === "true";

describe("User tops endpoints", { skip: !shouldRunIntegrationTests }, () => {
  let context: TestApplicationContext;
  let accessToken = "";
  let userId = "";
  let entityIds: string[] = [];
  let categoryId = "";

  before(async () => {
    context = await createTestApplication();

    const prisma = context.app.get(PrismaService);
    const category = await prisma.topCategory.upsert({
      create: { slug: "ai", sortOrder: 1, title: "AI" },
      update: { sortOrder: 1, title: "AI" },
      where: { slug: "ai" }
    });
    categoryId = category.id;

    const user = await provisionTestUser(context.app, "tops");
    accessToken = user.accessToken;
    userId = user.userId;

    for (let index = 0; index < 3; index += 1) {
      const createEntityResponse = await fetch(`${context.baseUrl}/entities`, {
        body: JSON.stringify({
          description: `Entity ${index + 1}`,
          title: `Top Entity ${index + 1} ${Date.now()}`,
          type: "product"
        }),
        headers: {
          ...authHeaders(accessToken),
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const entity = await readJson<{ id: string }>(createEntityResponse);

      assertCreated(createEntityResponse);
      entityIds.push(entity.id);
    }
  });

  after(async () => {
    await context.close();
  });

  it("creates a top, replaces items, reads by slug, and reverse-lookup works", async () => {
    const slug = `best-tools-${Date.now()}`;
    const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        categoryId,
        description: "My curated list",
        slug,
        title: "Best Tools"
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const createdTop = await readJson<{ id: string; slug: string; itemCount: number }>(
      createTopResponse
    );

    assertCreated(createTopResponse);
    assert.equal(createdTop.slug, slug);
    assert.equal(createdTop.itemCount, 0);

    const replaceItemsResponse = await fetch(`${context.baseUrl}/tops/${createdTop.id}/items`, {
      body: JSON.stringify({
        items: entityIds.map((entityId, index) => ({
          entityId,
          note: index === 0 ? "Top pick" : null
        }))
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "PUT"
    });
    const topWithItems = await readJson<{ itemCount: number; items: Array<{ position: number }> }>(
      replaceItemsResponse
    );

    assert.equal(replaceItemsResponse.status, 200);
    assert.equal(topWithItems.itemCount, 3);
    assert.equal(topWithItems.items[0]?.position, 1);

    const getBySlugResponse = await fetch(`${context.baseUrl}/tops/${slug}`);
    const topBySlug = await readJson<{ slug: string; items: Array<{ note: string | null }> }>(
      getBySlugResponse
    );

    assert.equal(getBySlugResponse.status, 200);
    assert.equal(topBySlug.slug, slug);
    assert.equal(topBySlug.items[0]?.note, "Top pick");

    const reverseLookupResponse = await fetch(`${context.baseUrl}/entities/${entityIds[0]}/tops`);
    const reverseLookup = await readJson<{ items: Array<{ slug: string; position: number }> }>(
      reverseLookupResponse
    );

    assert.equal(reverseLookupResponse.status, 200);
    assert.ok(reverseLookup.items.some((item) => item.slug === slug && item.position === 1));

    const authorTopsResponse = await fetch(`${context.baseUrl}/users/${userId}/tops`);
    const authorTops = await readJson<{ items: Array<{ slug: string }> }>(authorTopsResponse);

    assert.equal(authorTopsResponse.status, 200);
    assert.ok(authorTops.items.some((item) => item.slug === slug));
  });

  it("rejects duplicate entities in one top", async () => {
    const slug = `dup-test-${Date.now()}`;
    const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        categoryId,
        slug,
        title: "Duplicate Test"
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const createdTop = await readJson<{ id: string }>(createTopResponse);

    assertCreated(createTopResponse);

    const replaceItemsResponse = await fetch(`${context.baseUrl}/tops/${createdTop.id}/items`, {
      body: JSON.stringify({
        items: [
          { entityId: entityIds[0] },
          { entityId: entityIds[0] },
          { entityId: entityIds[1] }
        ]
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "PUT"
    });

    assert.equal(replaceItemsResponse.status, 400);
  });

  it("forks a top, copies items, and lists forks", async () => {
    const slug = `fork-source-${Date.now()}`;
    const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        categoryId,
        description: "Source list",
        slug,
        title: "Fork Source Top"
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const sourceTop = await readJson<{ id: string; slug: string }>(createTopResponse);

    assertCreated(createTopResponse);

    await fetch(`${context.baseUrl}/tops/${sourceTop.id}/items`, {
      body: JSON.stringify({
        items: entityIds.map((entityId, index) => ({
          entityId,
          note: index === 0 ? "Original note" : null
        }))
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "PUT"
    });

    const forker = await provisionTestUser(context.app, "tops-forker");

    const forkResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/fork`, {
      headers: authHeaders(forker.accessToken),
      method: "POST"
    });
    const forkedTop = await readJson<{
      forkedFrom: { slug: string; title: string } | null;
      itemCount: number;
      items: Array<{ note: string | null }>;
      slug: string;
      title: string;
    }>(forkResponse);

    assertCreated(forkResponse);
    assert.ok(forkedTop.forkedFrom);
    assert.equal(forkedTop.forkedFrom?.slug, slug);
    assert.equal(forkedTop.itemCount, 3);
    assert.equal(forkedTop.items[0]?.note, "Original note");
    assert.match(forkedTop.title, /\(версия tops-forker\)$/);

    const ownForkResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/fork`, {
      headers: authHeaders(accessToken),
      method: "POST"
    });

    assert.equal(ownForkResponse.status, 400);

    const sourceBySlugResponse = await fetch(`${context.baseUrl}/tops/${slug}`);
    const sourceBySlug = await readJson<{ forksCount: number }>(sourceBySlugResponse);

    assert.equal(sourceBySlugResponse.status, 200);
    assert.equal(sourceBySlug.forksCount, 1);

    const forksListResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/forks`);
    const forksList = await readJson<{ items: Array<{ slug: string }> }>(forksListResponse);

    assert.equal(forksListResponse.status, 200);
    assert.equal(forksList.items.length, 1);
    assert.equal(forksList.items[0]?.slug, forkedTop.slug);

    const replaceSourceItemsResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/items`, {
      body: JSON.stringify({
        items: entityIds.slice(0, 3).map((entityId) => ({ entityId, note: "Changed" }))
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "PUT"
    });

    assert.equal(replaceSourceItemsResponse.status, 200);

    const forkBySlugResponse = await fetch(`${context.baseUrl}/tops/${forkedTop.slug}`);
    const forkBySlug = await readJson<{ items: Array<{ note: string | null }> }>(forkBySlugResponse);

    assert.equal(forkBySlugResponse.status, 200);
    assert.equal(forkBySlug.items[0]?.note, "Original note");
  });

  it("records engagement metrics for likes, views, and comments", async () => {
    const slug = `engagement-${Date.now()}`;
    const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        categoryId,
        slug,
        title: "Engagement Top"
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const sourceTop = await readJson<{ id: string; slug: string }>(createTopResponse);

    assertCreated(createTopResponse);

    await fetch(`${context.baseUrl}/tops/${sourceTop.id}/items`, {
      body: JSON.stringify({
        items: entityIds.map((entityId) => ({ entityId }))
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "PUT"
    });

    const voterHeaders = {
      "x-opinia-voter": "engagement-test-voter"
    };

    const firstViewResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/view`, {
      headers: voterHeaders,
      method: "POST"
    });
    const firstView = await readJson<{ recorded: boolean; viewsCount: number }>(firstViewResponse);

    assert.equal(firstViewResponse.status, 201);
    assert.equal(firstView.recorded, true);
    assert.equal(firstView.viewsCount, 1);

    const secondViewResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/view`, {
      headers: voterHeaders,
      method: "POST"
    });
    const secondView = await readJson<{ recorded: boolean; viewsCount: number }>(secondViewResponse);

    assert.equal(secondViewResponse.status, 201);
    assert.equal(secondView.recorded, false);
    assert.equal(secondView.viewsCount, 1);

    const liker = await provisionTestUser(context.app, "tops-liker");

    const ownLikeResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/like`, {
      headers: authHeaders(accessToken),
      method: "POST"
    });

    assert.equal(ownLikeResponse.status, 400);

    const likeResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/like`, {
      headers: authHeaders(liker.accessToken),
      method: "POST"
    });
    const likeResult = await readJson<{ likedByCurrentUser: boolean; likesCount: number }>(likeResponse);

    assert.equal(likeResponse.status, 201);
    assert.equal(likeResult.likedByCurrentUser, true);
    assert.equal(likeResult.likesCount, 1);

    const unlikeResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/like`, {
      headers: authHeaders(liker.accessToken),
      method: "POST"
    });
    const unlikeResult = await readJson<{ likedByCurrentUser: boolean; likesCount: number }>(unlikeResponse);

    assert.equal(unlikeResponse.status, 201);
    assert.equal(unlikeResult.likedByCurrentUser, false);
    assert.equal(unlikeResult.likesCount, 0);

    const commentResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/comments`, {
      body: JSON.stringify({ text: "Great list" }),
      headers: {
        ...authHeaders(liker.accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const comment = await readJson<{ id: string; text: string }>(commentResponse);

    assert.equal(commentResponse.status, 201);
    assert.equal(comment.text, "Great list");

    const commentsListResponse = await fetch(`${context.baseUrl}/tops/${sourceTop.id}/comments`);
    const commentsList = await readJson<{ items: Array<{ id: string }> }>(commentsListResponse);

    assert.equal(commentsListResponse.status, 200);
    assert.equal(commentsList.items.length, 1);

    const topBySlugResponse = await fetch(`${context.baseUrl}/tops/${slug}`, {
      headers: authHeaders(liker.accessToken)
    });
    const topBySlug = await readJson<{
      commentsCount: number;
      likesCount: number;
      viewsCount: number;
    }>(topBySlugResponse);

    assert.equal(topBySlugResponse.status, 200);
    assert.equal(topBySlug.viewsCount, 1);
    assert.equal(topBySlug.likesCount, 0);
    assert.equal(topBySlug.commentsCount, 1);
  });

  it("sorts category tops by likes when sort=popular", async () => {
    const popularSlug = `popular-a-${Date.now()}`;
    const lessPopularSlug = `popular-b-${Date.now()}`;

    for (const [slug, title] of [
      [popularSlug, "Popular A"],
      [lessPopularSlug, "Popular B"]
    ] as const) {
      const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
        body: JSON.stringify({
          categoryId,
          slug,
          title
        }),
        headers: {
          ...authHeaders(accessToken),
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const createdTop = await readJson<{ id: string }>(createTopResponse);

      assertCreated(createTopResponse);

      await fetch(`${context.baseUrl}/tops/${createdTop.id}/items`, {
        body: JSON.stringify({
          items: entityIds.map((entityId) => ({ entityId }))
        }),
        headers: {
          ...authHeaders(accessToken),
          "Content-Type": "application/json"
        },
        method: "PUT"
      });
    }

    const liker = await provisionTestUser(context.app, "tops-popular-liker");
    const popularTopResponse = await fetch(`${context.baseUrl}/tops/${popularSlug}`);
    const popularTop = await readJson<{ id: string }>(popularTopResponse);

    await fetch(`${context.baseUrl}/tops/${popularTop.id}/like`, {
      headers: authHeaders(liker.accessToken),
      method: "POST"
    });

    const categoryResponse = await fetch(`${context.baseUrl}/tops/category/ai?sort=popular&limit=20`);
    const categoryTops = await readJson<{ items: Array<{ slug: string }> }>(categoryResponse);

    assert.equal(categoryResponse.status, 200);
    assert.equal(categoryTops.items[0]?.slug, popularSlug);
  });

  it("computes HYBRID system positions on read and preserves author order on item replace", async () => {
    const prisma = context.app.get(PrismaService);
    const [lowRatedId, topRatedId, insufficientDataId] = entityIds;

    await prisma.ratingAggregate.upsert({
      create: {
        avgScore: 3,
        distribution1: 0,
        distribution2: 0,
        distribution3: 10,
        distribution4: 0,
        distribution5: 0,
        entityId: lowRatedId!,
        votesCount: 10
      },
      update: {
        avgScore: 3,
        votesCount: 10
      },
      where: { entityId: lowRatedId! }
    });
    await prisma.ratingAggregate.upsert({
      create: {
        avgScore: 5,
        distribution1: 0,
        distribution2: 0,
        distribution3: 0,
        distribution4: 0,
        distribution5: 10,
        entityId: topRatedId!,
        votesCount: 10
      },
      update: {
        avgScore: 5,
        votesCount: 10
      },
      where: { entityId: topRatedId! }
    });
    await prisma.ratingAggregate.upsert({
      create: {
        avgScore: 4,
        distribution1: 0,
        distribution2: 0,
        distribution3: 4,
        distribution4: 0,
        distribution5: 0,
        entityId: insufficientDataId!,
        votesCount: 2
      },
      update: {
        avgScore: 4,
        votesCount: 2
      },
      where: { entityId: insufficientDataId! }
    });

    const slug = `hybrid-top-${Date.now()}`;
    const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        categoryId,
        rankMode: "HYBRID",
        slug,
        systemSortKey: "RATING",
        title: "Hybrid Top"
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const createdTop = await readJson<{ id: string; rankMode: string; systemSortKey: string }>(
      createTopResponse
    );

    assertCreated(createTopResponse);
    assert.equal(createdTop.rankMode, "HYBRID");
    assert.equal(createdTop.systemSortKey, "RATING");

    const authorOrder = [lowRatedId, topRatedId, insufficientDataId];
    const replaceItemsResponse = await fetch(`${context.baseUrl}/tops/${createdTop.id}/items`, {
      body: JSON.stringify({
        items: authorOrder.map((entityId) => ({ entityId }))
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "PUT"
    });
    const replacedTop = await readJson<{
      items: Array<{
        entity: { id: string };
        position: number;
        positionDelta?: number;
        systemPosition?: number;
        systemPositionStatus?: string;
      }>;
    }>(replaceItemsResponse);

    assert.equal(replaceItemsResponse.status, 200);
    assert.equal(replacedTop.items[0]?.position, 1);
    assert.equal(replacedTop.items[0]?.entity.id, lowRatedId);
    assert.equal(replacedTop.items[0]?.systemPosition, 2);
    assert.equal(replacedTop.items[0]?.positionDelta, -1);
    assert.equal(replacedTop.items[1]?.systemPosition, 1);
    assert.equal(replacedTop.items[2]?.systemPositionStatus, "insufficient_data");

    const getBySlugResponse = await fetch(`${context.baseUrl}/tops/${slug}`);
    const topBySlug = await readJson<{
      items: Array<{
        entity: { id: string };
        position: number;
        systemPosition?: number;
        systemPositionStatus?: string;
      }>;
    }>(getBySlugResponse);

    assert.equal(getBySlugResponse.status, 200);
    assert.equal(topBySlug.items[0]?.entity.id, lowRatedId);
    assert.equal(topBySlug.items[0]?.systemPosition, 2);
    assert.equal(topBySlug.items[1]?.systemPosition, 1);
    assert.equal(topBySlug.items[2]?.systemPositionStatus, "insufficient_data");
  });

  it("sorts SYSTEM tops by Opinia on read regardless of stored item order", async () => {
    const prisma = context.app.get(PrismaService);
    const [lowRatedId, topRatedId, insufficientDataId] = entityIds;

    await prisma.ratingAggregate.upsert({
      create: {
        avgScore: 3,
        distribution1: 0,
        distribution2: 0,
        distribution3: 10,
        distribution4: 0,
        distribution5: 0,
        entityId: lowRatedId!,
        votesCount: 10
      },
      update: {
        avgScore: 3,
        votesCount: 10
      },
      where: { entityId: lowRatedId! }
    });
    await prisma.ratingAggregate.upsert({
      create: {
        avgScore: 5,
        distribution1: 0,
        distribution2: 0,
        distribution3: 0,
        distribution4: 0,
        distribution5: 10,
        entityId: topRatedId!,
        votesCount: 10
      },
      update: {
        avgScore: 5,
        votesCount: 10
      },
      where: { entityId: topRatedId! }
    });
    await prisma.ratingAggregate.upsert({
      create: {
        avgScore: 4,
        distribution1: 0,
        distribution2: 0,
        distribution3: 4,
        distribution4: 0,
        distribution5: 0,
        entityId: insufficientDataId!,
        votesCount: 2
      },
      update: {
        avgScore: 4,
        votesCount: 2
      },
      where: { entityId: insufficientDataId! }
    });

    const slug = `system-top-${Date.now()}`;
    const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        categoryId,
        rankMode: "SYSTEM",
        slug,
        systemSortKey: "RATING",
        title: "System Top"
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const createdTop = await readJson<{ id: string; rankMode: string; systemSortKey: string }>(
      createTopResponse
    );

    assertCreated(createTopResponse);
    assert.equal(createdTop.rankMode, "SYSTEM");
    assert.equal(createdTop.systemSortKey, "RATING");

    const wrongOrder = [lowRatedId, topRatedId, insufficientDataId];
    const replaceItemsResponse = await fetch(`${context.baseUrl}/tops/${createdTop.id}/items`, {
      body: JSON.stringify({
        items: wrongOrder.map((entityId) => ({ entityId }))
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "PUT"
    });
    const replacedTop = await readJson<{
      items: Array<{
        entity: { id: string };
        position: number;
        systemPosition?: number;
        systemPositionStatus?: string;
      }>;
    }>(replaceItemsResponse);

    assert.equal(replaceItemsResponse.status, 200);
    assert.equal(replacedTop.items[0]?.entity.id, topRatedId);
    assert.equal(replacedTop.items[0]?.position, 1);
    assert.equal(replacedTop.items[0]?.systemPosition, 1);
    assert.equal(replacedTop.items[1]?.entity.id, lowRatedId);
    assert.equal(replacedTop.items[1]?.position, 2);
    assert.equal(replacedTop.items[1]?.systemPosition, 2);
    assert.equal(replacedTop.items[2]?.entity.id, insufficientDataId);
    assert.equal(replacedTop.items[2]?.systemPositionStatus, "insufficient_data");

    const getBySlugResponse = await fetch(`${context.baseUrl}/tops/${slug}`);
    const topBySlug = await readJson<{
      items: Array<{
        entity: { id: string };
        position: number;
        systemPosition?: number;
        systemPositionStatus?: string;
      }>;
    }>(getBySlugResponse);

    assert.equal(getBySlugResponse.status, 200);
    assert.equal(topBySlug.items[0]?.entity.id, topRatedId);
    assert.equal(topBySlug.items[1]?.entity.id, lowRatedId);
    assert.equal(topBySlug.items[2]?.entity.id, insufficientDataId);
    assert.equal(topBySlug.items[2]?.systemPositionStatus, "insufficient_data");
  });
});
