import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { normalizePhoneNumber } from '../common/utils/phone.util';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ListNotificationsQueryDto,
  NotificationGroup,
} from './dto/list-notifications-query.dto';
import { WhatsAppChannelService } from './providers/whatsapp-channel.service';

type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  relatedReservationId?: string;
  relatedSaleId?: string;
  relatedSpecialEventReservationId?: string;
  channels?: NotificationChannel[];
  actorUserId?: string;
  whatsapp?: {
    to?: string | null;
    text?: string;
  };
};

const NOTIFICATION_GROUP_BY_TYPE: Record<NotificationType, NotificationGroup> =
  {
    [NotificationType.NEW_RESERVATION]: 'reservations',
    [NotificationType.RESERVATION_UPDATED]: 'reservations',
    [NotificationType.EVENT_UPCOMING]: 'reservations',
    [NotificationType.PAYMENT_PENDING]: 'payments',
    [NotificationType.POS_SALE_CREATED]: 'system',
    [NotificationType.POS_TICKET_WHATSAPP]: 'system',
    [NotificationType.LOW_STOCK_ALERT]: 'inventory',
    [NotificationType.SPECIAL_EVENT_RESERVATION_CREATED]: 'reservations',
    [NotificationType.SPECIAL_EVENT_PAYMENT_CONFIRMED]: 'payments',
    [NotificationType.SPECIAL_EVENT_LINK_WHATSAPP]: 'reservations',
  };

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppChannelService: WhatsAppChannelService,
  ) {}

  async createNotification(input: CreateNotificationInput): Promise<{
    id: string;
    deliveries: Array<{
      id: string;
      channel: NotificationChannel;
      status: NotificationDeliveryStatus;
      destination: string | null;
      provider: string | null;
      errorMessage: string | null;
      preparedUrl?: string | null;
      createdAt: Date;
      sentAt: Date | null;
    }>;
  }> {
    const channels = Array.from(
      new Set(input.channels ?? [NotificationChannel.INTERNAL]),
    );

    const notification = await this.prisma.notification.create({
      data: {
        type: input.type,
        title: input.title.trim(),
        message: input.message.trim(),
        relatedReservationId: input.relatedReservationId ?? null,
        relatedSaleId: input.relatedSaleId ?? null,
        relatedSpecialEventReservationId:
          input.relatedSpecialEventReservationId ?? null,
      },
    });

    const deliveries = [] as Array<{
      id: string;
      channel: NotificationChannel;
      status: NotificationDeliveryStatus;
      destination: string | null;
      provider: string | null;
      errorMessage: string | null;
      preparedUrl?: string | null;
      createdAt: Date;
      sentAt: Date | null;
    }>;

    for (const channel of channels) {
      if (channel === NotificationChannel.INTERNAL) {
        const delivery = await this.prisma.notificationDelivery.create({
          data: {
            notificationId: notification.id,
            channel,
            status: NotificationDeliveryStatus.SENT,
            provider: 'internal',
            destination: null,
            sentAt: new Date(),
            payloadJson: Prisma.JsonNull,
            triggeredByUserId: input.actorUserId ?? null,
          },
        });

        deliveries.push({
          id: delivery.id,
          channel: delivery.channel,
          status: delivery.status,
          destination: delivery.destination,
          provider: delivery.provider,
          errorMessage: delivery.errorMessage,
          preparedUrl: null,
          createdAt: delivery.createdAt,
          sentAt: delivery.sentAt,
        });
        continue;
      }

      if (channel === NotificationChannel.WHATSAPP) {
        const destination = normalizePhoneNumber(input.whatsapp?.to ?? null);
        if (!destination) {
          const skipped = await this.prisma.notificationDelivery.create({
            data: {
              notificationId: notification.id,
              channel,
              status: NotificationDeliveryStatus.SKIPPED,
              provider: 'whatsapp',
              destination: input.whatsapp?.to?.trim() || null,
              errorMessage: 'Número inválido o ausente para WhatsApp',
              payloadJson: Prisma.JsonNull,
              triggeredByUserId: input.actorUserId ?? null,
            },
          });

          deliveries.push({
            id: skipped.id,
            channel: skipped.channel,
            status: skipped.status,
            destination: skipped.destination,
            provider: skipped.provider,
            errorMessage: skipped.errorMessage,
            preparedUrl: null,
            createdAt: skipped.createdAt,
            sentAt: skipped.sentAt,
          });
          continue;
        }

        const pending = await this.prisma.notificationDelivery.create({
          data: {
            notificationId: notification.id,
            channel,
            status: NotificationDeliveryStatus.PENDING,
            provider: 'whatsapp',
            destination,
            payloadJson: {
              text: input.whatsapp?.text?.trim() || notification.message,
            },
            triggeredByUserId: input.actorUserId ?? null,
          },
        });

        const result = await this.whatsAppChannelService.send({
          to: destination,
          text: input.whatsapp?.text?.trim() || notification.message,
        });

        const status =
          result.status === 'SENT'
            ? NotificationDeliveryStatus.SENT
            : result.status === 'SKIPPED'
              ? NotificationDeliveryStatus.SKIPPED
              : NotificationDeliveryStatus.FAILED;

        const updated = await this.prisma.notificationDelivery.update({
          where: { id: pending.id },
          data: {
            status,
            provider: result.provider,
            errorMessage: result.errorMessage ?? null,
            payloadJson: {
              text: input.whatsapp?.text?.trim() || notification.message,
              preparedUrl: result.preparedUrl ?? null,
              mode:
                result.provider === 'whatsapp_link'
                  ? 'manual_whatsapp_link'
                  : 'provider_send',
            },
            sentAt:
              status === NotificationDeliveryStatus.SENT ? new Date() : null,
          },
        });

        deliveries.push({
          id: updated.id,
          channel: updated.channel,
          status: updated.status,
          destination: updated.destination,
          provider: updated.provider,
          errorMessage: updated.errorMessage,
          preparedUrl: result.preparedUrl ?? null,
          createdAt: updated.createdAt,
          sentAt: updated.sentAt,
        });
      }
    }

    return {
      id: notification.id,
      deliveries,
    };
  }

  async listNotifications(query: ListNotificationsQueryDto = {}) {
    const limit = query.limit ?? 25;
    const where: Prisma.NotificationWhereInput = {
      isRead:
        query.status === 'read'
          ? true
          : query.status === 'unread'
            ? false
            : undefined,
      type:
        query.group && query.group !== 'all'
          ? {
              in: Object.entries(NOTIFICATION_GROUP_BY_TYPE)
                .filter(([, group]) => group === query.group)
                .map(([type]) => type as NotificationType),
            }
          : undefined,
    };

    const notificationsWithLookahead = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: limit + 1,
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });
    const hasMore = notificationsWithLookahead.length > limit;
    const notifications = hasMore
      ? notificationsWithLookahead.slice(0, limit)
      : notificationsWithLookahead;

    return {
      nextCursor: hasMore ? (notifications.at(-1)?.id ?? null) : null,
      hasMore,
      items: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        group: NOTIFICATION_GROUP_BY_TYPE[notification.type],
        title: notification.title,
        message: notification.message,
        relatedReservationId: notification.relatedReservationId,
        relatedSaleId: notification.relatedSaleId,
        relatedSpecialEventReservationId:
          notification.relatedSpecialEventReservationId,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        deliveries: notification.deliveries.map((delivery) => ({
          id: delivery.id,
          channel: delivery.channel,
          status: delivery.status,
          provider: delivery.provider,
          destination: delivery.destination,
          errorMessage: delivery.errorMessage,
          preparedUrl: this.extractPreparedUrl(delivery.payloadJson),
          sentAt: delivery.sentAt,
          createdAt: delivery.createdAt,
        })),
      })),
    };
  }

  async getNotificationSummary() {
    const grouped = await this.prisma.notification.groupBy({
      by: ['isRead', 'type'],
      _count: { _all: true },
    });

    return grouped.reduce(
      (summary, row) => {
        const count = row._count._all;
        summary.total += count;
        if (!row.isRead) {
          summary.unread += count;
        }
        if (NOTIFICATION_GROUP_BY_TYPE[row.type] === 'inventory') {
          summary.inventory += count;
        }
        return summary;
      },
      { total: 0, unread: 0, inventory: 0 },
    );
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.$transaction([
      this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      }),
      this.prisma.notificationRead.upsert({
        where: {
          notificationId_userId: {
            notificationId,
            userId,
          },
        },
        create: {
          notificationId,
          userId,
        },
        update: {
          readAt: new Date(),
        },
      }),
    ]);

    return { ok: true };
  }

  async markAsUnread(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.$transaction([
      this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: false },
      }),
      this.prisma.notificationRead.deleteMany({
        where: {
          notificationId,
          userId,
        },
      }),
    ]);

    return { ok: true };
  }

  async markAllAsRead(userId: string) {
    const unreadNotifications = await this.prisma.notification.findMany({
      where: { isRead: false },
      select: { id: true },
    });

    if (unreadNotifications.length === 0) {
      return { ok: true, count: 0 };
    }

    const notificationIds = unreadNotifications.map(
      (notification) => notification.id,
    );
    const [updated] = await this.prisma.$transaction([
      this.prisma.notification.updateMany({
        where: { id: { in: notificationIds }, isRead: false },
        data: { isRead: true },
      }),
      this.prisma.notificationRead.createMany({
        data: notificationIds.map((notificationId) => ({
          notificationId,
          userId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return { ok: true, count: updated.count };
  }

  async sendNotificationToWhatsApp(
    notificationId: string,
    input: { phone?: string; text?: string; actorUserId: string },
  ) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        deliveries: {
          where: { channel: NotificationChannel.WHATSAPP },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const fallbackPhone = notification.deliveries[0]?.destination ?? null;

    return this.createNotification({
      type: notification.type,
      title: `Reenvío WhatsApp: ${notification.title}`,
      message: notification.message,
      relatedReservationId: notification.relatedReservationId ?? undefined,
      relatedSaleId: notification.relatedSaleId ?? undefined,
      relatedSpecialEventReservationId:
        notification.relatedSpecialEventReservationId ?? undefined,
      channels: [NotificationChannel.INTERNAL, NotificationChannel.WHATSAPP],
      whatsapp: {
        to: input.phone ?? fallbackPhone,
        text: input.text?.trim() || notification.message,
      },
      actorUserId: input.actorUserId,
    });
  }

  private extractPreparedUrl(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const preparedUrl = (payload as { preparedUrl?: unknown }).preparedUrl;
    return typeof preparedUrl === 'string' &&
      preparedUrl.startsWith('https://wa.me/')
      ? preparedUrl
      : null;
  }
}
