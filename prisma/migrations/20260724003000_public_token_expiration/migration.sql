ALTER TABLE "SpecialEventReservation"
ADD COLUMN "publicTokenExpiresAt" TIMESTAMP(3);

UPDATE "Reservation"
SET "publicTokenExpiresAt" = GREATEST(
  "eventDate" + INTERVAL '30 days',
  CURRENT_TIMESTAMP + INTERVAL '7 days'
)
WHERE "publicTokenExpiresAt" IS NULL;

UPDATE "SpecialEventReservation" AS reservation
SET "publicTokenExpiresAt" = GREATEST(
  event."eventDate" + INTERVAL '30 days',
  CURRENT_TIMESTAMP + INTERVAL '7 days'
)
FROM "SpecialEvent" AS event
WHERE reservation."specialEventId" = event."id"
  AND reservation."publicTokenExpiresAt" IS NULL;

CREATE INDEX "Reservation_publicTokenExpiresAt_idx"
ON "Reservation"("publicTokenExpiresAt");

CREATE INDEX "SpecialEventReservation_publicTokenExpiresAt_idx"
ON "SpecialEventReservation"("publicTokenExpiresAt");
