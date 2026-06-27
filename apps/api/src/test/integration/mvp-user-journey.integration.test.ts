import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "reflect-metadata";

import {
  assertCreated,
  authHeaders,
  createTestApplication,
  readJson,
  type TestApplicationContext
} from "./test-app.harness.js";

const shouldRunE2eTests = process.env.E2E_TESTS === "true";

describe("MVP user journey", { skip: !shouldRunE2eTests }, () => {
  let context: TestApplicationContext;

  before(async () => {
    context = await createTestApplication();
  });

  after(async () => {
    await context.close();
  });

  it("covers extension lazy-create path from unknown URL to rated entity", async () => {
    const suffix = Date.now();
    const email = `e2e-lazy-${suffix}@example.com`;
    const siteUrl = `https://e2e-lazy-${suffix}.example/`;

    const registerResponse = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "E2E Lazy User",
        email,
        password: "Password123!"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const registerBody = await readJson<{ accessToken: string }>(registerResponse);

    assertCreated(registerResponse);
    assert.ok(registerBody.accessToken);

    const token = registerBody.accessToken;
    const searchBefore = await fetch(
      `${context.baseUrl}/search/entities?query=${encodeURIComponent(siteUrl)}`
    );
    const searchBeforeBody = await readJson<{ canCreateEntity: boolean; results: unknown[] }>(
      searchBefore
    );

    assert.equal(searchBefore.status, 200);
    assert.equal(searchBeforeBody.results.length, 0);
    assert.equal(searchBeforeBody.canCreateEntity, true);

    const resolveBefore = await fetch(
      `${context.baseUrl}/extension/resolve?url=${encodeURIComponent(siteUrl)}`
    );
    const resolveBeforeBody = await readJson<{ status: string }>(resolveBefore);

    assert.equal(resolveBefore.status, 200);
    assert.equal(resolveBeforeBody.status, "not_found");

    const lazyRatingStartedAt = performance.now();
    const lazyRatingResponse = await fetch(
      `${context.baseUrl}/extension/entities/by-url/my-rating`,
      {
        body: JSON.stringify({
          score: 4,
          sourceTitle: "E2E Lazy Site",
          url: siteUrl
        }),
        headers: authHeaders(token),
        method: "PUT"
      }
    );
    const lazyRatingBody = await readJson<{
      entity: { id: string; title: string };
      entityProvision: { mode: string };
      myRating: { score: number };
      rating: { avgScore: number; votesCount: number };
    }>(lazyRatingResponse);
    const lazyRatingDurationMs = performance.now() - lazyRatingStartedAt;

    assert.equal(lazyRatingResponse.status, 200);
    assert.equal(lazyRatingBody.entityProvision.mode, "created");
    assert.equal(lazyRatingBody.myRating.score, 4);
    assert.equal(lazyRatingBody.rating.votesCount, 1);
    assert.ok(lazyRatingDurationMs < 5000, "lazy rating should complete in under 5 seconds");

    const entityId = lazyRatingBody.entity.id;

    const resolveAfter = await fetch(
      `${context.baseUrl}/extension/resolve?url=${encodeURIComponent(siteUrl)}`
    );
    const resolveAfterBody = await readJson<{
      entity: { id: string };
      rating: { avgScore: number; votesCount: number };
      status: string;
    }>(resolveAfter);

    assert.equal(resolveAfter.status, 200);
    assert.equal(resolveAfterBody.status, "found");
    assert.equal(resolveAfterBody.entity.id, entityId);
    assert.equal(resolveAfterBody.rating.votesCount, 1);

    const searchAfter = await fetch(
      `${context.baseUrl}/search/entities?query=${encodeURIComponent(siteUrl)}`
    );
    const searchAfterBody = await readJson<{ results: Array<{ id: string }> }>(searchAfter);

    assert.equal(searchAfter.status, 200);
    assert.equal(searchAfterBody.results.length, 1);
    assert.equal(searchAfterBody.results[0]?.id, entityId);

    const updateRatingResponse = await fetch(
      `${context.baseUrl}/extension/entities/${entityId}/my-rating`,
      {
        body: JSON.stringify({ score: 5 }),
        headers: authHeaders(token),
        method: "PUT"
      }
    );
    const updateRatingBody = await readJson<{
      myRating: { score: number };
      rating: { avgScore: number; votesCount: number };
    }>(updateRatingResponse);

    assert.equal(updateRatingResponse.status, 200);
    assert.equal(updateRatingBody.myRating.score, 5);
    assert.equal(updateRatingBody.rating.avgScore, 5);
    assert.equal(updateRatingBody.rating.votesCount, 1);

    const entityPageResponse = await fetch(`${context.baseUrl}/entities/${entityId}/page`);
    const entityPageBody = await readJson<{
      entity: { id: string; title: string };
      rating: { avgScore: number; votesCount: number };
    }>(entityPageResponse);

    assert.equal(entityPageResponse.status, 200);
    assert.equal(entityPageBody.entity.id, entityId);
    assert.equal(entityPageBody.rating.avgScore, 5);
    assert.equal(entityPageBody.rating.votesCount, 1);
  });

  it("covers manual web create fallback path", async () => {
    const suffix = Date.now();
    const email = `e2e-manual-${suffix}@example.com`;
    const siteUrl = `https://e2e-manual-${suffix}.example/`;

    const registerResponse = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "E2E Manual User",
        email,
        password: "Password123!"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const registerBody = await readJson<{ accessToken: string }>(registerResponse);

    assertCreated(registerResponse);

    const token = registerBody.accessToken;

    const createEntityResponse = await fetch(`${context.baseUrl}/entities`, {
      body: JSON.stringify({
        canonicalUrl: siteUrl,
        title: "E2E Manual Site",
        type: "website"
      }),
      headers: authHeaders(token),
      method: "POST"
    });
    const createdEntity = await readJson<{ id: string; title: string }>(createEntityResponse);

    assert.equal(createEntityResponse.status, 201);
    assert.equal(createdEntity.title, "E2E Manual Site");

    const rateResponse = await fetch(
      `${context.baseUrl}/ratings/entities/${createdEntity.id}/my-rating`,
      {
        body: JSON.stringify({ score: 3 }),
        headers: authHeaders(token),
        method: "PUT"
      }
    );
    const rateBody = await readJson<{
      aggregate: { avgScore: number; votesCount: number };
      rating: { score: number };
    }>(rateResponse);

    assert.equal(rateResponse.status, 200);
    assert.equal(rateBody.rating.score, 3);
    assert.equal(rateBody.aggregate.votesCount, 1);

    const aggregateResponse = await fetch(
      `${context.baseUrl}/ratings/entities/${createdEntity.id}`
    );
    const aggregateBody = await readJson<{ avgScore: number; votesCount: number }>(
      aggregateResponse
    );

    assert.equal(aggregateResponse.status, 200);
    assert.equal(aggregateBody.avgScore, 3);
    assert.equal(aggregateBody.votesCount, 1);

    const resolveResponse = await fetch(
      `${context.baseUrl}/extension/resolve?url=${encodeURIComponent(siteUrl)}`
    );
    const resolveBody = await readJson<{
      entity: { id: string };
      rating: { avgScore: number };
      status: string;
    }>(resolveResponse);

    assert.equal(resolveResponse.status, 200);
    assert.equal(resolveBody.status, "found");
    assert.equal(resolveBody.entity.id, createdEntity.id);
    assert.equal(resolveBody.rating.avgScore, 3);
  });
});
