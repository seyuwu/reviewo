import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import "reflect-metadata";

import { PrismaService } from "../../database/prisma.service.js";
import {
  assertCreated,
  assertOk,
  authHeaders,
  createTestApplication,
  promoteUserToAdmin,
  provisionTestUser,
  readJson,
  type TestApplicationContext
} from "../../test/integration/test-app.harness.js";

const shouldRunIntegrationTests = process.env.INTEGRATION_TESTS === "true";

const TOP_CATEGORIES = [
  { slug: "ai", sortOrder: 1, title: "AI" },
  { slug: "games", sortOrder: 5, title: "Games" }
];

async function seedTopCategories(context: TestApplicationContext): Promise<void> {
  const prisma = context.app.get(PrismaService);

  for (const category of TOP_CATEGORIES) {
    await prisma.topCategory.upsert({
      create: category,
      update: {
        sortOrder: category.sortOrder,
        title: category.title
      },
      where: {
        slug: category.slug
      }
    });
  }
}

describe("Top categories endpoints", { skip: !shouldRunIntegrationTests }, () => {
  let context: TestApplicationContext;
  let accessToken = "";
  let entityIds: string[] = [];
  let aiCategoryId = "";

  before(async () => {
    context = await createTestApplication();
    await seedTopCategories(context);

    const categoriesResponse = await fetch(`${context.baseUrl}/tops/categories`);
    const categoriesBody = await readJson<{ items: Array<{ id: string; slug: string }> }>(
      categoriesResponse
    );

    assertOk(categoriesResponse);
    aiCategoryId = categoriesBody.items.find((item) => item.slug === "ai")?.id ?? "";
    assert.ok(aiCategoryId);

    const user = await provisionTestUser(context.app, "top-categories");
    accessToken = user.accessToken;

    for (let index = 0; index < 3; index += 1) {
      const createEntityResponse = await fetch(`${context.baseUrl}/entities`, {
        body: JSON.stringify({
          description: `Entity ${index + 1}`,
          title: `Category Top Entity ${index + 1} ${Date.now()}`,
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

  it("lists seeded top categories", async () => {
    const response = await fetch(`${context.baseUrl}/tops/categories`);
    const body = await readJson<{ items: Array<{ slug: string; title: string }> }>(response);

    assertOk(response);
    assert.ok(body.items.some((item) => item.slug === "ai"));
    assert.ok(body.items.some((item) => item.slug === "games"));
  });

  it("rejects create when categoryId is missing", async () => {
    const response = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        slug: `missing-category-${Date.now()}`,
        title: "Missing Category"
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    assert.notEqual(response.status, 201);
    assert.notEqual(response.status, 200);
  });

  it("rejects top category create for regular users", async () => {
    const title = `Indie Games ${Date.now()}`;
    const response = await fetch(`${context.baseUrl}/tops/categories`, {
      body: JSON.stringify({ title }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    assert.equal(response.status, 403);
  });

  it("creates a new top category for admins", async () => {
    const admin = await provisionTestUser(context.app, "top-categories-admin");
    await promoteUserToAdmin(context.app, admin.userId);

    const title = `Indie Games ${Date.now()}`;
    const response = await fetch(`${context.baseUrl}/tops/categories`, {
      body: JSON.stringify({ title }),
      headers: {
        ...authHeaders(admin.accessToken),
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const body = await readJson<{ id: string; slug: string; title: string }>(response);

    assertCreated(response);
    assert.ok(body.id);
    assert.equal(body.title, title);
    assert.ok(body.slug.length > 0);

    const listResponse = await fetch(`${context.baseUrl}/tops/categories`);
    const listBody = await readJson<{ items: Array<{ id: string }> }>(listResponse);

    assertOk(listResponse);
    assert.ok(listBody.items.some((item) => item.id === body.id));
  });

  it("lists tops by category and keeps uncategorized tops on global feed", async () => {
    const slug = `ai-tools-list-${Date.now()}`;
    const createTopResponse = await fetch(`${context.baseUrl}/tops`, {
      body: JSON.stringify({
        categoryId: aiCategoryId,
        slug,
        title: "AI Tools List"
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
        items: entityIds.map((entityId) => ({ entityId }))
      }),
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": "application/json"
      },
      method: "PUT"
    });

    assertOk(replaceItemsResponse);

    const categoryResponse = await fetch(`${context.baseUrl}/tops/category/ai`);
    const categoryBody = await readJson<{ items: Array<{ slug: string }> }>(categoryResponse);

    assertOk(categoryResponse);
    assert.ok(categoryBody.items.some((item) => item.slug === slug));

    const globalResponse = await fetch(`${context.baseUrl}/tops`);
    const globalBody = await readJson<{ items: Array<{ slug: string }> }>(globalResponse);

    assertOk(globalResponse);
    assert.ok(globalBody.items.some((item) => item.slug === slug));
  });
});
