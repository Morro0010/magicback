import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { WhatsAppChannelService } from './providers/whatsapp-channel.service';

describe('NotificationsService filters', () => {
  type NotificationFindManyArgs = {
    where?: {
      isRead?: boolean;
      type?: { in?: NotificationType[] };
    };
  };

  const notificationFindManyCalls: NotificationFindManyArgs[] = [];
  let notificationFindManyResult: unknown[] = [];
  const notificationFindManyMock = jest.fn(
    (args: NotificationFindManyArgs): Promise<unknown[]> => {
      notificationFindManyCalls.push(args);
      return Promise.resolve(notificationFindManyResult);
    },
  );
  const notificationFindUniqueMock = jest.fn<() => Promise<unknown>>();
  const notificationUpdateMock = jest.fn<() => Promise<unknown>>();
  const notificationUpdateManyMock = jest.fn<() => Promise<unknown>>();
  const notificationReadUpsertMock = jest.fn<() => Promise<unknown>>();
  const notificationReadDeleteManyMock = jest.fn<() => Promise<unknown>>();
  const notificationReadCreateManyMock = jest.fn<() => Promise<unknown>>();
  const notificationDeliveryCreateMock = jest.fn<() => Promise<unknown>>();
  const notificationDeliveryUpdateMock = jest.fn<() => Promise<unknown>>();
  const transactionMock = jest.fn(async (operations: Array<Promise<unknown>>) =>
    Promise.all(operations),
  );
  const prisma = {
    notification: {
      findMany: notificationFindManyMock,
      findUnique: notificationFindUniqueMock,
      update: notificationUpdateMock,
      updateMany: notificationUpdateManyMock,
    },
    notificationRead: {
      upsert: notificationReadUpsertMock,
      deleteMany: notificationReadDeleteManyMock,
      createMany: notificationReadCreateManyMock,
    },
    notificationDelivery: {
      create: notificationDeliveryCreateMock,
      update: notificationDeliveryUpdateMock,
    },
    $transaction: transactionMock,
  } as unknown as PrismaService;

  const whatsAppChannelService = {
    send: jest.fn(),
  } as unknown as WhatsAppChannelService;
  const service = new NotificationsService(prisma, whatsAppChannelService);

  beforeEach(() => {
    jest.clearAllMocks();
    notificationFindManyCalls.length = 0;
    notificationFindManyResult = [
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
    ];
  });

  it('maps notification group and applies unread inventory filters', async () => {
    const result = await service.listNotifications({
      status: 'unread',
      group: 'inventory',
    });

    const findManyArgs = notificationFindManyCalls[0];
    expect(findManyArgs?.where?.isRead).toBe(false);
    expect(findManyArgs?.where?.type).toEqual({
      in: [NotificationType.LOW_STOCK_ALERT],
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({ group: 'inventory' }),
    );
  });

  it('marks notification as unread and clears the user read row', async () => {
    notificationFindUniqueMock.mockResolvedValue({ id: 'n1' });
    notificationUpdateMock.mockResolvedValue({ id: 'n1', isRead: false });
    notificationReadDeleteManyMock.mockResolvedValue({ count: 1 });

    await expect(service.markAsUnread('n1', 'u1')).resolves.toEqual({
      ok: true,
    });

    expect(notificationUpdateMock).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { isRead: false },
    });
    expect(notificationReadDeleteManyMock).toHaveBeenCalledWith({
      where: { notificationId: 'n1', userId: 'u1' },
    });
  });

  it('marks every pending notification as read for the current user', async () => {
    notificationFindManyResult = [{ id: 'n1' }, { id: 'n2' }];
    notificationUpdateManyMock.mockResolvedValue({ count: 2 });
    notificationReadCreateManyMock.mockResolvedValue({ count: 2 });

    await expect(service.markAllAsRead('u1')).resolves.toEqual({
      ok: true,
      count: 2,
    });

    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['n1', 'n2'] }, isRead: false },
      data: { isRead: true },
    });
    expect(notificationReadCreateManyMock).toHaveBeenCalledWith({
      data: [
        { notificationId: 'n1', userId: 'u1' },
        { notificationId: 'n2', userId: 'u1' },
      ],
      skipDuplicates: true,
    });
  });
});
