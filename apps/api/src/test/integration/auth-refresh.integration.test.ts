import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "reflect-metadata";

import {
  assertCreated,
  createTestApplication,
  readJson,
  type TestApplicationContext
} from "./test-app.harness.js";

const shouldRunIntegrationTests = process.env.INTEGRATION_TESTS === "true";
const REFRESH_TOKEN_CONCURRENCY_GRACE_MS = 5_000;

interface AuthResponseBody {
  accessToken: string;
  refreshToken?: string;
}

describe("Auth refresh token rotation", { skip: !shouldRunIntegrationTests }, () => {
  let context: TestApplicationContext;

  before(async () => {
    context = await createTestApplication();
  });

  after(async () => {
    await context.close();
  });

  it("register issues a refresh token that rotates once and rejects reuse", async () => {
    const email = `refresh-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const registerResponse = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "Refresh Flow Tester",
        email,
        password: "correct horse battery staple"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const registerBody = await readJson<AuthResponseBody>(registerResponse);

    assertCreated(registerResponse);
    assert.ok(registerBody.accessToken);
    assert.ok(registerBody.refreshToken);

    const firstRefreshResponse = await fetch(`${context.baseUrl}/auth/refresh`, {
      body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const firstRefreshBody = await readJson<AuthResponseBody>(firstRefreshResponse);

    assert.equal(firstRefreshResponse.status, 200);
    assert.ok(firstRefreshBody.accessToken);
    assert.ok(firstRefreshBody.refreshToken);
    assert.notEqual(firstRefreshBody.accessToken, registerBody.accessToken);

    // Reuse outside the concurrent-request grace window must kill the token family.
    await new Promise((resolve) => setTimeout(resolve, REFRESH_TOKEN_CONCURRENCY_GRACE_MS + 50));
    const reuseResponse = await fetch(`${context.baseUrl}/auth/refresh`, {
      body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    assert.equal(reuseResponse.status, 401);

    const stolenFamilyResponse = await fetch(`${context.baseUrl}/auth/refresh`, {
      body: JSON.stringify({ refreshToken: firstRefreshBody.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    assert.equal(stolenFamilyResponse.status, 401);
  });

  it("does not revoke the winning session when two tabs refresh concurrently", async () => {
    const email = `refresh-race-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const registerResponse = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "Refresh Race Tester",
        email,
        password: "correct horse battery staple"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const registerBody = await readJson<AuthResponseBody>(registerResponse);

    assertCreated(registerResponse);
    assert.ok(registerBody.refreshToken);

    const responses = await Promise.all([
      fetch(`${context.baseUrl}/auth/refresh`, {
        body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }),
      fetch(`${context.baseUrl}/auth/refresh`, {
        body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      })
    ]);
    const responseBodies = await Promise.all(
      responses.map((response) => readJson<AuthResponseBody>(response))
    );
    const winnerIndex = responses.findIndex((response) => response.status === 200);

    assert.notEqual(winnerIndex, -1);
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.ok(responseBodies[winnerIndex]?.refreshToken);

    const followUpResponse = await fetch(`${context.baseUrl}/auth/refresh`, {
      body: JSON.stringify({ refreshToken: responseBodies[winnerIndex]?.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    assert.equal(followUpResponse.status, 200);
  });

  it("logout revokes the refresh token", async () => {
    const email = `logout-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const registerResponse = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "Logout Flow Tester",
        email,
        password: "correct horse battery staple"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const registerBody = await readJson<AuthResponseBody>(registerResponse);

    assertCreated(registerResponse);
    assert.ok(registerBody.refreshToken);

    const logoutResponse = await fetch(`${context.baseUrl}/auth/logout`, {
      body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    assert.equal(logoutResponse.status, 200);

    const refreshResponse = await fetch(`${context.baseUrl}/auth/refresh`, {
      body: JSON.stringify({ refreshToken: registerBody.refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    assert.equal(refreshResponse.status, 401);
  });

  it("refresh rejects unknown tokens", async () => {
    const response = await fetch(`${context.baseUrl}/auth/refresh`, {
      body: JSON.stringify({ refreshToken: "not-a-real-refresh-token-value" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    assert.equal(response.status, 401);
  });
});
