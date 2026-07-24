import { ReservationStatus } from '@prisma/client';

export const MODIFIABLE_RESERVATION_STATUSES = new Set<ReservationStatus>([
  ReservationStatus.REQUESTED,
  ReservationStatus.PENDING_PAYMENT,
]);

export function isPublicReservationModificationAllowed(
  status: ReservationStatus,
) {
  return MODIFIABLE_RESERVATION_STATUSES.has(status);
}
