import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

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
