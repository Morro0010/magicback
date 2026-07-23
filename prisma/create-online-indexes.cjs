require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const indexes = [
  {
    name: 'Customer_name_trgm_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Customer_name_trgm_idx" ON "Customer" USING GIN ("name" gin_trgm_ops)',
  },
  {
    name: 'Customer_phone_trgm_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Customer_phone_trgm_idx" ON "Customer" USING GIN ("phone" gin_trgm_ops)',
  },
  {
    name: 'Product_name_trgm_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops)',
  },
  {
    name: 'CustomerReview_customerName_trgm_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "CustomerReview_customerName_trgm_idx" ON "CustomerReview" USING GIN ("customerName" gin_trgm_ops)',
  },
  {
    name: 'SpecialEvent_name_trgm_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SpecialEvent_name_trgm_idx" ON "SpecialEvent" USING GIN ("name" gin_trgm_ops)',
  },
  {
    name: 'SpecialEvent_description_trgm_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SpecialEvent_description_trgm_idx" ON "SpecialEvent" USING GIN ("description" gin_trgm_ops)',
  },
  {
    name: 'SpecialEventReservation_holderName_trgm_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SpecialEventReservation_holderName_trgm_idx" ON "SpecialEventReservation" USING GIN ("holderName" gin_trgm_ops)',
  },
  {
    name: 'SpecialEventReservation_holderPhone_trgm_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SpecialEventReservation_holderPhone_trgm_idx" ON "SpecialEventReservation" USING GIN ("holderPhone" gin_trgm_ops)',
  },
  {
    name: 'Product_active_category_name_id_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_active_category_name_id_idx" ON "Product" ("isActive", "category", "name", "id")',
  },
  {
    name: 'Sale_createdAt_id_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Sale_createdAt_id_idx" ON "Sale" ("createdAt" DESC, "id" DESC)',
  },
  {
    name: 'Purchase_createdAt_id_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Purchase_createdAt_id_idx" ON "Purchase" ("createdAt" DESC, "id" DESC)',
  },
  {
    name: 'InventoryMovement_createdAt_id_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "InventoryMovement_createdAt_id_idx" ON "InventoryMovement" ("createdAt" DESC, "id" DESC)',
  },
  {
    name: 'Notification_createdAt_id_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_createdAt_id_idx" ON "Notification" ("createdAt" DESC, "id" DESC)',
  },
  {
    name: 'SpecialEvent_status_eventDate_id_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "SpecialEvent_status_eventDate_id_idx" ON "SpecialEvent" ("status", "eventDate", "id")',
  },
  {
    name: 'Celebrant_birth_month_day_idx',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Celebrant_birth_month_day_idx" ON "Celebrant" ((EXTRACT(MONTH FROM "birthDate")), (EXTRACT(DAY FROM "birthDate")))',
  },
];

async function main() {
  await prisma.$executeRawUnsafe("SET lock_timeout = '5s'");
  await prisma.$executeRawUnsafe("SET statement_timeout = '10min'");

  const invalidIndexes = await prisma.$queryRawUnsafe(
    `SELECT index_class.relname AS name
     FROM pg_index
     JOIN pg_class AS index_class ON index_class.oid = pg_index.indexrelid
     WHERE NOT pg_index.indisvalid
       AND index_class.relname IN (${indexes.map(({ name }) => `'${name}'`).join(', ')})`,
  );

  const invalidNames = new Set(invalidIndexes.map(({ name }) => name));
  for (const { name } of indexes) {
    if (invalidNames.has(name)) {
      await prisma.$executeRawUnsafe(
        `DROP INDEX CONCURRENTLY IF EXISTS "${name}"`,
      );
    }
  }

  for (const { name, sql } of indexes) {
    process.stdout.write(`Ensuring ${name}... `);
    await prisma.$executeRawUnsafe(sql);
    process.stdout.write('ok\n');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
