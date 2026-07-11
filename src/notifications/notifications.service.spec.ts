import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
} from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notificationDelivery: {
      create: jest.fn(),
      update: jest.fn(),
    },
    notificationRead: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const whatsAppChannelService = {
    send: jest.fn(),
  } as any;

  const service = new NotificationsService(prisma, whatsAppChannelService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.notification.create.mockResolvedValue({
      id: 'n1',
      type: NotificationType.POS_TICKET_WHATSAPP,
      title: 'Notificación',
      message: 'Mensaje',
      relatedReservationId: null,
      relatedSaleId: 's1',
    });
  });

  it('records internal + whatsapp delivery as SENT when provider succeeds', async () => {
    prisma.notificationDelivery.create
      .mockResolvedValueOnce({
        id: 'd-internal',
        channel: NotificationChannel.INTERNAL,
        status: NotificationDeliveryStatus.SENT,
        destination: null,
        provider: 'internal',
        errorMessage: null,
        createdAt: new Date('2026-03-19T15:00:00.000Z'),
        sentAt: new Date('2026-03-19T15:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'd-whatsapp',
        channel: NotificationChannel.WHATSAPP,
        status: NotificationDeliveryStatus.PENDING,
        destination: '+525512345678',
        provider: 'whatsapp',
        errorMessage: null,
        createdAt: new Date('2026-03-19T15:00:00.000Z'),
        sentAt: null,
      });

    prisma.notificationDelivery.update.mockResolvedValue({
      id: 'd-whatsapp',
      channel: NotificationChannel.WHATSAPP,
      status: NotificationDeliveryStatus.SENT,
      destination: '+525512345678',
      provider: 'mock',
      errorMessage: null,
      createdAt: new Date('2026-03-19T15:00:00.000Z'),
      sentAt: new Date('2026-03-19T15:00:01.000Z'),
    });

    whatsAppChannelService.send.mockResolvedValue({
      status: 'SENT',
      provider: 'mock',
    });

    const result = await service.createNotification({
      type: NotificationType.POS_TICKET_WHATSAPP,
      title: 'Ticket enviado',
      message: 'Venta V-10001',
      relatedSaleId: 's1',
      channels: [NotificationChannel.INTERNAL, NotificationChannel.WHATSAPP],
      whatsapp: {
        to: '+52 5512345678',
        text: 'Ticket listo',
      },
      actorUserId: 'u1',
    });

    expect(result.deliveries.some((delivery) => delivery.channel === NotificationChannel.INTERNAL)).toBe(true);
    expect(result.deliveries.some((delivery) => delivery.status === NotificationDeliveryStatus.SENT)).toBe(true);
    expect(whatsAppChannelService.send).toHaveBeenCalled();
  });

  it('records whatsapp delivery as FAILED without throwing when provider fails', async () => {
    prisma.notificationDelivery.create.mockResolvedValue({
      id: 'd-whatsapp',
      channel: NotificationChannel.WHATSAPP,
      status: NotificationDeliveryStatus.PENDING,
      destination: '+525500000000',
      provider: 'whatsapp',
      errorMessage: null,
      createdAt: new Date('2026-03-19T15:30:00.000Z'),
      sentAt: null,
    });

    prisma.notificationDelivery.update.mockResolvedValue({
      id: 'd-whatsapp',
      channel: NotificationChannel.WHATSAPP,
      status: NotificationDeliveryStatus.FAILED,
      destination: '+525500000000',
      provider: 'mock',
      errorMessage: 'Error simulado',
      createdAt: new Date('2026-03-19T15:30:00.000Z'),
      sentAt: null,
    });

    whatsAppChannelService.send.mockResolvedValue({
      status: 'FAILED',
      provider: 'mock',
      errorMessage: 'Error simulado',
    });

    const result = await service.createNotification({
      type: NotificationType.POS_TICKET_WHATSAPP,
      title: 'Ticket enviado',
      message: 'Venta V-10002',
      relatedSaleId: 's2',
      channels: [NotificationChannel.WHATSAPP],
      whatsapp: {
        to: '+525500000000',
      },
      actorUserId: 'u1',
    });

    expect(result.deliveries[0].status).toBe(NotificationDeliveryStatus.FAILED);
    expect(result.id).toBe('n1');
  });

  it('marks delivery as SKIPPED when whatsapp phone is invalid', async () => {
    prisma.notificationDelivery.create.mockResolvedValue({
      id: 'd-skip',
      channel: NotificationChannel.WHATSAPP,
      status: NotificationDeliveryStatus.SKIPPED,
      destination: 'abc',
      provider: 'whatsapp',
      errorMessage: 'Número inválido o ausente para WhatsApp',
      createdAt: new Date('2026-03-19T16:00:00.000Z'),
      sentAt: null,
    });

    const result = await service.createNotification({
      type: NotificationType.POS_TICKET_WHATSAPP,
      title: 'Ticket enviado',
      message: 'Venta V-10003',
      relatedSaleId: 's3',
      channels: [NotificationChannel.WHATSAPP],
      whatsapp: {
        to: 'abc',
      },
      actorUserId: 'u1',
    });

    expect(result.deliveries[0].status).toBe(NotificationDeliveryStatus.SKIPPED);
    expect(whatsAppChannelService.send).not.toHaveBeenCalled();
  });
});
