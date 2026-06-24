import { registerAs } from "@nestjs/config";

import type { NodeEnvironment } from "./environment.validation.js";

export interface ApplicationConfig {
  databaseUrl: string;
  environment: NodeEnvironment;
  port: number;
}

export const environmentConfig = registerAs(
  "app",
  (): ApplicationConfig => ({
    databaseUrl:
      process.env["DATABASE_URL"] ?? "postgresql://reviewo:reviewo_password@localhost:5432/reviewo",
    environment: (process.env["NODE_ENV"] ?? "development") as NodeEnvironment,
    port: Number(process.env["API_PORT"] ?? 3000)
  })
);
