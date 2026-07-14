import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseEventDate, toIsoDate } from '../common/utils/date.util';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { normalizeEventForm } from '../reservations/event-form.constants';
import { formatPrivateEventFolio } from '../common/utils/public-folio.util';
import { EventType } from '../reservations/dto/event-form.dto';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getCalendar(query: CalendarQueryDto) {
    const from = query.from
      ? parseEventDate(query.from)
      : parseEventDate(toIsoDate(new Date()));
    const to = query.to
      ? parseEventDate(query.to)
      : new Date(from.getTime() + 45 * 24 * 60 * 60 * 1000);

    const [reservations, blockedSlots] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where: {
          eventDate: {
            gte: from,
            lte: to,
          },
        },
        include: {
          package: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.blockedSlot.findMany({
        where: {
          date: {
            gte: from,
            lte: to,
          },
        },
        include: {
          specialEvent: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    return {
      from: toIsoDate(from),
      to: toIsoDate(to),
      reservations: reservations.map((reservation) => {
        const eventForm = normalizeEventForm(
          reservation.eventFormJson as never,
        );
        return {
          id: reservation.id,
          publicFolio:
            eventForm.eventType === EventType.PRIVATE_EVENT
              ? formatPrivateEventFolio(reservation.privateEventFolioNumber)
              : null,
          eventDate: toIsoDate(reservation.eventDate),
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          status: reservation.status,
          celebrantName: reservation.celebrantName,
          package: reservation.package,
          eventForm,
        };
      }),
      blockedSlots: blockedSlots.map((slot) => ({
        id: slot.id,
        date: toIsoDate(slot.date),
        startTime: slot.startTime,
        endTime: slot.endTime,
        reason: slot.reason,
        specialEventId: slot.specialEvent?.id ?? null,
        specialEventName: slot.specialEvent?.name ?? null,
      })),
    };
  }
}
