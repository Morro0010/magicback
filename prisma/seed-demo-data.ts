import 'reflect-metadata';
import {
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
import { generateOpaqueToken, hashOpaqueToken } from '../src/common/utils/security.util';
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

function plusDays(days: number) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

function money(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

async function ensureUser(input: {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await argon2.hash(input.password),
    },
  });
}

async function clearOperationalData() {
  await prisma.notificationDelivery.deleteMany();
  await prisma.notificationRead.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.specialEventTicket.deleteMany();
  await prisma.specialEventReservation.deleteMany();
  await prisma.specialEvent.deleteMany();
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
        description: 'Paquete base Magic City con renta de espacio, invitados, alimentos y decoración incluida.',
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
        description: 'Paquete básico con experiencia de spa. Precio final por definir.',
        price: money(0),
        featuresJson: ['Incluye básico', 'Experiencia de spa', 'Precio por definir'],
      },
    }),
    prisma.package.create({
      data: {
        name: 'Básico + decoración premium',
        description: 'Paquete básico con mampara completa, arco de globos, leds y figura de personaje.',
        price: money(0),
        featuresJson: ['Incluye básico', 'Mampara completa', 'Arco de globos', 'Leds', 'Figura de personaje'],
      },
    }),
  ]);
}

async function createProducts(adminId: string) {
  const products = [
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
  ];

  return prisma.$transaction(
    products.map((product) =>
      prisma.product.create({
        data: {
          ...product,
          salePrice: money(product.salePrice),
          costPrice: money(product.costPrice),
          stockCurrent: 0,
          isActive: true,
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
}) {
  const totalCost = input.items.reduce((acc, item) => acc + item.quantity * item.unitCostPrice, 0);
  const purchase = await prisma.purchase.create({
    data: {
      folio: input.folio,
      supplierName: input.supplierName,
      reference: `REF-${input.folio}`,
      notes: 'Compra demo para pruebas de inventario.',
      totalCost: money(totalCost),
      createdByUserId: input.createdByUserId,
    },
  });

  for (const item of input.items) {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: item.productId } });
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
}) {
  const products = await Promise.all(
    input.items.map((item) => prisma.product.findUniqueOrThrow({ where: { id: item.productId } })),
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
      },
    });
  }

  await prisma.notification.create({
    data: {
      type: NotificationType.POS_SALE_CREATED,
      title: `Venta ${sale.folio}`,
      message: `Venta demo por $${subtotal.toFixed(2)}`,
      relatedSaleId: sale.id,
      deliveries: {
        create: {
          channel: NotificationChannel.INTERNAL,
          status: NotificationDeliveryStatus.SENT,
          provider: 'internal',
          sentAt: new Date(),
          payloadJson: Prisma.JsonNull,
          triggeredByUserId: input.createdByUserId,
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
          },
        },
      },
    });
  }

  return sale;
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
}) {
  const packageRecord = await prisma.package.findUniqueOrThrow({ where: { id: input.packageId } });
  const eventDate = plusDays(input.daysFromNow);
  const token = generateOpaqueToken(32);
  const eventForm = normalizeEventForm({
    ...input.eventForm,
    eventTheme: input.theme,
    responsibleName: input.eventForm.responsibleName ?? `Responsable de ${input.celebrantName}`,
  });
  const estimatedTotal = eventForm.pricingBreakdown.estimatedTotal || packageRecord.price.toNumber();
  const pendingBalance = Math.max(estimatedTotal - input.advanceAmount, 0);

  const reservation = await prisma.reservation.create({
    data: {
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
      paymentDate: input.advanceAmount > 0 ? new Date() : null,
      editableUntil: calculateEditableUntil(eventDate),
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.createdByUserId,
      cancelledAt: input.status === ReservationStatus.CANCELLED ? new Date() : null,
      eventFormJson: eventForm,
    },
  });

  await prisma.reservationHistory.createMany({
    data: [
      {
        reservationId: reservation.id,
        actorUserId: input.createdByUserId,
        actionType: HistoryActionType.CREATED,
        newValueJson: { status: input.status },
      },
      {
        reservationId: reservation.id,
        actorUserId: input.createdByUserId,
        actionType: HistoryActionType.UPDATED,
        fieldChanged: 'eventFormJson',
        newValueJson: { source: 'demo-seed' },
      },
    ],
  });

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
      deliveries: {
        create: {
          channel: NotificationChannel.INTERNAL,
          status: NotificationDeliveryStatus.SENT,
          provider: 'internal',
          sentAt: new Date(),
          payloadJson: Prisma.JsonNull,
          triggeredByUserId: input.createdByUserId,
        },
      },
    },
  });

  return reservation;
}

function reviewAverage(values: Record<string, number>) {
  const ratings = Object.values(values);
  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return total / ratings.length;
}

async function createCustomerReviews(input: { adminId: string; cashierId: string }) {
  const reviews = [
    {
      customerName: 'Ana Pérez Demo',
      capturedByUserId: input.cashierId,
      recommendations: 'Todo estuvo muy bonito, solo mejorar el sonido al cantar las mañanitas.',
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
      metadataJson: { captureSurface: 'review_tablet', seed: true, device: 'ipad_landscape' },
    },
    {
      customerName: 'Roberto Gómez Demo',
      capturedByUserId: input.adminId,
      recommendations: 'La comida llegó un poco tarde. La atención del equipo fue excelente.',
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
      metadataJson: { captureSurface: 'review_tablet', seed: true, hasLowCategory: true },
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
  attendees: Array<{ name: string; type: SpecialEventAttendeeType; price: number }>;
}) {
  const token = generateOpaqueToken(32);
  const childCount = input.attendees.filter((attendee) => attendee.type === SpecialEventAttendeeType.CHILD).length;
  const adultCount = input.attendees.filter((attendee) => attendee.type === SpecialEventAttendeeType.ADULT).length;
  const totalAmount = input.attendees.reduce((sum, attendee) => sum + attendee.price, 0);

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
      paymentConfirmedAt: input.status === SpecialEventReservationStatus.PAYMENT_CONFIRMED ? new Date() : null,
      paymentConfirmedByUserId:
        input.status === SpecialEventReservationStatus.PAYMENT_CONFIRMED
          ? input.paymentConfirmedByUserId ?? null
          : null,
      cancelledAt: input.status === SpecialEventReservationStatus.CANCELLED ? new Date() : null,
      cancelledByUserId:
        input.status === SpecialEventReservationStatus.CANCELLED ? input.cancelledByUserId ?? null : null,
    },
  });

  const folio = formatSpecialFolio(reservation.folioNumber);
  await prisma.specialEventTicket.createMany({
    data: input.attendees.map((attendee, index) => ({
      reservationId: reservation.id,
      code: `${folio}-${String(index + 1).padStart(2, '0')}`,
      attendeeName: attendee.name,
      attendeeType: attendee.type,
      price: money(attendee.price),
    })),
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
            triggeredByUserId: input.paymentConfirmedByUserId ?? input.cancelledByUserId ?? null,
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

  return reservation;
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
      description: 'Evento temático demo para probar venta de boletos, cupo y pagos manuales.',
      eventDate: halloweenDate,
      startTime: '17:00',
      endTime: '20:00',
      childPrice: money(280),
      adultPrice: money(150),
      capacityMax: 80,
      imageUrl: 'https://example.com/demo-halloween-magic-city.jpg',
      includesText: 'Juegos, actividad temática, música, dulces y convivencia familiar.',
      status: SpecialEventStatus.PUBLISHED,
      blockedSlotId: halloweenBlock.id,
      createdByUserId: input.adminId,
      updatedByUserId: input.adminId,
    },
  });

  await createSpecialEventReservation({
    specialEventId: halloween.id,
    holderName: 'Familia Ramírez Demo',
    holderPhone: '5551112233',
    holderEmail: 'ramirez.demo@example.com',
    comments: 'Llegan con dos niños disfrazados.',
    status: SpecialEventReservationStatus.PENDING_PAYMENT,
    attendees: [
      { name: 'Mateo Ramírez', type: SpecialEventAttendeeType.CHILD, price: 280 },
      { name: 'Sofía Ramírez', type: SpecialEventAttendeeType.CHILD, price: 280 },
      { name: 'Laura Ramírez', type: SpecialEventAttendeeType.ADULT, price: 150 },
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
      { name: 'Camila Torres', type: SpecialEventAttendeeType.CHILD, price: 280 },
      { name: 'Diego Torres', type: SpecialEventAttendeeType.CHILD, price: 280 },
      { name: 'Paola Torres', type: SpecialEventAttendeeType.ADULT, price: 150 },
      { name: 'Iván Torres', type: SpecialEventAttendeeType.ADULT, price: 150 },
    ],
  });
  await createSpecialEventReservation({
    specialEventId: halloween.id,
    holderName: 'Reserva Cancelada Demo',
    holderPhone: '5559990000',
    status: SpecialEventReservationStatus.CANCELLED,
    cancelledByUserId: input.adminId,
    attendees: [{ name: 'Invitado Cancelado', type: SpecialEventAttendeeType.CHILD, price: 280 }],
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
      description: 'Evento publicado sin reservas todavía para probar cupo disponible completo.',
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
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_DB_RESET !== 'true') {
    throw new Error('Refusing to reset demo data in production without ALLOW_DEMO_DB_RESET=true');
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

  await clearOperationalData();

  const packages = await createPackages();
  const products = await createProducts(admin.id);
  const bySku = new Map(products.map((product) => [product.sku, product]));

  await createPurchase({
    folio: 'CMP-DEMO-001',
    supplierName: 'Dulcería Demo',
    createdByUserId: admin.id,
    items: [
      { productId: bySku.get('DEMO-AGUA-500')!.id, quantity: 80, unitCostPrice: 8 },
      { productId: bySku.get('DEMO-JUGO-INF')!.id, quantity: 60, unitCostPrice: 10 },
      { productId: bySku.get('DEMO-DULCES')!.id, quantity: 90, unitCostPrice: 12 },
    ],
  });
  await createPurchase({
    folio: 'CMP-DEMO-002',
    supplierName: 'Cine Snack Demo',
    createdByUserId: admin.id,
    items: [
      { productId: bySku.get('DEMO-PAL-CH')!.id, quantity: 45, unitCostPrice: 13 },
      { productId: bySku.get('DEMO-CINE-COMBO')!.id, quantity: 30, unitCostPrice: 32 },
      { productId: bySku.get('DEMO-PAPAS')!.id, quantity: 35, unitCostPrice: 14 },
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
    items: [
      { productId: bySku.get('DEMO-CINE-COMBO')!.id, quantity: 2 },
      { productId: bySku.get('DEMO-JUGO-INF')!.id, quantity: 5 },
    ],
  });

  await prisma.product.update({
    where: { id: bySku.get('DEMO-PAPAS')!.id },
    data: { stockCurrent: 4 },
  });
  await prisma.inventoryMovement.create({
    data: {
      productId: bySku.get('DEMO-PAPAS')!.id,
      type: InventoryMovementType.MANUAL_ADJUSTMENT_NEGATIVE,
      quantity: -20,
      previousStock: 24,
      newStock: 4,
      reason: 'Ajuste demo por conteo físico',
      actorUserId: admin.id,
      forcedByAdmin: false,
    },
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
    eventForm: {
      eventType: EventType.BIRTHDAY_PARTY,
      requiresInvoice: false,
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
    eventForm: {
      eventType: EventType.BIRTHDAY_PARTY,
      requiresInvoice: true,
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
          manualPrice: 1800,
          observations: 'Spa demo con batas rosas y estación de maquillaje.',
          isPricePending: false,
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
    eventForm: {
      eventType: EventType.BIRTHDAY_PARTY,
      requiresInvoice: false,
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
          observations: 'Mampara completa con arco orgánico y figura de personaje.',
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
      privateEvent: {
        totalPeople: 120,
        appliedRange: '76 a 140 personas',
        appliedPrice: 13500,
        isOverCapacity: false,
      },
      guestCounts: { children: 70, adults: 50 },
      phone: '5556667777',
      address: 'Dirección empresa demo',
      internalNotes: 'Horario privado permitido. Pago por transferencia, factura solicitada.',
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

  console.log('Demo data reset complete. Users were preserved.');
  console.log('Admin: admin@magiccity.local / Admin123!');
  console.log('Cashier: cashier1@magiccity.local / Cashier123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
