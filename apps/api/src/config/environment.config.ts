import { registerAs } from "@nestjs/config";

import type { NodeEnvironment } from "./environment.validation.js";
import { createDevelopmentAllowedOrigins } from "./origin-policy.js";

export interface ApplicationConfig {
  corsAllowedOrigins: string[];
  databaseUrl: string;
  environment: NodeEnvironment;
  jwtAccessTokenTtlSeconds: number;
  jwtSecret: string;
  port: number;
  redisUrl: string;
  reputationEngineEnabled: boolean;
  trustProxyHops: number;
}

export const environmentConfig = registerAs(
  "app",
  (): ApplicationConfig => ({
    corsAllowedOrigins: parseCorsAllowedOrigins(
      process.env["CORS_ALLOWED_ORIGINS"],
      (process.env["NODE_ENV"] ?? "development") as NodeEnvironment
    ),
    databaseUrl:
      process.env["DATABASE_URL"] ?? "postgresql://reviewo:reviewo_password@localhost:5432/reviewo",
    environment: (process.env["NODE_ENV"] ?? "development") as NodeEnvironment,
    jwtAccessTokenTtlSeconds: Number(process.env["JWT_ACCESS_TOKEN_TTL_SECONDS"] ?? 7 * 86_400),
    jwtSecret: process.env["JWT_SECRET"] ?? "reviewo_development_jwt_secret_change_me",
    port: Number(process.env["API_PORT"] ?? 3000),
    redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
    reputationEngineEnabled: parseBooleanFlag(process.env["REPUTATION_ENGINE_ENABLED"], false),
    trustProxyHops: Number(process.env["TRUST_PROXY_HOPS"] ?? 0)
  })
);

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === "true" || normalized === "1";
}

function parseCorsAllowedOrigins(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment
): string[] {
  if (!value) {
    return nodeEnvironment === "development" ? createDevelopmentAllowedOrigins() : [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
