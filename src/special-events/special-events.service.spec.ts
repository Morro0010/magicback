import { ConflictException } from '@nestjs/common';
import {
  SpecialEventAttendeeType,
  SpecialEventReservationStatus,
  SpecialEventStatus,
} from '@prisma/client';
import { SpecialEventsService } from './special-events.service';

const decimal = (value: number) => ({
  toNumber: () => value,
  toString: () => String(value),
});

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    name: 'Halloween Magic City',
    description: 'Evento temático',
    eventDate: new Date('2026-10-31T00:00:00.000Z'),
    startTime: '10:00',
    endTime: '12:00',
    childPrice: decimal(250),
    adultPrice: decimal(100),
    capacityMax: 10,
    imageUrl: null,
    includesText: 'Juegos\nDulces',
    status: SpecialEventStatus.PUBLISHED,
    blockedSlotId: null,
    createdByUserId: 'admin-1',
    updatedByUserId: 'admin-1',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    blockedSlot: null,
    createdByUser: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
    updatedByUser: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
    ...overrides,
  };
}

function makeReservation(event = makeEvent()) {
  return {
    id: 'reservation-1',
    specialEventId: event.id,
    specialEvent: event,
    folioNumber: 293,
    publicTokenHash: 'hash',
    holderName: 'Ana Perez',
    holderPhone: '5512345678',
    holderEmail: null,
    comments: null,
    childCount: 1,
    adultCount: 1,
    totalAmount: decimal(350),
    status: SpecialEventReservationStatus.PENDING_PAYMENT,
    paymentConfirmedAt: null,
    paymentConfirmedByUserId: null,
    paymentConfirmedByUser: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelledByUser: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    tickets: [
      {
        id: 'ticket-1',
        reservationId: 'reservation-1',
        code: '0293-01',
        attendeeName: 'Ana Perez',
        attendeeType: SpecialEventAttendeeType.ADULT,
        isReservationHolder: true,
        price: decimal(100),
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        id: 'ticket-2',
        reservationId: 'reservation-1',
        code: '0293-02',
        attendeeName: 'Mateo Perez',
        attendeeType: SpecialEventAttendeeType.CHILD,
        isReservationHolder: false,
        price: decimal(250),
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ],
  };
}

describe('SpecialEventsService', () => {
  const event = makeEvent();
  const reservation = makeReservation(event);

  const tx = {
    $queryRaw: jest.fn(),
    specialEvent: {
      findUnique: jest.fn(),
    },
    specialEventReservation: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    specialEventTicket: {
      count: jest.fn(),
      createMany: jest.fn(),
    },
  } as any;

  const prisma = {
    $transaction: jest.fn(),
  } as any;

  const configService = {
    getOrThrow: jest.fn(() => 'http://localhost:5173'),
    get: jest.fn(() => '+52 55 1234 5678'),
  } as any;

  const messagingService = {
    sendSpecialEventReservationCreated: jest.fn(),
    sendSpecialEventPaymentConfirmed: jest.fn(),
    resendSpecialEventReservationLink: jest.fn(),
  } as any;
  const customersService = {
    linkSpecialEventReservation: jest.fn(),
  } as any;

  const service = new SpecialEventsService(
    prisma,
    configService,
    messagingService,
    customersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    tx.specialEvent.findUnique.mockResolvedValue(event);
    tx.specialEventTicket.count.mockResolvedValue(0);
    tx.specialEventReservation.create.mockResolvedValue({
      id: reservation.id,
      folioNumber: reservation.folioNumber,
    });
    tx.specialEventReservation.findUniqueOrThrow.mockResolvedValue(reservation);
  });

  it('creates a pending reservation with folio-based tickets and price snapshots', async () => {
    const result = await service.createPublicReservation(event.id, {
      holderName: ' Ana Perez ',
      holderPhone: ' 5512345678 ',
      attendees: [
        { name: 'Mateo Perez', type: SpecialEventAttendeeType.CHILD },
      ],
    });

    expect(result.folio).toBe('EVT-0293');
    expect(result.totalAmount).toBe(350);
    expect(result.tickets.map((ticket) => ticket.code)).toEqual([
      '0293-01',
      '0293-02',
    ]);
    expect(tx.specialEventTicket.createMany).toHaveBeenCalledWith({
      data: [
        {
          reservationId: reservation.id,
          code: '0293-01',
          attendeeName: 'Ana Perez',
          attendeeType: SpecialEventAttendeeType.ADULT,
          isReservationHolder: true,
          price: event.adultPrice,
        },
        {
          reservationId: reservation.id,
          code: '0293-02',
          attendeeName: 'Mateo Perez',
          attendeeType: SpecialEventAttendeeType.CHILD,
          isReservationHolder: false,
          price: event.childPrice,
        },
      ],
    });
    expect(
      messagingService.sendSpecialEventReservationCreated,
    ).toHaveBeenCalled();
    expect(customersService.linkSpecialEventReservation).toHaveBeenCalledWith({
      reservationId: reservation.id,
      holderName: reservation.holderName,
      holderPhone: reservation.holderPhone,
      holderEmail: reservation.holderEmail,
    });
    expect(result.publicLink).toContain('/special-reservation#token=');
  });

  it('rejects reservations that exceed remaining capacity', async () => {
    tx.specialEvent.findUnique.mockResolvedValue(makeEvent({ capacityMax: 2 }));
    tx.specialEventTicket.count.mockResolvedValue(1);

    await expect(
      service.createPublicReservation(event.id, {
        holderName: 'Ana Perez',
        holderPhone: '5512345678',
        attendees: [
          { name: 'Mateo Perez', type: SpecialEventAttendeeType.CHILD },
        ],
      }),
    ).rejects.toThrow(ConflictException);

    expect(tx.specialEventReservation.create).not.toHaveBeenCalled();
    expect(
      messagingService.sendSpecialEventReservationCreated,
    ).not.toHaveBeenCalled();
  });
});
