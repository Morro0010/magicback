import 'reflect-metadata';
import {
  BirthdayFollowUpStatus,
  HistoryActionType,
  InventoryMovementType,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  PaymentMethod,
  Prisma,
  PrismaClient,
  ProductCategory,
  ProductUnit,
  ReservationStatus,
  SpecialEventAttendeeType,
  SpecialEventReservationStatus,
  SpecialEventStatus,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { calculateEditableUntil } from '../src/common/utils/date.util';
import { nextPrivateEventFolioNumber } from '../src/common/utils/public-folio.util';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../src/common/utils/security.util';
import { normalizeEventForm } from '../src/reservations/event-form.constants';
import {
  EventAreaType,
  EventCakeProvider,
  EventDrinkOption,
  EventFoodOption,
  EventPackageType,
  EventType,
} from '../src/reservations/dto/event-form.dto';

const prisma = new PrismaClient();
type SeedEventFormInput = NonNullable<Parameters<typeof normalizeEventForm>[0]>;

type DemoPublicLink = {
  label: string;
  path: string;
};

const demoPublicLinks: DemoPublicLink[] = [];

function plusDays(days: number) {
  const now = new Date();
  const base = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
  );
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

function dateTimeDaysAgo(days: number, hour = 12) {
  const value = plusDays(-days);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function birthDateForUpcomingBirthday(daysUntil: number, ageTurning: number) {
  const birthday = plusDays(daysUntil);
  const birthYear = birthday.getUTCFullYear() - ageTurning;
  return [
    String(birthYear).padStart(4, '0'),
    String(birthday.getUTCMonth() + 1).padStart(2, '0'),
    String(birthday.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function nextBirthdayYear(birthDate: Date) {
  const today = plusDays(0);
  const thisYearBirthday = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      birthDate.getUTCMonth(),
      birthDate.getUTCDate(),
      12,
    ),
  );
  return thisYearBirthday < today
    ? today.getUTCFullYear() + 1
    : today.getUTCFullYear();
}

function normalizeCustomerPhone(phone: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.length === 13 && digits.startsWith('521')) {
    return digits.slice(3);
  }
  if (digits.length === 12 && digits.startsWith('52')) {
    return digits.slice(2);
  }
  if (digits.length > 10 && digits.startsWith('52')) {
    return digits.slice(-10);
  }
  return digits;
}

function money(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

async function ensureUser(input: {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  isActive?: boolean;
}) {
  const passwordHash = await argon2.hash(input.password);
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        role: input.role,
        passwordHash,
        isActive: input.isActive ?? true,
      },
    });
  }

  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash,
      isActive: input.isActive ?? true,
    },
  });
}

async function upsertDemoCustomer(input: {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  internalNotes?: string | null;
}) {
  const normalizedPhone = normalizeCustomerPhone(input.phone);
  if (!normalizedPhone) {
    throw new Error(`No se pudo normalizar el teléfono demo de ${input.name}`);
  }

  const existing = await prisma.customer.findUnique({
    where: { normalizedPhone },
  });
  if (!existing) {
    return prisma.customer.create({
      data: {
        name: input.name.trim(),
        phone: input.phone.trim(),
        normalizedPhone,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        internalNotes: input.internalNotes?.trim() || null,
      },
    });
  }

  return prisma.customer.update({
    where: { id: existing.id },
    data: {
      email: existing.email || input.email?.trim() || null,
      address: existing.address || input.address?.trim() || null,
      internalNotes:
        existing.internalNotes || input.internalNotes?.trim() || null,
    },
  });
}

async function clearOperationalData() {
  await prisma.notificationDelivery.deleteMany();
  await prisma.notificationRead.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.specialEventTicket.deleteMany();
  await prisma.specialEventReservation.deleteMany();
  await prisma.$executeRawUnsafe(
    'ALTER SEQUENCE IF EXISTS "SpecialEventReservation_folioNumber_seq" RESTART WITH 1',
  );
  await prisma.$executeRawUnsafe(
    'ALTER SEQUENCE IF EXISTS "Reservation_privateEventFolioNumber_seq" RESTART WITH 1',
  );
  await prisma.specialEvent.deleteMany();
  await prisma.birthdayFollowUp.deleteMany();
  await prisma.celebrant.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.customerReview.deleteMany();
  await prisma.reservationHistory.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.blockedSlot.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.product.deleteMany();
  await prisma.package.deleteMany();
}

async function createPackages() {
  return prisma.$transaction([
    prisma.package.create({
      data: {
        name: 'Básico',
        description:
          'Paquete base Magic City con renta de espacio, invitados, alimentos y decoración incluida.',
        price: money(0),
        featuresJson: [
          'Agua fresca a elegir',
          'Comida a elegir',
          'Pastel Dairy Queen',
          'Mobiliario y mantelería',
          '4 horas de juego',
          'Performance con Milo',
        ],
      },
    }),
    prisma.package.create({
      data: {
        name: 'Básico + spa',
        description:
          'Paquete básico con experiencia de spa. Precio final por definir.',
        price: money(0),
        featuresJson: [
          'Incluye básico',
          'Experiencia de spa',
          'Precio por definir',
        ],
      },
    }),
    prisma.package.create({
      data: {
        name: 'Básico + decoración premium',
        description:
          'Paquete básico con mampara completa, arco de globos, leds y figura de personaje.',
        price: money(0),
        featuresJson: [
          'Incluye básico',
          'Mampara completa',
          'Arco de globos',
          'Leds',
          'Figura de personaje',
        ],
      },
    }),
  ]);
}

async function createProducts(adminId: string) {
  const products: Array<{
    name: string;
    sku: string;
    category: ProductCategory;
    salePrice: number;
    costPrice: number;
    stockMin: number;
    unit: ProductUnit;
    isActive?: boolean;
  }> = [
    {
      name: 'Agua natural 500ml',
      sku: 'DEMO-AGUA-500',
      category: ProductCategory.BEBIDAS,
      salePrice: 18,
      costPrice: 8,
      stockMin: 20,
      unit: ProductUnit.BOTELLA,
    },
    {
      name: 'Jugo infantil',
      sku: 'DEMO-JUGO-INF',
      category: ProductCategory.BEBIDAS,
      salePrice: 22,
      costPrice: 10,
      stockMin: 18,
      unit: ProductUnit.PIEZA,
    },
    {
      name: 'Palomitas chicas',
      sku: 'DEMO-PAL-CH',
      category: ProductCategory.CINE,
      salePrice: 35,
      costPrice: 13,
      stockMin: 15,
      unit: ProductUnit.BOLSA,
    },
    {
      name: 'Combo cine infantil',
      sku: 'DEMO-CINE-COMBO',
      category: ProductCategory.CINE,
      salePrice: 75,
      costPrice: 32,
      stockMin: 10,
      unit: ProductUnit.PAQUETE,
    },
    {
      name: 'Bolsa de dulces',
      sku: 'DEMO-DULCES',
      category: ProductCategory.DULCES,
      salePrice: 28,
      costPrice: 12,
      stockMin: 25,
      unit: ProductUnit.BOLSA,
    },
    {
      name: 'Papas botana',
      sku: 'DEMO-PAPAS',
      category: ProductCategory.BOTANAS,
      salePrice: 30,
      costPrice: 14,
      stockMin: 12,
      unit: ProductUnit.BOLSA,
    },
    {
      name: 'Refresco en lata',
      sku: 'DEMO-REFRESCO-LATA',
      category: ProductCategory.BEBIDAS,
      salePrice: 26,
      costPrice: 11,
      stockMin: 16,
      unit: ProductUnit.LATA,
    },
    {
      name: 'Artículo temporal inactivo',
      sku: 'DEMO-INACTIVO',
      category: ProductCategory.OTROS,
      salePrice: 45,
      costPrice: 20,
      stockMin: 5,
      unit: ProductUnit.PIEZA,
      isActive: false,
    },
  ];

  const extraNames = [
    'Agua mineral',
    'Té helado',
    'Néctar infantil',
    'Refresco familiar',
    'Galletas decoradas',
    'Paleta de caramelo',
    'Chocolate individual',
    'Gomitas surtidas',
    'Papas naturales',
    'Papas con chile',
    'Nachos individuales',
    'Pretzels',
    'Palomitas medianas',
    'Palomitas grandes',
    'Combo cine familiar',
    'Vaso coleccionable',
    'Calcetines antiderrapantes',
    'Pulsera Magic',
    'Corona de cumpleaños',
    'Bolsa para regalo',
  ];
  for (let index = 0; index < 52; index += 1) {
    const category =
      Object.values(ProductCategory)[
        index % Object.values(ProductCategory).length
      ];
    const unit =
      Object.values(ProductUnit)[index % Object.values(ProductUnit).length];
    products.push({
      name: `${extraNames[index % extraNames.length]} ${Math.floor(index / extraNames.length) + 1}`,
      sku: `DEMO-EXTRA-${String(index + 1).padStart(3, '0')}`,
      category,
      salePrice: 20 + (index % 12) * 5,
      costPrice: 8 + (index % 9) * 3,
      stockMin: 8 + (index % 10),
      unit,
      isActive: index % 17 !== 0,
    });
  }

  return prisma.$transaction(
    products.map((product) =>
      prisma.product.create({
        data: {
          ...product,
          salePrice: money(product.salePrice),
          costPrice: money(product.costPrice),
          stockCurrent: 0,
          isActive: product.isActive ?? true,
          createdByUserId: adminId,
          updatedByUserId: adminId,
        },
      }),
    ),
  );
}

async function createPurchase(input: {
  folio: string;
  supplierName: string;
  createdByUserId: string;
  items: Array<{ productId: string; quantity: number; unitCostPrice: number }>;
  createdAt?: Date;
}) {
  const totalCost = input.items.reduce(
    (acc, item) => acc + item.quantity * item.unitCostPrice,
    0,
  );
  const purchase = await prisma.purchase.create({
    data: {
      folio: input.folio,
      supplierName: input.supplierName,
      reference: `REF-${input.folio}`,
      notes: 'Compra demo para pruebas de inventario.',
      totalCost: money(totalCost),
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
    },
  });

  for (const item of input.items) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: item.productId },
    });
    const previousStock = product.stockCurrent;
    const newStock = previousStock + item.quantity;

    await prisma.purchaseItem.create({
      data: {
        purchaseId: purchase.id,
        productId: product.id,
        productNameSnapshot: product.name,
        unitSnapshot: product.unit,
        quantity: item.quantity,
        unitCostPrice: money(item.unitCostPrice),
        subtotal: money(item.quantity * item.unitCostPrice),
        createdAt: input.createdAt,
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: {
        stockCurrent: newStock,
        costPrice: money(item.unitCostPrice),
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        type: InventoryMovementType.PURCHASE_IN,
        quantity: item.quantity,
        previousStock,
        newStock,
        reason: `Compra ${purchase.folio}`,
        actorUserId: input.createdByUserId,
        purchaseId: purchase.id,
        unitCostPrice: money(item.unitCostPrice),
        createdAt: input.createdAt,
      },
    });
  }

  return purchase;
}

async function createSale(input: {
  folio: string;
  createdByUserId: string;
  paymentMethod: PaymentMethod;
  items: Array<{ productId: string; quantity: number }>;
  customerPhone?: string;
  notes?: string;
  forceNegativeStock?: boolean;
  sendWhatsAppTicket?: boolean;
  createdAt?: Date;
}) {
  const products = await Promise.all(
    input.items.map((item) =>
      prisma.product.findUniqueOrThrow({ where: { id: item.productId } }),
    ),
  );
  const subtotal = input.items.reduce((acc, item, index) => {
    return acc + products[index].salePrice.toNumber() * item.quantity;
  }, 0);
  const forcedByAdmin = input.forceNegativeStock === true;

  const sale = await prisma.sale.create({
    data: {
      folio: input.folio,
      paymentMethod: input.paymentMethod,
      subtotal: money(subtotal),
      total: money(subtotal),
      forcedByAdmin,
      customerPhone: input.customerPhone ?? null,
      notes: input.notes ?? null,
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
    },
  });

  for (const [index, item] of input.items.entries()) {
    const product = products[index];
    const previousStock = product.stockCurrent;
    const newStock = previousStock - item.quantity;
    const forcedNegativeStock = newStock < 0;

    await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        productId: product.id,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        categorySnapshot: product.category,
        unitSnapshot: product.unit,
        quantity: item.quantity,
        unitSalePrice: product.salePrice,
        unitCostPrice: product.costPrice,
        subtotal: money(product.salePrice.toNumber() * item.quantity),
        forcedNegativeStock,
        createdAt: input.createdAt,
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { stockCurrent: newStock },
    });

    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        type: forcedNegativeStock
          ? InventoryMovementType.ADMIN_FORCED_SALE
          : InventoryMovementType.SALE_OUT,
        quantity: -item.quantity,
        previousStock,
        newStock,
        reason: `Venta ${sale.folio}`,
        forcedByAdmin: forcedNegativeStock,
        actorUserId: input.createdByUserId,
        saleId: sale.id,
        unitSalePrice: product.salePrice,
        unitCostPrice: product.costPrice,
        createdAt: input.createdAt,
      },
    });
  }

  await prisma.notification.create({
    data: {
      type: NotificationType.POS_SALE_CREATED,
      title: `Venta ${sale.folio}`,
      message: `Venta demo por $${subtotal.toFixed(2)}`,
      relatedSaleId: sale.id,
      createdAt: input.createdAt,
      deliveries: {
        create: {
          channel: NotificationChannel.INTERNAL,
          status: NotificationDeliveryStatus.SENT,
          provider: 'internal',
          sentAt: new Date(),
          payloadJson: Prisma.JsonNull,
          triggeredByUserId: input.createdByUserId,
          createdAt: input.createdAt,
        },
      },
    },
  });

  if (input.sendWhatsAppTicket && input.customerPhone) {
    await prisma.notification.create({
      data: {
        type: NotificationType.POS_TICKET_WHATSAPP,
        title: `Ticket WhatsApp ${sale.folio}`,
        message: `Ticket demo preparado para ${input.customerPhone}`,
        relatedSaleId: sale.id,
        createdAt: input.createdAt,
        deliveries: {
          create: {
            channel: NotificationChannel.WHATSAPP,
            destination: input.customerPhone,
            status: NotificationDeliveryStatus.SKIPPED,
            provider: 'mock',
            payloadJson: {
              seed: true,
              ticketLink: `/admin/sales/${sale.id}/ticket`,
              folio: sale.folio,
            },
            triggeredByUserId: input.createdByUserId,
            createdAt: input.createdAt,
          },
        },
      },
    });
  }

  return sale;
}

async function createManualInventoryAdjustment(input: {
  productId: string;
  quantityDelta: number;
  reason: string;
  actorUserId: string;
  forceNegativeStock?: boolean;
  createdAt?: Date;
}) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: input.productId },
  });
  const nextStock = product.stockCurrent + input.quantityDelta;
  const forcedByAdmin = nextStock < 0 && input.forceNegativeStock === true;

  if (nextStock < 0 && !forcedByAdmin) {
    throw new Error(
      `El ajuste demo dejaría stock negativo sin autorización: ${product.name}`,
    );
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: {
        stockCurrent: nextStock,
        updatedByUserId: input.actorUserId,
      },
    }),
    prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        type:
          input.quantityDelta > 0
            ? InventoryMovementType.MANUAL_ADJUSTMENT_POSITIVE
            : InventoryMovementType.MANUAL_ADJUSTMENT_NEGATIVE,
        quantity: input.quantityDelta,
        previousStock: product.stockCurrent,
        newStock: nextStock,
        reason: input.reason,
        forcedByAdmin,
        actorUserId: input.actorUserId,
        createdAt: input.createdAt,
      },
    }),
  ]);
}

async function createReservation(input: {
  packageId: string;
  createdByUserId: string;
  celebrantName: string;
  status: ReservationStatus;
  daysFromNow: number;
  startTime: string;
  endTime: string;
  attendeesCount: number;
  advanceAmount: number;
  paymentMethod?: PaymentMethod;
  theme: string;
  eventForm: SeedEventFormInput;
  followUpStatus?: BirthdayFollowUpStatus;
  historyActions?: HistoryActionType[];
  createdAt?: Date;
  exposePublicLink?: boolean;
}) {
  const packageRecord = await prisma.package.findUniqueOrThrow({
    where: { id: input.packageId },
  });
  const eventDate = plusDays(input.daysFromNow);
  const token = generateOpaqueToken(32);
  const eventForm = normalizeEventForm({
    ...input.eventForm,
    eventTheme: input.theme,
    responsibleName:
      input.eventForm.responsibleName ??
      `Responsable de ${input.celebrantName}`,
  });
  const estimatedTotal =
    eventForm.pricingBreakdown.estimatedTotal || packageRecord.price.toNumber();
  const pendingBalance = Math.max(estimatedTotal - input.advanceAmount, 0);
  const privateEventFolioNumber =
    eventForm.eventType === EventType.PRIVATE_EVENT
      ? await nextPrivateEventFolioNumber(prisma)
      : null;

  const reservation = await prisma.reservation.create({
    data: {
      privateEventFolioNumber,
      publicTokenHash: hashOpaqueToken(token),
      publicTokenExpiresAt: plusDays(45),
      celebrantName: input.celebrantName,
      eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      attendeesCount: input.attendeesCount,
      packageId: packageRecord.id,
      theme: input.theme,
      foodDetails:
        eventForm.eventType === EventType.BIRTHDAY_PARTY
          ? 'Opciones incluidas capturadas en eventFormJson.'
          : 'No aplica comida incluida para este tipo de evento demo.',
      notes: `Reservación demo ${eventForm.eventType ?? 'legacy'} para pruebas.`,
      status: input.status,
      advanceAmount: money(input.advanceAmount),
      advancePaymentMethod: input.paymentMethod ?? null,
      pendingBalance: money(pendingBalance),
      paymentDate:
        input.advanceAmount > 0 ? (input.createdAt ?? new Date()) : null,
      editableUntil: calculateEditableUntil(eventDate),
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.createdByUserId,
      cancelledAt:
        input.status === ReservationStatus.CANCELLED
          ? (input.createdAt ?? new Date())
          : null,
      eventFormJson: eventForm,
      createdAt: input.createdAt,
    },
  });

  const historyRows: Prisma.ReservationHistoryCreateManyInput[] = [
    {
      reservationId: reservation.id,
      actorUserId: input.createdByUserId,
      actionType: HistoryActionType.CREATED,
      newValueJson: { status: ReservationStatus.REQUESTED },
      createdAt: input.createdAt,
    },
    {
      reservationId: reservation.id,
      actorUserId: input.createdByUserId,
      actionType: HistoryActionType.UPDATED,
      fieldChanged: 'eventFormJson',
      newValueJson: { source: 'demo-seed' },
      createdAt: input.createdAt,
    },
  ];

  if (input.advanceAmount > 0) {
    historyRows.push({
      reservationId: reservation.id,
      actorUserId: input.createdByUserId,
      actionType: HistoryActionType.PAYMENT_RECORDED,
      fieldChanged: 'advanceAmount',
      oldValueJson: { amount: 0 },
      newValueJson: {
        amount: input.advanceAmount,
        method: input.paymentMethod ?? null,
      },
      createdAt: input.createdAt,
    });
  }

  if (input.status !== ReservationStatus.REQUESTED) {
    historyRows.push({
      reservationId: reservation.id,
      actorUserId: input.createdByUserId,
      actionType: HistoryActionType.STATUS_CHANGED,
      fieldChanged: 'status',
      oldValueJson: { status: ReservationStatus.REQUESTED },
      newValueJson: { status: input.status },
      createdAt: input.createdAt,
    });
  }

  if (input.status === ReservationStatus.CANCELLED) {
    historyRows.push({
      reservationId: reservation.id,
      actorUserId: input.createdByUserId,
      actionType: HistoryActionType.CANCELLED,
      fieldChanged: 'status',
      oldValueJson: { status: ReservationStatus.REQUESTED },
      newValueJson: {
        status: ReservationStatus.CANCELLED,
        reason: 'Cancelación demo',
      },
      createdAt: input.createdAt,
    });
  }

  for (const actionType of input.historyActions ?? []) {
    historyRows.push({
      reservationId: reservation.id,
      actorUserId: input.createdByUserId,
      actionType,
      fieldChanged:
        actionType === HistoryActionType.REASSIGNED ? 'createdByUserId' : null,
      newValueJson: { source: 'demo-seed', actionType },
      createdAt: input.createdAt,
    });
  }

  await prisma.reservationHistory.createMany({
    data: historyRows,
  });

  let customerId: string | null = null;
  let celebrantId: string | null = null;
  if (eventForm.phone) {
    const customer = await upsertDemoCustomer({
      name: eventForm.responsibleName || input.celebrantName,
      phone: eventForm.phone,
      address: eventForm.address,
    });
    customerId = customer.id;

    if (
      eventForm.eventType === EventType.BIRTHDAY_PARTY &&
      eventForm.celebrantBirthDate
    ) {
      const birthDate = parseDateOnly(eventForm.celebrantBirthDate);
      const existingCelebrant = await prisma.celebrant.findFirst({
        where: {
          customerId: customer.id,
          name: input.celebrantName,
          birthDate,
        },
      });
      const celebrant =
        existingCelebrant ??
        (await prisma.celebrant.create({
          data: {
            customerId: customer.id,
            name: input.celebrantName,
            birthDate,
            sourceReservationId: reservation.id,
          },
        }));
      celebrantId = celebrant.id;

      if (input.followUpStatus) {
        await prisma.birthdayFollowUp.create({
          data: {
            customerId: customer.id,
            celebrantId: celebrant.id,
            birthdayYear: nextBirthdayYear(birthDate),
            status: input.followUpStatus,
            notes: `Seguimiento ${input.followUpStatus.toLowerCase()} generado por demo reset.`,
          },
        });
      }
    }

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        customerId,
        primaryCelebrantId: celebrantId,
      },
    });
  }

  await prisma.notification.create({
    data: {
      type:
        input.status === ReservationStatus.PENDING_PAYMENT
          ? NotificationType.PAYMENT_PENDING
          : NotificationType.NEW_RESERVATION,
      title:
        input.status === ReservationStatus.PENDING_PAYMENT
          ? `Pago pendiente: ${input.celebrantName}`
          : `Nueva reservación: ${input.celebrantName}`,
      message: `Evento demo ${input.startTime}-${input.endTime}`,
      relatedReservationId: reservation.id,
      isRead: input.status === ReservationStatus.COMPLETED,
      createdAt: input.createdAt,
      deliveries: {
        create: {
          channel: NotificationChannel.INTERNAL,
          status: NotificationDeliveryStatus.SENT,
          provider: 'internal',
          sentAt: new Date(),
          payloadJson: Prisma.JsonNull,
          triggeredByUserId: input.createdByUserId,
          createdAt: input.createdAt,
        },
      },
    },
  });

  if (input.exposePublicLink !== false) {
    demoPublicLinks.push({
      label: `Reservación ${input.celebrantName}`,
      path: `/public/reservations/${token}`,
    });
  }

  return { reservation, token, customerId, celebrantId };
}

function reviewAverage(values: Record<string, number>) {
  const ratings = Object.values(values);
  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return total / ratings.length;
}

async function createCustomerReviews(input: {
  adminId: string;
  cashierId: string;
}) {
  const reviews = [
    {
      customerName: 'Ana Pérez Demo',
      capturedByUserId: input.cashierId,
      recommendations:
        'Todo estuvo muy bonito, solo mejorar el sonido al cantar las mañanitas.',
      ratings: {
        cumplimientoHorarioServicio: 5,
        amabilidadDisponibilidadStaff: 5,
        lugarLimpio: 5,
        calidadProductosServicio: 4,
        instalacionAdecuadaFiestas: 5,
        comidaTiempoForma: 4,
        recomendariaMagicCity: 5,
        satisfaccionGeneral: 5,
      },
      metadataJson: {
        captureSurface: 'review_tablet',
        seed: true,
        device: 'ipad_landscape',
      },
      createdAt: dateTimeDaysAgo(1, 18),
    },
    {
      customerName: 'Roberto Gómez Demo',
      capturedByUserId: input.adminId,
      recommendations:
        'La comida llegó un poco tarde. La atención del equipo fue excelente.',
      ratings: {
        cumplimientoHorarioServicio: 3,
        amabilidadDisponibilidadStaff: 5,
        lugarLimpio: 4,
        calidadProductosServicio: 3,
        instalacionAdecuadaFiestas: 4,
        comidaTiempoForma: 2,
        recomendariaMagicCity: 4,
        satisfaccionGeneral: 3,
      },
      metadataJson: {
        captureSurface: 'review_tablet',
        seed: true,
        hasLowCategory: true,
      },
      createdAt: dateTimeDaysAgo(9, 16),
    },
    {
      customerName: 'Mariana López Demo',
      capturedByUserId: input.cashierId,
      recommendations: null,
      ratings: {
        cumplimientoHorarioServicio: 4,
        amabilidadDisponibilidadStaff: 4,
        lugarLimpio: 5,
        calidadProductosServicio: 5,
        instalacionAdecuadaFiestas: 5,
        comidaTiempoForma: 5,
        recomendariaMagicCity: 5,
        satisfaccionGeneral: 4,
      },
      metadataJson: { captureSurface: 'review_tablet', seed: true },
      createdAt: dateTimeDaysAgo(22, 11),
    },
  ];

  for (const review of reviews) {
    await prisma.customerReview.create({
      data: {
        customerName: review.customerName,
        ...review.ratings,
        recommendations: review.recommendations,
        averageRating: money(reviewAverage(review.ratings)),
        metadataJson: review.metadataJson,
        capturedByUserId: review.capturedByUserId,
        createdAt: review.createdAt,
      },
    });
  }
}

function formatSpecialFolio(folioNumber: number) {
  return String(folioNumber).padStart(4, '0');
}

async function createSpecialEventReservation(input: {
  specialEventId: string;
  holderName: string;
  holderPhone: string;
  holderEmail?: string;
  comments?: string;
  status: SpecialEventReservationStatus;
  paymentConfirmedByUserId?: string;
  cancelledByUserId?: string;
  attendees: Array<{
    name: string;
    type: SpecialEventAttendeeType;
    price: number;
  }>;
}) {
  const token = generateOpaqueToken(32);
  const childCount = input.attendees.filter(
    (attendee) => attendee.type === SpecialEventAttendeeType.CHILD,
  ).length;
  const adultCount = input.attendees.filter(
    (attendee) => attendee.type === SpecialEventAttendeeType.ADULT,
  ).length;
  const totalAmount = input.attendees.reduce(
    (sum, attendee) => sum + attendee.price,
    0,
  );

  const reservation = await prisma.specialEventReservation.create({
    data: {
      specialEventId: input.specialEventId,
      publicTokenHash: hashOpaqueToken(token),
      holderName: input.holderName,
      holderPhone: input.holderPhone,
      holderEmail: input.holderEmail ?? null,
      comments: input.comments ?? null,
      childCount,
      adultCount,
      totalAmount: money(totalAmount),
      status: input.status,
      paymentConfirmedAt:
        input.status === SpecialEventReservationStatus.PAYMENT_CONFIRMED
          ? new Date()
          : null,
      paymentConfirmedByUserId:
        input.status === SpecialEventReservationStatus.PAYMENT_CONFIRMED
          ? (input.paymentConfirmedByUserId ?? null)
          : null,
      cancelledAt:
        input.status === SpecialEventReservationStatus.CANCELLED
          ? new Date()
          : null,
      cancelledByUserId:
        input.status === SpecialEventReservationStatus.CANCELLED
          ? (input.cancelledByUserId ?? null)
          : null,
    },
  });

  const folio = formatSpecialFolio(reservation.folioNumber);
  await prisma.specialEventTicket.createMany({
    data: input.attendees.map((attendee, index) => ({
      reservationId: reservation.id,
      code: `${folio}-${String(index + 1).padStart(2, '0')}`,
      attendeeName: attendee.name,
      attendeeType: attendee.type,
      isReservationHolder:
        attendee.type === SpecialEventAttendeeType.ADULT &&
        attendee.name.trim().toLocaleLowerCase('es-MX') ===
          input.holderName.trim().toLocaleLowerCase('es-MX'),
      price: money(attendee.price),
    })),
  });

  const customer = await upsertDemoCustomer({
    name: input.holderName,
    phone: input.holderPhone,
    email: input.holderEmail,
  });
  await prisma.specialEventReservation.update({
    where: { id: reservation.id },
    data: { customerId: customer.id },
  });

  const notificationType =
    input.status === SpecialEventReservationStatus.PAYMENT_CONFIRMED
      ? NotificationType.SPECIAL_EVENT_PAYMENT_CONFIRMED
      : NotificationType.SPECIAL_EVENT_RESERVATION_CREATED;

  await prisma.notification.create({
    data: {
      type: notificationType,
      title:
        input.status === SpecialEventReservationStatus.PAYMENT_CONFIRMED
          ? `Pago confirmado evento especial ${folio}`
          : `Reserva evento especial ${folio}`,
      message: `${input.holderName} reservó ${input.attendees.length} boletos demo.`,
      relatedSpecialEventReservationId: reservation.id,
      isRead: input.status === SpecialEventReservationStatus.CANCELLED,
      deliveries: {
        create: [
          {
            channel: NotificationChannel.INTERNAL,
            status: NotificationDeliveryStatus.SENT,
            provider: 'internal',
            sentAt: new Date(),
            payloadJson: Prisma.JsonNull,
            triggeredByUserId:
              input.paymentConfirmedByUserId ?? input.cancelledByUserId ?? null,
          },
          {
            channel: NotificationChannel.WHATSAPP,
            destination: input.holderPhone,
            status: NotificationDeliveryStatus.SKIPPED,
            provider: 'mock',
            payloadJson: {
              seed: true,
              trackingLink: `/special-reservation/${token}`,
              folio,
            },
            triggeredByUserId: input.paymentConfirmedByUserId ?? null,
          },
        ],
      },
    },
  });

  demoPublicLinks.push({
    label: `Boletos ${folio} · ${input.holderName}`,
    path: `/special-reservation/${token}`,
  });

  return { reservation, token, folio, customerId: customer.id };
}

async function createSpecialEvents(input: { adminId: string }) {
  const halloweenDate = plusDays(25);
  const halloweenBlock = await prisma.blockedSlot.create({
    data: {
      date: halloweenDate,
      startTime: '00:00',
      endTime: '23:59',
      reason: 'Evento especial: Halloween Magic City Demo',
      createdByUserId: input.adminId,
    },
  });
  const halloween = await prisma.specialEvent.create({
    data: {
      name: 'Halloween Magic City Demo',
      description:
        'Evento temático demo para probar venta de boletos, cupo y pagos manuales.',
      eventDate: halloweenDate,
      startTime: '17:00',
      endTime: '20:00',
      childPrice: money(280),
      adultPrice: money(150),
      capacityMax: 10,
      imageUrl: 'https://example.com/demo-halloween-magic-city.jpg',
      includesText:
        'Juegos, actividad temática, música, dulces y convivencia familiar.',
      status: SpecialEventStatus.PUBLISHED,
      blockedSlotId: halloweenBlock.id,
      createdByUserId: input.adminId,
      updatedByUserId: input.adminId,
    },
  });

  await createSpecialEventReservation({
    specialEventId: halloween.id,
    holderName: 'Ana Ramírez Demo',
    holderPhone: '5551234567',
    holderEmail: 'ramirez.demo@example.com',
    comments: 'Llegan con dos niños disfrazados.',
    status: SpecialEventReservationStatus.PENDING_PAYMENT,
    attendees: [
      {
        name: 'Ana Ramírez Demo',
        type: SpecialEventAttendeeType.ADULT,
        price: 150,
      },
      {
        name: 'Mateo Ramírez',
        type: SpecialEventAttendeeType.CHILD,
        price: 280,
      },
      {
        name: 'Sofía Ramírez',
        type: SpecialEventAttendeeType.CHILD,
        price: 280,
      },
      {
        name: 'Laura Ramírez',
        type: SpecialEventAttendeeType.ADULT,
        price: 150,
      },
    ],
  });
  await createSpecialEventReservation({
    specialEventId: halloween.id,
    holderName: 'Familia Torres Demo',
    holderPhone: '5554446677',
    holderEmail: 'torres.demo@example.com',
    status: SpecialEventReservationStatus.PAYMENT_CONFIRMED,
    paymentConfirmedByUserId: input.adminId,
    attendees: [
      {
        name: 'Familia Torres Demo',
        type: SpecialEventAttendeeType.ADULT,
        price: 150,
      },
      {
        name: 'Camila Torres',
        type: SpecialEventAttendeeType.CHILD,
        price: 280,
      },
      {
        name: 'Diego Torres',
        type: SpecialEventAttendeeType.CHILD,
        price: 280,
      },
      {
        name: 'Paola Torres',
        type: SpecialEventAttendeeType.ADULT,
        price: 150,
      },
      { name: 'Iván Torres', type: SpecialEventAttendeeType.ADULT, price: 150 },
    ],
  });
  await createSpecialEventReservation({
    specialEventId: halloween.id,
    holderName: 'Reserva Cancelada Demo',
    holderPhone: '5559990000',
    status: SpecialEventReservationStatus.CANCELLED,
    cancelledByUserId: input.adminId,
    attendees: [
      {
        name: 'Reserva Cancelada Demo',
        type: SpecialEventAttendeeType.ADULT,
        price: 150,
      },
      {
        name: 'Invitado Cancelado',
        type: SpecialEventAttendeeType.CHILD,
        price: 280,
      },
    ],
  });

  const posadaBlock = await prisma.blockedSlot.create({
    data: {
      date: plusDays(42),
      startTime: '00:00',
      endTime: '23:59',
      reason: 'Evento especial: Posada Magic City Demo',
      createdByUserId: input.adminId,
    },
  });
  await prisma.specialEvent.create({
    data: {
      name: 'Posada Magic City Demo',
      description:
        'Evento publicado sin reservas todavía para probar cupo disponible completo.',
      eventDate: plusDays(42),
      startTime: '18:00',
      endTime: '21:00',
      childPrice: money(320),
      adultPrice: money(180),
      capacityMax: 120,
      imageUrl: null,
      includesText: 'Dinámica navideña, juegos y convivencia.',
      status: SpecialEventStatus.PUBLISHED,
      blockedSlotId: posadaBlock.id,
      createdByUserId: input.adminId,
      updatedByUserId: input.adminId,
    },
  });
  await prisma.specialEvent.create({
    data: {
      name: 'Día del Niño Borrador Demo',
      description: 'Borrador demo que no debe aparecer públicamente.',
      eventDate: plusDays(60),
      startTime: '10:00',
      endTime: '13:00',
      childPrice: money(250),
      adultPrice: money(100),
      capacityMax: 100,
      includesText: 'Contenido pendiente de confirmar.',
      status: SpecialEventStatus.DRAFT,
      createdByUserId: input.adminId,
      updatedByUserId: input.adminId,
    },
  });
  await prisma.specialEvent.create({
    data: {
      name: 'Curso Cerrado Demo',
      description: 'Evento cerrado demo para filtros administrativos.',
      eventDate: plusDays(-8),
      startTime: '09:00',
      endTime: '12:00',
      childPrice: money(400),
      adultPrice: money(0),
      capacityMax: 35,
      includesText: 'Curso especial demo finalizado.',
      status: SpecialEventStatus.CLOSED,
      createdByUserId: input.adminId,
      updatedByUserId: input.adminId,
    },
  });
  await prisma.specialEvent.create({
    data: {
      name: 'Evento Cancelado Demo',
      description:
        'Evento cancelado sin bloqueo activo para probar filtros y estados administrativos.',
      eventDate: plusDays(70),
      startTime: '16:00',
      endTime: '19:00',
      childPrice: money(275),
      adultPrice: money(125),
      capacityMax: 60,
      includesText: 'Evento cancelado; no debe estar disponible públicamente.',
      status: SpecialEventStatus.CANCELLED,
      createdByUserId: input.adminId,
      updatedByUserId: input.adminId,
    },
  });
}

async function createNotificationAndAuditScenarios(input: {
  adminId: string;
  cashierId: string;
}) {
  const reservation = await prisma.reservation.findFirstOrThrow({
    where: { status: ReservationStatus.CONFIRMED },
    orderBy: { createdAt: 'desc' },
  });
  const specialReservation =
    await prisma.specialEventReservation.findFirstOrThrow({
      where: { status: SpecialEventReservationStatus.PENDING_PAYMENT },
      orderBy: { createdAt: 'desc' },
    });

  const readNotification = await prisma.notification.create({
    data: {
      type: NotificationType.RESERVATION_UPDATED,
      title: 'Reservación actualizada demo',
      message: 'Notificación leída para probar filtros y cambio de estado.',
      relatedReservationId: reservation.id,
      isRead: true,
      deliveries: {
        create: {
          channel: NotificationChannel.INTERNAL,
          status: NotificationDeliveryStatus.SENT,
          provider: 'internal',
          sentAt: new Date(),
          payloadJson: Prisma.JsonNull,
          triggeredByUserId: input.adminId,
        },
      },
    },
  });
  await prisma.notificationRead.create({
    data: {
      notificationId: readNotification.id,
      userId: input.adminId,
    },
  });

  await prisma.notification.create({
    data: {
      type: NotificationType.EVENT_UPCOMING,
      title: 'Evento próximo demo',
      message: 'Recordatorio sin leer para probar prioridad cronológica.',
      relatedReservationId: reservation.id,
      deliveries: {
        create: {
          channel: NotificationChannel.INTERNAL,
          status: NotificationDeliveryStatus.SENT,
          provider: 'internal',
          sentAt: new Date(),
          payloadJson: Prisma.JsonNull,
          triggeredByUserId: input.cashierId,
        },
      },
    },
  });

  await prisma.notification.create({
    data: {
      type: NotificationType.SPECIAL_EVENT_LINK_WHATSAPP,
      title: 'Seguimiento WhatsApp demo',
      message:
        'Entregas pendiente y fallida para probar estados de mensajería.',
      relatedSpecialEventReservationId: specialReservation.id,
      deliveries: {
        create: [
          {
            channel: NotificationChannel.WHATSAPP,
            destination: '+525551234567',
            status: NotificationDeliveryStatus.PENDING,
            provider: 'mock',
            payloadJson: { seed: true, mode: 'pending-demo' },
            triggeredByUserId: input.adminId,
          },
          {
            channel: NotificationChannel.WHATSAPP,
            destination: '+525551234567',
            status: NotificationDeliveryStatus.FAILED,
            provider: 'mock',
            errorMessage: 'Fallo simulado; no se envió ningún mensaje real.',
            payloadJson: { seed: true, mode: 'failed-demo' },
            attempts: 2,
            triggeredByUserId: input.adminId,
          },
        ],
      },
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        eventType: 'DEMO_LOGIN_SUCCESS',
        actorUserId: input.adminId,
        ipAddress: '127.0.0.1',
        userAgent: 'Magic City demo reset',
        metadataJson: { seed: true },
      },
      {
        eventType: 'DEMO_POS_OPERATION',
        actorUserId: input.cashierId,
        ipAddress: '127.0.0.1',
        userAgent: 'Magic City demo reset',
        metadataJson: { seed: true },
      },
    ],
  });
}

function seededRandom(seed = 20260722) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function createYearOfNormalOperation(input: {
  adminId: string;
  cashierId: string;
  packageIds: string[];
  products: Awaited<ReturnType<typeof createProducts>>;
}) {
  const random = seededRandom();
  const activeProducts = input.products.filter((product) => product.isActive);
  const firstNames = [
    'Ana',
    'María',
    'Laura',
    'Patricia',
    'Fernanda',
    'Claudia',
    'Gabriela',
    'Mónica',
    'Daniela',
    'Alejandra',
    'Paola',
    'Verónica',
    'Sofía',
    'Carolina',
    'Adriana',
  ];
  const lastNames = [
    'García',
    'Hernández',
    'Martínez',
    'López',
    'González',
    'Pérez',
    'Ramírez',
    'Flores',
    'Torres',
    'Rivera',
    'Navarro',
    'Vargas',
  ];
  const childNames = [
    'Valentina',
    'Mateo',
    'Santiago',
    'Regina',
    'Emiliano',
    'Renata',
    'Leonardo',
    'Camila',
    'Sebastián',
    'Victoria',
    'Diego',
    'Luciana',
  ];
  const themes = [
    'Unicornios',
    'Dinosaurios',
    'Espacio',
    'Superhéroes',
    'Princesas',
    'Minecraft',
    'Safari',
    'Sirenas',
    'Fútbol',
    'Arcoíris',
  ];

  await createPurchase({
    folio: 'CMP-YR-APERTURA',
    supplierName: 'Inventario inicial anual',
    createdByUserId: input.adminId,
    createdAt: dateTimeDaysAgo(365, 9),
    items: activeProducts.map((product) => ({
      productId: product.id,
      quantity: 500,
      unitCostPrice: product.costPrice.toNumber(),
    })),
  });

  for (let index = 0; index < 40; index += 1) {
    const start = (index * 5) % activeProducts.length;
    const selected = Array.from(
      { length: 5 },
      (_, offset) =>
        activeProducts[(start + offset * 3) % activeProducts.length],
    );
    await createPurchase({
      folio: `CMP-YR-${String(index + 1).padStart(4, '0')}`,
      supplierName: [
        'Distribuidora Colima',
        'Dulcería La Estrella',
        'Bebidas del Pacífico',
        'Snack y Fiesta',
      ][index % 4],
      createdByUserId: index % 5 === 0 ? input.cashierId : input.adminId,
      createdAt: dateTimeDaysAgo(350 - index * 8, 8 + (index % 7)),
      items: selected.map((product, itemIndex) => ({
        productId: product.id,
        quantity: 30 + ((index + itemIndex) % 6) * 10,
        unitCostPrice: product.costPrice.toNumber(),
      })),
    });
  }

  for (let index = 0; index < 540; index += 1) {
    const lineCount = 1 + Math.floor(random() * 3);
    const selectedIds = new Set<string>();
    while (selectedIds.size < lineCount) {
      selectedIds.add(
        activeProducts[Math.floor(random() * activeProducts.length)].id,
      );
    }
    await createSale({
      folio: `VTA-YR-${String(index + 1).padStart(5, '0')}`,
      createdByUserId: index % 9 === 0 ? input.adminId : input.cashierId,
      paymentMethod: Object.values(PaymentMethod)[index % 4],
      customerPhone:
        index % 4 === 0
          ? `55${String(70000000 + index).padStart(8, '0')}`
          : undefined,
      sendWhatsAppTicket: index % 15 === 0,
      createdAt: dateTimeDaysAgo(
        359 - Math.floor((index * 360) / 540),
        10 + (index % 10),
      ),
      items: [...selectedIds].map((productId, itemIndex) => ({
        productId,
        quantity: 1 + ((index + itemIndex) % 4),
      })),
    });
  }

  for (let index = 0; index < 156; index += 1) {
    const daysFromNow = -350 + Math.floor((index * 410) / 156);
    const isPast = daysFromNow < 0;
    const status = isPast
      ? index % 11 === 0
        ? ReservationStatus.CANCELLED
        : ReservationStatus.COMPLETED
      : [
          ReservationStatus.REQUESTED,
          ReservationStatus.HELD,
          ReservationStatus.CONFIRMED,
          ReservationStatus.PENDING_PAYMENT,
        ][index % 4];
    const parentName = `${firstNames[index % firstNames.length]} ${
      lastNames[Math.floor(index / firstNames.length) % lastNames.length]
    }`;
    const celebrantName = `${childNames[index % childNames.length]} ${
      lastNames[index % lastNames.length]
    }`;
    const phone = `31${String(20000000 + index).padStart(8, '0')}`;
    const createdDaysAgo = Math.max(0, -daysFromNow + 20 + (index % 35));
    const advanceAmount =
      status === ReservationStatus.CANCELLED ? 0 : 2500 + (index % 6) * 750;

    await createReservation({
      packageId: input.packageIds[index % input.packageIds.length],
      createdByUserId: index % 6 === 0 ? input.adminId : input.cashierId,
      celebrantName,
      status,
      daysFromNow,
      startTime: index % 2 === 0 ? '11:00' : '16:00',
      endTime: index % 2 === 0 ? '15:00' : '20:00',
      attendeesCount: 25 + (index % 55),
      advanceAmount,
      paymentMethod: Object.values(PaymentMethod)[index % 4],
      theme: themes[index % themes.length],
      exposePublicLink: false,
      createdAt: dateTimeDaysAgo(createdDaysAgo, 9 + (index % 9)),
      eventForm: {
        eventType: EventType.BIRTHDAY_PARTY,
        requiresInvoice: index % 8 === 0,
        responsibleName: parentName,
        celebrantBirthDate: `${2015 + (index % 7)}-${String(
          1 + (index % 12),
        ).padStart(2, '0')}-${String(1 + (index % 27)).padStart(2, '0')}`,
        packageType: [
          EventPackageType.BASICO,
          EventPackageType.BASICO_SPA,
          EventPackageType.BASICO_DECORACION_PREMIUM,
        ][index % 3],
        guestCounts: {
          children: 18 + (index % 35),
          adults: 7 + (index % 20),
        },
        selectedOptions: {
          freshWaterFlavor:
            index % 2 === 0
              ? EventDrinkOption.JAMAICA
              : EventDrinkOption.HORCHATA,
          foodOption:
            index % 3 === 0
              ? EventFoodOption.PIZZA
              : EventFoodOption.TACOS_TUXPENOS,
          cakeProvider: EventCakeProvider.DAIRY_QUEEN,
          cakeFlavor: index % 2 === 0 ? 'Chocolate' : 'Vainilla',
        },
        phone,
        address: `Colonia demo ${1 + (index % 18)}, Colima`,
        internalNotes: `Operación anual simulada #${index + 1}.`,
      },
    });
  }

  const reviewRows: Prisma.CustomerReviewCreateManyInput[] = [];
  for (let index = 0; index < 120; index += 1) {
    const base = 3 + (index % 3);
    const ratings = {
      cumplimientoHorarioServicio: Math.min(5, base),
      amabilidadDisponibilidadStaff: Math.min(5, base + 1),
      lugarLimpio: Math.min(5, 4 + (index % 2)),
      calidadProductosServicio: Math.min(5, base),
      instalacionAdecuadaFiestas: Math.min(5, base + 1),
      comidaTiempoForma: Math.max(2, base - (index % 4 === 0 ? 1 : 0)),
      recomendariaMagicCity: Math.min(5, base + 1),
      satisfaccionGeneral: Math.min(5, base),
    };
    reviewRows.push({
      customerName: `${firstNames[index % firstNames.length]} ${
        lastNames[index % lastNames.length]
      }`,
      ...ratings,
      recommendations:
        index % 5 === 0
          ? 'Mantener la atención y mejorar ligeramente los tiempos de alimentos.'
          : null,
      averageRating: money(reviewAverage(ratings)),
      metadataJson: {
        captureSurface: 'review_tablet',
        seed: true,
        annual: true,
      },
      capturedByUserId: index % 7 === 0 ? input.adminId : input.cashierId,
      createdAt: dateTimeDaysAgo(355 - Math.floor((index * 350) / 120), 12),
    });
  }
  await prisma.customerReview.createMany({ data: reviewRows });

  for (let index = 0; index < 30; index += 1) {
    const daysFromNow = -280 + index * 14;
    const status =
      daysFromNow >= 0
        ? index % 5 === 0
          ? SpecialEventStatus.DRAFT
          : SpecialEventStatus.PUBLISHED
        : index % 9 === 0
          ? SpecialEventStatus.CANCELLED
          : SpecialEventStatus.CLOSED;
    const event = await prisma.specialEvent.create({
      data: {
        name: `Experiencia temática ${String(index + 1).padStart(2, '0')}`,
        description:
          'Evento anual simulado con actividades, alimentos y acceso por boleto.',
        eventDate: plusDays(daysFromNow),
        startTime: index % 2 === 0 ? '11:00' : '16:00',
        endTime: index % 2 === 0 ? '14:00' : '19:00',
        childPrice: money(220 + (index % 4) * 30),
        adultPrice: money(120 + (index % 3) * 20),
        capacityMax: 90 + (index % 4) * 20,
        includesText: 'Acceso a juegos\nActividad temática\nSnack infantil',
        status,
        createdByUserId: input.adminId,
        updatedByUserId: input.adminId,
        createdAt: dateTimeDaysAgo(Math.max(0, -daysFromNow + 40), 10),
      },
    });

    const reservationCount = 4 + (index % 6);
    for (
      let reservationIndex = 0;
      reservationIndex < reservationCount;
      reservationIndex += 1
    ) {
      const holderIndex = index * 10 + reservationIndex;
      const holderName = `${firstNames[holderIndex % firstNames.length]} ${
        lastNames[holderIndex % lastNames.length]
      }`;
      const holderPhone = `33${String(40000000 + holderIndex).padStart(8, '0')}`;
      const customer = await upsertDemoCustomer({
        name: holderName,
        phone: holderPhone,
      });
      const reservationStatus =
        reservationIndex % 7 === 0
          ? SpecialEventReservationStatus.CANCELLED
          : reservationIndex % 3 === 0
            ? SpecialEventReservationStatus.PENDING_PAYMENT
            : SpecialEventReservationStatus.PAYMENT_CONFIRMED;
      const childCount = 1 + (reservationIndex % 4);
      const adultCount = 1 + (reservationIndex % 2);
      const token = generateOpaqueToken(32);
      const createdAt = dateTimeDaysAgo(
        Math.max(0, -daysFromNow + 25 - reservationIndex),
        11 + (reservationIndex % 6),
      );
      await prisma.specialEventReservation.create({
        data: {
          specialEventId: event.id,
          customerId: customer.id,
          publicTokenHash: hashOpaqueToken(token),
          holderName,
          holderPhone,
          holderEmail: `cliente${holderIndex}@demo.local`,
          childCount,
          adultCount,
          totalAmount: money(
            childCount * event.childPrice.toNumber() +
              adultCount * event.adultPrice.toNumber(),
          ),
          status: reservationStatus,
          paymentConfirmedAt:
            reservationStatus ===
            SpecialEventReservationStatus.PAYMENT_CONFIRMED
              ? createdAt
              : null,
          paymentConfirmedByUserId:
            reservationStatus ===
            SpecialEventReservationStatus.PAYMENT_CONFIRMED
              ? input.adminId
              : null,
          cancelledAt:
            reservationStatus === SpecialEventReservationStatus.CANCELLED
              ? createdAt
              : null,
          cancelledByUserId:
            reservationStatus === SpecialEventReservationStatus.CANCELLED
              ? input.adminId
              : null,
          createdAt,
          tickets: {
            create: Array.from(
              { length: childCount + adultCount },
              (_, ticketIndex) => {
                const isChild = ticketIndex < childCount;
                return {
                  code: `YR-${String(index + 1).padStart(2, '0')}-${String(
                    reservationIndex + 1,
                  ).padStart(
                    2,
                    '0',
                  )}-${String(ticketIndex + 1).padStart(2, '0')}`,
                  attendeeName:
                    ticketIndex === 0
                      ? holderName
                      : `${childNames[(holderIndex + ticketIndex) % childNames.length]} Invitado`,
                  attendeeType: isChild
                    ? SpecialEventAttendeeType.CHILD
                    : SpecialEventAttendeeType.ADULT,
                  isReservationHolder: ticketIndex === 0,
                  price: isChild ? event.childPrice : event.adultPrice,
                  createdAt,
                };
              },
            ),
          },
        },
      });
    }
  }
}

function assertEnumCoverage<T extends string>(
  label: string,
  actual: Iterable<T>,
  expected: readonly T[],
) {
  const actualSet = new Set(actual);
  const missing = expected.filter((value) => !actualSet.has(value));
  if (missing.length) {
    throw new Error(
      `Cobertura demo incompleta en ${label}: faltan ${missing.join(', ')}`,
    );
  }
}

async function assertDemoCoverage() {
  const [
    products,
    reservationStatuses,
    specialEventStatuses,
    specialReservationStatuses,
    movementTypes,
    salePaymentMethods,
    notificationTypes,
    deliveryStatuses,
    historyActions,
    birthdayStatuses,
    reviewsCount,
    blockedSlotsCount,
    notificationReadsCount,
    auditLogsCount,
  ] = await Promise.all([
    prisma.product.findMany({
      select: { category: true, unit: true, isActive: true },
    }),
    prisma.reservation.groupBy({ by: ['status'] }),
    prisma.specialEvent.groupBy({ by: ['status'] }),
    prisma.specialEventReservation.groupBy({ by: ['status'] }),
    prisma.inventoryMovement.groupBy({ by: ['type'] }),
    prisma.sale.groupBy({ by: ['paymentMethod'] }),
    prisma.notification.groupBy({ by: ['type'] }),
    prisma.notificationDelivery.groupBy({ by: ['status'] }),
    prisma.reservationHistory.groupBy({ by: ['actionType'] }),
    prisma.birthdayFollowUp.groupBy({ by: ['status'] }),
    prisma.customerReview.count(),
    prisma.blockedSlot.count(),
    prisma.notificationRead.count(),
    prisma.auditLog.count(),
  ]);

  assertEnumCoverage(
    'categorías de producto',
    products.map((row) => row.category),
    Object.values(ProductCategory),
  );
  assertEnumCoverage(
    'unidades de producto',
    products.map((row) => row.unit),
    Object.values(ProductUnit),
  );
  assertEnumCoverage(
    'estados de reservación',
    reservationStatuses.map((row) => row.status),
    Object.values(ReservationStatus),
  );
  assertEnumCoverage(
    'estados de evento especial',
    specialEventStatuses.map((row) => row.status),
    Object.values(SpecialEventStatus),
  );
  assertEnumCoverage(
    'estados de boletos',
    specialReservationStatuses.map((row) => row.status),
    Object.values(SpecialEventReservationStatus),
  );
  assertEnumCoverage(
    'movimientos de inventario',
    movementTypes.map((row) => row.type),
    Object.values(InventoryMovementType),
  );
  assertEnumCoverage(
    'métodos de pago POS',
    salePaymentMethods.map((row) => row.paymentMethod),
    Object.values(PaymentMethod),
  );
  assertEnumCoverage(
    'tipos de notificación',
    notificationTypes.map((row) => row.type),
    Object.values(NotificationType),
  );
  assertEnumCoverage(
    'estados de entrega',
    deliveryStatuses.map((row) => row.status),
    Object.values(NotificationDeliveryStatus),
  );
  assertEnumCoverage(
    'historial de reservaciones',
    historyActions.map((row) => row.actionType),
    Object.values(HistoryActionType),
  );
  assertEnumCoverage(
    'seguimiento de cumpleaños',
    birthdayStatuses.map((row) => row.status),
    Object.values(BirthdayFollowUpStatus),
  );

  if (
    !products.some((product) => product.isActive) ||
    !products.some((product) => !product.isActive)
  ) {
    throw new Error('El demo debe incluir productos activos e inactivos.');
  }
  if (
    reviewsCount < 3 ||
    blockedSlotsCount < 4 ||
    notificationReadsCount < 1 ||
    auditLogsCount < 2
  ) {
    throw new Error(
      'Faltan datos demo de reseñas, bloqueos, lecturas o auditoría.',
    );
  }

  const [admin, cashier, inactiveCashier] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: 'admin@magiccity.local' },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'cashier1@magiccity.local' },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'cashier.inactive@magiccity.local' },
    }),
  ]);
  const validPasswords = await Promise.all([
    argon2.verify(admin.passwordHash, 'Admin123!'),
    argon2.verify(cashier.passwordHash, 'Cashier123!'),
    argon2.verify(inactiveCashier.passwordHash, 'Inactive123!'),
  ]);
  if (validPasswords.some((isValid) => !isValid) || inactiveCashier.isActive) {
    throw new Error(
      'Las credenciales demo o el escenario de usuario inactivo no quedaron consistentes.',
    );
  }

  const reservations = await prisma.reservation.findMany({
    select: { customerId: true, primaryCelebrantId: true, eventFormJson: true },
  });
  const eventTypes = reservations.flatMap((reservation) => {
    if (
      !reservation.eventFormJson ||
      typeof reservation.eventFormJson !== 'object'
    ) {
      return [];
    }
    const value = reservation.eventFormJson as { eventType?: unknown };
    return typeof value.eventType === 'string' ? [value.eventType] : [];
  });
  assertEnumCoverage('tipos de evento', eventTypes, Object.values(EventType));

  if (reservations.some((reservation) => !reservation.customerId)) {
    throw new Error(
      'Todas las reservaciones demo con contacto deben estar vinculadas a Cliente.',
    );
  }

  const consolidatedFamily = await prisma.customer.findUnique({
    where: { normalizedPhone: '5551234567' },
    include: {
      celebrants: true,
      reservations: true,
      specialEventReservations: true,
    },
  });
  if (
    !consolidatedFamily ||
    consolidatedFamily.celebrants.length < 2 ||
    consolidatedFamily.reservations.length < 2 ||
    consolidatedFamily.specialEventReservations.length < 1
  ) {
    throw new Error(
      'No se creó el caso demo de familia consolidada con varios festejados y boletos.',
    );
  }

  const mixedCineSale = await prisma.sale.findFirst({
    where: {
      items: { some: { categorySnapshot: ProductCategory.CINE } },
      AND: {
        items: { some: { categorySnapshot: { not: ProductCategory.CINE } } },
      },
    },
  });
  if (!mixedCineSale) {
    throw new Error(
      'Falta una venta mixta operación + CINE para probar finanzas.',
    );
  }
}

async function main() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DEMO_DB_RESET !== 'true'
  ) {
    throw new Error(
      'Refusing to reset demo data in production without ALLOW_DEMO_DB_RESET=true',
    );
  }

  const admin = await ensureUser({
    email: 'admin@magiccity.local',
    name: 'Sofía Administradora',
    role: UserRole.ADMIN,
    password: 'Admin123!',
  });
  const cashier = await ensureUser({
    email: 'cashier1@magiccity.local',
    name: 'Carlos Cajero',
    role: UserRole.CASHIER,
    password: 'Cashier123!',
  });
  await ensureUser({
    email: 'cashier.inactive@magiccity.local',
    name: 'Cajero Inactivo Demo',
    role: UserRole.CASHIER,
    password: 'Inactive123!',
    isActive: false,
  });

  await clearOperationalData();

  const packages = await createPackages();
  const products = await createProducts(admin.id);
  const bySku = new Map(products.map((product) => [product.sku, product]));

  await createPurchase({
    folio: 'CMP-DEMO-001',
    supplierName: 'Dulcería Demo',
    createdByUserId: admin.id,
    createdAt: dateTimeDaysAgo(20, 10),
    items: [
      {
        productId: bySku.get('DEMO-AGUA-500')!.id,
        quantity: 80,
        unitCostPrice: 8,
      },
      {
        productId: bySku.get('DEMO-JUGO-INF')!.id,
        quantity: 60,
        unitCostPrice: 10,
      },
      {
        productId: bySku.get('DEMO-DULCES')!.id,
        quantity: 90,
        unitCostPrice: 12,
      },
    ],
  });
  await createPurchase({
    folio: 'CMP-DEMO-002',
    supplierName: 'Cine Snack Demo',
    createdByUserId: admin.id,
    createdAt: dateTimeDaysAgo(3, 14),
    items: [
      {
        productId: bySku.get('DEMO-PAL-CH')!.id,
        quantity: 45,
        unitCostPrice: 13,
      },
      {
        productId: bySku.get('DEMO-CINE-COMBO')!.id,
        quantity: 30,
        unitCostPrice: 32,
      },
      {
        productId: bySku.get('DEMO-PAPAS')!.id,
        quantity: 35,
        unitCostPrice: 14,
      },
    ],
  });
  await createPurchase({
    folio: 'CMP-DEMO-003',
    supplierName: 'Bebidas Demo',
    createdByUserId: cashier.id,
    items: [
      {
        productId: bySku.get('DEMO-REFRESCO-LATA')!.id,
        quantity: 48,
        unitCostPrice: 11,
      },
    ],
  });

  await createSale({
    folio: 'VTA-DEMO-001',
    createdByUserId: cashier.id,
    paymentMethod: PaymentMethod.CASH,
    customerPhone: '5550001111',
    notes: 'Venta mixta normal + CINE.',
    items: [
      { productId: bySku.get('DEMO-AGUA-500')!.id, quantity: 3 },
      { productId: bySku.get('DEMO-PAL-CH')!.id, quantity: 2 },
      { productId: bySku.get('DEMO-DULCES')!.id, quantity: 4 },
    ],
  });
  await createSale({
    folio: 'VTA-DEMO-002',
    createdByUserId: admin.id,
    paymentMethod: PaymentMethod.CARD,
    customerPhone: '5550002222',
    sendWhatsAppTicket: true,
    createdAt: dateTimeDaysAgo(7, 17),
    items: [
      { productId: bySku.get('DEMO-CINE-COMBO')!.id, quantity: 2 },
      { productId: bySku.get('DEMO-JUGO-INF')!.id, quantity: 5 },
    ],
  });
  await createSale({
    folio: 'VTA-DEMO-003',
    createdByUserId: cashier.id,
    paymentMethod: PaymentMethod.TRANSFER,
    customerPhone: '5550003333',
    notes: 'Venta por transferencia para filtros de pago.',
    items: [
      { productId: bySku.get('DEMO-REFRESCO-LATA')!.id, quantity: 6 },
      { productId: bySku.get('DEMO-JUGO-INF')!.id, quantity: 3 },
    ],
  });

  const papasBeforeAdjustment = await prisma.product.findUniqueOrThrow({
    where: { id: bySku.get('DEMO-PAPAS')!.id },
  });
  await createManualInventoryAdjustment({
    productId: papasBeforeAdjustment.id,
    quantityDelta: 4 - papasBeforeAdjustment.stockCurrent,
    reason: 'Ajuste demo negativo por conteo físico',
    actorUserId: admin.id,
  });
  await createManualInventoryAdjustment({
    productId: bySku.get('DEMO-AGUA-500')!.id,
    quantityDelta: 5,
    reason: 'Ajuste demo positivo por devolución al almacén',
    actorUserId: admin.id,
  });
  await createSale({
    folio: 'VTA-DEMO-004',
    createdByUserId: admin.id,
    paymentMethod: PaymentMethod.OTHER,
    notes: 'Sobreventa forzada demo para probar autorización y stock negativo.',
    forceNegativeStock: true,
    items: [{ productId: papasBeforeAdjustment.id, quantity: 6 }],
  });

  await createReservation({
    packageId: packages[0].id,
    createdByUserId: cashier.id,
    celebrantName: 'Valentina Demo',
    status: ReservationStatus.REQUESTED,
    daysFromNow: 10,
    startTime: '11:00',
    endTime: '14:00',
    attendeesCount: 42,
    advanceAmount: 500,
    paymentMethod: PaymentMethod.TRANSFER,
    theme: 'Unicornios',
    followUpStatus: BirthdayFollowUpStatus.PENDING,
    historyActions: [
      HistoryActionType.PUBLIC_UPDATED,
      HistoryActionType.PUBLIC_LINK_REGENERATED,
    ],
    eventForm: {
      eventType: EventType.BIRTHDAY_PARTY,
      requiresInvoice: false,
      responsibleName: 'Ana Ramírez Demo',
      celebrantBirthDate: birthDateForUpcomingBirthday(3, 8),
      packageType: EventPackageType.BASICO,
      guestCounts: { children: 30, adults: 12 },
      selectedOptions: {
        freshWaterFlavor: EventDrinkOption.JAMAICA,
        foodOption: EventFoodOption.PIZZA,
        cakeProvider: EventCakeProvider.DAIRY_QUEEN,
        cakeFlavor: 'Chocolate',
      },
      phone: '5551234567',
      address: 'Dirección demo Valentina',
      internalNotes: 'Solicitud pública demo pendiente de revisar.',
      generalComments: 'Cliente pregunta por globos extra.',
    },
  });
  await createReservation({
    packageId: packages[1].id,
    createdByUserId: admin.id,
    celebrantName: 'Mateo Demo',
    status: ReservationStatus.CONFIRMED,
    daysFromNow: 18,
    startTime: '16:00',
    endTime: '19:00',
    attendeesCount: 55,
    advanceAmount: 4200,
    paymentMethod: PaymentMethod.CASH,
    theme: 'Superhéroes',
    followUpStatus: BirthdayFollowUpStatus.CONTACTED,
    historyActions: [HistoryActionType.REASSIGNED],
    eventForm: {
      eventType: EventType.BIRTHDAY_PARTY,
      requiresInvoice: true,
      responsibleName: 'Roberto Gómez Demo',
      celebrantBirthDate: birthDateForUpcomingBirthday(7, 9),
      packageType: EventPackageType.BASICO_SPA,
      guestCounts: { children: 40, adults: 15 },
      selectedOptions: {
        freshWaterFlavor: EventDrinkOption.HORCHATA,
        foodOption: EventFoodOption.POZOLE,
        cakeProvider: EventCakeProvider.DAIRY_QUEEN,
        cakeFlavor: 'Vainilla con cajeta',
      },
      addOns: {
        spa: {
          participants: 12,
          observations: 'Spa demo con batas rosas y estación de maquillaje.',
          isPricePending: true,
        },
      },
      phone: '5552223333',
      address: 'Dirección demo Mateo',
      internalNotes: 'Confirmar estación de spa antes del evento.',
    },
  });
  await createReservation({
    packageId: packages[0].id,
    createdByUserId: cashier.id,
    celebrantName: 'Lucía Demo',
    status: ReservationStatus.PENDING_PAYMENT,
    daysFromNow: 5,
    startTime: '12:00',
    endTime: '15:00',
    attendeesCount: 35,
    advanceAmount: 300,
    paymentMethod: PaymentMethod.CASH,
    theme: 'Espacial',
    eventForm: {
      eventType: EventType.SPACE_RENTAL,
      requiresInvoice: false,
      responsibleName: 'Mariana López Demo',
      areaType: EventAreaType.AREA_CHICA,
      guestCounts: { children: 18, adults: 10 },
      phone: '5553334444',
      address: 'Dirección demo Lucía',
      internalNotes: 'Renta de espacio sin alimentos incluidos.',
      generalComments: 'Traen alimentos externos.',
    },
  });
  await createReservation({
    packageId: packages[2].id,
    createdByUserId: admin.id,
    celebrantName: 'Decoración Demo',
    status: ReservationStatus.COMPLETED,
    daysFromNow: -2,
    startTime: '16:00',
    endTime: '20:00',
    attendeesCount: 48,
    advanceAmount: 18000,
    paymentMethod: PaymentMethod.CARD,
    theme: 'Princesas',
    followUpStatus: BirthdayFollowUpStatus.NOT_INTERESTED,
    eventForm: {
      eventType: EventType.BIRTHDAY_PARTY,
      requiresInvoice: false,
      responsibleName: 'Paola Torres Demo',
      celebrantBirthDate: birthDateForUpcomingBirthday(12, 7),
      packageType: EventPackageType.BASICO_DECORACION_PREMIUM,
      guestCounts: { children: 32, adults: 16 },
      selectedOptions: {
        freshWaterFlavor: EventDrinkOption.LIMON_CON_CHIA,
        foodOption: EventFoodOption.TACOS_TUXPENOS,
        cakeProvider: EventCakeProvider.DAIRY_QUEEN,
        cakeFlavor: 'Marmoleado',
      },
      addOns: {
        premiumDecoration: {
          characterTheme: 'Princesas',
          balloonColors: 'Rosa, lila y dorado',
          manualPrice: 3500,
          observations:
            'Mampara completa con arco orgánico y figura de personaje.',
          isPricePending: false,
        },
      },
      phone: '5554445555',
      address: 'Dirección demo Decoración',
      internalNotes: 'Evento completado para validar historial y finanzas.',
    },
  });
  await createReservation({
    packageId: packages[0].id,
    createdByUserId: admin.id,
    celebrantName: 'Empresa Demo',
    status: ReservationStatus.HELD,
    daysFromNow: 32,
    startTime: '08:00',
    endTime: '12:00',
    attendeesCount: 120,
    advanceAmount: 5000,
    paymentMethod: PaymentMethod.TRANSFER,
    theme: 'Evento privado matutino',
    eventForm: {
      eventType: EventType.PRIVATE_EVENT,
      requiresInvoice: true,
      responsibleName: 'María Empresa Demo',
      privateEvent: {
        totalPeople: 120,
        appliedRange: '76 a 140 personas',
        appliedPrice: 13500,
        isOverCapacity: false,
      },
      guestCounts: { children: 70, adults: 50 },
      phone: '5556667777',
      address: 'Dirección empresa demo',
      internalNotes:
        'Horario privado permitido. Pago por transferencia, factura solicitada.',
      generalComments: 'Evento corporativo familiar demo.',
    },
  });
  await createReservation({
    packageId: packages[0].id,
    createdByUserId: admin.id,
    celebrantName: 'Cancelada Demo',
    status: ReservationStatus.CANCELLED,
    daysFromNow: 21,
    startTime: '17:00',
    endTime: '20:00',
    attendeesCount: 28,
    advanceAmount: 0,
    theme: 'Piratas',
    eventForm: {
      eventType: EventType.BIRTHDAY_PARTY,
      requiresInvoice: false,
      responsibleName: 'Familia Cancelada Demo',
      celebrantBirthDate: birthDateForUpcomingBirthday(40, 10),
      packageType: EventPackageType.BASICO,
      guestCounts: { children: 20, adults: 8 },
      selectedOptions: {
        freshWaterFlavor: EventDrinkOption.JAMAICA,
        foodOption: EventFoodOption.PIZZA,
        cakeProvider: EventCakeProvider.DAIRY_QUEEN,
        cakeFlavor: 'Chocolate',
      },
      phone: '5558889999',
      address: 'Dirección demo cancelada',
      internalNotes: 'Caso cancelado para filtros y calendario.',
    },
  });
  await createReservation({
    packageId: packages[0].id,
    createdByUserId: admin.id,
    celebrantName: 'Santiago Demo',
    status: ReservationStatus.COMPLETED,
    daysFromNow: -75,
    startTime: '12:00',
    endTime: '16:00',
    attendeesCount: 35,
    advanceAmount: 10875,
    paymentMethod: PaymentMethod.TRANSFER,
    theme: 'Dinosaurios',
    followUpStatus: BirthdayFollowUpStatus.PENDING,
    eventForm: {
      eventType: EventType.BIRTHDAY_PARTY,
      requiresInvoice: false,
      responsibleName: 'Ana Ramírez Demo',
      celebrantBirthDate: birthDateForUpcomingBirthday(13, 6),
      packageType: EventPackageType.BASICO,
      guestCounts: { children: 25, adults: 10 },
      selectedOptions: {
        freshWaterFlavor: EventDrinkOption.HORCHATA,
        foodOption: EventFoodOption.PIZZA,
        cakeProvider: EventCakeProvider.DAIRY_QUEEN,
        cakeFlavor: 'Vainilla',
      },
      phone: '+52 555 123 4567',
      address: 'Dirección demo Valentina',
      internalNotes:
        'Segundo festejado de la misma familia para probar consolidación.',
    },
    createdAt: dateTimeDaysAgo(110, 13),
  });
  await createReservation({
    packageId: packages[0].id,
    createdByUserId: cashier.id,
    celebrantName: 'Renta Grande Demo',
    status: ReservationStatus.REQUESTED,
    daysFromNow: 27,
    startTime: '13:00',
    endTime: '17:00',
    attendeesCount: 60,
    advanceAmount: 0,
    theme: 'Convivio familiar',
    eventForm: {
      eventType: EventType.SPACE_RENTAL,
      requiresInvoice: true,
      responsibleName: 'Elena Renta Demo',
      areaType: EventAreaType.AREA_GRANDE,
      guestCounts: { children: 30, adults: 30 },
      phone: '5551012020',
      address: 'Dirección demo renta grande',
      internalNotes: 'Caso de área grande sin anticipo.',
      generalComments: 'Solo incluye espacio, mobiliario y manteles.',
    },
  });

  await prisma.blockedSlot.createMany({
    data: [
      {
        date: plusDays(3),
        startTime: '09:00',
        endTime: '11:00',
        reason: 'Limpieza profunda demo',
        createdByUserId: admin.id,
      },
      {
        date: plusDays(12),
        startTime: '15:00',
        endTime: '17:00',
        reason: 'Mantenimiento de juegos demo',
        createdByUserId: admin.id,
      },
    ],
  });

  await prisma.notification.create({
    data: {
      type: NotificationType.LOW_STOCK_ALERT,
      title: 'Stock por surtir',
      message: 'Papas botana quedó por debajo del mínimo.',
      deliveries: {
        create: {
          channel: NotificationChannel.INTERNAL,
          status: NotificationDeliveryStatus.SENT,
          provider: 'internal',
          sentAt: new Date(),
          payloadJson: Prisma.JsonNull,
          triggeredByUserId: admin.id,
        },
      },
    },
  });

  await createCustomerReviews({ adminId: admin.id, cashierId: cashier.id });
  await createSpecialEvents({ adminId: admin.id });
  await createYearOfNormalOperation({
    adminId: admin.id,
    cashierId: cashier.id,
    packageIds: packages.map((packageRecord) => packageRecord.id),
    products,
  });
  await prisma.customer.update({
    where: { normalizedPhone: '5551234567' },
    data: {
      internalNotes:
        'Familia demo consolidada: dos festejados, reservaciones normales y boletos de evento especial.',
    },
  });
  await createNotificationAndAuditScenarios({
    adminId: admin.id,
    cashierId: cashier.id,
  });
  await assertDemoCoverage();

  const summary = await Promise.all([
    prisma.product.count(),
    prisma.purchase.count(),
    prisma.sale.count(),
    prisma.reservation.count(),
    prisma.customer.count(),
    prisma.celebrant.count(),
    prisma.birthdayFollowUp.count(),
    prisma.customerReview.count(),
    prisma.specialEvent.count(),
    prisma.specialEventReservation.count(),
    prisma.specialEventTicket.count(),
    prisma.notification.count(),
  ]);

  console.log('Demo data reset complete and coverage checks passed.');
  console.log('Admin: admin@magiccity.local / Admin123!');
  console.log('Cashier: cashier1@magiccity.local / Cashier123!');
  console.log('Inactive user: cashier.inactive@magiccity.local / Inactive123!');
  console.log(
    [
      `Products: ${summary[0]}`,
      `Purchases: ${summary[1]}`,
      `Sales: ${summary[2]}`,
      `Reservations: ${summary[3]}`,
      `Customers: ${summary[4]}`,
      `Celebrants: ${summary[5]}`,
      `Birthday follow-ups: ${summary[6]}`,
      `Reviews: ${summary[7]}`,
      `Special events: ${summary[8]}`,
      `Special reservations: ${summary[9]}`,
      `Tickets: ${summary[10]}`,
      `Notifications: ${summary[11]}`,
    ].join(' | '),
  );
  console.log('Demo public links:');
  for (const link of demoPublicLinks) {
    console.log(`- ${link.label}: ${link.path}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
