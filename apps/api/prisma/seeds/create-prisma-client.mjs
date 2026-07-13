import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../dist/generated/prisma/client.js";

export function createSeedPrismaClient() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for seed scripts.");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}
