import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    url:
      process.env["DATABASE_URL"] ?? "postgresql://reviewo:reviewo_password@localhost:5432/reviewo"
  },
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs"
  },
  schema: "prisma/schema.prisma"
});
