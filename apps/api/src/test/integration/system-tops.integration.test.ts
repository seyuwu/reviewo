import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "reflect-metadata";

import {
  assertOk,
  createTestApplication,
  readJson,
  type TestApplicationContext
} from "../../test/integration/test-app.harness.js";
import { SystemTopsService } from "../../modules/tops/services/system-tops.service.js";

const shouldRunIntegrationTests = process.env.INTEGRATION_TESTS === "true";

async function refreshSystemTops(context: TestApplicationContext): Promise<void> {
  const systemTopsService = context.app.get(SystemTopsService);
  await systemTopsService.refreshAll();
}

describe("System tops endpoints", { skip: !shouldRunIntegrationTests }, () => {
  let context: TestApplicationContext;

  before(async () => {
    context = await createTestApplication();
    await refreshSystemTops(context);
  });

  after(async () => {
    await context.close();
  });

  it("lists system top catalog", async () => {
    const response = await fetch(`${context.baseUrl}/tops/system`);
    const body = await readJson<{ items: Array<{ slug: string; title: string }> }>(response);

    assertOk(response);
    assert.ok(body.items.some((item) => item.slug === "ai-tools"));
    assert.ok(body.items.some((item) => item.title.length > 0));
  });

  it("returns latest system top snapshot", async () => {
    const response = await fetch(`${context.baseUrl}/tops/system/ai-tools`);
    const body = await readJson<{
      computedAt: string | null;
      items: Array<{ position: number }>;
      slug: string;
      title: string;
    }>(response);

    assertOk(response);
    assert.equal(body.slug, "ai-tools");
    assert.ok(body.title.length > 0);
    assert.ok(body.computedAt);
  });

  it("returns 404 for unknown system top slug", async () => {
    const response = await fetch(`${context.baseUrl}/tops/system/not-a-real-top`);

    assert.equal(response.status, 404);
  });

  it("returns reverse lookup for entities in snapshots when present", async () => {
    const snapshotResponse = await fetch(`${context.baseUrl}/tops/system/ai-tools`);
    const snapshot = await readJson<{ items: Array<{ entity: { id: string }; position: number }> }>(
      snapshotResponse
    );

    assertOk(snapshotResponse);

    if (snapshot.items.length === 0) {
      return;
    }

    const entityId = snapshot.items[0]!.entity.id;
    const response = await fetch(`${context.baseUrl}/entities/${entityId}/system-tops`);
    const body = await readJson<{
      items: Array<{ isSystemTop: boolean; position: number; slug: string }>;
    }>(response);

    const match = body.items.find((item) => item.slug === "ai-tools");

    assert.ok(match);
    assert.equal(match.position, snapshot.items[0]!.position);
  });
});
