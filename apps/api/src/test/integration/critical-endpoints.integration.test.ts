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

const shouldRunIntegrationTests = process.env.INTEGRATION_TESTS === "true";

describe("Critical API endpoints", { skip: !shouldRunIntegrationTests }, () => {
  let context: TestApplicationContext;

  before(async () => {
    context = await createTestApplication();
  });

  after(async () => {
    await context.close();
  });

  it("GET /health returns ok with database check", async () => {
    const response = await fetch(`${context.baseUrl}/health`);
    const body = await readJson<{ status: string; checks: { database: string } }>(response);

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.checks.database, "ok");
  });

  it("GET /extension/resolve returns not_found for unknown URL", async () => {
    const url = encodeURIComponent("https://integration-unknown.example/");
    const response = await fetch(`${context.baseUrl}/extension/resolve?url=${url}`);
    const body = await readJson<{ status: string; canCreateEntity: boolean }>(response);

    assert.equal(response.status, 200);
    assert.equal(body.status, "not_found");
    assert.equal(body.canCreateEntity, true);
  });

  it("POST /auth/register and GET /auth/me work for new user", async () => {
    const email = `integration-${Date.now()}@example.com`;
    const registerResponse = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "Integration User",
        email,
        password: "Password123!"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const registerBody = await readJson<{
      accessToken: string;
      user: { email: string | null; id: string };
    }>(registerResponse);

    assertCreated(registerResponse);
    assert.ok(registerBody.accessToken);

    const meResponse = await fetch(`${context.baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${registerBody.accessToken}`
      }
    });
    const meBody = await readJson<{ email: string | null; id: string }>(meResponse);

    assert.equal(meResponse.status, 200);
    assert.equal(meBody.email, email);
    assert.equal(meBody.id, registerBody.user.id);
  });

  it("GET /search/entities returns empty results for unknown query", async () => {
    const query = encodeURIComponent(`no-results-${Date.now()}`);
    const response = await fetch(`${context.baseUrl}/search/entities?query=${query}`);
    const body = await readJson<{
      canCreateEntity: boolean;
      query: string;
      results: unknown[];
    }>(response);

    assert.equal(response.status, 200);
    assert.equal(body.results.length, 0);
    assert.equal(body.canCreateEntity, true);
    assert.equal(typeof body.query, "string");
  });

  it("GET /search/entities returns ranking fields for matched entities", async () => {
    const suffix = Date.now();
    const email = `search-shape-${suffix}@example.com`;
    const siteUrl = `https://search-shape-${suffix}.example/`;
    const registerResponse = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "Search Shape User",
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

    const createEntityResponse = await fetch(`${context.baseUrl}/entities`, {
      body: JSON.stringify({
        canonicalUrl: siteUrl,
        title: `Search Shape ${suffix}`,
        type: "website"
      }),
      headers: authHeaders(registerBody.accessToken),
      method: "POST"
    });

    assertCreated(createEntityResponse);

    const searchResponse = await fetch(
      `${context.baseUrl}/search/entities?query=${encodeURIComponent(`search-shape-${suffix}`)}`
    );
    const searchBody = await readJson<{
      canCreateEntity: boolean;
      results: Array<{
        avgScore: number | null;
        id: string;
        resultKind: "canonical_site" | "entity";
        reviewsCount: number;
        title: string;
        votesCount: number;
      }>;
    }>(searchResponse);

    assert.equal(searchResponse.status, 200);
    assert.equal(searchBody.canCreateEntity, false);
    assert.ok(searchBody.results.length > 0);
    assert.equal(searchBody.results[0]?.resultKind, "canonical_site");
    assert.equal(searchBody.results[0]?.votesCount, 0);
    assert.equal(searchBody.results[0]?.reviewsCount, 0);
    assert.equal(searchBody.results[0]?.avgScore, null);
  });
});
