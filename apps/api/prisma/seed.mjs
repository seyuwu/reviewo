import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
