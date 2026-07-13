import { createSeedPrismaClient } from "./seeds/create-prisma-client.mjs";
import { UserRole } from "../dist/generated/prisma/client.js";
import { TOP_CATEGORIES } from "./top-categories.registry.mjs";

const prisma = createSeedPrismaClient();

async function seedTopCategories() {
  for (const category of TOP_CATEGORIES) {
    await prisma.topCategory.upsert({
      create: category,
      update: {
        sortOrder: category.sortOrder,
        title: category.title
      },
      where: {
        slug: category.slug
      }
    });
  }

  console.log(`Seeded ${TOP_CATEGORIES.length} top categories.`);
}

async function promoteAdminIfConfigured() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) {
    console.log("No ADMIN_EMAIL configured; skipping admin promotion.");
    return;
  }

  const user = await prisma.user.findUnique({
    where: {
      email: adminEmail
    }
  });

  if (!user) {
    console.log(`No user found for ADMIN_EMAIL=${adminEmail}; skipping admin promotion.`);
    return;
  }

  if (user.role === UserRole.ADMIN) {
    console.log(`User ${adminEmail} is already an admin.`);
    return;
  }

  await prisma.user.update({
    data: {
      role: UserRole.ADMIN
    },
    where: {
      id: user.id
    }
  });

  console.log(`Promoted ${adminEmail} to ADMIN.`);
}

async function main() {
  await seedTopCategories();
  await promoteAdminIfConfigured();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
