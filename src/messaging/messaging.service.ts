import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import {
  reservationPaymentConfirmedTemplate,
  specialEventPaymentConfirmedTemplate,
  specialEventReservationCreatedTemplate,
} from './whatsapp-message.templates';

@Injectable()
export class MessagingService {
  constructor(private readonly notificationsService: NotificationsService) {}

  sendSpecialEventReservationCreated(input: {
    reservationId: string;
    holderName: string;
    holderPhone: string;
    eventName: string;
    folio: string;
    trackingLink: string;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    total?: number;
    actorUserId?: string;
  }) {
    const message = specialEventReservationCreatedTemplate(input);

    return this.notificationsService.createNotification({
      type: NotificationType.SPECIAL_EVENT_RESERVATION_CREATED,
      title: `Reserva especial ${input.folio} registrada`,
      message,
      relatedSpecialEventReservationId: input.reservationId,
      channels: [NotificationChannel.INTERNAL, NotificationChannel.WHATSAPP],
      whatsapp: {
        to: input.holderPhone,
        text: message,
      },
      actorUserId: input.actorUserId,
    });
  }

  sendSpecialEventPaymentConfirmed(input: {
    reservationId: string;
    holderName: string;
    holderPhone: string;
    eventName: string;
    folio: string;
    trackingLink?: string | null;
    actorUserId: string;
  }) {
    const message = specialEventPaymentConfirmedTemplate(input);

    return this.notificationsService.createNotification({
      type: NotificationType.SPECIAL_EVENT_PAYMENT_CONFIRMED,
      title: `Pago confirmado ${input.folio}`,
      message,
      relatedSpecialEventReservationId: input.reservationId,
      channels: [NotificationChannel.INTERNAL, NotificationChannel.WHATSAPP],
      whatsapp: {
        to: input.holderPhone,
        text: message,
      },
      actorUserId: input.actorUserId,
    });
  }

  resendSpecialEventReservationLink(input: {
    reservationId: string;
    holderName: string;
    holderPhone: string;
    eventName: string;
    folio: string;
    trackingLink: string;
    actorUserId: string;
  }) {
    const message = specialEventReservationCreatedTemplate(input);

    return this.notificationsService.createNotification({
      type: NotificationType.SPECIAL_EVENT_LINK_WHATSAPP,
      title: `Reenvío de link ${input.folio}`,
      message,
      relatedSpecialEventReservationId: input.reservationId,
      channels: [NotificationChannel.INTERNAL, NotificationChannel.WHATSAPP],
      whatsapp: {
        to: input.holderPhone,
        text: message,
      },
      actorUserId: input.actorUserId,
    });
  }

  sendReservationConfirmed(input: {
    reservationId: string;
    customerName: string;
    customerPhone?: string | null;
    publicLink?: string | null;
    folio?: string;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    actorUserId?: string;
  }) {
    const message = reservationPaymentConfirmedTemplate({
      customerName: input.customerName,
      folio: input.folio ?? input.reservationId,
      eventDate: input.eventDate ?? 'Fecha pendiente',
      startTime: input.startTime ?? '',
      endTime: input.endTime ?? '',
      trackingLink: input.publicLink,
    });

    return this.notificationsService.createNotification({
      type: NotificationType.RESERVATION_UPDATED,
      title: 'Reservación confirmada',
      message,
      relatedReservationId: input.reservationId,
      channels: input.customerPhone
        ? [NotificationChannel.INTERNAL, NotificationChannel.WHATSAPP]
        : [NotificationChannel.INTERNAL],
      whatsapp: input.customerPhone
        ? {
            to: input.customerPhone,
            text: message,
          }
        : undefined,
      actorUserId: input.actorUserId,
    });
  }
}
