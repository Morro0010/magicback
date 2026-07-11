import { ConflictException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

describe('ReservationsService', () => {
  const prisma = {
    blockedSlot: {
      findMany: jest.fn(),
    },
    reservation: {
      findMany: jest.fn(),
    },
  } as any;

  const notificationsService = { createNotification: jest.fn() } as any;
  const historyService = { createEntry: jest.fn() } as any;
  const auditService = { log: jest.fn() } as any;
  const configService = { getOrThrow: jest.fn(() => 'http://localhost:5173') } as any;

  const service = new ReservationsService(
    prisma,
    notificationsService,
    historyService,
    auditService,
    configService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects blocked slot overlap', async () => {
    prisma.blockedSlot.findMany.mockResolvedValue([
      {
        startTime: '10:00',
        endTime: '12:00',
      },
    ]);
    prisma.reservation.findMany.mockResolvedValue([]);

    await expect(
      service.assertSlotAvailability({
        eventDate: new Date('2026-06-01T00:00:00.000Z'),
        startTime: '11:00',
        endTime: '13:00',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('detects reservation overlap', async () => {
    prisma.blockedSlot.findMany.mockResolvedValue([]);
    prisma.reservation.findMany.mockResolvedValue([
      {
        id: 'r1',
        startTime: '15:00',
        endTime: '17:00',
      },
    ]);

    await expect(
      service.assertSlotAvailability({
        eventDate: new Date('2026-06-01T00:00:00.000Z'),
        startTime: '16:00',
        endTime: '18:00',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
