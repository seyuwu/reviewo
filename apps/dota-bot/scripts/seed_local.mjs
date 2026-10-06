import { createSeedPrismaClient } from "../../api/prisma/seeds/create-prisma-client.mjs";

const expectedDatabase = "postgresql://fdp_local:fdp_local_only@127.0.0.1:32208/fdp_local_bot";
if (process.env.DATABASE_URL !== expectedDatabase) {
  throw new Error("This script only works with the isolated local bot database");
}
const prisma = createSeedPrismaClient();
try {
  await prisma.gamesLaunchSetting.upsert({
    where: { id: "default" },
    create: { id: "default", communityOpen: true, searchLive: true },
    update: { communityOpen: true, searchLive: true }
  });
  console.log("Local community and teammate search are open.");
} finally {
  await prisma.$disconnect();
}
