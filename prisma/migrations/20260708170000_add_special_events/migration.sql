-- CreateEnum
CREATE TYPE "SpecialEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SpecialEventReservationStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SpecialEventAttendeeType" AS ENUM ('CHILD', 'ADULT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SPECIAL_EVENT_RESERVATION_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SPECIAL_EVENT_PAYMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SPECIAL_EVENT_LINK_WHATSAPP';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "relatedSpecialEventReservationId" TEXT;

-- CreateTable
CREATE TABLE "SpecialEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "childPrice" DECIMAL(10,2) NOT NULL,
    "adultPrice" DECIMAL(10,2) NOT NULL,
    "capacityMax" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "includesText" TEXT NOT NULL,
    "status" "SpecialEventStatus" NOT NULL DEFAULT 'DRAFT',
    "blockedSlotId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialEventReservation" (
    "id" TEXT NOT NULL,
    "specialEventId" TEXT NOT NULL,
    "folioNumber" SERIAL NOT NULL,
    "publicTokenHash" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderPhone" TEXT NOT NULL,
    "holderEmail" TEXT,
    "comments" TEXT,
    "childCount" INTEGER NOT NULL,
    "adultCount" INTEGER NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" "SpecialEventReservationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentConfirmedAt" TIMESTAMP(3),
    "paymentConfirmedByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialEventReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialEventTicket" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attendeeName" TEXT NOT NULL,
    "attendeeType" "SpecialEventAttendeeType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialEventTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecialEvent_blockedSlotId_key" ON "SpecialEvent"("blockedSlotId");

-- CreateIndex
CREATE INDEX "SpecialEvent_eventDate_status_idx" ON "SpecialEvent"("eventDate", "status");

-- CreateIndex
CREATE INDEX "SpecialEvent_status_idx" ON "SpecialEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialEventReservation_folioNumber_key" ON "SpecialEventReservation"("folioNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialEventReservation_publicTokenHash_key" ON "SpecialEventReservation"("publicTokenHash");

-- CreateIndex
CREATE INDEX "SpecialEventReservation_specialEventId_status_idx" ON "SpecialEventReservation"("specialEventId", "status");

-- CreateIndex
CREATE INDEX "SpecialEventReservation_folioNumber_idx" ON "SpecialEventReservation"("folioNumber");

-- CreateIndex
CREATE INDEX "SpecialEventReservation_holderName_idx" ON "SpecialEventReservation"("holderName");

-- CreateIndex
CREATE INDEX "SpecialEventReservation_holderPhone_idx" ON "SpecialEventReservation"("holderPhone");

-- CreateIndex
CREATE INDEX "SpecialEventReservation_createdAt_idx" ON "SpecialEventReservation"("createdAt");

-- CreateIndex
CREATE INDEX "SpecialEventReservation_paymentConfirmedAt_idx" ON "SpecialEventReservation"("paymentConfirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialEventTicket_code_key" ON "SpecialEventTicket"("code");

-- CreateIndex
CREATE INDEX "SpecialEventTicket_reservationId_idx" ON "SpecialEventTicket"("reservationId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedSpecialEventReservationId_fkey" FOREIGN KEY ("relatedSpecialEventReservationId") REFERENCES "SpecialEventReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialEvent" ADD CONSTRAINT "SpecialEvent_blockedSlotId_fkey" FOREIGN KEY ("blockedSlotId") REFERENCES "BlockedSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialEvent" ADD CONSTRAINT "SpecialEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialEvent" ADD CONSTRAINT "SpecialEvent_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialEventReservation" ADD CONSTRAINT "SpecialEventReservation_specialEventId_fkey" FOREIGN KEY ("specialEventId") REFERENCES "SpecialEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialEventReservation" ADD CONSTRAINT "SpecialEventReservation_paymentConfirmedByUserId_fkey" FOREIGN KEY ("paymentConfirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialEventReservation" ADD CONSTRAINT "SpecialEventReservation_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialEventTicket" ADD CONSTRAINT "SpecialEventTicket_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "SpecialEventReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
