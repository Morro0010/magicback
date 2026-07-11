import { ForbiddenException } from '@nestjs/common';
import { PublicReservationsService } from './public-reservations.service';

describe('PublicReservationsService', () => {
  const prisma = {
    reservation: {
      findUnique: jest.fn(),
    },
  } as any;

  const reservationsService = {
    assertSlotAvailability: jest.fn(),
  } as any;

  const historyService = { createEntry: jest.fn() } as any;
  const notificationsService = { createNotification: jest.fn() } as any;
  const auditService = { log: jest.fn() } as any;

  const service = new PublicReservationsService(
    prisma,
    reservationsService,
    historyService,
    notificationsService,
    auditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks edition when event is 3 days or less away', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'r1',
      publicTokenHash: 'hash',
      celebrantName: 'Test',
      eventDate: new Date(),
      startTime: '12:00',
      endTime: '14:00',
      attendeesCount: 20,
      packageId: 'p1',
      package: { id: 'p1', name: 'Paquete', price: 1000 },
      theme: null,
      foodDetails: null,
      notes: null,
      status: 'CONFIRMED',
      advanceAmount: 500,
      pendingBalance: 500,
      paymentDate: null,
      editableUntil: new Date(Date.now() - 60_000),
      createdByUserId: 'u1',
      updatedByUserId: 'u1',
      cancelledAt: null,
      updatedAt: new Date(),
    });

    await expect(
      service.updatePublicReservationByToken(
        'opaque-token',
        {
          theme: 'Nuevo tema',
        },
        { ipAddress: '127.0.0.1' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
