import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "reflect-metadata";

import {
  assertCreated,
  assertOk,
  authHeaders,
  createTestApplication,
  createTestEntity,
  promoteUserToAdmin,
  provisionTestUser,
  readJson,
  seedDuplicateEntityPair,
  type TestApplicationContext
} from "../../test/integration/test-app.harness.js";

const shouldRunIntegrationTests = process.env.INTEGRATION_TESTS === "true";

describe("Community contributions endpoints", { skip: !shouldRunIntegrationTests }, () => {
  let context: TestApplicationContext;
  let author: { accessToken: string; userId: string };
  let admin: { accessToken: string; userId: string };

  before(async () => {
    context = await createTestApplication();
    author = await provisionTestUser(context.app, "Contribution Author");
    admin = await provisionTestUser(context.app, "Contribution Admin");
    await promoteUserToAdmin(context.app, admin.userId);
  });

  after(async () => {
    await context.close();
  });

  it("applies UPDATE_DESCRIPTION when admin resolves the contribution", async () => {
    const entity = await createTestEntity(context.baseUrl, author.accessToken, {
      description: "Original description",
      title: `Contribution Entity ${Date.now()}`
    });
    const nextDescription = "Admin approved description";

    const createContributionResponse = await fetch(
      `${context.baseUrl}/entities/${entity.id}/contributions`,
      {
        body: JSON.stringify({
          payload: {
            newValue: nextDescription,
            oldValue: "Original description"
          },
          type: "UPDATE_DESCRIPTION"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const contribution = await readJson<{ id: string; status: string; tier: string }>(
      createContributionResponse
    );

    assertCreated(createContributionResponse);
    assert.equal(contribution.status, "PENDING");
    assert.equal(contribution.tier, "MODERATION");

    const resolveResponse = await fetch(
      `${context.baseUrl}/admin/contributions/${contribution.id}/resolve`,
      {
        body: JSON.stringify({ action: "apply" }),
        headers: authHeaders(admin.accessToken),
        method: "POST"
      }
    );
    const resolvedContribution = await readJson<{ status: string }>(resolveResponse);

    assertOk(resolveResponse);
    assert.equal(resolvedContribution.status, "APPLIED");

    const entityResponse = await fetch(`${context.baseUrl}/entities/${entity.id}`);
    const entityBody = await readJson<{ description: string | null }>(entityResponse);

    assert.equal(entityResponse.status, 200);
    assert.equal(entityBody.description, nextDescription);
  });

  it("returns duplicate suggestions for similar entities", async () => {
    const { sourceId } = await seedDuplicateEntityPair(context.app, author.userId);

    const suggestionsResponse = await fetch(
      `${context.baseUrl}/entities/${sourceId}/duplicate-suggestions`
    );
    const suggestions = await readJson<{
      items: Array<{ entity: { id: string }; matchPercent: number }>;
    }>(suggestionsResponse);

    assert.equal(suggestionsResponse.status, 200);
    assert.ok(suggestions.items.length > 0);
    const firstSuggestion = suggestions.items[0];
    assert.ok(firstSuggestion);
    assert.ok(firstSuggestion.matchPercent >= 70);
    assert.notEqual(firstSuggestion.entity.id, sourceId);
  });

  it("repoints top items when MERGE_ENTITY is applied by admin", async () => {
    const entityA = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Merge Source ${Date.now()}`
    });
    const entityB = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Merge Target ${Date.now()}`
    });
    const entityC = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Merge Extra ${Date.now()}`
    });

    const slug = `merge-top-${Date.now()}`;
    const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        slug,
        title: "Merge Top Test"
      }),
      headers: authHeaders(author.accessToken),
      method: "POST"
    });
    const createdTop = await readJson<{ id: string; slug: string }>(createTopResponse);

    assertCreated(createTopResponse);

    const replaceItemsResponse = await fetch(`${context.baseUrl}/tops/${createdTop.id}/items`, {
      body: JSON.stringify({
        items: [
          { entityId: entityA.id },
          { entityId: entityB.id },
          { entityId: entityC.id }
        ]
      }),
      headers: authHeaders(author.accessToken),
      method: "PUT"
    });

    assert.equal(replaceItemsResponse.status, 200);

    const createMergeResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/contributions`,
      {
        body: JSON.stringify({
          payload: {
            reason: "Same entity",
            sourceEntityId: entityA.id,
            targetEntityId: entityB.id
          },
          type: "MERGE_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const mergeContribution = await readJson<{ id: string; status: string; tier: string }>(
      createMergeResponse
    );

    assertCreated(createMergeResponse);
    assert.equal(mergeContribution.tier, "MODERATION");
    assert.equal(mergeContribution.status, "PENDING");

    const resolveResponse = await fetch(
      `${context.baseUrl}/admin/contributions/${mergeContribution.id}/resolve`,
      {
        body: JSON.stringify({ action: "apply" }),
        headers: authHeaders(admin.accessToken),
        method: "POST"
      }
    );
    const resolvedContribution = await readJson<{ status: string }>(resolveResponse);

    assertOk(resolveResponse);
    assert.equal(resolvedContribution.status, "APPLIED");

    const topBySlugResponse = await fetch(`${context.baseUrl}/tops/${createdTop.slug}`);
    const topBySlug = await readJson<{
      items: Array<{ entity: { id: string }; position: number }>;
    }>(topBySlugResponse);

    assert.equal(topBySlugResponse.status, 200);
    assert.equal(topBySlug.items.length, 2);
    assert.ok(topBySlug.items.every((item) => item.entity.id !== entityA.id));
    assert.ok(topBySlug.items.some((item) => item.entity.id === entityB.id && item.position === 2));
    assert.ok(topBySlug.items.some((item) => item.entity.id === entityC.id));

    const reverseLookupResponse = await fetch(`${context.baseUrl}/entities/${entityB.id}/tops`);
    const reverseLookup = await readJson<{ items: Array<{ slug: string }> }>(reverseLookupResponse);

    assert.equal(reverseLookupResponse.status, 200);
    assert.ok(reverseLookup.items.some((item) => item.slug === createdTop.slug));

    const sourceReverseLookupResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/tops`
    );

    assert.equal(sourceReverseLookupResponse.status, 404);
  });
});
