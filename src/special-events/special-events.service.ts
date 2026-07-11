import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ReservationStatus,
  SpecialEvent,
  SpecialEventAttendeeType,
  SpecialEventReservationStatus,
  SpecialEventStatus,
} from '@prisma/client';
import { parseEventDate, rangesOverlap, toIsoDate, validateTimeRange } from '../common/utils/date.util';
import { generateOpaqueToken, hashOpaqueToken } from '../common/utils/security.util';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialEventReservationDto } from './dto/create-special-event-reservation.dto';
import { CreateSpecialEventDto } from './dto/create-special-event.dto';
import { ListSpecialEventReservationsQueryDto } from './dto/list-special-event-reservations-query.dto';
import { ListSpecialEventsQueryDto } from './dto/list-special-events-query.dto';
import { UpdateSpecialEventDto } from './dto/update-special-event.dto';

const ACTIVE_SPECIAL_RESERVATION_STATUSES = [
  SpecialEventReservationStatus.PENDING_PAYMENT,
  SpecialEventReservationStatus.PAYMENT_CONFIRMED,
] as const;

const SPECIAL_EVENT_INCLUDE = {
  blockedSlot: true,
  createdByUser: { select: { id: true, name: true, role: true } },
  updatedByUser: { select: { id: true, name: true, role: true } },
} satisfies Prisma.SpecialEventInclude;

const SPECIAL_RESERVATION_INCLUDE = {
  specialEvent: true,
  tickets: { orderBy: { code: 'asc' } },
  paymentConfirmedByUser: { select: { id: true, name: true, role: true } },
  cancelledByUser: { select: { id: true, name: true, role: true } },
} satisfies Prisma.SpecialEventReservationInclude;

type SpecialEventWithInclude = Prisma.SpecialEventGetPayload<{ include: typeof SPECIAL_EVENT_INCLUDE }>;
type SpecialReservationWithInclude = Prisma.SpecialEventReservationGetPayload<{
  include: typeof SPECIAL_RESERVATION_INCLUDE;
}>;
type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class SpecialEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly messagingService: MessagingService,
  ) {}

  async listAdminEvents(query: ListSpecialEventsQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.SpecialEventWhereInput = {
      status: query.status,
      OR: query.search
        ? [
            { name: { contains: query.search.trim(), mode: 'insensitive' } },
            { description: { contains: query.search.trim(), mode: 'insensitive' } },
          ]
        : undefined,
      eventDate:
        query.from || query.to
          ? {
              gte: query.from ? parseEventDate(query.from) : undefined,
              lte: query.to ? parseEventDate(query.to) : undefined,
            }
          : undefined,
    };

    const [total, events] = await this.prisma.$transaction([
      this.prisma.specialEvent.count({ where }),
      this.prisma.specialEvent.findMany({
        where,
        include: SPECIAL_EVENT_INCLUDE,
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = await Promise.all(events.map((event) => this.toEventResponse(event)));
    return { page, limit, total, items };
  }

  async listPublicEvents() {
    const today = this.today();
    const events = await this.prisma.specialEvent.findMany({
      where: {
        status: SpecialEventStatus.PUBLISHED,
        eventDate: { gte: today },
      },
      include: SPECIAL_EVENT_INCLUDE,
      orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
      take: 50,
    });

    return {
      items: await Promise.all(events.map((event) => this.toEventResponse(event))),
    };
  }

  async getAdminEvent(id: string) {
    const event = await this.findEventOrThrow(id);
    return this.toEventResponse(event);
  }

  async getPublicEvent(id: string) {
    const event = await this.findEventOrThrow(id);
    if (!this.isPubliclyReservable(event)) {
      throw new NotFoundException('Evento no disponible');
    }

    return this.toEventResponse(event);
  }

  async createEvent(dto: CreateSpecialEventDto, actorUserId: string) {
    if (dto.status && dto.status !== SpecialEventStatus.DRAFT) {
      throw new BadRequestException('Usa las acciones de publicación para cambiar el estado del evento');
    }

    this.assertValidEventInput(dto);
    const created = await this.prisma.specialEvent.create({
      data: {
        name: dto.name.trim(),
        description: dto.description.trim(),
        eventDate: parseEventDate(dto.eventDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        childPrice: dto.childPrice,
        adultPrice: dto.adultPrice,
        capacityMax: dto.capacityMax,
        imageUrl: dto.imageUrl?.trim() || null,
        includesText: dto.includesText.trim(),
        status: SpecialEventStatus.DRAFT,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      include: SPECIAL_EVENT_INCLUDE,
    });

    return this.toEventResponse(created);
  }

  async updateEvent(id: string, dto: UpdateSpecialEventDto, actorUserId: string) {
    if (dto.status) {
      throw new BadRequestException('Usa las acciones de publicación para cambiar el estado del evento');
    }

    const current = await this.findEventOrThrow(id);
    const next = {
      name: dto.name ?? current.name,
      description: dto.description ?? current.description,
      eventDate: dto.eventDate ?? toIsoDate(current.eventDate),
      startTime: dto.startTime ?? current.startTime,
      endTime: dto.endTime ?? current.endTime,
      childPrice: dto.childPrice ?? this.toNumber(current.childPrice),
      adultPrice: dto.adultPrice ?? this.toNumber(current.adultPrice),
      capacityMax: dto.capacityMax ?? current.capacityMax,
      imageUrl: dto.imageUrl ?? current.imageUrl ?? undefined,
      includesText: dto.includesText ?? current.includesText,
    };
    this.assertValidEventInput(next);

    const activeSeats = await this.countReservedSeats(id);
    if (next.capacityMax < activeSeats) {
      throw new BadRequestException('El cupo máximo no puede ser menor al cupo ya reservado');
    }

    if (current.status === SpecialEventStatus.PUBLISHED) {
      await this.ensureCanBlockDate({
        eventId: id,
        eventDate: parseEventDate(next.eventDate),
        excludeBlockedSlotId: current.blockedSlotId ?? undefined,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const event = await tx.specialEvent.update({
        where: { id },
        data: {
          name: next.name.trim(),
          description: next.description.trim(),
          eventDate: parseEventDate(next.eventDate),
          startTime: next.startTime,
          endTime: next.endTime,
          childPrice: next.childPrice,
          adultPrice: next.adultPrice,
          capacityMax: next.capacityMax,
          imageUrl: next.imageUrl?.trim() || null,
          includesText: next.includesText.trim(),
          updatedByUserId: actorUserId,
        },
        include: SPECIAL_EVENT_INCLUDE,
      });

      if (event.status === SpecialEventStatus.PUBLISHED && event.blockedSlotId) {
        await tx.blockedSlot.update({
          where: { id: event.blockedSlotId },
          data: {
            date: event.eventDate,
            startTime: '00:00',
            endTime: '23:59',
            reason: `Evento especial: ${event.name}`,
          },
        });
      }

      return event;
    });

    return this.toEventResponse(updated);
  }

  async publishEvent(id: string, actorUserId: string) {
    const event = await this.findEventOrThrow(id);
    if (event.status === SpecialEventStatus.CANCELLED) {
      throw new BadRequestException('No se puede publicar un evento cancelado');
    }

    if (event.eventDate < this.today()) {
      throw new BadRequestException('No se puede publicar un evento en fecha pasada');
    }

    await this.ensureCanBlockDate({
      eventId: event.id,
      eventDate: event.eventDate,
      excludeBlockedSlotId: event.blockedSlotId ?? undefined,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      let blockedSlotId = event.blockedSlotId;
      if (blockedSlotId) {
        await tx.blockedSlot.update({
          where: { id: blockedSlotId },
          data: {
            date: event.eventDate,
            startTime: '00:00',
            endTime: '23:59',
            reason: `Evento especial: ${event.name}`,
          },
        });
      } else {
        const blocked = await tx.blockedSlot.create({
          data: {
            date: event.eventDate,
            startTime: '00:00',
            endTime: '23:59',
            reason: `Evento especial: ${event.name}`,
            createdByUserId: actorUserId,
          },
        });
        blockedSlotId = blocked.id;
      }

      return tx.specialEvent.update({
        where: { id },
        data: {
          status: SpecialEventStatus.PUBLISHED,
          blockedSlotId,
          updatedByUserId: actorUserId,
        },
        include: SPECIAL_EVENT_INCLUDE,
      });
    });

    return this.toEventResponse(updated);
  }

  async unpublishEvent(id: string, actorUserId: string) {
    return this.setInactiveStatus(id, SpecialEventStatus.DRAFT, actorUserId);
  }

  async closeEvent(id: string, actorUserId: string) {
    const updated = await this.prisma.specialEvent.update({
      where: { id },
      data: {
        status: SpecialEventStatus.CLOSED,
        updatedByUserId: actorUserId,
      },
      include: SPECIAL_EVENT_INCLUDE,
    });

    return this.toEventResponse(updated);
  }

  async cancelEvent(id: string, actorUserId: string) {
    return this.setInactiveStatus(id, SpecialEventStatus.CANCELLED, actorUserId);
  }

  async listEventReservations(eventId: string, query: ListSpecialEventReservationsQueryDto = {}) {
    await this.findEventOrThrow(eventId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const numericSearch = query.search && /^\d+$/.test(query.search.trim()) ? Number(query.search.trim()) : undefined;
    const where: Prisma.SpecialEventReservationWhereInput = {
      specialEventId: eventId,
      status: query.status,
      OR: query.search
        ? [
            { holderName: { contains: query.search.trim(), mode: 'insensitive' } },
            { holderPhone: { contains: query.search.trim(), mode: 'insensitive' } },
            ...(numericSearch ? [{ folioNumber: numericSearch }] : []),
          ]
        : undefined,
    };

    const [total, reservations] = await this.prisma.$transaction([
      this.prisma.specialEventReservation.count({ where }),
      this.prisma.specialEventReservation.findMany({
        where,
        include: SPECIAL_RESERVATION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: reservations.map((reservation) => this.toReservationResponse(reservation, true)),
    };
  }

  async getReservationById(id: string) {
    const reservation = await this.prisma.specialEventReservation.findUnique({
      where: { id },
      include: SPECIAL_RESERVATION_INCLUDE,
    });
    if (!reservation) {
      throw new NotFoundException('Reserva especial no encontrada');
    }

    return this.toReservationResponse(reservation, true);
  }

  async getPublicReservationByToken(token: string) {
    const reservation = await this.findReservationByTokenOrThrow(token);
    return this.toReservationResponse(reservation, true);
  }

  async createPublicReservation(eventId: string, dto: CreateSpecialEventReservationDto) {
    const publicToken = generateOpaqueToken(32);
    const reservation = await this.prisma.$transaction(async (tx) => {
      await this.lockEvent(tx, eventId);
      const event = await tx.specialEvent.findUnique({ where: { id: eventId } });
      if (!event || !this.isPubliclyReservable(event)) {
        throw new BadRequestException('Evento no disponible para reservar');
      }

      const totals = await this.calculateReservationTotals(tx, event, dto.attendees);
      const created = await tx.specialEventReservation.create({
        data: {
          specialEventId: event.id,
          publicTokenHash: hashOpaqueToken(publicToken),
          holderName: dto.holderName.trim(),
          holderPhone: dto.holderPhone.trim(),
          holderEmail: dto.holderEmail?.trim() || null,
          comments: dto.comments?.trim() || null,
          childCount: totals.childCount,
          adultCount: totals.adultCount,
          totalAmount: totals.totalAmount,
        },
      });

      await tx.specialEventTicket.createMany({
        data: dto.attendees.map((attendee, index) => ({
          reservationId: created.id,
          code: this.buildTicketCode(created.folioNumber, index),
          attendeeName: attendee.name.trim(),
          attendeeType: attendee.type,
          price: attendee.type === SpecialEventAttendeeType.CHILD ? event.childPrice : event.adultPrice,
        })),
      });

      return tx.specialEventReservation.findUniqueOrThrow({
        where: { id: created.id },
        include: SPECIAL_RESERVATION_INCLUDE,
      });
    });

    await this.trySendSpecialReservationCreated(reservation, publicToken);
    return {
      ...this.toReservationResponse(reservation, true),
      publicLink: this.buildPublicReservationUrl(publicToken),
    };
  }

  async updatePublicReservationByToken(token: string, dto: CreateSpecialEventReservationDto) {
    const current = await this.findReservationByTokenOrThrow(token);
    if (current.status !== SpecialEventReservationStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Esta reserva ya fue confirmada. Si necesitas hacer cambios, comunícate con administración.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockEvent(tx, current.specialEventId);
      const event = await tx.specialEvent.findUnique({ where: { id: current.specialEventId } });
      if (!event || !this.isPubliclyReservable(event)) {
        throw new BadRequestException('Evento no disponible para editar');
      }

      const totals = await this.calculateReservationTotals(tx, event, dto.attendees, current.id);

      await tx.specialEventTicket.deleteMany({ where: { reservationId: current.id } });
      await tx.specialEventReservation.update({
        where: { id: current.id },
        data: {
          holderName: dto.holderName.trim(),
          holderPhone: dto.holderPhone.trim(),
          holderEmail: dto.holderEmail?.trim() || null,
          comments: dto.comments?.trim() || null,
          childCount: totals.childCount,
          adultCount: totals.adultCount,
          totalAmount: totals.totalAmount,
        },
      });
      await tx.specialEventTicket.createMany({
        data: dto.attendees.map((attendee, index) => ({
          reservationId: current.id,
          code: this.buildTicketCode(current.folioNumber, index),
          attendeeName: attendee.name.trim(),
          attendeeType: attendee.type,
          price: attendee.type === SpecialEventAttendeeType.CHILD ? event.childPrice : event.adultPrice,
        })),
      });

      return tx.specialEventReservation.findUniqueOrThrow({
        where: { id: current.id },
        include: SPECIAL_RESERVATION_INCLUDE,
      });
    });

    return this.toReservationResponse(updated, true);
  }

  async confirmReservationPayment(id: string, actorUserId: string) {
    const current = await this.getReservationByIdInternal(id);
    if (current.status === SpecialEventReservationStatus.CANCELLED) {
      throw new BadRequestException('No se puede confirmar una reserva cancelada');
    }

    const updated = await this.prisma.specialEventReservation.update({
      where: { id },
      data: {
        status: SpecialEventReservationStatus.PAYMENT_CONFIRMED,
        paymentConfirmedAt: new Date(),
        paymentConfirmedByUserId: actorUserId,
      },
      include: SPECIAL_RESERVATION_INCLUDE,
    });

    await this.trySendSpecialPaymentConfirmed(updated, actorUserId);
    return this.toReservationResponse(updated, true);
  }

  async cancelReservation(id: string, actorUserId: string) {
    const current = await this.prisma.specialEventReservation.findUnique({
      where: { id },
      include: SPECIAL_RESERVATION_INCLUDE,
    });
    if (!current) {
      throw new NotFoundException('Reserva especial no encontrada');
    }
    if (current.status === SpecialEventReservationStatus.CANCELLED) {
      return this.toReservationResponse(current, true);
    }

    const updated = await this.prisma.specialEventReservation.update({
      where: { id },
      data: {
        status: SpecialEventReservationStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: actorUserId,
      },
      include: SPECIAL_RESERVATION_INCLUDE,
    });

    return this.toReservationResponse(updated, true);
  }

  async resendReservationLink(id: string, actorUserId: string) {
    const reservation = await this.getReservationByIdInternal(id);
    const token = generateOpaqueToken(32);
    const updated = await this.prisma.specialEventReservation.update({
      where: { id },
      data: {
        publicTokenHash: hashOpaqueToken(token),
      },
      include: SPECIAL_RESERVATION_INCLUDE,
    });

    const deliveries = await this.messagingService.resendSpecialEventReservationLink({
      reservationId: updated.id,
      holderName: updated.holderName,
      holderPhone: updated.holderPhone,
      eventName: updated.specialEvent.name,
      folio: this.formatFolio(updated.folioNumber),
      trackingLink: this.buildPublicReservationUrl(token),
      actorUserId,
    });

    return {
      reservationId: reservation.id,
      publicLink: this.buildPublicReservationUrl(token),
      deliveries: deliveries.deliveries,
    };
  }

  async getFinanceSummary(range: { from?: Date; to?: Date }) {
    const createdWhere = this.whereByCreatedRange(range);
    const confirmedWhere = this.whereByPaymentRange(range);
    const [expected, confirmed, pending, pendingCount, confirmedCount, cancelledCount] = await this.prisma.$transaction([
      this.prisma.specialEventReservation.aggregate({
        where: {
          ...createdWhere,
          status: { in: [...ACTIVE_SPECIAL_RESERVATION_STATUSES] },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.specialEventReservation.aggregate({
        where: {
          ...confirmedWhere,
          status: SpecialEventReservationStatus.PAYMENT_CONFIRMED,
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.specialEventReservation.aggregate({
        where: {
          ...createdWhere,
          status: SpecialEventReservationStatus.PENDING_PAYMENT,
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.specialEventReservation.count({
        where: { ...createdWhere, status: SpecialEventReservationStatus.PENDING_PAYMENT },
      }),
      this.prisma.specialEventReservation.count({
        where: { ...createdWhere, status: SpecialEventReservationStatus.PAYMENT_CONFIRMED },
      }),
      this.prisma.specialEventReservation.count({
        where: { ...createdWhere, status: SpecialEventReservationStatus.CANCELLED },
      }),
    ]);

    return {
      expectedSpecialEventIncomePeriod: expected._sum.totalAmount?.toNumber() ?? 0,
      confirmedSpecialEventIncomePeriod: confirmed._sum.totalAmount?.toNumber() ?? 0,
      pendingSpecialEventIncomePeriod: pending._sum.totalAmount?.toNumber() ?? 0,
      reservationCounts: {
        pendingPayment: pendingCount,
        paymentConfirmed: confirmedCount,
        cancelled: cancelledCount,
      },
    };
  }

  private async setInactiveStatus(id: string, status: SpecialEventStatus, actorUserId: string) {
    const event = await this.findEventOrThrow(id);
    const activeReservations = await this.countActiveReservations(id);
    let warning: string | null = null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (event.blockedSlotId && activeReservations > 0) {
        warning = 'El bloqueo se mantiene porque existen reservas especiales activas o pagos asociados.';
      }

      const nextEvent = await tx.specialEvent.update({
        where: { id },
        data: {
          status,
          blockedSlotId: activeReservations === 0 ? null : event.blockedSlotId,
          updatedByUserId: actorUserId,
        },
        include: SPECIAL_EVENT_INCLUDE,
      });

      if (event.blockedSlotId && activeReservations === 0) {
        await tx.blockedSlot.delete({ where: { id: event.blockedSlotId } });
      }

      return nextEvent;
    });

    return {
      event: await this.toEventResponse(updated),
      warning,
    };
  }

  private assertValidEventInput(input: {
    name: string;
    description: string;
    eventDate: string;
    startTime: string;
    endTime: string;
    childPrice: number;
    adultPrice: number;
    capacityMax: number;
    includesText: string;
  }) {
    try {
      validateTimeRange(input.startTime, input.endTime);
    } catch {
      throw new BadRequestException('Horario inválido');
    }

    if (!input.name.trim() || !input.description.trim() || !input.includesText.trim()) {
      throw new BadRequestException('Nombre, descripción e incluye son requeridos');
    }
    if (input.childPrice < 0 || input.adultPrice < 0 || input.capacityMax <= 0) {
      throw new BadRequestException('Precios y cupo inválidos');
    }
  }

  private async ensureCanBlockDate(input: { eventId: string; eventDate: Date; excludeBlockedSlotId?: string }) {
    const [reservations, blockedSlots] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where: {
          eventDate: input.eventDate,
          status: { not: ReservationStatus.CANCELLED },
        },
        select: { id: true },
        take: 1,
      }),
      this.prisma.blockedSlot.findMany({
        where: {
          date: input.eventDate,
          id: input.excludeBlockedSlotId ? { not: input.excludeBlockedSlotId } : undefined,
        },
        select: { id: true, startTime: true, endTime: true },
      }),
    ]);

    if (reservations.length > 0) {
      throw new ConflictException('La fecha ya tiene reservaciones normales activas');
    }
    if (blockedSlots.some((slot) => rangesOverlap('00:00', '23:59', slot.startTime, slot.endTime))) {
      throw new ConflictException('La fecha ya tiene bloqueos activos');
    }
  }

  private async calculateReservationTotals(
    tx: TransactionClient,
    event: SpecialEvent,
    attendees: CreateSpecialEventReservationDto['attendees'],
    excludeReservationId?: string,
  ) {
    if (attendees.length === 0) {
      throw new BadRequestException('Agrega al menos un asistente');
    }
    const reservedSeats = await this.countReservedSeats(event.id, tx, excludeReservationId);
    if (reservedSeats + attendees.length > event.capacityMax) {
      throw new ConflictException('Evento agotado o sin cupo suficiente');
    }

    const childCount = attendees.filter((attendee) => attendee.type === SpecialEventAttendeeType.CHILD).length;
    const adultCount = attendees.filter((attendee) => attendee.type === SpecialEventAttendeeType.ADULT).length;
    const totalAmount = Number(
      (childCount * this.toNumber(event.childPrice) + adultCount * this.toNumber(event.adultPrice)).toFixed(2),
    );

    return {
      childCount,
      adultCount,
      totalAmount,
    };
  }

  private async countReservedSeats(eventId: string, client: PrismaService | TransactionClient = this.prisma, excludeReservationId?: string) {
    return client.specialEventTicket.count({
      where: {
        reservation: {
          id: excludeReservationId ? { not: excludeReservationId } : undefined,
          specialEventId: eventId,
          status: { in: [...ACTIVE_SPECIAL_RESERVATION_STATUSES] },
        },
      },
    });
  }

  private async countActiveReservations(eventId: string) {
    return this.prisma.specialEventReservation.count({
      where: {
        specialEventId: eventId,
        status: { in: [...ACTIVE_SPECIAL_RESERVATION_STATUSES] },
      },
    });
  }

  private async eventStats(eventId: string, capacityMax: number) {
    const [reservedCount, expected, confirmed, pending, pendingCount, confirmedCount, cancelledCount] = await this.prisma.$transaction([
      this.prisma.specialEventTicket.count({
        where: {
          reservation: {
            specialEventId: eventId,
            status: { in: [...ACTIVE_SPECIAL_RESERVATION_STATUSES] },
          },
        },
      }),
      this.prisma.specialEventReservation.aggregate({
        where: { specialEventId: eventId, status: { in: [...ACTIVE_SPECIAL_RESERVATION_STATUSES] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.specialEventReservation.aggregate({
        where: { specialEventId: eventId, status: SpecialEventReservationStatus.PAYMENT_CONFIRMED },
        _sum: { totalAmount: true },
      }),
      this.prisma.specialEventReservation.aggregate({
        where: { specialEventId: eventId, status: SpecialEventReservationStatus.PENDING_PAYMENT },
        _sum: { totalAmount: true },
      }),
      this.prisma.specialEventReservation.count({
        where: { specialEventId: eventId, status: SpecialEventReservationStatus.PENDING_PAYMENT },
      }),
      this.prisma.specialEventReservation.count({
        where: { specialEventId: eventId, status: SpecialEventReservationStatus.PAYMENT_CONFIRMED },
      }),
      this.prisma.specialEventReservation.count({
        where: { specialEventId: eventId, status: SpecialEventReservationStatus.CANCELLED },
      }),
    ]);

    return {
      reservedCount,
      availableCount: Math.max(capacityMax - reservedCount, 0),
      expectedIncome: expected._sum.totalAmount?.toNumber() ?? 0,
      confirmedIncome: confirmed._sum.totalAmount?.toNumber() ?? 0,
      pendingIncome: pending._sum.totalAmount?.toNumber() ?? 0,
      pendingReservations: pendingCount,
      confirmedReservations: confirmedCount,
      cancelledReservations: cancelledCount,
    };
  }

  private async findEventOrThrow(id: string) {
    const event = await this.prisma.specialEvent.findUnique({
      where: { id },
      include: SPECIAL_EVENT_INCLUDE,
    });
    if (!event) {
      throw new NotFoundException('Evento especial no encontrado');
    }
    return event;
  }

  private async getReservationByIdInternal(id: string) {
    const reservation = await this.prisma.specialEventReservation.findUnique({
      where: { id },
      include: SPECIAL_RESERVATION_INCLUDE,
    });
    if (!reservation) {
      throw new NotFoundException('Reserva especial no encontrada');
    }
    return reservation;
  }

  private async findReservationByTokenOrThrow(token: string) {
    const reservation = await this.prisma.specialEventReservation.findUnique({
      where: { publicTokenHash: hashOpaqueToken(token) },
      include: SPECIAL_RESERVATION_INCLUDE,
    });
    if (!reservation) {
      throw new NotFoundException('Link de reserva especial no encontrado');
    }
    return reservation;
  }

  private async lockEvent(tx: TransactionClient, eventId: string) {
    await tx.$queryRaw`SELECT "id" FROM "SpecialEvent" WHERE "id" = ${eventId} FOR UPDATE`;
  }

  private isPubliclyReservable(event: { status: SpecialEventStatus; eventDate: Date }) {
    return event.status === SpecialEventStatus.PUBLISHED && event.eventDate >= this.today();
  }

  private today() {
    return parseEventDate(toIsoDate(new Date()));
  }

  private buildTicketCode(folioNumber: number, index: number) {
    return `${this.formatFolio(folioNumber)}-${String(index + 1).padStart(2, '0')}`;
  }

  private formatFolio(folioNumber: number) {
    return String(folioNumber).padStart(4, '0');
  }

  private buildPublicReservationUrl(token: string) {
    const frontendOrigin = this.configService
      .getOrThrow<string>('FRONTEND_ORIGIN')
      .split(',')
      .map((origin) => origin.trim())
      .find((origin) => origin.startsWith('http://') || origin.startsWith('https://'));

    return `${frontendOrigin ?? 'http://localhost:5173'}/special-reservation/${token}`;
  }

  private waMeLink(phone: string, text: string) {
    const digits = phone.replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
  }

  private async trySendSpecialReservationCreated(reservation: SpecialReservationWithInclude, token: string) {
    try {
      await this.messagingService.sendSpecialEventReservationCreated({
        reservationId: reservation.id,
        holderName: reservation.holderName,
        holderPhone: reservation.holderPhone,
        eventName: reservation.specialEvent.name,
        folio: this.formatFolio(reservation.folioNumber),
        trackingLink: this.buildPublicReservationUrl(token),
        eventDate: toIsoDate(reservation.specialEvent.eventDate),
        startTime: reservation.specialEvent.startTime,
        endTime: reservation.specialEvent.endTime,
        total: reservation.totalAmount.toNumber(),
      });
    } catch {
      // Messaging failures must not block reservation creation.
    }
  }

  private async trySendSpecialPaymentConfirmed(reservation: SpecialReservationWithInclude, actorUserId: string) {
    try {
      await this.messagingService.sendSpecialEventPaymentConfirmed({
        reservationId: reservation.id,
        holderName: reservation.holderName,
        holderPhone: reservation.holderPhone,
        eventName: reservation.specialEvent.name,
        folio: this.formatFolio(reservation.folioNumber),
        trackingLink: null,
        actorUserId,
      });
    } catch {
      // Messaging failures must not block payment confirmation.
    }
  }

  private toNumber(value: { toString: () => string } | number) {
    return typeof value === 'number' ? value : Number(value.toString());
  }

  private whereByCreatedRange(range: { from?: Date; to?: Date }): Prisma.SpecialEventReservationWhereInput {
    return {
      createdAt:
        range.from || range.to
          ? {
              gte: range.from,
              lte: range.to,
            }
          : undefined,
    };
  }

  private whereByPaymentRange(range: { from?: Date; to?: Date }): Prisma.SpecialEventReservationWhereInput {
    return {
      paymentConfirmedAt:
        range.from || range.to
          ? {
              gte: range.from,
              lte: range.to,
            }
          : undefined,
    };
  }

  private async toEventResponse(event: SpecialEventWithInclude) {
    const stats = await this.eventStats(event.id, event.capacityMax);
    return {
      id: event.id,
      name: event.name,
      description: event.description,
      eventDate: toIsoDate(event.eventDate),
      startTime: event.startTime,
      endTime: event.endTime,
      childPrice: event.childPrice.toNumber(),
      adultPrice: event.adultPrice.toNumber(),
      capacityMax: event.capacityMax,
      imageUrl: event.imageUrl,
      includesText: event.includesText,
      status: event.status,
      blockedSlotId: event.blockedSlotId,
      stats,
      createdByUser: event.createdByUser,
      updatedByUser: event.updatedByUser,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  private toReservationResponse(reservation: SpecialReservationWithInclude, includeLinks = false) {
    const folio = this.formatFolio(reservation.folioNumber);
    const businessWhatsapp =
      this.configService.get<string>('WHATSAPP_BUSINESS_PHONE') ??
      this.configService.get<string>('BUSINESS_WHATSAPP') ??
      '';
    const whatsappText =
      `Hola, soy ${reservation.holderName}. Envío comprobante de pago para ${reservation.specialEvent.name}, reserva ${folio}.`;
    return {
      id: reservation.id,
      specialEventId: reservation.specialEventId,
      specialEvent: {
        id: reservation.specialEvent.id,
        name: reservation.specialEvent.name,
        description: reservation.specialEvent.description,
        eventDate: toIsoDate(reservation.specialEvent.eventDate),
        startTime: reservation.specialEvent.startTime,
        endTime: reservation.specialEvent.endTime,
        childPrice: reservation.specialEvent.childPrice.toNumber(),
        adultPrice: reservation.specialEvent.adultPrice.toNumber(),
        imageUrl: reservation.specialEvent.imageUrl,
        includesText: reservation.specialEvent.includesText,
        status: reservation.specialEvent.status,
      },
      folioNumber: reservation.folioNumber,
      folio,
      holderName: reservation.holderName,
      holderPhone: reservation.holderPhone,
      holderEmail: reservation.holderEmail,
      comments: reservation.comments,
      childCount: reservation.childCount,
      adultCount: reservation.adultCount,
      totalAmount: reservation.totalAmount.toNumber(),
      status: reservation.status,
      paymentConfirmedAt: reservation.paymentConfirmedAt,
      paymentConfirmedByUser: reservation.paymentConfirmedByUser,
      cancelledAt: reservation.cancelledAt,
      cancelledByUser: reservation.cancelledByUser,
      isEditable: reservation.status === SpecialEventReservationStatus.PENDING_PAYMENT,
      tickets: reservation.tickets.map((ticket) => ({
        id: ticket.id,
        code: ticket.code,
        attendeeName: ticket.attendeeName,
        attendeeType: ticket.attendeeType,
        price: ticket.price.toNumber(),
      })),
      ...(includeLinks
        ? {
            whatsappProofLink: this.waMeLink(businessWhatsapp, whatsappText),
          }
        : {}),
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
    };
  }
}
