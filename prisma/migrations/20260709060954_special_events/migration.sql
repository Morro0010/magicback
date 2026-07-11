-- DropForeignKey
ALTER TABLE "SpecialEventTicket" DROP CONSTRAINT "SpecialEventTicket_reservationId_fkey";

-- AddForeignKey
ALTER TABLE "SpecialEventTicket" ADD CONSTRAINT "SpecialEventTicket_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "SpecialEventReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
