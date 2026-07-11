import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HistoryActionType,
  NotificationType,
  ReservationStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import {
  calculateEditableUntil,
  isEditionLocked,
  parseEventDate,
  rangesOverlap,
  toIsoDate,
  validateTimeRange,
} from '../common/utils/date.util';
import {
  hashOpaqueToken,
  maskTokenForLogs,
} from '../common/utils/security.util';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto';
import { UpdatePublicReservationDto } from './dto/update-public-reservation.dto';
import { HistoryService } from '../history/history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/services/audit.service';
import {
  calculateEventFormPricing,
  getEventFormValidationMessage,
  getEventScheduleValidationMessage,
  isMagicEventConfigured,
  normalizeEventForm,
  PRIVATE_EVENT_SCHEDULE_OPTIONS,
  type EventFormPayload,
} from '../reservations/event-form.constants';

const PUBLIC_RESERVATION_INCLUDE = {
  package: true,
} satisfies Prisma.ReservationInclude;

@Injectable()
export class PublicReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationsService: ReservationsService,
    private readonly historyService: HistoryService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async getPublicReservationByToken(
    token: string,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const reservation = await this.findByToken(token);

    if (!reservation) {
      await this.auditService.log({
        eventType: 'PUBLIC_LINK_ACCESS_DENIED',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          tokenHint: maskTokenForLogs(token),
          reason: 'not_found',
        },
      });
      throw new NotFoundException('Reservation link not found');
    }

    return this.toPublicReservationResponse(reservation);
  }

  async getAvailabilityByToken(
    token: string,
    query: PublicAvailabilityQueryDto,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const current = await this.findByToken(token);

    if (!current) {
      await this.auditService.log({
        eventType: 'PUBLIC_LINK_ACCESS_DENIED',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          tokenHint: maskTokenForLogs(token),
          reason: 'not_found',
        },
      });
      throw new NotFoundException('Reservation link not found');
    }

    const date = parseEventDate(query.date);
    const [reservations, blockedSlots] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where: {
          id: { not: current.id },
          eventDate: date,
          status: { not: ReservationStatus.CANCELLED },
        },
        select: {
          startTime: true,
          endTime: true,
        },
      }),
      this.prisma.blockedSlot.findMany({
        where: {
          date,
        },
        select: {
          startTime: true,
          endTime: true,
          reason: true,
        },
      }),
    ]);

    const busyRanges = [
      ...reservations.map((reservation) => ({
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        source: 'reservation' as const,
      })),
      ...blockedSlots.map((slot) => ({
        startTime: slot.startTime,
        endTime: slot.endTime,
        source: 'blocked_slot' as const,
        reason: slot.reason,
      })),
    ];

    return {
      date: toIsoDate(date),
      busyRanges,
      privateEventSlots: PRIVATE_EVENT_SCHEDULE_OPTIONS.map((option) => ({
        ...option,
        isAvailable: !busyRanges.some((range) =>
          rangesOverlap(
            option.startTime,
            option.endTime,
            range.startTime,
            range.endTime,
          ),
        ),
      })),
    };
  }

  async updatePublicReservationByToken(
    token: string,
    dto: UpdatePublicReservationDto,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const current = await this.findByToken(token);

    if (!current) {
      await this.auditService.log({
        eventType: 'PUBLIC_LINK_ACCESS_DENIED',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          tokenHint: maskTokenForLogs(token),
          reason: 'not_found',
        },
      });
      throw new NotFoundException('Reservation link not found');
    }

    if (isEditionLocked(current.editableUntil)) {
      throw new ForbiddenException(
        'La reservación ya no puede editarse. Quedan 3 días o menos para el evento.',
      );
    }

    const targetDate = dto.eventDate
      ? parseEventDate(dto.eventDate)
      : current.eventDate;
    const targetStart = dto.startTime ?? current.startTime;
    const targetEnd = dto.endTime ?? current.endTime;

    try {
      validateTimeRange(targetStart, targetEnd);
    } catch {
      throw new BadRequestException('Invalid time range');
    }

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

    const scheduleMessage = getEventScheduleValidationMessage(
      mergedEventForm,
      targetStart,
      targetEnd,
    );
    if (scheduleMessage) {
      throw new BadRequestException(scheduleMessage);
    }

    const formMessage = getEventFormValidationMessage(mergedEventForm);
    if (formMessage) {
      throw new BadRequestException(formMessage);
    }

    const dateChanged = toIsoDate(targetDate) !== toIsoDate(current.eventDate);
    const timeChanged =
      targetStart !== current.startTime || targetEnd !== current.endTime;

    if (dateChanged || timeChanged) {
      await this.reservationsService.assertSlotAvailability({
        eventDate: targetDate,
        startTime: targetStart,
        endTime: targetEnd,
        excludeReservationId: current.id,
      });
    }

    const packageId = dto.packageId ?? current.packageId;
    const packageRecord = await this.prisma.package.findUnique({
      where: { id: packageId },
    });
    if (!packageRecord || !packageRecord.isActive) {
      throw new NotFoundException('Package not found or inactive');
    }

    const attendeesFromEventForm =
      mergedEventForm.privateEvent.totalPeople ||
      mergedEventForm.childrenCount + mergedEventForm.adultsCount;
    const attendeesCount =
      dto.attendeesCount ??
      (attendeesFromEventForm > 0
        ? attendeesFromEventForm
        : current.attendeesCount);

    const eventPricing = calculateEventFormPricing(mergedEventForm);
    const estimatedTotal = isMagicEventConfigured(mergedEventForm)
      ? eventPricing.estimatedTotal
      : Number(packageRecord.price.toString()) + eventPricing.estimatedTotal;
    const nextPending = Math.max(
      estimatedTotal - Number(current.advanceAmount.toString()),
      0,
    );

    const updated = await this.prisma.reservation.update({
      where: {
        id: current.id,
      },
      data: {
        celebrantName: dto.celebrantName?.trim(),
        eventDate: targetDate,
        startTime: targetStart,
        endTime: targetEnd,
        attendeesCount,
        packageId,
        eventFormJson: mergedEventForm,
        theme:
          dto.theme === undefined
            ? dto.eventForm
              ? mergedEventForm.eventTheme
              : undefined
            : dto.theme.trim(),
        foodDetails:
          dto.foodDetails === undefined ? undefined : dto.foodDetails.trim(),
        notes: dto.notes === undefined ? undefined : dto.notes.trim(),
        pendingBalance: Number(nextPending.toFixed(2)),
        editableUntil: dateChanged
          ? calculateEditableUntil(targetDate)
          : current.editableUntil,
      },
      include: PUBLIC_RESERVATION_INCLUDE,
    });

    await this.historyService.createEntry({
      reservationId: updated.id,
      actionType: HistoryActionType.PUBLIC_UPDATED,
      actorUserId: null,
      fieldChanged: 'public_update',
      oldValue: {
        celebrantName: current.celebrantName,
        eventDate: toIsoDate(current.eventDate),
        startTime: current.startTime,
        endTime: current.endTime,
      },
      newValue: {
        celebrantName: updated.celebrantName,
        eventDate: toIsoDate(updated.eventDate),
        startTime: updated.startTime,
        endTime: updated.endTime,
      },
    });

    await this.notificationsService.createNotification({
      type: NotificationType.RESERVATION_UPDATED,
      title: 'Reservación actualizada por cliente',
      message: `${updated.celebrantName} modificó su enlace público`,
      relatedReservationId: updated.id,
    });

    await this.auditService.log({
      eventType: 'PUBLIC_LINK_UPDATED',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: {
        reservationId: updated.id,
        tokenHint: maskTokenForLogs(token),
      },
    });

    return this.toPublicReservationResponse(updated);
  }

  private async findByToken(token: string) {
    return this.prisma.reservation.findUnique({
      where: {
        publicTokenHash: hashOpaqueToken(token),
      },
      include: PUBLIC_RESERVATION_INCLUDE,
    });
  }

  private toPublicReservationResponse(
    reservation: Prisma.ReservationGetPayload<{
      include: typeof PUBLIC_RESERVATION_INCLUDE;
    }>,
  ) {
    const editable = !isEditionLocked(reservation.editableUntil);
    const eventForm = this.parseEventForm(reservation.eventFormJson);

    return {
      celebrantName: reservation.celebrantName,
      eventDate: toIsoDate(reservation.eventDate),
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      attendeesCount: reservation.attendeesCount,
      packageId: reservation.packageId,
      package: {
        id: reservation.package.id,
        name: reservation.package.name,
        price: Number(reservation.package.price.toString()),
      },
      eventForm,
      eventFormPricing: calculateEventFormPricing(eventForm),
      theme: reservation.theme,
      foodDetails: reservation.foodDetails,
      notes: reservation.notes,
      status: reservation.status,
      editableUntil: reservation.editableUntil,
      isEditable: editable,
      editionMessage: editable
        ? null
        : 'Edición bloqueada: faltan 3 días o menos para la fecha del evento.',
      updatedAt: reservation.updatedAt,
    };
  }

  private parseEventForm(value: unknown): EventFormPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return normalizeEventForm();
    }

    return normalizeEventForm(value as EventFormPayload);
  }
}
