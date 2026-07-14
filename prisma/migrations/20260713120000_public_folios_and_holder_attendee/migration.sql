-- Public folios remain separate from internal IDs and secure public tokens.
CREATE SEQUENCE IF NOT EXISTS "Reservation_privateEventFolioNumber_seq" START 1;

ALTER TABLE "Reservation"
ADD COLUMN "privateEventFolioNumber" INTEGER;

UPDATE "Reservation"
SET "privateEventFolioNumber" = nextval('"Reservation_privateEventFolioNumber_seq"')
WHERE "eventFormJson" ->> 'eventType' = 'private_event';

CREATE UNIQUE INDEX "Reservation_privateEventFolioNumber_key"
ON "Reservation"("privateEventFolioNumber");

ALTER SEQUENCE "Reservation_privateEventFolioNumber_seq"
OWNED BY "Reservation"."privateEventFolioNumber";

ALTER TABLE "SpecialEventTicket"
ADD COLUMN "isReservationHolder" BOOLEAN NOT NULL DEFAULT false;

-- Preserve financial and capacity snapshots. Existing reservations only mark an
-- adult ticket when its name already matches the holder; no attendee is added.
WITH matching_holder AS (
  SELECT
    ticket."id",
    row_number() OVER (
      PARTITION BY ticket."reservationId"
      ORDER BY ticket."createdAt", ticket."id"
    ) AS row_number
  FROM "SpecialEventTicket" ticket
  INNER JOIN "SpecialEventReservation" reservation
    ON reservation."id" = ticket."reservationId"
  WHERE ticket."attendeeType" = 'ADULT'
    AND lower(trim(ticket."attendeeName")) = lower(trim(reservation."holderName"))
)
UPDATE "SpecialEventTicket" ticket
SET "isReservationHolder" = true
FROM matching_holder
WHERE ticket."id" = matching_holder."id"
  AND matching_holder.row_number = 1;

CREATE INDEX "SpecialEventTicket_reservationId_isReservationHolder_idx"
ON "SpecialEventTicket"("reservationId", "isReservationHolder");

CREATE UNIQUE INDEX "SpecialEventTicket_one_holder_per_reservation_key"
ON "SpecialEventTicket"("reservationId")
WHERE "isReservationHolder" = true;
