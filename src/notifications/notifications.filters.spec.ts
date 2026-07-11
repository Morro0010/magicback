import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService filters', () => {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notificationRead: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    notificationDelivery: {
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const whatsAppChannelService = { send: jest.fn() };
  const service = new NotificationsService(prisma, whatsAppChannelService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((ops: Array<Promise<unknown>>) => Promise.all(ops));
    prisma.notification.findMany.mockResolvedValue([
      {
        id: 'n1',
        type: NotificationType.LOW_STOCK_ALERT,
        title: 'Stock bajo',
        message: 'Producto en mínimo',
        relatedReservationId: null,
        relatedSaleId: null,
        isRead: false,
        createdAt: new Date('2026-06-21T10:00:00.000Z'),
        deliveries: [],
      },
    ]);
  });

  it('maps notification group and applies unread inventory filters', async () => {
    const result = await service.listNotifications({ status: 'unread', group: 'inventory' });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isRead: false,
          type: { in: [NotificationType.LOW_STOCK_ALERT] },
        }),
      }),
    );
    expect(result[0]).toEqual(expect.objectContaining({ group: 'inventory' }));
  });

  it('marks notification as unread and clears the user read row', async () => {
    prisma.notification.findUnique.mockResolvedValue({ id: 'n1' });
    prisma.notification.update.mockResolvedValue({ id: 'n1', isRead: false });
    prisma.notificationRead.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.markAsUnread('n1', 'u1')).resolves.toEqual({ ok: true });

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { isRead: false },
    });
    expect(prisma.notificationRead.deleteMany).toHaveBeenCalledWith({
      where: { notificationId: 'n1', userId: 'u1' },
    });
  });
});
