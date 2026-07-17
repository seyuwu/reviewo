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

describe("Dota profiles integration", { skip: !shouldRunIntegrationTests }, () => {
  let context: TestApplicationContext;

  before(async () => {
    context = await createTestApplication();
  });

  after(async () => {
    await context.close();
  });

  it("creates profile, confirms qualities, resolves by account id, blocks self-confirm", async () => {
    const ownerEmail = `dota-owner-${Date.now()}@example.com`;
    const confirmerEmail = `dota-confirmer-${Date.now()}@example.com`;
    const accountId = `${Date.now()}`.slice(-9);

    const ownerRegister = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "Dota Owner",
        email: ownerEmail,
        password: "Password123!"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const owner = await readJson<{ accessToken: string }>(ownerRegister);
    assertCreated(ownerRegister);

    const confirmerRegister = await fetch(`${context.baseUrl}/auth/register`, {
      body: JSON.stringify({
        displayName: "Dota Confirmer",
        email: confirmerEmail,
        password: "Password123!"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const confirmer = await readJson<{ accessToken: string }>(confirmerRegister);
    assertCreated(confirmerRegister);

    const createResponse = await fetch(`${context.baseUrl}/dota/profiles`, {
      body: JSON.stringify({
        dotaAccountId: accountId,
        hasMic: true,
        mmr: "4500",
        roles: ["4", "5"],
        server: "EU"
      }),
      headers: {
        ...authHeaders(owner.accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const created = await readJson<{
      progress: { current: number };
      slug: string;
    }>(createResponse);

    assertCreated(createResponse);
    assert.ok(created.slug);
    assert.equal(created.progress.current, 0);

    const confirmResponse = await fetch(`${context.baseUrl}/dota/profiles/${created.slug}/confirm`, {
      body: JSON.stringify({
        qualityKeys: ["play_again", "has_mic"],
        visitorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      }),
      headers: {
        ...authHeaders(confirmer.accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const confirmed = await readJson<{
      progress: { current: number };
      qualities: Record<string, number>;
    }>(confirmResponse);

    assertCreated(confirmResponse);
    assert.equal(confirmed.progress.current, 1);
    assert.equal(confirmed.qualities.play_again, 1);

    const byIdResponse = await fetch(`${context.baseUrl}/dota/profiles/by-id/${accountId}`);
    const byId = await readJson<{ slug: string }>(byIdResponse);

    assert.equal(byIdResponse.status, 200);
    assert.equal(byId.slug, created.slug);

    const selfConfirmResponse = await fetch(`${context.baseUrl}/dota/profiles/${created.slug}/confirm`, {
      body: JSON.stringify({
        qualityKeys: ["good_caller"],
        visitorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      }),
      headers: {
        ...authHeaders(owner.accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    assert.equal(selfConfirmResponse.status, 403);
  });
});
