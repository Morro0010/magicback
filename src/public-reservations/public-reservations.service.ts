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
  formatCalendarDateEs,
  getMinimumPublicReservationDate,
  isPublicReservationDateAllowed,
  isPublicReservationEditionLocked,
  parseEventDate,
  rangesOverlap,
  toIsoDate,
  validateTimeRange,
} from '../common/utils/date.util';
import {
  hashOpaqueToken,
  maskTokenForLogs,
} from '../common/utils/security.util';
import {
  formatPrivateEventFolio,
  nextPrivateEventFolioNumber,
} from '../common/utils/public-folio.util';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto';
import { UpdatePublicReservationDto } from './dto/update-public-reservation.dto';
import { EventType } from '../reservations/dto/event-form.dto';
import { HistoryService } from '../history/history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/services/audit.service';
import { CustomersService } from '../customers/customers.service';
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
    private readonly customersService: CustomersService,
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
    this.assertPublicDateAllowed(date);
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

    if (current.status === ReservationStatus.CANCELLED) {
      throw new ForbiddenException(
        'Una reservación cancelada no puede modificarse desde el enlace público.',
      );
    }

    if (isPublicReservationEditionLocked(current.eventDate)) {
      throw new ForbiddenException(
        'Tu evento está próximo y las modificaciones en línea ya están cerradas. Para solicitar algún cambio, comunícate directamente con administración de Magic City.',
      );
    }

    const targetDate = dto.eventDate
      ? parseEventDate(dto.eventDate)
      : current.eventDate;
    const targetStart = dto.startTime ?? current.startTime;
    const targetEnd = dto.endTime ?? current.endTime;
    this.assertPublicDateAllowed(targetDate);

    try {
      validateTimeRange(targetStart, targetEnd);
    } catch {
      throw new BadRequestException(
        'El horario de inicio debe ser anterior al horario de cierre.',
      );
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
          celebrantBirthDate:
            currentEventForm.celebrantBirthDate ??
            dto.eventForm.celebrantBirthDate,
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
    if (
      !packageRecord ||
      (packageId !== current.packageId && !packageRecord.isActive)
    ) {
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
    const privateEventFolioNumber =
      current.privateEventFolioNumber ??
      (mergedEventForm.eventType === EventType.PRIVATE_EVENT
        ? await nextPrivateEventFolioNumber(this.prisma)
        : null);

    const updated = await this.prisma.reservation.update({
      where: {
        id: current.id,
      },
      data: {
        celebrantName: dto.celebrantName?.trim(),
        privateEventFolioNumber,
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
        status: ReservationStatus.REQUESTED,
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
        attendeesCount: current.attendeesCount,
        packageId: current.packageId,
        eventForm: currentEventForm,
        pendingBalance: Number(current.pendingBalance.toString()),
      },
      newValue: {
        celebrantName: updated.celebrantName,
        eventDate: toIsoDate(updated.eventDate),
        startTime: updated.startTime,
        endTime: updated.endTime,
        attendeesCount: updated.attendeesCount,
        packageId: updated.packageId,
        eventForm: mergedEventForm,
        estimatedTotal: Number(estimatedTotal.toFixed(2)),
        pendingBalance: Number(nextPending.toFixed(2)),
        status: ReservationStatus.REQUESTED,
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

    await this.customersService.linkReservationFromEventForm(
      updated.id,
      mergedEventForm,
      updated.celebrantName,
    );

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
    const editable =
      reservation.status !== ReservationStatus.CANCELLED &&
      !isPublicReservationEditionLocked(reservation.eventDate);
    const eventForm = this.parseEventForm(reservation.eventFormJson);
    const publicEventForm = {
      ...eventForm,
      celebrantBirthDate: null,
    };

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
      eventForm: publicEventForm,
      eventFormPricing: calculateEventFormPricing(publicEventForm),
      theme: reservation.theme,
      foodDetails: reservation.foodDetails,
      notes: reservation.notes,
      status: reservation.status,
      publicFolio:
        eventForm.eventType === EventType.PRIVATE_EVENT
          ? formatPrivateEventFolio(reservation.privateEventFolioNumber)
          : null,
      editableUntil: reservation.editableUntil,
      isEditable: editable,
      minimumAllowedDate: getMinimumPublicReservationDate(),
      hasCelebrantBirthDate: Boolean(eventForm.celebrantBirthDate),
      editionMessage: editable
        ? null
        : reservation.status === ReservationStatus.CANCELLED
          ? 'Esta reservación está cancelada y no admite modificaciones en línea. Si necesitas ayuda, comunícate directamente con administración de Magic City.'
          : 'Tu evento está próximo y las modificaciones en línea ya están cerradas. Para solicitar algún cambio, comunícate directamente con administración de Magic City. Este cierre nos ayuda a preparar correctamente todos los detalles de tu evento.',
      updatedAt: reservation.updatedAt,
    };
  }

  private parseEventForm(value: unknown): EventFormPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return normalizeEventForm();
    }

    return normalizeEventForm(value as EventFormPayload);
  }

  private assertPublicDateAllowed(eventDate: Date) {
    if (isPublicReservationDateAllowed(eventDate)) {
      return;
    }

    const minimumDate = getMinimumPublicReservationDate();
    throw new BadRequestException(
      `Las reservaciones deben realizarse con al menos tres días completos de anticipación. Por favor selecciona una fecha a partir del ${formatCalendarDateEs(minimumDate)}.`,
    );
  }
}
