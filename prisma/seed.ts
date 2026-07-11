import {
  PrismaClient,
  HistoryActionType,
  InventoryMovementType,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  PaymentMethod,
  ProductCategory,
  ProductUnit,
  ReservationStatus,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { calculateEditableUntil } from '../src/common/utils/date.util';
import { generateOpaqueToken, hashOpaqueToken } from '../src/common/utils/security.util';

const prisma = new PrismaClient();

function plusDays(days: number): Date {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

async function main() {
  await prisma.notificationDelivery.deleteMany();
  await prisma.notificationRead.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.reservationHistory.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.product.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.blockedSlot.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.package.deleteMany();
  await prisma.user.deleteMany();

  const adminPassword = await argon2.hash('Admin123!');
  const cashierPassword = await argon2.hash('Cashier123!');

  const [admin, cashierOne, cashierTwo] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Sofía Administradora',
        email: 'admin@magiccity.local',
        passwordHash: adminPassword,
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Carlos Cajero',
        email: 'cashier1@magiccity.local',
        passwordHash: cashierPassword,
        role: UserRole.CASHIER,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Mariana Cajera',
        email: 'cashier2@magiccity.local',
        passwordHash: cashierPassword,
        role: UserRole.CASHIER,
      },
    }),
  ]);

  const packages = await prisma.$transaction([
    prisma.package.create({
      data: {
        name: 'Básico',
        description: 'Paquete base Magic City con renta de espacio, invitados, alimentos y decoración incluida.',
        price: 0,
        featuresJson: [
          'Agua fresca a elegir',
          'Comida a elegir',
          'Pastel Dairy Queen',
          'Mobiliario, mantelería y servicio básico',
          '4 horas de juego',
          'Performance con Milo',
          'Media mampara con banderín y racimos de globos',
        ],
      },
    }),
    prisma.package.create({
      data: {
        name: 'Básico + spa',
        description: 'Paquete básico con experiencia de spa. Precio final por definir.',
        price: 0,
        featuresJson: [
          'Incluye todo el paquete básico',
          'Experiencia de spa',
          'Precio por definir',
        ],
      },
    }),
    prisma.package.create({
      data: {
        name: 'Básico + decoración premium',
        description: 'Paquete básico con mampara completa, arco de globos, leds y figura de personaje.',
        price: 0,
        featuresJson: [
          'Incluye todo el paquete básico',
          'Mampara completa',
          'Arco de globos',
          'Leds',
          'Figura de personaje',
          'Precio por definir',
        ],
      },
    }),
  ]);

  await prisma.blockedSlot.createMany({
    data: [
      {
        date: plusDays(5),
        startTime: '10:00',
        endTime: '12:00',
        reason: 'Mantenimiento de juegos',
        createdByUserId: admin.id,
      },
      {
        date: plusDays(18),
        startTime: '16:00',
        endTime: '18:00',
        reason: 'Evento interno del staff',
        createdByUserId: admin.id,
      },
    ],
  });

  const reservationSeeds: Array<{
    celebrantName: string;
    daysFromNow: number;
    startTime: string;
    endTime: string;
    attendeesCount: number;
    packageIdx: number;
    theme: string;
    foodDetails: string;
    notes: string;
    status: ReservationStatus;
    advanceAmount: number;
    advancePaymentMethod?: PaymentMethod;
    createdByUserId: string;
    updatedByUserId: string;
    cancelledAt?: Date;
  }> = [
    {
      celebrantName: 'Valentina Ruiz',
      daysFromNow: 12,
      startTime: '11:00',
      endTime: '14:00',
      attendeesCount: 40,
      packageIdx: 0,
      theme: 'Unicornios',
      foodDetails: 'Mini burgers y fruta',
      notes: 'Confirmar mesa de pastel',
      status: ReservationStatus.REQUESTED,
      advanceAmount: 500,
      advancePaymentMethod: PaymentMethod.TRANSFER,
      createdByUserId: cashierOne.id,
      updatedByUserId: cashierOne.id,
    },
    {
      celebrantName: 'Mateo Hernández',
      daysFromNow: 2,
      startTime: '15:00',
      endTime: '18:00',
      attendeesCount: 55,
      packageIdx: 1,
      theme: 'Superhéroes',
      foodDetails: 'Pizza y papas',
      notes: 'Evento próximo, solo consulta',
      status: ReservationStatus.HELD,
      advanceAmount: 1000,
      advancePaymentMethod: PaymentMethod.CASH,
      createdByUserId: cashierTwo.id,
      updatedByUserId: cashierTwo.id,
    },
    {
      celebrantName: 'Lucía González',
      daysFromNow: 24,
      startTime: '12:00',
      endTime: '16:00',
      attendeesCount: 70,
      packageIdx: 1,
      theme: 'Espacial',
      foodDetails: 'Catering premium',
      notes: 'Incluye fotógrafo',
      status: ReservationStatus.CONFIRMED,
      advanceAmount: 4200,
      advancePaymentMethod: PaymentMethod.TRANSFER,
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
    },
    {
      celebrantName: 'Santiago Pérez',
      daysFromNow: 7,
      startTime: '09:00',
      endTime: '12:00',
      attendeesCount: 30,
      packageIdx: 0,
      theme: 'Minecraft',
      foodDetails: 'Hot dogs y jugo',
      notes: 'Saldo pendiente por cubrir',
      status: ReservationStatus.PENDING_PAYMENT,
      advanceAmount: 400,
      advancePaymentMethod: PaymentMethod.CASH,
      createdByUserId: cashierOne.id,
      updatedByUserId: cashierOne.id,
    },
    {
      celebrantName: 'Renata Flores',
      daysFromNow: -1,
      startTime: '13:00',
      endTime: '16:00',
      attendeesCount: 45,
      packageIdx: 1,
      theme: 'Princesas',
      foodDetails: 'Pastas y botanas',
      notes: 'Evento finalizado',
      status: ReservationStatus.COMPLETED,
      advanceAmount: 4200,
      advancePaymentMethod: PaymentMethod.TRANSFER,
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
    },
    {
      celebrantName: 'Diego Navarro',
      daysFromNow: 14,
      startTime: '17:00',
      endTime: '20:00',
      attendeesCount: 50,
      packageIdx: 0,
      theme: 'Futbol',
      foodDetails: 'Snacks y refrescos',
      notes: 'Cancelada por solicitud del cliente',
      status: ReservationStatus.CANCELLED,
      advanceAmount: 700,
      advancePaymentMethod: PaymentMethod.CASH,
      createdByUserId: cashierTwo.id,
      updatedByUserId: admin.id,
      cancelledAt: new Date(),
    },
  ];

  for (const seed of reservationSeeds) {
    const selectedPackage = packages[seed.packageIdx];
    const eventDate = plusDays(seed.daysFromNow);
    const token = generateOpaqueToken(32);
    const pendingBalance = Math.max(Number(selectedPackage.price.toString()) - seed.advanceAmount, 0);

    const created = await prisma.reservation.create({
      data: {
        publicTokenHash: hashOpaqueToken(token),
        celebrantName: seed.celebrantName,
        eventDate,
        startTime: seed.startTime,
        endTime: seed.endTime,
        attendeesCount: seed.attendeesCount,
        packageId: selectedPackage.id,
        theme: seed.theme,
        foodDetails: seed.foodDetails,
        notes: seed.notes,
        status: seed.status,
        advanceAmount: seed.advanceAmount,
        advancePaymentMethod: seed.advancePaymentMethod,
        pendingBalance,
        paymentDate: new Date(eventDate.getTime() - 10 * 24 * 60 * 60 * 1000),
        editableUntil: calculateEditableUntil(eventDate),
        createdByUserId: seed.createdByUserId,
        updatedByUserId: seed.updatedByUserId,
        cancelledAt: seed.cancelledAt ?? null,
      },
    });

    await prisma.reservationHistory.create({
      data: {
        reservationId: created.id,
        actorUserId: seed.createdByUserId,
        actionType: HistoryActionType.CREATED,
        fieldChanged: 'reservation',
        newValueJson: {
          status: seed.status,
          eventDate: eventDate.toISOString().slice(0, 10),
          startTime: seed.startTime,
        },
      },
    });

    if (seed.status === ReservationStatus.CANCELLED) {
      await prisma.reservationHistory.create({
        data: {
          reservationId: created.id,
          actorUserId: admin.id,
          actionType: HistoryActionType.CANCELLED,
          fieldChanged: 'status',
          oldValueJson: ReservationStatus.CONFIRMED,
          newValueJson: ReservationStatus.CANCELLED,
        },
      });
    }

    await prisma.notification.create({
      data: {
        type: NotificationType.NEW_RESERVATION,
        title: 'Reservación creada (seed)',
        message: `${seed.celebrantName} ${eventDate.toISOString().slice(0, 10)} ${seed.startTime}`,
        relatedReservationId: created.id,
        isRead: false,
      },
    });

    if (pendingBalance > 0) {
      await prisma.notification.create({
        data: {
          type: NotificationType.PAYMENT_PENDING,
          title: 'Pago pendiente (seed)',
          message: `${seed.celebrantName} tiene pendiente $${pendingBalance.toFixed(2)}`,
          relatedReservationId: created.id,
          isRead: false,
        },
      });
    }
  }

  await prisma.notification.createMany({
    data: [
      {
        type: NotificationType.EVENT_UPCOMING,
        title: 'Evento próximo',
        message: 'Tienes eventos agendados para esta semana.',
        isRead: false,
      },
      {
        type: NotificationType.RESERVATION_UPDATED,
        title: 'Reservación modificada',
        message: 'Una reservación fue actualizada por personal de caja.',
        isRead: true,
      },
    ],
  });

  const products = await prisma.$transaction([
    prisma.product.create({
      data: {
        name: 'Papitas clásicas',
        sku: 'BOT-001',
        category: ProductCategory.BOTANAS,
        description: 'Bolsa individual sabor original.',
        salePrice: 25,
        costPrice: 13,
        stockCurrent: 80,
        stockMin: 20,
        isActive: true,
        unit: ProductUnit.BOLSA,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Papitas picantes',
        sku: 'BOT-002',
        category: ProductCategory.BOTANAS,
        description: 'Bolsa individual sabor picante.',
        salePrice: 27,
        costPrice: 14,
        stockCurrent: 65,
        stockMin: 15,
        isActive: true,
        unit: ProductUnit.BOLSA,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Refresco 355 ml',
        sku: 'BEB-001',
        category: ProductCategory.BEBIDAS,
        description: 'Lata 355 ml sabores surtidos.',
        salePrice: 22,
        costPrice: 11,
        stockCurrent: 100,
        stockMin: 24,
        isActive: true,
        unit: ProductUnit.LATA,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Agua natural',
        sku: 'BEB-002',
        category: ProductCategory.BEBIDAS,
        description: 'Botella de agua natural.',
        salePrice: 18,
        costPrice: 9,
        stockCurrent: 90,
        stockMin: 20,
        isActive: true,
        unit: ProductUnit.BOTELLA,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Jugo',
        sku: 'BEB-003',
        category: ProductCategory.BEBIDAS,
        description: 'Jugo individual.',
        salePrice: 20,
        costPrice: 10,
        stockCurrent: 70,
        stockMin: 12,
        isActive: true,
        unit: ProductUnit.BOTELLA,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Chocolate',
        sku: 'DUL-001',
        category: ProductCategory.DULCES,
        description: 'Chocolate individual.',
        salePrice: 15,
        costPrice: 7,
        stockCurrent: 10,
        stockMin: 8,
        isActive: true,
        unit: ProductUnit.PIEZA,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Galletas',
        sku: 'DUL-002',
        category: ProductCategory.DULCES,
        description: 'Paquete de galletas.',
        salePrice: 18,
        costPrice: 9,
        stockCurrent: 50,
        stockMin: 10,
        isActive: true,
        unit: ProductUnit.PAQUETE,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Palomitas',
        sku: 'BOT-003',
        category: ProductCategory.BOTANAS,
        description: 'Bolsa mediana de palomitas.',
        salePrice: 30,
        costPrice: 16,
        stockCurrent: 45,
        stockMin: 10,
        isActive: true,
        unit: ProductUnit.BOLSA,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
      },
    }),
  ]);

  const purchaseFolio = `C-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-10001`;
  const purchase = await prisma.purchase.create({
    data: {
      folio: purchaseFolio,
      supplierName: 'Proveedor local demo',
      reference: 'FAC-1001',
      notes: 'Compra inicial de reposición',
      totalCost: 695,
      createdByUserId: admin.id,
    },
  });

  const purchaseLines = [
    { product: products[0], quantity: 20, unitCostPrice: 12 },
    { product: products[2], quantity: 30, unitCostPrice: 10 },
    { product: products[7], quantity: 10, unitCostPrice: 15.5 },
  ];

  for (const line of purchaseLines) {
    const nextStock = line.product.stockCurrent + line.quantity;
    await prisma.purchaseItem.create({
      data: {
        purchaseId: purchase.id,
        productId: line.product.id,
        productNameSnapshot: line.product.name,
        unitSnapshot: line.product.unit,
        quantity: line.quantity,
        unitCostPrice: line.unitCostPrice,
        subtotal: Number((line.quantity * line.unitCostPrice).toFixed(2)),
      },
    });

    await prisma.product.update({
      where: { id: line.product.id },
      data: {
        stockCurrent: nextStock,
        updatedByUserId: admin.id,
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        productId: line.product.id,
        type: InventoryMovementType.PURCHASE_IN,
        quantity: line.quantity,
        previousStock: line.product.stockCurrent,
        newStock: nextStock,
        reason: `Compra ${purchase.folio}`,
        actorUserId: admin.id,
        purchaseId: purchase.id,
        unitCostPrice: line.unitCostPrice,
      },
    });
  }

  const refreshedProducts = await prisma.product.findMany({
    orderBy: { createdAt: 'asc' },
  });
  const productBySku = new Map(refreshedProducts.map((product) => [product.sku, product]));

  const salesSeed = [
    {
      folio: `V-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-10001`,
      createdByUserId: cashierOne.id,
      paymentMethod: PaymentMethod.CASH,
      customerPhone: '+525512345670',
      notes: 'Venta mostrador mañana',
      lines: [
        { sku: 'BOT-001', quantity: 3 },
        { sku: 'BEB-001', quantity: 2 },
      ],
      forceNegative: false,
    },
    {
      folio: `V-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-10002`,
      createdByUserId: cashierTwo.id,
      paymentMethod: PaymentMethod.CARD,
      customerPhone: null,
      notes: 'Venta rápida sin WhatsApp',
      lines: [
        { sku: 'BOT-003', quantity: 2 },
        { sku: 'DUL-002', quantity: 1 },
      ],
      forceNegative: false,
    },
    {
      folio: `V-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-10003`,
      createdByUserId: admin.id,
      paymentMethod: PaymentMethod.TRANSFER,
      customerPhone: '+525500000000',
      notes: 'Sobreventa forzada por ADMIN',
      lines: [{ sku: 'DUL-001', quantity: 15 }],
      forceNegative: true,
    },
  ];

  for (const saleSeed of salesSeed) {
    let subtotal = 0;
    let forcedByAdmin = false;
    const lineData = saleSeed.lines.map((line) => {
      const product = productBySku.get(line.sku);
      if (!product) {
        throw new Error(`Producto no encontrado en seed para SKU ${line.sku}`);
      }

      const unitSalePrice = product.salePrice.toNumber();
      const unitCostPrice = product.costPrice.toNumber();
      const lineSubtotal = Number((unitSalePrice * line.quantity).toFixed(2));
      subtotal = Number((subtotal + lineSubtotal).toFixed(2));
      const forced = product.stockCurrent < line.quantity;
      forcedByAdmin = forcedByAdmin || forced;

      return {
        product,
        quantity: line.quantity,
        unitSalePrice,
        unitCostPrice,
        lineSubtotal,
        forced,
      };
    });

    const sale = await prisma.sale.create({
      data: {
        folio: saleSeed.folio,
        paymentMethod: saleSeed.paymentMethod,
        subtotal,
        total: subtotal,
        forcedByAdmin: forcedByAdmin && saleSeed.forceNegative,
        customerPhone: saleSeed.customerPhone,
        notes: saleSeed.notes,
        createdByUserId: saleSeed.createdByUserId,
      },
    });

    for (const line of lineData) {
      const current = await prisma.product.findUniqueOrThrow({ where: { id: line.product.id } });
      const nextStock = current.stockCurrent - line.quantity;
      const isForced = nextStock < 0;
      await prisma.saleItem.create({
        data: {
          saleId: sale.id,
          productId: line.product.id,
          productNameSnapshot: line.product.name,
          skuSnapshot: line.product.sku,
          categorySnapshot: line.product.category,
          unitSnapshot: line.product.unit,
          quantity: line.quantity,
          unitSalePrice: line.unitSalePrice,
          unitCostPrice: line.unitCostPrice,
          subtotal: line.lineSubtotal,
          forcedNegativeStock: isForced,
        },
      });

      await prisma.product.update({
        where: { id: line.product.id },
        data: {
          stockCurrent: nextStock,
          updatedByUserId: saleSeed.createdByUserId,
        },
      });

      await prisma.inventoryMovement.create({
        data: {
          productId: line.product.id,
          type: isForced
            ? InventoryMovementType.ADMIN_FORCED_SALE
            : InventoryMovementType.SALE_OUT,
          quantity: -line.quantity,
          previousStock: current.stockCurrent,
          newStock: nextStock,
          reason: isForced ? 'Sobreventa forzada por ADMIN (seed)' : 'Venta POS (seed)',
          forcedByAdmin: isForced,
          actorUserId: saleSeed.createdByUserId,
          saleId: sale.id,
          unitSalePrice: line.unitSalePrice,
          unitCostPrice: line.unitCostPrice,
        },
      });
    }

    const saleNotification = await prisma.notification.create({
      data: {
        type: NotificationType.POS_SALE_CREATED,
        title: 'Venta POS registrada (seed)',
        message: `Venta ${sale.folio} total $${sale.total.toFixed(2)}`,
        relatedSaleId: sale.id,
        isRead: false,
      },
    });

    await prisma.notificationDelivery.create({
      data: {
        notificationId: saleNotification.id,
        channel: NotificationChannel.INTERNAL,
        status: NotificationDeliveryStatus.SENT,
        provider: 'internal',
        sentAt: new Date(),
      },
    });

    if (sale.customerPhone) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: saleNotification.id,
          channel: NotificationChannel.WHATSAPP,
          status: sale.customerPhone.includes('0000')
            ? NotificationDeliveryStatus.FAILED
            : NotificationDeliveryStatus.SENT,
          provider: 'mock',
          destination: sale.customerPhone,
          errorMessage: sale.customerPhone.includes('0000')
            ? 'Error simulado de proveedor en seed'
            : null,
          sentAt: sale.customerPhone.includes('0000') ? null : new Date(),
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log('Seed completed. Demo users:');
  // eslint-disable-next-line no-console
  console.log('ADMIN (Sofía) -> admin@magiccity.local / Admin123!');
  // eslint-disable-next-line no-console
  console.log('CASHIER-> cashier1@magiccity.local / Cashier123!');
  // eslint-disable-next-line no-console
  console.log('CASHIER-> cashier2@magiccity.local / Cashier123!');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
