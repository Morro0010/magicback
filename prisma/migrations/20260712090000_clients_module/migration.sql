-- Operative test-data reset authorized for the customer module rollout.
-- Keeps configuration/catalog data: User, Session, Package, Product, pricing/catalog tables.
DELETE FROM "NotificationDelivery"
WHERE "notificationId" IN (
  SELECT "id" FROM "Notification"
  WHERE "relatedReservationId" IS NOT NULL
     OR "relatedSpecialEventReservationId" IS NOT NULL
);

DELETE FROM "NotificationRead"
WHERE "notificationId" IN (
  SELECT "id" FROM "Notification"
  WHERE "relatedReservationId" IS NOT NULL
     OR "relatedSpecialEventReservationId" IS NOT NULL
);

DELETE FROM "Notification"
WHERE "relatedReservationId" IS NOT NULL
   OR "relatedSpecialEventReservationId" IS NOT NULL;

DELETE FROM "ReservationHistory";
DELETE FROM "Reservation";
DELETE FROM "SpecialEventTicket";
DELETE FROM "SpecialEventReservation";
DELETE FROM "SpecialEvent";
DELETE FROM "BlockedSlot"
WHERE "reason" ILIKE 'Evento especial:%';

ALTER SEQUENCE IF EXISTS "SpecialEventReservation_folioNumber_seq" RESTART WITH 1;

CREATE TYPE "BirthdayFollowUpStatus" AS ENUM ('PENDING', 'CONTACTED', 'NOT_INTERESTED');

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Celebrant" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "sourceReservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Celebrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BirthdayFollowUp" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "celebrantId" TEXT NOT NULL,
    "birthdayYear" INTEGER NOT NULL,
    "status" "BirthdayFollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdayFollowUp_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Reservation" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "primaryCelebrantId" TEXT;
ALTER TABLE "SpecialEventReservation" ADD COLUMN "customerId" TEXT;

CREATE UNIQUE INDEX "Customer_normalizedPhone_key" ON "Customer"("normalizedPhone");
CREATE INDEX "Customer_name_idx" ON "Customer"("name");
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

CREATE UNIQUE INDEX "Celebrant_customerId_name_birthDate_key" ON "Celebrant"("customerId", "name", "birthDate");
CREATE INDEX "Celebrant_customerId_idx" ON "Celebrant"("customerId");
CREATE INDEX "Celebrant_birthDate_idx" ON "Celebrant"("birthDate");
CREATE INDEX "Celebrant_sourceReservationId_idx" ON "Celebrant"("sourceReservationId");

CREATE UNIQUE INDEX "BirthdayFollowUp_celebrantId_birthdayYear_key" ON "BirthdayFollowUp"("celebrantId", "birthdayYear");
CREATE INDEX "BirthdayFollowUp_customerId_idx" ON "BirthdayFollowUp"("customerId");
CREATE INDEX "BirthdayFollowUp_status_idx" ON "BirthdayFollowUp"("status");
CREATE INDEX "BirthdayFollowUp_birthdayYear_idx" ON "BirthdayFollowUp"("birthdayYear");

CREATE INDEX "Reservation_customerId_idx" ON "Reservation"("customerId");
CREATE INDEX "Reservation_primaryCelebrantId_idx" ON "Reservation"("primaryCelebrantId");
CREATE INDEX "SpecialEventReservation_customerId_idx" ON "SpecialEventReservation"("customerId");

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_primaryCelebrantId_fkey" FOREIGN KEY ("primaryCelebrantId") REFERENCES "Celebrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpecialEventReservation" ADD CONSTRAINT "SpecialEventReservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Celebrant" ADD CONSTRAINT "Celebrant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Celebrant" ADD CONSTRAINT "Celebrant_sourceReservationId_fkey" FOREIGN KEY ("sourceReservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BirthdayFollowUp" ADD CONSTRAINT "BirthdayFollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BirthdayFollowUp" ADD CONSTRAINT "BirthdayFollowUp_celebrantId_fkey" FOREIGN KEY ("celebrantId") REFERENCES "Celebrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
