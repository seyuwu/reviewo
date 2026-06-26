import { registerAs } from "@nestjs/config";

import type { NodeEnvironment } from "./environment.validation.js";

export interface ApplicationConfig {
  corsAllowedOrigins: string[];
  databaseUrl: string;
  environment: NodeEnvironment;
  jwtAccessTokenTtlSeconds: number;
  jwtSecret: string;
  port: number;
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
    jwtAccessTokenTtlSeconds: Number(process.env["JWT_ACCESS_TOKEN_TTL_SECONDS"] ?? 900),
    jwtSecret: process.env["JWT_SECRET"] ?? "reviewo_development_jwt_secret_change_me",
    port: Number(process.env["API_PORT"] ?? 3000)
  })
);

function parseCorsAllowedOrigins(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment
): string[] {
  if (!value) {
    return nodeEnvironment === "development" ? ["http://localhost:3001"] : [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
