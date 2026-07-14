import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import {
  addCalendarDays,
  getBusinessCalendarDate,
} from '../common/utils/date.util';
import { normalizeEventForm } from '../reservations/event-form.constants';
import { EventAreaType, EventType } from '../reservations/dto/event-form.dto';
import { PublicReservationsService } from './public-reservations.service';

describe('PublicReservationsService', () => {
  const prisma = {
    reservation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    package: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  const reservationsService = {
    assertSlotAvailability: jest.fn(),
  } as any;

  const historyService = { createEntry: jest.fn() } as any;
  const notificationsService = { createNotification: jest.fn() } as any;
  const auditService = { log: jest.fn() } as any;
  const customersService = {
    linkReservationFromEventForm: jest.fn(),
  } as any;

  const service = new PublicReservationsService(
    prisma,
    reservationsService,
    historyService,
    notificationsService,
    auditService,
    customersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeEditableReservation() {
    const eventDate = addCalendarDays(getBusinessCalendarDate(), 10);
    const eventForm = normalizeEventForm({
      eventType: EventType.SPACE_RENTAL,
      areaType: EventAreaType.AREA_CHICA,
      requiresInvoice: false,
    });
    return {
      id: 'r-editable',
      privateEventFolioNumber: null,
      publicTokenHash: 'hash',
      celebrantName: 'Cliente Demo',
      eventFormJson: eventForm,
      eventDate: new Date(`${eventDate}T00:00:00.000Z`),
      startTime: '10:00',
      endTime: '14:00',
      attendeesCount: 20,
      packageId: 'p1',
      package: { id: 'p1', name: 'Paquete', price: { toString: () => '0' } },
      theme: null,
      foodDetails: null,
      notes: null,
      status: ReservationStatus.CONFIRMED,
      advanceAmount: { toString: () => '500' },
      pendingBalance: { toString: () => '5000' },
      paymentDate: new Date('2026-07-01T00:00:00.000Z'),
      editableUntil: new Date(`${eventDate}T00:00:00.000Z`),
      createdByUserId: 'u1',
      updatedByUserId: 'u1',
      cancelledAt: null,
      updatedAt: new Date(),
    };
  }

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

  it('rejects availability dates inside the minimum lead window', async () => {
    prisma.reservation.findUnique.mockResolvedValue(makeEditableReservation());
    const invalidDate = addCalendarDays(getBusinessCalendarDate(), 3);

    await expect(
      service.getAvailabilityByToken(
        'opaque-token',
        { date: invalidDate },
        { ipAddress: '127.0.0.1' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks valid client changes for review while preserving recorded payments', async () => {
    const current = makeEditableReservation();
    const targetDate = addCalendarDays(getBusinessCalendarDate(), 8);
    const updated = {
      ...current,
      eventDate: new Date(`${targetDate}T00:00:00.000Z`),
      status: ReservationStatus.REQUESTED,
      pendingBalance: { toString: () => '5000' },
    };
    prisma.reservation.findUnique.mockResolvedValue(current);
    prisma.package.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Paquete',
      price: { toString: () => '0' },
      isActive: true,
    });
    prisma.reservation.update.mockResolvedValue(updated);

    const result = await service.updatePublicReservationByToken(
      'opaque-token',
      { eventDate: targetDate },
      { ipAddress: '127.0.0.1' },
    );

    expect(reservationsService.assertSlotAvailability).toHaveBeenCalledWith({
      eventDate: new Date(`${targetDate}T00:00:00.000Z`),
      startTime: current.startTime,
      endTime: current.endTime,
      excludeReservationId: current.id,
    });
    expect(prisma.reservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReservationStatus.REQUESTED,
          pendingBalance: 5000,
        }),
      }),
    );
    const updateData = prisma.reservation.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('advanceAmount');
    expect(updateData).not.toHaveProperty('paymentDate');
    expect(historyService.createEntry).toHaveBeenCalled();
    expect(notificationsService.createNotification).toHaveBeenCalled();
    expect(customersService.linkReservationFromEventForm).toHaveBeenCalled();
    expect(result.status).toBe(ReservationStatus.REQUESTED);
  });
});
