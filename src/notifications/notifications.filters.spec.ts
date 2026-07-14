import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService filters', () => {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notificationRead: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
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
    prisma.$transaction.mockImplementation((ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    );
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
    const result = await service.listNotifications({
      status: 'unread',
      group: 'inventory',
    });

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

    await expect(service.markAsUnread('n1', 'u1')).resolves.toEqual({
      ok: true,
    });

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { isRead: false },
    });
    expect(prisma.notificationRead.deleteMany).toHaveBeenCalledWith({
      where: { notificationId: 'n1', userId: 'u1' },
    });
  });

  it('marks every pending notification as read for the current user', async () => {
    prisma.notification.findMany.mockResolvedValueOnce([
      { id: 'n1' },
      { id: 'n2' },
    ]);
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    prisma.notificationRead.createMany.mockResolvedValue({ count: 2 });

    await expect(service.markAllAsRead('u1')).resolves.toEqual({
      ok: true,
      count: 2,
    });

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1', 'n2'] }, isRead: false },
      data: { isRead: true },
    });
    expect(prisma.notificationRead.createMany).toHaveBeenCalledWith({
      data: [
        { notificationId: 'n1', userId: 'u1' },
        { notificationId: 'n2', userId: 'u1' },
      ],
      skipDuplicates: true,
    });
  });
});
