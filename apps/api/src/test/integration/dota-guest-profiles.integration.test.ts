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

describe("Dota guest profiles integration", { skip: !shouldRunIntegrationTests }, () => {
  let context: TestApplicationContext;

  before(async () => {
    context = await createTestApplication();
  });

  after(async () => {
    await context.close();
  });

  it("creates guest profile, recovers session with rotation, and claims email", async () => {
    const accountId = `${Date.now()}`.slice(-9);

    const createResponse = await fetch(`${context.baseUrl}/dota/profiles/guest`, {
      body: JSON.stringify({
        dotaAccountId: accountId,
        hasMic: true,
        mmr: "4200",
        roles: ["1", "2"],
        server: "EU"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const created = await readJson<{
      accessToken: string;
      recoveryToken: string;
      recoveryUrl: string;
      profile: { slug: string };
      user: { email: string | null; id: string };
    }>(createResponse);

    assertCreated(createResponse);
    assert.equal(created.user.email, null);
    assert.ok(created.accessToken);
    assert.ok(created.recoveryToken.length >= 16);
    assert.match(created.recoveryUrl, /\/recover\//);
    assert.ok(created.profile.slug);

    const meResponse = await fetch(`${context.baseUrl}/dota/profiles/me`, {
      headers: authHeaders(created.accessToken)
    });
    const me = await readJson<{ slug: string }>(meResponse);
    assert.equal(meResponse.status, 200);
    assert.equal(me.slug, created.profile.slug);

    const recoverResponse = await fetch(`${context.baseUrl}/auth/recover`, {
      body: JSON.stringify({ token: created.recoveryToken }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const recovered = await readJson<{
      accessToken: string;
      recoveryToken: string;
      user: { id: string };
    }>(recoverResponse);

    assert.equal(recoverResponse.status, 201);
    assert.equal(recovered.user.id, created.user.id);
    assert.notEqual(recovered.recoveryToken, created.recoveryToken);
    assert.ok(recovered.accessToken);

    const reuseOldToken = await fetch(`${context.baseUrl}/auth/recover`, {
      body: JSON.stringify({ token: created.recoveryToken }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    assert.equal(reuseOldToken.status, 401);

    const claimEmail = `guest-claim-${Date.now()}@example.com`;
    const claimResponse = await fetch(`${context.baseUrl}/auth/claim-email`, {
      body: JSON.stringify({
        email: claimEmail,
        password: "Password123!"
      }),
      headers: {
        ...authHeaders(recovered.accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const claimed = await readJson<{ email: string | null }>(claimResponse);
    assert.equal(claimResponse.status, 201);
    assert.equal(claimed.email, claimEmail);

    const secondClaim = await fetch(`${context.baseUrl}/auth/claim-email`, {
      body: JSON.stringify({
        email: `another-${Date.now()}@example.com`,
        password: "Password123!"
      }),
      headers: {
        ...authHeaders(recovered.accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    assert.equal(secondClaim.status, 409);

    const loginResponse = await fetch(`${context.baseUrl}/auth/login`, {
      body: JSON.stringify({
        email: claimEmail,
        password: "Password123!"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const loggedIn = await readJson<{ accessToken: string }>(loginResponse);
    assert.equal(loginResponse.status, 201);
    assert.ok(loggedIn.accessToken);

    const authedGuestBlocked = await fetch(`${context.baseUrl}/dota/profiles/guest`, {
      body: JSON.stringify({
        mmr: "3000",
        roles: ["5"]
      }),
      headers: {
        ...authHeaders(loggedIn.accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    assert.equal(authedGuestBlocked.status, 400);
  });
});
