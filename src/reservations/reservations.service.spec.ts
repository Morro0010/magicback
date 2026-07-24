import { ConflictException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { normalizeEventForm } from './event-form.constants';
import { EventAreaType, EventType } from './dto/event-form.dto';
import { ReservationsService } from './reservations.service';

describe('ReservationsService', () => {
  const prisma = {
    blockedSlot: {
      findMany: jest.fn(),
    },
    reservation: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const notificationsService = { createNotification: jest.fn() } as any;
  const historyService = { createEntry: jest.fn() } as any;
  const auditService = { log: jest.fn() } as any;
  const configService = {
    getOrThrow: jest.fn(() => 'http://localhost:5173'),
  } as any;
  const customersService = {
    linkReservationFromEventForm: jest.fn(),
  } as any;

  const service = new ReservationsService(
    prisma,
    notificationsService,
    historyService,
    auditService,
    configService,
    customersService,
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

  it.each([
    ReservationStatus.CONFIRMED,
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
  ])(
    'allows staff to edit a %s reservation and change its status',
    async (status) => {
      const eventForm = normalizeEventForm({
        eventType: EventType.SPACE_RENTAL,
        areaType: EventAreaType.AREA_CHICA,
        requiresInvoice: false,
      });
      const current = {
        id: 'r1',
        privateEventFolioNumber: null,
        celebrantName: 'Cliente Demo',
        eventDate: new Date('2026-08-20T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '14:00',
        attendeesCount: 20,
        packageId: 'package-1',
        package: {
          id: 'package-1',
          name: 'Paquete',
          price: 5000,
          isActive: true,
        },
        eventFormJson: eventForm,
        theme: null,
        foodDetails: null,
        notes: null,
        status,
        advanceAmount: 1000,
        advancePaymentMethod: null,
        pendingBalance: 4000,
        paymentDate: null,
        editableUntil: new Date('2026-08-17T00:00:00.000Z'),
        createdByUserId: 'admin-1',
        updatedByUserId: 'admin-1',
        createdByUser: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
        updatedByUser: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
        cancelledAt: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      };
      prisma.reservation.findUnique.mockResolvedValue(current);
      prisma.reservation.update.mockResolvedValue({
        ...current,
        status: ReservationStatus.REQUESTED,
      });

      const result = await service.updateReservation(
        current.id,
        { status: ReservationStatus.REQUESTED },
        { id: 'cashier-1' },
      );

      expect(prisma.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReservationStatus.REQUESTED,
            updatedByUserId: 'cashier-1',
          }),
        }),
      );
      expect(result.status).toBe(ReservationStatus.REQUESTED);
    },
  );
});
