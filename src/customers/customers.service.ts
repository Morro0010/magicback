import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BirthdayFollowUpStatus,
  Prisma,
  ReservationStatus,
  SpecialEventReservationStatus,
} from '@prisma/client';
import {
  getBusinessCalendarDate,
  parseEventDate,
  toIsoDate,
} from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { EventType } from '../reservations/dto/event-form.dto';
import type { EventFormPayload } from '../reservations/event-form.constants';
import {
  formatPrivateEventFolio,
  formatSpecialEventFolio,
} from '../common/utils/public-folio.util';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateBirthdayFollowUpDto } from './dto/update-birthday-follow-up.dto';
import { UpdateCustomerNotesDto } from './dto/update-customer-notes.dto';

const UPCOMING_BIRTHDAY_WINDOW_DAYS = 14;

const CUSTOMER_DETAIL_INCLUDE = {
  celebrants: {
    orderBy: [{ birthDate: 'asc' }, { name: 'asc' }],
  },
  reservations: {
    include: {
      package: { select: { id: true, name: true, price: true } },
    },
    orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
  },
  specialEventReservations: {
    include: {
      specialEvent: {
        select: {
          id: true,
          name: true,
          eventDate: true,
          startTime: true,
          endTime: true,
        },
      },
      tickets: { orderBy: { code: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.CustomerInclude;

type CustomerDetail = Prisma.CustomerGetPayload<{
  include: typeof CUSTOMER_DETAIL_INCLUDE;
}>;

export type CustomerContactInput = {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
};

export function normalizeCustomerPhone(phone: string | null | undefined) {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.length === 13 && digits.startsWith('521')) {
    return digits.slice(3);
  }
  if (digits.length === 12 && digits.startsWith('52')) {
    return digits.slice(2);
  }
  if (digits.length > 10 && digits.startsWith('52')) {
    return digits.slice(-10);
  }
  return digits;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(query: ListCustomersQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const search = query.search?.trim();
    const normalizedSearch = normalizeCustomerPhone(search);
    const where: Prisma.CustomerWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            ...(normalizedSearch
              ? [{ normalizedPhone: { contains: normalizedSearch } }]
              : []),
          ],
        }
      : {};

    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = await Promise.all(
      customers.map((customer) => this.toListItem(customer.id)),
    );

    return { page, limit, total, items };
  }

  async getCustomerById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: CUSTOMER_DETAIL_INCLUDE,
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return this.toCustomerDetail(customer);
  }

  async updateCustomerNotes(id: string, dto: UpdateCustomerNotesDto) {
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        internalNotes: dto.internalNotes?.trim() || null,
      },
      include: CUSTOMER_DETAIL_INCLUDE,
    });

    return this.toCustomerDetail(customer);
  }

  async listUpcomingBirthdays() {
    const today = parseEventDate(getBusinessCalendarDate());
    const celebrants = await this.prisma.celebrant.findMany({
      include: {
        customer: true,
      },
      orderBy: [{ birthDate: 'asc' }, { name: 'asc' }],
    });

    const upcoming = celebrants
      .map((celebrant) => {
        const nextBirthday = this.nextBirthdayDate(celebrant.birthDate, today);
        const daysUntil = Math.floor(
          (nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return { celebrant, nextBirthday, daysUntil };
      })
      .filter(
        (item) =>
          item.daysUntil >= 0 &&
          item.daysUntil <= UPCOMING_BIRTHDAY_WINDOW_DAYS,
      )
      .sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime());

    const items = await Promise.all(
      upcoming.map(async (item) => {
        const followUp = await this.prisma.birthdayFollowUp.upsert({
          where: {
            celebrantId_birthdayYear: {
              celebrantId: item.celebrant.id,
              birthdayYear: item.nextBirthday.getUTCFullYear(),
            },
          },
          create: {
            customerId: item.celebrant.customerId,
            celebrantId: item.celebrant.id,
            birthdayYear: item.nextBirthday.getUTCFullYear(),
            status: BirthdayFollowUpStatus.PENDING,
          },
          update: {},
        });

        return {
          followUpId: followUp.id,
          status: followUp.status,
          notes: followUp.notes,
          birthdayYear: followUp.birthdayYear,
          nextBirthday: toIsoDate(item.nextBirthday),
          daysUntil: item.daysUntil,
          celebrant: {
            id: item.celebrant.id,
            name: item.celebrant.name,
            birthDate: toIsoDate(item.celebrant.birthDate),
          },
          customer: {
            id: item.celebrant.customer.id,
            name: item.celebrant.customer.name,
            phone: item.celebrant.customer.phone,
            normalizedPhone: item.celebrant.customer.normalizedPhone,
          },
        };
      }),
    );

    return { windowDays: UPCOMING_BIRTHDAY_WINDOW_DAYS, items };
  }

  async updateBirthdayFollowUp(id: string, dto: UpdateBirthdayFollowUpDto) {
    const followUp = await this.prisma.birthdayFollowUp.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes?.trim() || null,
      },
      include: {
        celebrant: true,
        customer: true,
      },
    });

    return {
      id: followUp.id,
      status: followUp.status,
      notes: followUp.notes,
      birthdayYear: followUp.birthdayYear,
      celebrant: {
        id: followUp.celebrant.id,
        name: followUp.celebrant.name,
        birthDate: toIsoDate(followUp.celebrant.birthDate),
      },
      customer: {
        id: followUp.customer.id,
        name: followUp.customer.name,
        phone: followUp.customer.phone,
        normalizedPhone: followUp.customer.normalizedPhone,
      },
      updatedAt: followUp.updatedAt,
    };
  }

  async linkReservationFromEventForm(
    reservationId: string,
    eventForm: EventFormPayload,
    celebrantName: string,
  ) {
    const phone = eventForm.phone;
    if (!phone) {
      return null;
    }

    const customer = await this.upsertCustomerFromContact({
      name: eventForm.responsibleName || celebrantName,
      phone,
      address: eventForm.address,
    });

    let celebrantId: string | null = null;
    if (
      eventForm.eventType === EventType.BIRTHDAY_PARTY &&
      eventForm.celebrantBirthDate
    ) {
      const celebrant = await this.upsertCelebrant({
        customerId: customer.id,
        name: celebrantName,
        birthDate: eventForm.celebrantBirthDate,
        sourceReservationId: reservationId,
      });
      celebrantId = celebrant.id;
    }

    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        customerId: customer.id,
        primaryCelebrantId: celebrantId,
      },
    });

    return { customerId: customer.id, celebrantId };
  }

  async linkSpecialEventReservation(input: {
    reservationId: string;
    holderName: string;
    holderPhone: string;
    holderEmail?: string | null;
  }) {
    const customer = await this.upsertCustomerFromContact({
      name: input.holderName,
      phone: input.holderPhone,
      email: input.holderEmail,
    });

    await this.prisma.specialEventReservation.update({
      where: { id: input.reservationId },
      data: { customerId: customer.id },
    });

    return { customerId: customer.id };
  }

  private async upsertCustomerFromContact(input: CustomerContactInput) {
    const normalizedPhone = normalizeCustomerPhone(input.phone);
    if (!normalizedPhone) {
      throw new NotFoundException('Teléfono de cliente requerido');
    }

    const name = input.name.trim() || input.phone.trim();
    const existing = await this.prisma.customer.findUnique({
      where: { normalizedPhone },
    });

    if (!existing) {
      return this.prisma.customer.create({
        data: {
          name,
          phone: input.phone.trim(),
          normalizedPhone,
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
        },
      });
    }

    const data: Prisma.CustomerUpdateInput = {};
    if (!existing.email && input.email?.trim()) {
      data.email = input.email.trim();
    }
    if (!existing.address && input.address?.trim()) {
      data.address = input.address.trim();
    }
    if (!existing.phone && input.phone.trim()) {
      data.phone = input.phone.trim();
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return this.prisma.customer.update({
      where: { id: existing.id },
      data,
    });
  }

  private async upsertCelebrant(input: {
    customerId: string;
    name: string;
    birthDate: string;
    sourceReservationId: string;
  }) {
    const birthDate = this.parseBirthDate(input.birthDate);
    const name = input.name.trim();
    const existing = await this.prisma.celebrant.findFirst({
      where: {
        customerId: input.customerId,
        name,
        birthDate,
      },
    });

    if (existing) {
      if (!existing.sourceReservationId) {
        return this.prisma.celebrant.update({
          where: { id: existing.id },
          data: { sourceReservationId: input.sourceReservationId },
        });
      }
      return existing;
    }

    return this.prisma.celebrant.create({
      data: {
        customerId: input.customerId,
        name,
        birthDate,
        sourceReservationId: input.sourceReservationId,
      },
    });
  }

  private async toListItem(customerId: string) {
    const detail = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: CUSTOMER_DETAIL_INCLUDE,
    });
    const totals = this.calculateCustomerTotals(detail);
    return {
      id: detail.id,
      name: detail.name,
      phone: detail.phone,
      normalizedPhone: detail.normalizedPhone,
      email: detail.email,
      firstSeenAt: detail.firstSeenAt,
      reservationCount: detail.reservations.length,
      specialEventReservationCount: detail.specialEventReservations.length,
      celebrantCount: detail.celebrants.length,
      totalSpent: totals.totalSpent,
      updatedAt: detail.updatedAt,
    };
  }

  private toCustomerDetail(customer: CustomerDetail) {
    const totals = this.calculateCustomerTotals(customer);
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      normalizedPhone: customer.normalizedPhone,
      email: customer.email,
      address: customer.address,
      firstSeenAt: customer.firstSeenAt,
      internalNotes: customer.internalNotes,
      totalSpent: totals.totalSpent,
      reservationTotal: totals.reservationTotal,
      specialEventTotal: totals.specialEventTotal,
      celebrants: customer.celebrants.map((celebrant) => ({
        id: celebrant.id,
        name: celebrant.name,
        birthDate: toIsoDate(celebrant.birthDate),
        sourceReservationId: celebrant.sourceReservationId,
        createdAt: celebrant.createdAt,
        updatedAt: celebrant.updatedAt,
      })),
      reservations: customer.reservations.map((reservation) => ({
        id: reservation.id,
        publicFolio:
          this.eventTypeFromJson(reservation.eventFormJson) ===
          EventType.PRIVATE_EVENT
            ? formatPrivateEventFolio(reservation.privateEventFolioNumber)
            : null,
        celebrantName: reservation.celebrantName,
        eventDate: toIsoDate(reservation.eventDate),
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        eventType: this.eventTypeFromJson(reservation.eventFormJson),
        status: reservation.status,
        amount: this.reservationAmount(reservation),
        package: {
          id: reservation.package.id,
          name: reservation.package.name,
          price: reservation.package.price.toNumber(),
        },
        createdAt: reservation.createdAt,
      })),
      specialEventReservations: customer.specialEventReservations.map(
        (reservation) => ({
          id: reservation.id,
          specialEventId: reservation.specialEventId,
          eventName: reservation.specialEvent.name,
          eventDate: toIsoDate(reservation.specialEvent.eventDate),
          startTime: reservation.specialEvent.startTime,
          endTime: reservation.specialEvent.endTime,
          folioNumber: reservation.folioNumber,
          folio: formatSpecialEventFolio(reservation.folioNumber),
          status: reservation.status,
          childCount: reservation.childCount,
          adultCount: reservation.adultCount,
          ticketCount: reservation.tickets.length,
          totalAmount: reservation.totalAmount.toNumber(),
          createdAt: reservation.createdAt,
        }),
      ),
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  private calculateCustomerTotals(customer: CustomerDetail) {
    const reservationTotal = customer.reservations
      .filter(
        (reservation) => reservation.status !== ReservationStatus.CANCELLED,
      )
      .reduce(
        (sum, reservation) => sum + this.reservationAmount(reservation),
        0,
      );
    const specialEventTotal = customer.specialEventReservations
      .filter(
        (reservation) =>
          reservation.status !== SpecialEventReservationStatus.CANCELLED,
      )
      .reduce(
        (sum, reservation) => sum + reservation.totalAmount.toNumber(),
        0,
      );

    return {
      reservationTotal: Number(reservationTotal.toFixed(2)),
      specialEventTotal: Number(specialEventTotal.toFixed(2)),
      totalSpent: Number((reservationTotal + specialEventTotal).toFixed(2)),
    };
  }

  private reservationAmount(reservation: {
    advanceAmount: { toNumber: () => number };
    pendingBalance: { toNumber: () => number };
  }) {
    return Number(
      (
        reservation.advanceAmount.toNumber() +
        reservation.pendingBalance.toNumber()
      ).toFixed(2),
    );
  }

  private eventTypeFromJson(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const eventType = (value as { eventType?: unknown }).eventType;
    return typeof eventType === 'string' ? eventType : null;
  }

  private parseBirthDate(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private nextBirthdayDate(birthDate: Date, today: Date) {
    const month = birthDate.getUTCMonth();
    const day = birthDate.getUTCDate();
    let next = new Date(Date.UTC(today.getUTCFullYear(), month, day));
    if (next < today) {
      next = new Date(Date.UTC(today.getUTCFullYear() + 1, month, day));
    }
    return next;
  }
}
