import { ReservationStatus } from '@prisma/client';
import { isPublicReservationModificationAllowed } from './reservation-status.util';

describe('public reservation modification status', () => {
  it.each([ReservationStatus.REQUESTED, ReservationStatus.PENDING_PAYMENT])(
    'allows customers to change %s reservations',
    (status) => {
      expect(isPublicReservationModificationAllowed(status)).toBe(true);
    },
  );

  it.each([
    ReservationStatus.HELD,
    ReservationStatus.CONFIRMED,
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
  ])('blocks customers from changing %s reservations', (status) => {
    expect(isPublicReservationModificationAllowed(status)).toBe(false);
  });
});
