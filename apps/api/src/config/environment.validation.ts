export type NodeEnvironment = "development" | "production" | "test";

export interface EnvironmentVariables {
  API_PORT: number;
  DATABASE_URL: string;
  NODE_ENV: NodeEnvironment;
}

const DEFAULT_API_PORT = 3000;
const DEFAULT_NODE_ENV: NodeEnvironment = "development";
const DEFAULT_DATABASE_URL = "postgresql://reviewo:reviewo_password@localhost:5432/reviewo";
const VALID_NODE_ENVIRONMENTS = new Set<NodeEnvironment>(["development", "production", "test"]);

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const nodeEnvironment = parseNodeEnvironment(config["NODE_ENV"]);
  const apiPort = parsePort(config["API_PORT"]);
  const databaseUrl = parseDatabaseUrl(config["DATABASE_URL"]);

  return {
    API_PORT: apiPort,
    DATABASE_URL: databaseUrl,
    NODE_ENV: nodeEnvironment
  };
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
