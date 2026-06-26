export type NodeEnvironment = "development" | "production" | "test";

export interface EnvironmentVariables {
  API_PORT: number;
  CORS_ALLOWED_ORIGINS: string[];
  DATABASE_URL: string;
  JWT_ACCESS_TOKEN_TTL_SECONDS: number;
  JWT_SECRET: string;
  NODE_ENV: NodeEnvironment;
}

const DEFAULT_API_PORT = 3000;
const DEFAULT_NODE_ENV: NodeEnvironment = "development";
const DEFAULT_DEVELOPMENT_CORS_ALLOWED_ORIGINS = ["http://localhost:3001"];
const DEFAULT_DATABASE_URL = "postgresql://reviewo:reviewo_password@localhost:5432/reviewo";
const DEFAULT_JWT_ACCESS_TOKEN_TTL_SECONDS = 900;
const DEFAULT_JWT_SECRET = "reviewo_development_jwt_secret_change_me";
const VALID_NODE_ENVIRONMENTS = new Set<NodeEnvironment>(["development", "production", "test"]);

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const nodeEnvironment = parseNodeEnvironment(config["NODE_ENV"]);
  const apiPort = parsePort(config["API_PORT"]);
  const corsAllowedOrigins = parseCorsAllowedOrigins(
    config["CORS_ALLOWED_ORIGINS"],
    nodeEnvironment
  );
  const databaseUrl = parseDatabaseUrl(config["DATABASE_URL"]);
  const jwtSecret = parseJwtSecret(config["JWT_SECRET"], nodeEnvironment);
  const jwtAccessTokenTtlSeconds = parseJwtAccessTokenTtlSeconds(
    config["JWT_ACCESS_TOKEN_TTL_SECONDS"]
  );

  return {
    API_PORT: apiPort,
    CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_TOKEN_TTL_SECONDS: jwtAccessTokenTtlSeconds,
    JWT_SECRET: jwtSecret,
    NODE_ENV: nodeEnvironment
  };
}

function parseCorsAllowedOrigins(value: unknown, nodeEnvironment: NodeEnvironment): string[] {
  if (value === undefined || value === null || value === "") {
    return nodeEnvironment === "development" ? DEFAULT_DEVELOPMENT_CORS_ALLOWED_ORIGINS : [];
  }

  if (typeof value !== "string") {
    throw new Error("CORS_ALLOWED_ORIGINS must be a comma-separated list of URLs");
  }

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    try {
      const url = new URL(origin);

      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Invalid CORS origin protocol");
      }
    } catch {
      throw new Error("CORS_ALLOWED_ORIGINS must contain valid HTTP or HTTPS URLs");
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

function parseDatabaseUrl(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_DATABASE_URL;
  }

  if (typeof value !== "string") {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string");
  }

  try {
    const url = new URL(value);

    if (!["postgresql:", "postgres:"].includes(url.protocol)) {
      throw new Error("Invalid database protocol");
    }
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection string");
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

  if (nodeEnvironment === "production" && value.startsWith("change_me")) {
    throw new Error("JWT_SECRET must not use a placeholder value in production");
  }

  if (value.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }

  return value;
}

function parseJwtAccessTokenTtlSeconds(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_JWT_ACCESS_TOKEN_TTL_SECONDS;
  }

  const ttlSeconds = Number(value);

  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86400) {
    throw new Error("JWT_ACCESS_TOKEN_TTL_SECONDS must be an integer between 60 and 86400");
  }

  return ttlSeconds;
}
