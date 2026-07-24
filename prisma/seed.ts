import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_EMAIL = 'admin@magiccity.local';
const DEFAULT_ADMIN_NAME = 'Sofía Administradora';
const DEFAULT_ADMIN_PASSWORD = 'Admin123!';

function getProductionSeedPassword() {
  const configured = process.env.SEED_ADMIN_PASSWORD;

  if (
    process.env.NODE_ENV === 'production' &&
    (!configured || configured === DEFAULT_ADMIN_PASSWORD)
  ) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be explicitly set to a non-default value in production',
    );
  }

  return configured ?? DEFAULT_ADMIN_PASSWORD;
}

async function main() {
  const email = (
    process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL
  ).trim().toLowerCase();
  const name = (process.env.SEED_ADMIN_NAME ?? DEFAULT_ADMIN_NAME).trim();
  const passwordHash = await argon2.hash(getProductionSeedPassword());

  await prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
    update: {
      name,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Production seed completed. Admin: ${email}`);
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
