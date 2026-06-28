import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateEnvironment } from "./environment.validation.js";

const productionBase = {
  CORS_ALLOWED_ORIGINS: "https://app.example.com",
  DATABASE_URL: "postgresql://reviewo:secret@postgres:5432/reviewo",
  JWT_SECRET: "production_jwt_secret_with_enough_length",
  NODE_ENV: "production",
  REDIS_URL: "redis://redis:6379"
} as const;

describe("validateEnvironment", () => {
  it("accepts a valid production configuration", () => {
    const config = validateEnvironment({ ...productionBase });

    assert.equal(config.NODE_ENV, "production");
    assert.deepEqual(config.CORS_ALLOWED_ORIGINS, ["https://app.example.com"]);
    assert.equal(config.JWT_SECRET, productionBase.JWT_SECRET);
  });

  it("requires DATABASE_URL in production", () => {
    assert.throws(
      () =>
        validateEnvironment({
          ...productionBase,
          DATABASE_URL: ""
        }),
      /DATABASE_URL must be set in production/
    );
  });

  it("requires CORS_ALLOWED_ORIGINS in production", () => {
    assert.throws(
      () =>
        validateEnvironment({
          ...productionBase,
          CORS_ALLOWED_ORIGINS: ""
        }),
      /CORS_ALLOWED_ORIGINS must be set in production/
    );
  });

  it("rejects placeholder JWT_SECRET in production", () => {
    assert.throws(
      () =>
        validateEnvironment({
          ...productionBase,
          JWT_SECRET: "change_me_for_real_environment_jwt_secret"
        }),
      /JWT_SECRET must not use a placeholder value in production/
    );
  });

  it("uses development defaults when optional values are omitted", () => {
    const config = validateEnvironment({
      NODE_ENV: "development"
    });

    assert.equal(config.NODE_ENV, "development");
    assert.deepEqual(config.CORS_ALLOWED_ORIGINS, ["http://localhost:3001"]);
    assert.equal(
      config.DATABASE_URL,
      "postgresql://reviewo:reviewo_password@localhost:5432/reviewo"
    );
    assert.equal(config.JWT_ACCESS_TOKEN_TTL_SECONDS, 120 * 86_400);
  });

  it("accepts a 120-day JWT access token TTL", () => {
    const config = validateEnvironment({
      ...productionBase,
      JWT_ACCESS_TOKEN_TTL_SECONDS: "10368000"
    });

    assert.equal(config.JWT_ACCESS_TOKEN_TTL_SECONDS, 10368000);
  });
});
