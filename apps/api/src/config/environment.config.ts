import { registerAs } from "@nestjs/config";

import type { NodeEnvironment } from "./environment.validation.js";

export interface ApplicationConfig {
  environment: NodeEnvironment;
  port: number;
}

export const environmentConfig = registerAs(
  "app",
  (): ApplicationConfig => ({
    environment: (process.env["NODE_ENV"] ?? "development") as NodeEnvironment,
    port: Number(process.env["API_PORT"] ?? 3000)
  })
);
