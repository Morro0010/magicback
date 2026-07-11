import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  HistoryActionType,
  NotificationType,
  ReservationStatus,
  type Prisma,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseEventDate,
  rangesOverlap,
  timeToMinutes,
  validateTimeRange,
} from '../common/utils/date.util';
import { calculateEditableUntil, toIsoDate } from '../common/utils/date.util';
import { generateOpaqueToken, hashOpaqueToken, maskTokenForLogs } from '../common/utils/security.util';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingService } from '../messaging/messaging.service';
import { HistoryService } from '../history/history.service';
import { AuditService } from '../common/services/audit.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { ReassignReservationDto } from './dto/reassign-reservation.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ListReservationsQueryDto } from './dto/list-reservations-query.dto';
import {
  calculateEventFormPricing,
  getEventFormValidationMessage,
  getEventScheduleValidationMessage,
  isMagicEventConfigured,
  normalizeEventForm,
  type EventFormPayload,
} from './event-form.constants';

const RESERVATION_INCLUDE = {
  package: true,
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  updatedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.ReservationInclude;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly historyService: HistoryService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    @Optional() private readonly messagingService?: MessagingService,
  ) {}

  async listReservations(query: ListReservationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ReservationWhereInput = {
      status: query.status,
    };

    if (query.from || query.to) {
      where.eventDate = {
        gte: query.from ? parseEventDate(query.from) : undefined,
        lte: query.to ? parseEventDate(query.to) : undefined,
      };
    }

    const [total, reservations] = await this.prisma.$transaction([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include: RESERVATION_INCLUDE,
        orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: reservations.map((reservation) => this.toReservationResponse(reservation)),
    };
  }

  async getReservationById(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: RESERVATION_INCLUDE,
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    return this.toReservationResponse(reservation);
  }

  async createReservation(
    dto: CreateReservationDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ) {
    let eventDate = dto.eventDate
      ? parseEventDate(dto.eventDate)
      : this.getDefaultEventDate();
    const normalizedEventForm = normalizeEventForm(dto.eventForm);
    let startTime =
      dto.startTime ?? (normalizedEventForm.eventType === 'private_event' ? '08:00' : '11:00');
    let endTime =
      dto.endTime ?? (normalizedEventForm.eventType === 'private_event' ? '12:00' : '14:00');

    this.assertValidTimeRange(startTime, endTime);
    this.assertEventBusinessRules(normalizedEventForm, startTime, endTime);

    const packageRecord = dto.packageId
      ? await this.prisma.package.findUnique({ where: { id: dto.packageId } })
      : await this.prisma.package.findFirst({
          where: { isActive: true },
          orderBy: { price: 'asc' },
        });

    if (!packageRecord || !packageRecord.isActive) {
      throw new NotFoundException('Package not found or inactive');
    }

    const attendeesFromForm =
      normalizedEventForm.privateEvent.totalPeople ||
      normalizedEventForm.childrenCount + normalizedEventForm.adultsCount;
    const attendeesCount = dto.attendeesCount ?? (attendeesFromForm > 0 ? attendeesFromForm : 1);

    const hasCompleteSchedule = Boolean(dto.eventDate && dto.startTime && dto.endTime);
    if (normalizedEventForm.eventType && !hasCompleteSchedule && !dto.quickCapture) {
      throw new BadRequestException('Selecciona fecha y horario para este tipo de evento.');
    }

    const shouldAutoAssignSchedule =
      Boolean(dto.quickCapture) || (!normalizedEventForm.eventType && !hasCompleteSchedule);

    if (shouldAutoAssignSchedule) {
      const suggestedSchedule = await this.findNextAvailableSchedule({
        eventDate,
        startTime,
        endTime,
        eventForm: normalizedEventForm,
      });

      if (!suggestedSchedule) {
        throw new ConflictException('No available schedule found for quick capture');
      }

      eventDate = suggestedSchedule.eventDate;
      startTime = suggestedSchedule.startTime;
      endTime = suggestedSchedule.endTime;
    } else {
      await this.assertSlotAvailability({
        eventDate,
        startTime,
        endTime,
      });
    }

    const advanceAmount = dto.advanceAmount ?? 0;
    const estimatedTotal = this.calculateReservationTotal(
      this.toNumber(packageRecord.price),
      normalizedEventForm,
    );
    const pendingBalance = this.calculatePendingBalance(estimatedTotal, advanceAmount);

    const publicToken = generateOpaqueToken(32);
    const publicTokenHash = hashOpaqueToken(publicToken);

    const status =
      dto.status ??
      (pendingBalance > 0 ? ReservationStatus.PENDING_PAYMENT : ReservationStatus.REQUESTED);

    const editableUntil = calculateEditableUntil(eventDate);

    const reservation = await this.prisma.reservation.create({
      data: {
        publicTokenHash,
        celebrantName: dto.celebrantName.trim(),
        eventFormJson: normalizedEventForm,
        eventDate,
        startTime,
        endTime,
        attendeesCount,
        packageId: packageRecord.id,
        theme: dto.theme?.trim() || normalizedEventForm.eventTheme,
        foodDetails: dto.foodDetails?.trim() || null,
        notes: dto.notes?.trim() || null,
        status,
        advanceAmount,
        advancePaymentMethod: dto.advancePaymentMethod,
        pendingBalance,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : null,
        editableUntil,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
      include: RESERVATION_INCLUDE,
    });

    await this.historyService.createEntry({
      reservationId: reservation.id,
      actorUserId: actor.id,
      actionType: HistoryActionType.CREATED,
      fieldChanged: 'reservation',
      newValue: {
        celebrantName: reservation.celebrantName,
        eventDate: toIsoDate(reservation.eventDate),
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        attendeesCount: reservation.attendeesCount,
        status: reservation.status,
      },
    });

    await this.notificationsService.createNotification({
      type: NotificationType.NEW_RESERVATION,
      title: 'Nueva reservación creada',
      message: `${reservation.celebrantName} - ${toIsoDate(reservation.eventDate)} ${reservation.startTime}`,
      relatedReservationId: reservation.id,
    });

    await this.createPaymentPendingNotificationIfNeeded(reservation.id, pendingBalance);
    await this.createUpcomingNotificationIfNeeded(reservation.id, reservation.eventDate);

    await this.auditService.log({
      eventType: 'RESERVATION_CREATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        reservationId: reservation.id,
        eventDate: toIsoDate(reservation.eventDate),
        startTime: reservation.startTime,
        tokenHint: maskTokenForLogs(publicToken),
      },
    });

    return {
      ...this.toReservationResponse(reservation),
      publicLink: this.buildPublicReservationUrl(publicToken),
    };
  }

  async updateReservation(
    reservationId: string,
    dto: UpdateReservationDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ) {
    const current = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { package: true },
    });

    if (!current) {
      throw new NotFoundException('Reservation not found');
    }

    if (current.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException('Cancelled reservations cannot be edited');
    }

    const targetDate = dto.eventDate ? parseEventDate(dto.eventDate) : current.eventDate;
    const targetStart = dto.startTime ?? current.startTime;
    const targetEnd = dto.endTime ?? current.endTime;

    this.assertValidTimeRange(targetStart, targetEnd);

    const currentEventForm = this.parseEventForm(current.eventFormJson);
    const mergedEventForm = dto.eventForm
      ? normalizeEventForm({
          ...currentEventForm,
          ...dto.eventForm,
          guestCounts: {
            ...currentEventForm.guestCounts,
            ...dto.eventForm.guestCounts,
          },
          selectedOptions: {
            ...currentEventForm.selectedOptions,
            ...dto.eventForm.selectedOptions,
          },
          addOns: {
            spa: {
              ...currentEventForm.addOns.spa,
              ...dto.eventForm.addOns?.spa,
            },
            premiumDecoration: {
              ...currentEventForm.addOns.premiumDecoration,
              ...dto.eventForm.addOns?.premiumDecoration,
            },
          },
          privateEvent: {
            ...currentEventForm.privateEvent,
            ...dto.eventForm.privateEvent,
          },
        })
      : currentEventForm;
    this.assertEventBusinessRules(mergedEventForm, targetStart, targetEnd);

    const dateChanged = toIsoDate(targetDate) !== toIsoDate(current.eventDate);
    const timeChanged = targetStart !== current.startTime || targetEnd !== current.endTime;

    if (dateChanged || timeChanged) {
      await this.assertSlotAvailability({
        eventDate: targetDate,
        startTime: targetStart,
        endTime: targetEnd,
        excludeReservationId: reservationId,
      });
    }

    const targetPackageId = dto.packageId ?? current.packageId;
    const targetPackage =
      targetPackageId === current.packageId
        ? current.package
        : await this.prisma.package.findUnique({ where: { id: targetPackageId } });

    if (!targetPackage || !targetPackage.isActive) {
      throw new NotFoundException('Package not found or inactive');
    }

    const nextAdvanceAmount = dto.advanceAmount ?? this.toNumber(current.advanceAmount);
    const nextEstimatedTotal = this.calculateReservationTotal(
      this.toNumber(targetPackage.price),
      mergedEventForm,
    );
    const nextPendingBalance = this.calculatePendingBalance(nextEstimatedTotal, nextAdvanceAmount);
    const attendeesFromForm =
      mergedEventForm.privateEvent.totalPeople ||
      mergedEventForm.childrenCount + mergedEventForm.adultsCount;
    const nextAttendeesCount =
      dto.attendeesCount ?? (attendeesFromForm > 0 ? attendeesFromForm : current.attendeesCount);

    const nextStatus = dto.status ?? current.status;
    const editableUntil = dateChanged ? calculateEditableUntil(targetDate) : current.editableUntil;

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        celebrantName: dto.celebrantName?.trim(),
        eventDate: targetDate,
        startTime: targetStart,
        endTime: targetEnd,
        attendeesCount: nextAttendeesCount,
        packageId: targetPackageId,
        eventFormJson: mergedEventForm,
        theme:
          dto.theme === undefined
            ? dto.eventForm
              ? mergedEventForm.eventTheme
              : undefined
            : dto.theme?.trim() || null,
        foodDetails:
          dto.foodDetails === undefined ? undefined : dto.foodDetails?.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
        status: nextStatus,
        advanceAmount: nextAdvanceAmount,
        advancePaymentMethod: dto.advancePaymentMethod,
        pendingBalance: nextPendingBalance,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        editableUntil,
        updatedByUserId: actor.id,
      },
      include: RESERVATION_INCLUDE,
    });

    await this.trackFieldChanges(current, updated, actor.id, HistoryActionType.UPDATED);
    if (dto.eventForm) {
      await this.historyService.createEntry({
        reservationId: reservationId,
        actorUserId: actor.id,
        actionType: HistoryActionType.UPDATED,
        fieldChanged: 'eventForm',
        oldValue: currentEventForm,
        newValue: mergedEventForm,
      });
    }

    await this.notificationsService.createNotification({
      type: NotificationType.RESERVATION_UPDATED,
      title: 'Reservación modificada',
      message: `${updated.celebrantName} se actualizó por el personal`,
      relatedReservationId: updated.id,
    });

    await this.createPaymentPendingNotificationIfNeeded(updated.id, nextPendingBalance);
    await this.createUpcomingNotificationIfNeeded(updated.id, updated.eventDate);

    await this.auditService.log({
      eventType: 'RESERVATION_UPDATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        reservationId,
        eventDate: toIsoDate(updated.eventDate),
      },
    });

    return this.toReservationResponse(updated);
  }

  async cancelReservation(
    reservationId: string,
    dto: CancelReservationDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ) {
    const current = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!current) {
      throw new NotFoundException('Reservation not found');
    }

    if (current.status === ReservationStatus.CANCELLED) {
      return { ok: true };
    }

    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledAt: new Date(),
        updatedByUserId: actor.id,
      },
    });

    await this.historyService.createEntry({
      reservationId,
      actorUserId: actor.id,
      actionType: HistoryActionType.CANCELLED,
      fieldChanged: 'status',
      oldValue: current.status,
      newValue: {
        status: ReservationStatus.CANCELLED,
        reason: dto.reason?.trim() || null,
      },
    });

    await this.notificationsService.createNotification({
      type: NotificationType.RESERVATION_UPDATED,
      title: 'Reservación cancelada',
      message: `${current.celebrantName} fue cancelada`,
      relatedReservationId: reservationId,
    });

    await this.auditService.log({
      eventType: 'RESERVATION_CANCELLED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        reservationId,
        reason: dto.reason?.trim() || null,
      },
    });

    return { ok: true };
  }

  async reassignReservation(
    reservationId: string,
    dto: ReassignReservationDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ) {
    this.assertValidTimeRange(dto.startTime, dto.endTime);

    const current = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!current) {
      throw new NotFoundException('Reservation not found');
    }

    if (current.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException('Cancelled reservations cannot be reassigned');
    }

    const currentEventForm = this.parseEventForm(current.eventFormJson);
    this.assertEventBusinessRules(currentEventForm, dto.startTime, dto.endTime);

    const targetDate = parseEventDate(dto.eventDate);

    await this.assertSlotAvailability({
      eventDate: targetDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      excludeReservationId: reservationId,
    });

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        eventDate: targetDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        editableUntil: calculateEditableUntil(targetDate),
        updatedByUserId: actor.id,
      },
      include: RESERVATION_INCLUDE,
    });

    await this.historyService.createEntry({
      reservationId,
      actorUserId: actor.id,
      actionType: HistoryActionType.REASSIGNED,
      fieldChanged: 'schedule',
      oldValue: {
        eventDate: toIsoDate(current.eventDate),
        startTime: current.startTime,
        endTime: current.endTime,
      },
      newValue: {
        eventDate: toIsoDate(updated.eventDate),
        startTime: updated.startTime,
        endTime: updated.endTime,
      },
    });

    await this.notificationsService.createNotification({
      type: NotificationType.RESERVATION_UPDATED,
      title: 'Reservación reasignada',
      message: `${updated.celebrantName} cambió de horario`,
      relatedReservationId: updated.id,
    });

    await this.createUpcomingNotificationIfNeeded(updated.id, updated.eventDate);

    await this.auditService.log({
      eventType: 'RESERVATION_REASSIGNED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        reservationId,
        eventDate: toIsoDate(updated.eventDate),
        startTime: updated.startTime,
        endTime: updated.endTime,
      },
    });

    return this.toReservationResponse(updated);
  }

  async recordPayment(
    reservationId: string,
    dto: RecordPaymentDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ) {
    const current = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { package: true },
    });

    if (!current) {
      throw new NotFoundException('Reservation not found');
    }

    if (current.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException('Cancelled reservations cannot receive payments');
    }

    const nextAdvanceAmount = this.toNumber(current.advanceAmount) + dto.amount;
    const eventForm = this.parseEventForm(current.eventFormJson);
    const estimatedTotal = this.calculateReservationTotal(
      this.toNumber(current.package.price),
      eventForm,
    );
    const nextPendingBalance = this.calculatePendingBalance(estimatedTotal, nextAdvanceAmount);

    const nextStatus =
      current.status === ReservationStatus.COMPLETED
        ? current.status
        : nextPendingBalance > 0
          ? ReservationStatus.PENDING_PAYMENT
          : ReservationStatus.CONFIRMED;

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        advanceAmount: nextAdvanceAmount,
        advancePaymentMethod: dto.paymentMethod,
        paymentDate,
        pendingBalance: nextPendingBalance,
        status: nextStatus,
        updatedByUserId: actor.id,
      },
      include: RESERVATION_INCLUDE,
    });

    await this.historyService.createEntry({
      reservationId,
      actorUserId: actor.id,
      actionType: HistoryActionType.PAYMENT_RECORDED,
      fieldChanged: 'advanceAmount',
      oldValue: this.toNumber(current.advanceAmount),
      newValue: {
        addedAmount: dto.amount,
        totalAdvanceAmount: nextAdvanceAmount,
        pendingBalance: nextPendingBalance,
        paymentMethod: dto.paymentMethod,
        paymentDate,
      },
    });

    if (nextPendingBalance > 0) {
      await this.createPaymentPendingNotificationIfNeeded(updated.id, nextPendingBalance);
    }

    await this.notificationsService.createNotification({
      type: NotificationType.RESERVATION_UPDATED,
      title: 'Pago registrado',
      message: `${updated.celebrantName} tiene nuevo pago registrado`,
      relatedReservationId: updated.id,
    });

    if (this.messagingService && this.toNumber(current.pendingBalance) > 0 && nextPendingBalance === 0) {
      try {
        await this.messagingService.sendReservationConfirmed({
          reservationId: updated.id,
          customerName: eventForm.responsibleName || updated.celebrantName,
          customerPhone: eventForm.phone,
          folio: updated.id,
          eventDate: toIsoDate(updated.eventDate),
          startTime: updated.startTime,
          endTime: updated.endTime,
          actorUserId: actor.id,
        });
      } catch {
        // Messaging failures must not block payment registration.
      }
    }

    await this.auditService.log({
      eventType: 'PAYMENT_RECORDED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        reservationId,
        amount: dto.amount,
        pendingBalance: nextPendingBalance,
      },
    });

    return this.toReservationResponse(updated);
  }

  async getReservationHistory(reservationId: string) {
    const exists = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!exists) {
      throw new NotFoundException('Reservation not found');
    }

    return this.historyService.listByReservation(reservationId);
  }

  async regeneratePublicLink(
    reservationId: string,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const nextToken = generateOpaqueToken(32);

    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        publicTokenHash: hashOpaqueToken(nextToken),
        updatedByUserId: actor.id,
      },
    });

    await this.historyService.createEntry({
      reservationId,
      actorUserId: actor.id,
      actionType: HistoryActionType.PUBLIC_LINK_REGENERATED,
      fieldChanged: 'publicTokenHash',
      oldValue: 'hidden',
      newValue: 'regenerated',
    });

    await this.auditService.log({
      eventType: 'PUBLIC_LINK_REGENERATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        reservationId,
        tokenHint: maskTokenForLogs(nextToken),
      },
    });

    return {
      reservationId,
      publicLink: this.buildPublicReservationUrl(nextToken),
    };
  }

  async assertSlotAvailability(input: {
    eventDate: Date;
    startTime: string;
    endTime: string;
    excludeReservationId?: string;
  }): Promise<void> {
    const blockedSlots = await this.prisma.blockedSlot.findMany({
      where: {
        date: input.eventDate,
      },
    });

    const blockedConflict = blockedSlots.find((slot) =>
      rangesOverlap(input.startTime, input.endTime, slot.startTime, slot.endTime),
    );

    if (blockedConflict) {
      throw new ConflictException('Requested time overlaps a blocked slot');
    }

    const reservations = await this.prisma.reservation.findMany({
      where: {
        id: input.excludeReservationId ? { not: input.excludeReservationId } : undefined,
        eventDate: input.eventDate,
        status: {
          not: ReservationStatus.CANCELLED,
        },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
      },
    });

    const conflict = reservations.find((reservation) =>
      rangesOverlap(input.startTime, input.endTime, reservation.startTime, reservation.endTime),
    );

    if (conflict) {
      throw new ConflictException('Requested time overlaps an existing reservation');
    }
  }

  private parseEventForm(value: unknown): EventFormPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return normalizeEventForm();
    }

    return normalizeEventForm(value as EventFormPayload);
  }

  private getDefaultEventDate(): Date {
    const now = new Date();
    const baseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    baseDate.setUTCDate(baseDate.getUTCDate() + 14);
    return baseDate;
  }

  private async findNextAvailableSchedule(input: {
    eventDate: Date;
    startTime: string;
    endTime: string;
    eventForm: EventFormPayload;
  }): Promise<{ eventDate: Date; startTime: string; endTime: string } | null> {
    const durationMinutes = timeToMinutes(input.endTime) - timeToMinutes(input.startTime);
    const firstDay = new Date(input.eventDate);

    for (let dayOffset = 0; dayOffset < 45; dayOffset += 1) {
      const dayCandidate = new Date(firstDay);
      dayCandidate.setUTCDate(firstDay.getUTCDate() + dayOffset);

      for (let minuteMark = 9 * 60; minuteMark <= 20 * 60; minuteMark += 30) {
        const endMinute = minuteMark + durationMinutes;
        if (endMinute > 22 * 60) {
          continue;
        }

        const startCandidate = `${String(Math.floor(minuteMark / 60)).padStart(2, '0')}:${String(
          minuteMark % 60,
        ).padStart(2, '0')}`;
        const endCandidate = `${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(
          endMinute % 60,
        ).padStart(2, '0')}`;

        const scheduleError = getEventScheduleValidationMessage(
          input.eventForm,
          startCandidate,
          endCandidate,
        );
        if (scheduleError) {
          continue;
        }

        try {
          await this.assertSlotAvailability({
            eventDate: dayCandidate,
            startTime: startCandidate,
            endTime: endCandidate,
          });
          return {
            eventDate: dayCandidate,
            startTime: startCandidate,
            endTime: endCandidate,
          };
        } catch (error) {
          if (!(error instanceof ConflictException)) {
            throw error;
          }
        }
      }
    }

    return null;
  }

  private async trackFieldChanges(
    before: {
      celebrantName: string;
      eventDate: Date;
      startTime: string;
      endTime: string;
      attendeesCount: number;
      packageId: string;
      theme: string | null;
      foodDetails: string | null;
      notes: string | null;
      status: ReservationStatus;
      advanceAmount: { toString: () => string };
      pendingBalance: { toString: () => string };
    },
    after: {
      id: string;
      celebrantName: string;
      eventDate: Date;
      startTime: string;
      endTime: string;
      attendeesCount: number;
      packageId: string;
      theme: string | null;
      foodDetails: string | null;
      notes: string | null;
      status: ReservationStatus;
      advanceAmount: { toString: () => string };
      pendingBalance: { toString: () => string };
    },
    actorUserId: string,
    actionType: HistoryActionType,
  ): Promise<void> {
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    const beforeComparable = {
      celebrantName: before.celebrantName,
      eventDate: toIsoDate(before.eventDate),
      startTime: before.startTime,
      endTime: before.endTime,
      attendeesCount: before.attendeesCount,
      packageId: before.packageId,
      theme: before.theme,
      foodDetails: before.foodDetails,
      notes: before.notes,
      status: before.status,
      advanceAmount: Number(before.advanceAmount.toString()),
      pendingBalance: Number(before.pendingBalance.toString()),
    };

    const afterComparable = {
      celebrantName: after.celebrantName,
      eventDate: toIsoDate(after.eventDate),
      startTime: after.startTime,
      endTime: after.endTime,
      attendeesCount: after.attendeesCount,
      packageId: after.packageId,
      theme: after.theme,
      foodDetails: after.foodDetails,
      notes: after.notes,
      status: after.status,
      advanceAmount: Number(after.advanceAmount.toString()),
      pendingBalance: Number(after.pendingBalance.toString()),
    };

    (Object.keys(beforeComparable) as Array<keyof typeof beforeComparable>).forEach(
      (fieldKey) => {
        if (beforeComparable[fieldKey] !== afterComparable[fieldKey]) {
          changes.push({
            field: fieldKey,
            oldValue: beforeComparable[fieldKey],
            newValue: afterComparable[fieldKey],
          });
        }
      },
    );

    if (changes.length === 0) {
      await this.historyService.createEntry({
        reservationId: after.id,
        actorUserId,
        actionType,
        fieldChanged: null,
        oldValue: null,
        newValue: null,
      });
      return;
    }

    for (const change of changes) {
      await this.historyService.createEntry({
        reservationId: after.id,
        actorUserId,
        actionType,
        fieldChanged: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }
  }

  private assertValidTimeRange(startTime: string, endTime: string): void {
    try {
      validateTimeRange(startTime, endTime);
    } catch {
      throw new BadRequestException('Invalid time range');
    }
  }

  private assertEventBusinessRules(eventForm: EventFormPayload, startTime: string, endTime: string): void {
    const scheduleMessage = getEventScheduleValidationMessage(eventForm, startTime, endTime);
    if (scheduleMessage) {
      throw new BadRequestException(scheduleMessage);
    }

    const formMessage = getEventFormValidationMessage(eventForm);
    if (formMessage) {
      throw new BadRequestException(formMessage);
    }
  }

  private calculatePendingBalance(packagePrice: number, advanceAmount: number): number {
    return Number(Math.max(packagePrice - advanceAmount, 0).toFixed(2));
  }

  private calculateReservationTotal(packagePrice: number, eventForm: EventFormPayload): number {
    const eventPricing = calculateEventFormPricing(eventForm);

    if (isMagicEventConfigured(eventForm)) {
      return eventPricing.estimatedTotal;
    }

    return Number((packagePrice + eventPricing.estimatedTotal).toFixed(2));
  }

  private buildPublicReservationUrl(token: string): string {
    const frontendOrigin = this.getPrimaryFrontendOrigin();
    return `${frontendOrigin}/public/reservations/${token}`;
  }

  private getPrimaryFrontendOrigin(): string {
    const frontendOrigins = this.configService
      .getOrThrow<string>('FRONTEND_ORIGIN')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    return (
      frontendOrigins.find((origin) => origin.startsWith('http://') || origin.startsWith('https://')) ??
      frontendOrigins[0]
    );
  }

  private toNumber(value: { toString: () => string } | number): number {
    return typeof value === 'number' ? value : Number(value.toString());
  }

  private async createPaymentPendingNotificationIfNeeded(
    reservationId: string,
    pendingBalance: number,
  ) {
    if (pendingBalance <= 0) {
      return;
    }

    await this.notificationsService.createNotification({
      type: NotificationType.PAYMENT_PENDING,
      title: 'Pago pendiente',
      message: `Reservación con saldo pendiente de $${pendingBalance.toFixed(2)}`,
      relatedReservationId: reservationId,
    });
  }

  private async createUpcomingNotificationIfNeeded(
    reservationId: string,
    eventDate: Date,
  ): Promise<void> {
    const now = new Date();
    const daysUntilEvent =
      (eventDate.getTime() - new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime()) /
      (1000 * 60 * 60 * 24);

    if (daysUntilEvent >= 0 && daysUntilEvent <= 7) {
      await this.notificationsService.createNotification({
        type: NotificationType.EVENT_UPCOMING,
        title: 'Evento próximo',
        message: `El evento está programado para ${toIsoDate(eventDate)}`,
        relatedReservationId: reservationId,
      });
    }
  }

  private toReservationResponse(
    reservation: Prisma.ReservationGetPayload<{
      include: typeof RESERVATION_INCLUDE;
    }>,
  ) {
    const eventForm = this.parseEventForm(reservation.eventFormJson);
    return {
      id: reservation.id,
      celebrantName: reservation.celebrantName,
      eventForm,
      eventFormPricing: calculateEventFormPricing(eventForm),
      eventDate: toIsoDate(reservation.eventDate),
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      attendeesCount: reservation.attendeesCount,
      packageId: reservation.packageId,
      package: {
        id: reservation.package.id,
        name: reservation.package.name,
        price: this.toNumber(reservation.package.price),
      },
      theme: reservation.theme,
      foodDetails: reservation.foodDetails,
      notes: reservation.notes,
      status: reservation.status,
      advanceAmount: this.toNumber(reservation.advanceAmount),
      advancePaymentMethod: reservation.advancePaymentMethod,
      pendingBalance: this.toNumber(reservation.pendingBalance),
      paymentDate: reservation.paymentDate,
      editableUntil: reservation.editableUntil,
      createdByUserId: reservation.createdByUserId,
      updatedByUserId: reservation.updatedByUserId,
      createdBy: reservation.createdByUser,
      updatedBy: reservation.updatedByUser,
      cancelledAt: reservation.cancelledAt,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
    };
  }
}
