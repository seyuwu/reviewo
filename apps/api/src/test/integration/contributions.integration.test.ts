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

    assert.equal(topBySlugResponse.status, 404);

    const reverseLookupResponse = await fetch(`${context.baseUrl}/entities/${entityB.id}/tops`);
    const reverseLookup = await readJson<{ items: Array<{ slug: string }> }>(reverseLookupResponse);

    assert.equal(reverseLookupResponse.status, 200);
    assert.equal(reverseLookup.items.length, 0);

    const sourceReverseLookupResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/tops`
    );

    assert.equal(sourceReverseLookupResponse.status, 404);
  });

  it("applies LINK_ENTITY when admin resolves the contribution and exposes related presences", async () => {
    const entityA = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Link Source ${Date.now()}`
    });
    const entityB = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Link Target ${Date.now()}`
    });

    const createLinkResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/contributions`,
      {
        body: JSON.stringify({
          payload: {
            reason: "Same subject",
            relatedEntityId: entityB.id
          },
          type: "LINK_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const linkContribution = await readJson<{ id: string; status: string; tier: string }>(
      createLinkResponse
    );

    assertCreated(createLinkResponse);
    assert.equal(linkContribution.tier, "MODERATION");
    assert.equal(linkContribution.status, "PENDING");

    const resolveResponse = await fetch(
      `${context.baseUrl}/admin/contributions/${linkContribution.id}/resolve`,
      {
        body: JSON.stringify({ action: "apply" }),
        headers: authHeaders(admin.accessToken),
        method: "POST"
      }
    );
    const resolvedContribution = await readJson<{ status: string }>(resolveResponse);

    assertOk(resolveResponse);
    assert.equal(resolvedContribution.status, "APPLIED");

    const relatedPresencesResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/related-presences`
    );
    const relatedPresences = await readJson<{
      items: Array<{ id: string; title: string }>;
    }>(relatedPresencesResponse);

    assert.equal(relatedPresencesResponse.status, 200);
    assert.equal(relatedPresences.items.length, 1);
    assert.equal(relatedPresences.items[0]?.id, entityB.id);

    const pageResponse = await fetch(`${context.baseUrl}/entities/${entityB.id}/page`);
    const pageBody = await readJson<{
      relatedPresences: Array<{ id: string }>;
    }>(pageResponse);

    assert.equal(pageResponse.status, 200);
    assert.equal(pageBody.relatedPresences.length, 1);
    assert.equal(pageBody.relatedPresences[0]?.id, entityA.id);
  });

  it("keeps cluster membership on target when MERGE_ENTITY is applied", async () => {
    const entityA = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Cluster Merge Source ${Date.now()}`
    });
    const entityB = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Cluster Merge Target ${Date.now()}`
    });
    const entityC = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Cluster Merge Extra ${Date.now()}`
    });

    const createFirstLinkResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/contributions`,
      {
        body: JSON.stringify({
          payload: { relatedEntityId: entityB.id },
          type: "LINK_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const firstLinkContribution = await readJson<{ id: string }>(createFirstLinkResponse);

    assertCreated(createFirstLinkResponse);

    await fetch(`${context.baseUrl}/admin/contributions/${firstLinkContribution.id}/resolve`, {
      body: JSON.stringify({ action: "apply" }),
      headers: authHeaders(admin.accessToken),
      method: "POST"
    });

    const createSecondLinkResponse = await fetch(
      `${context.baseUrl}/entities/${entityB.id}/contributions`,
      {
        body: JSON.stringify({
          payload: { relatedEntityId: entityC.id },
          type: "LINK_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const secondLinkContribution = await readJson<{ id: string }>(createSecondLinkResponse);

    assertCreated(createSecondLinkResponse);

    await fetch(`${context.baseUrl}/admin/contributions/${secondLinkContribution.id}/resolve`, {
      body: JSON.stringify({ action: "apply" }),
      headers: authHeaders(admin.accessToken),
      method: "POST"
    });

    const createMergeResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/contributions`,
      {
        body: JSON.stringify({
          payload: {
            sourceEntityId: entityA.id,
            targetEntityId: entityB.id
          },
          type: "MERGE_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const mergeContribution = await readJson<{ id: string }>(createMergeResponse);

    assertCreated(createMergeResponse);

    const resolveMergeResponse = await fetch(
      `${context.baseUrl}/admin/contributions/${mergeContribution.id}/resolve`,
      {
        body: JSON.stringify({ action: "apply" }),
        headers: authHeaders(admin.accessToken),
        method: "POST"
      }
    );

    assertOk(resolveMergeResponse);

    const relatedPresencesResponse = await fetch(
      `${context.baseUrl}/entities/${entityB.id}/related-presences`
    );
    const relatedPresences = await readJson<{
      items: Array<{ id: string }>;
    }>(relatedPresencesResponse);

    assert.equal(relatedPresencesResponse.status, 200);
    assert.equal(relatedPresences.items.length, 1);
    assert.equal(relatedPresences.items[0]?.id, entityC.id);

    const sourceRelatedResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/related-presences`
    );

    assert.equal(sourceRelatedResponse.status, 404);
  });

  it("rejects LINK_ENTITY when entities are already linked", async () => {
    const entityA = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Already Linked A ${Date.now()}`
    });
    const entityB = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Already Linked B ${Date.now()}`
    });

    const createLinkResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/contributions`,
      {
        body: JSON.stringify({
          payload: { relatedEntityId: entityB.id },
          type: "LINK_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const linkContribution = await readJson<{ id: string }>(createLinkResponse);

    assertCreated(createLinkResponse);

    await fetch(`${context.baseUrl}/admin/contributions/${linkContribution.id}/resolve`, {
      body: JSON.stringify({ action: "apply" }),
      headers: authHeaders(admin.accessToken),
      method: "POST"
    });

    const duplicateLinkResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/contributions`,
      {
        body: JSON.stringify({
          payload: { relatedEntityId: entityB.id },
          type: "LINK_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );

    assert.equal(duplicateLinkResponse.status, 409);
  });

  it("applies UNLINK_ENTITY when admin resolves the contribution", async () => {
    const entityA = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Unlink Source ${Date.now()}`
    });
    const entityB = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Unlink Target ${Date.now()}`
    });

    const createLinkResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/contributions`,
      {
        body: JSON.stringify({
          payload: { relatedEntityId: entityB.id },
          type: "LINK_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const linkContribution = await readJson<{ id: string }>(createLinkResponse);

    assertCreated(createLinkResponse);

    await fetch(`${context.baseUrl}/admin/contributions/${linkContribution.id}/resolve`, {
      body: JSON.stringify({ action: "apply" }),
      headers: authHeaders(admin.accessToken),
      method: "POST"
    });

    const createUnlinkResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/contributions`,
      {
        body: JSON.stringify({
          payload: { relatedEntityId: entityB.id },
          type: "UNLINK_ENTITY"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const unlinkContribution = await readJson<{ id: string; status: string; tier: string }>(
      createUnlinkResponse
    );

    assertCreated(createUnlinkResponse);
    assert.equal(unlinkContribution.tier, "MODERATION");
    assert.equal(unlinkContribution.status, "PENDING");

    const resolveResponse = await fetch(
      `${context.baseUrl}/admin/contributions/${unlinkContribution.id}/resolve`,
      {
        body: JSON.stringify({ action: "apply" }),
        headers: authHeaders(admin.accessToken),
        method: "POST"
      }
    );

    assertOk(resolveResponse);

    const relatedPresencesResponse = await fetch(
      `${context.baseUrl}/entities/${entityA.id}/related-presences`
    );
    const relatedPresences = await readJson<{ items: Array<{ id: string }> }>(
      relatedPresencesResponse
    );

    assert.equal(relatedPresencesResponse.status, 200);
    assert.equal(relatedPresences.items.length, 0);
  });

  it("rejects UPDATE_LOGO contributions with unsafe logo URLs", async () => {
    const entity = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Unsafe Logo Entity ${Date.now()}`
    });

    const createContributionResponse = await fetch(
      `${context.baseUrl}/entities/${entity.id}/contributions`,
      {
        body: JSON.stringify({
          payload: {
            newValue: "javascript:alert(1)",
            oldValue: null
          },
          type: "UPDATE_LOGO"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );

    assert.equal(createContributionResponse.status, 400);
  });

  it("applies UPDATE_LOGO into entity_media and syncs entities.logo_url", async () => {
    const entity = await createTestEntity(context.baseUrl, author.accessToken, {
      title: `Logo Entity ${Date.now()}`
    });
    const nextLogoUrl = "https://example.com/logo.png";

    const createContributionResponse = await fetch(
      `${context.baseUrl}/entities/${entity.id}/contributions`,
      {
        body: JSON.stringify({
          payload: {
            newValue: nextLogoUrl,
            oldValue: null
          },
          type: "UPDATE_LOGO"
        }),
        headers: authHeaders(author.accessToken),
        method: "POST"
      }
    );
    const contribution = await readJson<{ id: string }>(createContributionResponse);

    assertCreated(createContributionResponse);

    const resolveResponse = await fetch(
      `${context.baseUrl}/admin/contributions/${contribution.id}/resolve`,
      {
        body: JSON.stringify({ action: "apply" }),
        headers: authHeaders(admin.accessToken),
        method: "POST"
      }
    );

    assertOk(resolveResponse);

    const entityResponse = await fetch(`${context.baseUrl}/entities/${entity.id}`);
    const entityBody = await readJson<{ logoUrl: string | null }>(entityResponse);

    assert.equal(entityResponse.status, 200);
    assert.equal(entityBody.logoUrl, nextLogoUrl);
  });
});
