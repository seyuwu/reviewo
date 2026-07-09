import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { EntityType, EntityVisibility, UserRole } from "#prisma/client";

import { createSlugFromCanonicalUrl } from "../../modules/entities/services/entity-slug.js";
import { AuthRepository } from "../../modules/auth/repositories/auth.repository.js";
import { JwtTokenService } from "../../modules/auth/services/jwt-token.service.js";
import { PasswordHasherService } from "../../modules/auth/services/password-hasher.service.js";
import { UsersService } from "../../modules/users/services/users.service.js";
import { PrismaService } from "../../database/prisma.service.js";
import { AppModule } from "../../app.module.js";

export interface TestApplicationContext {
  app: INestApplication;
  baseUrl: string;
  close(): Promise<void>;
}

export async function createTestApplication(): Promise<TestApplicationContext> {
  const app = await NestFactory.create(AppModule, {
    logger: false
  });
  await app.init();
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address();

  if (!address || typeof address === "string") {
    await app.close();
    throw new Error("Could not resolve integration test server port");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await app.close();
    }
  };
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export function assertCreated(response: Response): void {
  assert.equal(response.status, 201);
}

export function assertOk(response: Response): void {
  assert.ok(
    response.status === 200 || response.status === 201,
    `Expected 200 or 201, got ${response.status}`
  );
}

export async function promoteUserToAdmin(
  app: INestApplication,
  userId: string
): Promise<void> {
  const prisma = app.get(PrismaService);

  await prisma.user.update({
    data: { role: UserRole.ADMIN },
    where: { id: userId }
  });
}

export async function registerTestUser(
  baseUrl: string,
  label: string
): Promise<{ accessToken: string; userId: string }> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const response = await fetch(`${baseUrl}/auth/register`, {
    body: JSON.stringify({
      displayName: label,
      email,
      password: "Password123!"
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const body = await readJson<{ accessToken: string; user: { id: string } }>(response);

  assertCreated(response);

  return {
    accessToken: body.accessToken,
    userId: body.user.id
  };
}

export async function provisionTestUser(
  app: INestApplication,
  label: string
): Promise<{ accessToken: string; userId: string }> {
  const prisma = app.get(PrismaService);
  const jwtTokenService = app.get(JwtTokenService);
  const passwordHasherService = app.get(PasswordHasherService);
  const usersService = app.get(UsersService);
  const authRepository = app.get(AuthRepository);
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const passwordHash = await passwordHasherService.hash("Password123!");

  const user = await prisma.$transaction(async (transaction) => {
    const createdUser = await usersService.createUserProfileForRegistration(
      {
        displayName: label,
        email
      },
      transaction
    );

    await authRepository.createEmailIdentity(
      {
        email,
        passwordHash,
        userId: createdUser.id
      },
      transaction
    );

    return createdUser;
  });

  return {
    accessToken: jwtTokenService.signAccessToken(user.id),
    userId: user.id
  };
}

export async function createTestEntity(
  baseUrl: string,
  accessToken: string,
  input: {
    canonicalUrl?: string | null;
    description?: string;
    title: string;
    type?: string;
  }
): Promise<{ id: string }> {
  const response = await fetch(`${baseUrl}/entities`, {
    body: JSON.stringify({
      description: input.description ?? null,
      title: input.title,
      type: input.type ?? "product",
      ...(input.canonicalUrl !== undefined ? { canonicalUrl: input.canonicalUrl } : {})
    }),
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const entity = await readJson<{ id: string }>(response);

  assertCreated(response);

  return entity;
}

export async function seedDuplicateEntityPair(
  app: INestApplication,
  authorId: string
): Promise<{ sourceId: string; targetId: string }> {
  const prisma = app.get(PrismaService);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const canonicalUrl = `https://dup-${stamp}.example.com`;
  const stubSlug = createSlugFromCanonicalUrl(canonicalUrl);

  const source = await prisma.entity.create({
    data: {
      canonicalUrl,
      createdBy: authorId,
      slug: `dup-source-${stamp}`,
      title: "Duplicate Pair Service",
      type: EntityType.website,
      visibility: EntityVisibility.ACTIVE
    }
  });
  const target = await prisma.entity.create({
    data: {
      createdBy: authorId,
      slug: stubSlug,
      title: "Duplicate Pair Service",
      type: EntityType.website,
      visibility: EntityVisibility.ACTIVE
    }
  });

  return {
    sourceId: source.id,
    targetId: target.id
  };
}
