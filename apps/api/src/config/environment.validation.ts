import { createDevelopmentAllowedOrigins } from "./origin-policy.js";

export type NodeEnvironment = "development" | "production" | "test";

export interface EnvironmentVariables {
  API_PORT: number;
  CORS_ALLOWED_ORIGINS: string[];
  DATABASE_URL: string;
  JWT_ACCESS_TOKEN_TTL_SECONDS: number;
  JWT_SECRET: string;
  NODE_ENV: NodeEnvironment;
  REDIS_URL: string;
  REPUTATION_ENGINE_ENABLED: boolean;
  TRUST_PROXY_HOPS: number;
}

const DEFAULT_API_PORT = 3000;
const DEFAULT_NODE_ENV: NodeEnvironment = "development";
const DEFAULT_DATABASE_URL = "postgresql://reviewo:reviewo_password@localhost:5432/reviewo";
const DEVELOPMENT_CHROME_EXTENSION_WILDCARD = "chrome-extension://*";
const SECONDS_PER_DAY = 86_400;
const DEFAULT_JWT_ACCESS_TOKEN_TTL_SECONDS = 7 * SECONDS_PER_DAY;
const MAX_DEVELOPMENT_JWT_ACCESS_TOKEN_TTL_SECONDS = 365 * SECONDS_PER_DAY;
const MAX_PRODUCTION_JWT_ACCESS_TOKEN_TTL_SECONDS = 30 * SECONDS_PER_DAY;
const DEFAULT_JWT_SECRET = "reviewo_development_jwt_secret_change_me";
const DEFAULT_REDIS_URL = "redis://localhost:6379";
const VALID_NODE_ENVIRONMENTS = new Set<NodeEnvironment>(["development", "production", "test"]);

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const nodeEnvironment = parseNodeEnvironment(config["NODE_ENV"]);
  const apiPort = parsePort(config["API_PORT"]);
  const corsAllowedOrigins = parseCorsAllowedOrigins(
    config["CORS_ALLOWED_ORIGINS"],
    nodeEnvironment
  );
  const databaseUrl = parseDatabaseUrl(config["DATABASE_URL"], nodeEnvironment);
  const jwtSecret = parseJwtSecret(config["JWT_SECRET"], nodeEnvironment);
  const jwtAccessTokenTtlSeconds = parseJwtAccessTokenTtlSeconds(
    config["JWT_ACCESS_TOKEN_TTL_SECONDS"],
    nodeEnvironment
  );
  const reputationEngineEnabled = parseBooleanFlag(
    config["REPUTATION_ENGINE_ENABLED"],
    false
  );
  const redisUrl = parseRedisUrl(config["REDIS_URL"], nodeEnvironment);
  const trustProxyHops = parseTrustProxyHops(config["TRUST_PROXY_HOPS"]);

  return {
    API_PORT: apiPort,
    CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_TOKEN_TTL_SECONDS: jwtAccessTokenTtlSeconds,
    JWT_SECRET: jwtSecret,
    NODE_ENV: nodeEnvironment,
    REDIS_URL: redisUrl,
    REPUTATION_ENGINE_ENABLED: reputationEngineEnabled,
    TRUST_PROXY_HOPS: trustProxyHops
  };
}

function parseCorsAllowedOrigins(value: unknown, nodeEnvironment: NodeEnvironment): string[] {
  if (value === undefined || value === null || value === "") {
    if (nodeEnvironment === "production") {
      throw new Error("CORS_ALLOWED_ORIGINS must be set in production");
    }

    return createDevelopmentAllowedOrigins();
  }

  if (typeof value !== "string") {
    throw new Error("CORS_ALLOWED_ORIGINS must be a comma-separated list of URLs");
  }

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === DEVELOPMENT_CHROME_EXTENSION_WILDCARD) {
      if (nodeEnvironment === "production") {
        throw new Error("CORS_ALLOWED_ORIGINS must not use chrome-extension wildcard in production");
      }

      continue;
    }

    let url: URL;

    try {
      url = new URL(origin);

      if (!["http:", "https:", "chrome-extension:"].includes(url.protocol)) {
        throw new Error("Invalid CORS origin protocol");
      }
    } catch {
      throw new Error("CORS_ALLOWED_ORIGINS must contain valid HTTP, HTTPS, or chrome-extension URLs");
    }

    if (nodeEnvironment === "production" && url.protocol === "http:" && !isLocalhost(url)) {
      throw new Error("CORS_ALLOWED_ORIGINS must use HTTPS in production");
    }
  }

  return origins;
}

function parseNodeEnvironment(value: unknown): NodeEnvironment {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_NODE_ENV;
  }

  if (typeof value !== "string" || !VALID_NODE_ENVIRONMENTS.has(value as NodeEnvironment)) {
    throw new Error("NODE_ENV must be one of: development, production, test");
  }

  return value as NodeEnvironment;
}

function parsePort(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_API_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }

  return port;
}

function parseDatabaseUrl(value: unknown, nodeEnvironment: NodeEnvironment): string {
  if (value === undefined || value === null || value === "") {
    if (nodeEnvironment === "production") {
      throw new Error("DATABASE_URL must be set in production");
    }

    return DEFAULT_DATABASE_URL;
  }

  if (typeof value !== "string") {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string");
  }

  let url: URL;

  try {
    url = new URL(value);

    if (!["postgresql:", "postgres:"].includes(url.protocol)) {
      throw new Error("Invalid database protocol");
    }
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection string");
  }

  if (nodeEnvironment === "production" && isPlaceholderSecret(url.password)) {
    throw new Error("DATABASE_URL must not use a placeholder password in production");
  }

  return value;
}

function parseJwtSecret(value: unknown, nodeEnvironment: NodeEnvironment): string {
  if (value === undefined || value === null || value === "") {
    if (nodeEnvironment === "production") {
      throw new Error("JWT_SECRET must be set in production");
    }

    return DEFAULT_JWT_SECRET;
  }

  if (typeof value !== "string") {
    throw new Error("JWT_SECRET must be a string");
  }

  if (nodeEnvironment === "production" && isPlaceholderSecret(value)) {
    throw new Error("JWT_SECRET must not use a placeholder value in production");
  }

  if (value.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }

  return value;
}

function parseJwtAccessTokenTtlSeconds(value: unknown, nodeEnvironment: NodeEnvironment): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_JWT_ACCESS_TOKEN_TTL_SECONDS;
  }

  const ttlSeconds = Number(value);
  const maxTtlSeconds =
    nodeEnvironment === "production"
      ? MAX_PRODUCTION_JWT_ACCESS_TOKEN_TTL_SECONDS
      : MAX_DEVELOPMENT_JWT_ACCESS_TOKEN_TTL_SECONDS;

  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > maxTtlSeconds) {
    throw new Error(
      `JWT_ACCESS_TOKEN_TTL_SECONDS must be an integer between 60 and ${maxTtlSeconds}`
    );
  }

  return ttlSeconds;
}

function parseTrustProxyHops(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const hops = Number(value);

  if (!Number.isInteger(hops) || hops < 0 || hops > 5) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 5");
  }

  return hops;
}

function parseBooleanFlag(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error("Boolean environment flags must be true or false");
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error("Boolean environment flags must be true or false");
}

function parseRedisUrl(value: unknown, nodeEnvironment: NodeEnvironment): string {
  if (value === undefined || value === null || value === "") {
    if (nodeEnvironment === "production") {
      throw new Error("REDIS_URL must be set in production");
    }

    return DEFAULT_REDIS_URL;
  }

  if (typeof value !== "string") {
    throw new Error("REDIS_URL must be a Redis connection string");
  }

  return value;
}

function isLocalhost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.length === 0 ||
    normalized.includes("change_me") ||
    normalized.includes("reviewo_password") ||
    normalized.includes("development_jwt_secret")
  );
}
