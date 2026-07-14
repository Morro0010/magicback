import {
  EventAreaType,
  EventCakeOption,
  EventCakeProvider,
  EventDecorationPackage,
  EventDrinkOption,
  EventFoodOption,
  EventPackageType,
  EventType,
  type EventFormDto,
} from './dto/event-form.dto';

export const BIRTHDAY_OR_SPACE_DURATION_LIMIT_MINUTES = 4 * 60;
export const DURATION_LIMIT_MESSAGE =
  'La duración máxima para este tipo de evento es de 4 horas. Si requiere más tiempo, favor de comunicarse con administración.';
export const PRIVATE_EVENT_SCHEDULE_MESSAGE =
  'Para evento privado selecciona un horario permitido: 8:00 a.m. - 12:00 p.m. o 8:30 a.m. - 12:30 p.m.';
export const PRIVATE_EVENT_CAPACITY_MESSAGE =
  'Para eventos de más de 230 personas, favor de comunicarse con administración.';

export const PRIVATE_EVENT_SCHEDULE_OPTIONS = [
  { startTime: '08:00', endTime: '12:00', label: '8:00 a.m. - 12:00 p.m.' },
  { startTime: '08:30', endTime: '12:30', label: '8:30 a.m. - 12:30 p.m.' },
] as const;

export const MAGIC_EVENT_PRICE_CATALOG = {
  areaRental: {
    [EventAreaType.AREA_CHICA]: 5500,
    [EventAreaType.AREA_GRANDE]: 7500,
  },
  guest: {
    child: 375,
    adult: 150,
  },
  packageAddOns: {
    [EventPackageType.BASICO]: null,
    [EventPackageType.BASICO_SPA]: null,
    [EventPackageType.BASICO_DECORACION_PREMIUM]: null,
  },
  privateEvent: [
    { min: 1, max: 75, label: '1 a 75 personas', price: 10000 },
    { min: 76, max: 140, label: '76 a 140 personas', price: 13500 },
    { min: 141, max: 180, label: '141 a 180 personas', price: 15500 },
    { min: 181, max: 230, label: '181 a 230 personas', price: 18000 },
  ],
} as const;

export const EVENT_FORM_PRICE_CATALOG = {
  adultTicketPrice: 115,
  minimumChildren: 15,
  pizzaSpecialExtra: 80,
  extras: {
    popcorn: 30,
    candyBag: 70,
    tableCenterpieces: 95,
    botanaTray: 250,
    fruitTray: 0,
    gelatinIndividual: 30,
    gelatinComplete: 150,
    cupcakes: 25,
    extraChocolate: 0,
    extraVanilla: 0,
    extraMarble: 0,
  },
  decoration: {
    mediaMampara: 2250,
    mamparaCompleta: 2950,
    neon: 150,
    confetti: 500,
    characterFigure: 250,
  },
} as const;

export type EventPricingLineItem = {
  code: string;
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  isQuoted: boolean;
};

export type EventPricingResult = {
  catalog: Record<string, unknown>;
  lineItems: EventPricingLineItem[];
  estimatedTotal: number;
  hasQuotedItems: boolean;
  pendingPriceItems: string[];
};

export type EventPricingBreakdown = {
  eventType: EventType | null;
  areaRental: {
    areaType: EventAreaType | null;
    unitPrice: number;
    subtotal: number;
  };
  children: {
    quantity: number;
    unitPrice: number;
    subtotal: number;
  };
  adults: {
    quantity: number;
    unitPrice: number;
    subtotal: number;
  };
  privateEvent: {
    totalPeople: number;
    appliedRange: string | null;
    appliedPrice: number;
    subtotal: number;
    isOverCapacity: boolean;
  };
  addOns: Array<{
    code: string;
    label: string;
    unitPrice: number | null;
    subtotal: number;
    isPricePending: boolean;
  }>;
  estimatedTotal: number;
  pendingPriceItems: string[];
};

export type EventFormPayload = {
  eventType: EventType | null;
  requiresInvoice: boolean;
  areaType: EventAreaType | null;
  packageType: EventPackageType | null;
  guestCounts: {
    children: number;
    adults: number;
    childUnitPrice: number;
    adultUnitPrice: number;
  };
  selectedOptions: {
    freshWaterFlavor: EventDrinkOption | null;
    foodOption: EventFoodOption | null;
    cakeProvider: EventCakeProvider | null;
    cakeFlavor: string | null;
  };
  addOns: {
    spa: {
      participants: number;
      manualPrice: number | null;
      observations: string | null;
      isPricePending: boolean;
    };
    premiumDecoration: {
      characterTheme: string | null;
      balloonColors: string | null;
      manualPrice: number | null;
      observations: string | null;
      isPricePending: boolean;
    };
  };
  privateEvent: {
    totalPeople: number;
    appliedRange: string | null;
    appliedPrice: number;
    isOverCapacity: boolean;
  };
  pricingBreakdown: EventPricingBreakdown;
  pendingPriceItems: string[];
  internalNotes: string | null;

  // Legacy mirrors kept for existing reservations and older UI reads.
  responsibleName: string | null;
  celebrantAge: number | null;
  celebrantBirthDate: string | null;
  phone: string | null;
  address: string | null;
  eventTheme: string | null;
  childrenCount: number;
  adultsCount: number;
  pizzaFlavor: string | null;
  pizzaSpecial: boolean;
  drinkOption: EventDrinkOption | null;
  cakeOption: EventCakeOption | null;
  popcornUnits: number;
  candyBagUnits: number;
  tableCenterpiecesUnits: number;
  botanaTrayUnits: number;
  fruitTrayUnits: number;
  gelatinIndividualUnits: number;
  gelatinCompleteUnits: number;
  cupcakesUnits: number;
  extraChocolateUnits: number;
  extraVanillaUnits: number;
  extraMarbleUnits: number;
  decorationPackage: EventDecorationPackage | null;
  neonUnits: number;
  confettiUnits: number;
  characterFigureUnits: number;
  generalComments: string | null;
  satisfactionScore: number | null;
};

type EventFormInput =
  EventFormDto | Partial<EventFormPayload> | null | undefined;

export function normalizeEventForm(input?: EventFormInput): EventFormPayload {
  const eventType = normalizeEventType(input);
  const guestChildren = safeNumber(
    input?.guestCounts?.children ?? input?.childrenCount,
  );
  const guestAdults = safeNumber(
    input?.guestCounts?.adults ?? input?.adultsCount,
  );
  const freshWaterFlavor =
    eventType === EventType.BIRTHDAY_PARTY
      ? (input?.selectedOptions?.freshWaterFlavor ??
        normalizeFreshWaterFlavor(input?.drinkOption) ??
        null)
      : null;
  const cakeFlavor =
    eventType === EventType.BIRTHDAY_PARTY
      ? input?.selectedOptions?.cakeFlavor?.trim() ||
        mapLegacyCakeFlavor(input?.cakeOption) ||
        null
      : null;
  const packageType =
    eventType === EventType.BIRTHDAY_PARTY
      ? (input?.packageType ?? null)
      : null;
  const privateTotalPeople =
    eventType === EventType.PRIVATE_EVENT
      ? safeNumber(input?.privateEvent?.totalPeople)
      : 0;
  const privateManualPrice = safeMoney(input?.privateEvent?.appliedPrice);
  const privateRange =
    getPrivateEventRange(privateTotalPeople) ??
    getPrivateEventRangeBySelection(
      input?.privateEvent?.appliedRange,
      privateManualPrice,
    );

  const base: Omit<EventFormPayload, 'pricingBreakdown' | 'pendingPriceItems'> =
    {
      eventType,
      requiresInvoice: Boolean(input?.requiresInvoice),
      areaType:
        eventType === EventType.SPACE_RENTAL ? (input?.areaType ?? null) : null,
      packageType,
      guestCounts: {
        children:
          eventType === EventType.SPACE_RENTAL ? guestChildren : guestChildren,
        adults:
          eventType === EventType.SPACE_RENTAL ? guestAdults : guestAdults,
        childUnitPrice: MAGIC_EVENT_PRICE_CATALOG.guest.child,
        adultUnitPrice: MAGIC_EVENT_PRICE_CATALOG.guest.adult,
      },
      selectedOptions: {
        freshWaterFlavor,
        foodOption:
          eventType === EventType.BIRTHDAY_PARTY
            ? (input?.selectedOptions?.foodOption ??
              inferFoodOption(input?.pizzaFlavor) ??
              null)
            : null,
        cakeProvider:
          eventType === EventType.BIRTHDAY_PARTY
            ? (input?.selectedOptions?.cakeProvider ??
              (cakeFlavor ? EventCakeProvider.DAIRY_QUEEN : null))
            : null,
        cakeFlavor,
      },
      addOns: {
        spa: {
          participants:
            packageType === EventPackageType.BASICO_SPA
              ? safeNumber(input?.addOns?.spa?.participants)
              : 0,
          manualPrice:
            packageType === EventPackageType.BASICO_SPA
              ? safeMoney(input?.addOns?.spa?.manualPrice)
              : null,
          observations:
            packageType === EventPackageType.BASICO_SPA
              ? input?.addOns?.spa?.observations?.trim() || null
              : null,
          isPricePending:
            packageType === EventPackageType.BASICO_SPA &&
            safeMoney(input?.addOns?.spa?.manualPrice) === null,
        },
        premiumDecoration: {
          characterTheme:
            packageType === EventPackageType.BASICO_DECORACION_PREMIUM
              ? input?.addOns?.premiumDecoration?.characterTheme?.trim() ||
                input?.eventTheme?.trim() ||
                null
              : null,
          balloonColors:
            packageType === EventPackageType.BASICO_DECORACION_PREMIUM
              ? input?.addOns?.premiumDecoration?.balloonColors?.trim() || null
              : null,
          manualPrice:
            packageType === EventPackageType.BASICO_DECORACION_PREMIUM
              ? safeMoney(input?.addOns?.premiumDecoration?.manualPrice)
              : null,
          observations:
            packageType === EventPackageType.BASICO_DECORACION_PREMIUM
              ? input?.addOns?.premiumDecoration?.observations?.trim() || null
              : null,
          isPricePending:
            packageType === EventPackageType.BASICO_DECORACION_PREMIUM &&
            safeMoney(input?.addOns?.premiumDecoration?.manualPrice) === null,
        },
      },
      privateEvent: {
        totalPeople: privateTotalPeople,
        appliedRange:
          privateRange?.label ?? input?.privateEvent?.appliedRange ?? null,
        appliedPrice:
          privateRange?.price ??
          safeMoney(input?.privateEvent?.appliedPrice) ??
          0,
        isOverCapacity: privateTotalPeople > 230,
      },
      internalNotes: input?.internalNotes?.trim() || null,
      responsibleName: input?.responsibleName?.trim() || null,
      celebrantAge: input?.celebrantAge ?? null,
      celebrantBirthDate:
        eventType === EventType.BIRTHDAY_PARTY
          ? normalizeDateString(input?.celebrantBirthDate)
          : null,
      phone: input?.phone?.trim() || null,
      address: input?.address?.trim() || null,
      eventTheme:
        input?.eventTheme?.trim() ||
        input?.addOns?.premiumDecoration?.characterTheme?.trim() ||
        null,
      childrenCount: guestChildren,
      adultsCount: guestAdults,
      pizzaFlavor:
        eventType === EventType.BIRTHDAY_PARTY
          ? input?.pizzaFlavor?.trim() || null
          : null,
      pizzaSpecial:
        eventType === EventType.BIRTHDAY_PARTY
          ? Boolean(input?.pizzaSpecial)
          : false,
      drinkOption: freshWaterFlavor,
      cakeOption:
        eventType === EventType.BIRTHDAY_PARTY
          ? (input?.cakeOption ?? normalizeLegacyCakeOption(cakeFlavor))
          : null,
      popcornUnits: safeNumber(input?.popcornUnits),
      candyBagUnits: safeNumber(input?.candyBagUnits),
      tableCenterpiecesUnits: safeNumber(input?.tableCenterpiecesUnits),
      botanaTrayUnits: safeNumber(input?.botanaTrayUnits),
      fruitTrayUnits: safeNumber(input?.fruitTrayUnits),
      gelatinIndividualUnits: safeNumber(input?.gelatinIndividualUnits),
      gelatinCompleteUnits: safeNumber(input?.gelatinCompleteUnits),
      cupcakesUnits: safeNumber(input?.cupcakesUnits),
      extraChocolateUnits: safeNumber(input?.extraChocolateUnits),
      extraVanillaUnits: safeNumber(input?.extraVanillaUnits),
      extraMarbleUnits: safeNumber(input?.extraMarbleUnits),
      decorationPackage: input?.decorationPackage ?? null,
      neonUnits: safeNumber(input?.neonUnits),
      confettiUnits: safeNumber(input?.confettiUnits),
      characterFigureUnits: safeNumber(input?.characterFigureUnits),
      generalComments: input?.generalComments?.trim() || null,
      satisfactionScore: input?.satisfactionScore ?? null,
    };

  const pricing = isMagicEventConfigured(base)
    ? calculateMagicEventPricing(base)
    : calculateLegacyEventPricing(base);

  return {
    ...base,
    pricingBreakdown: toPricingBreakdown(base, pricing),
    pendingPriceItems: pricing.pendingPriceItems,
  };
}

export function calculateEventFormPricing(
  formInput?: EventFormInput,
): EventPricingResult {
  const form = normalizeEventForm(formInput ?? null);

  return isMagicEventConfigured(form)
    ? calculateMagicEventPricing(form)
    : calculateLegacyEventPricing(form);
}

export function isMagicEventConfigured(formInput?: EventFormInput): boolean {
  const form = formInput as Partial<EventFormPayload> | null | undefined;

  return Boolean(
    form?.eventType ||
    form?.areaType ||
    form?.packageType ||
    form?.guestCounts?.children ||
    form?.guestCounts?.adults ||
    form?.selectedOptions?.freshWaterFlavor ||
    form?.selectedOptions?.foodOption ||
    form?.selectedOptions?.cakeFlavor ||
    form?.privateEvent?.totalPeople ||
    form?.privateEvent?.appliedRange ||
    form?.privateEvent?.appliedPrice,
  );
}

export function getPrivateEventRange(totalPeople: number) {
  if (totalPeople <= 0) {
    return undefined;
  }

  return MAGIC_EVENT_PRICE_CATALOG.privateEvent.find(
    (range) => totalPeople >= range.min && totalPeople <= range.max,
  );
}

export function getPrivateEventRangeBySelection(
  label?: string | null,
  price?: number | null,
) {
  return MAGIC_EVENT_PRICE_CATALOG.privateEvent.find(
    (range) =>
      range.label === label || (price != null && range.price === price),
  );
}

export function getEventScheduleValidationMessage(
  formInput: EventFormInput,
  startTime: string,
  endTime: string,
): string | null {
  const form = normalizeEventForm(formInput);

  if (!form.eventType) {
    return null;
  }

  if (form.eventType === EventType.PRIVATE_EVENT) {
    const isAllowed = PRIVATE_EVENT_SCHEDULE_OPTIONS.some(
      (option) => option.startTime === startTime && option.endTime === endTime,
    );
    return isAllowed ? null : PRIVATE_EVENT_SCHEDULE_MESSAGE;
  }

  const durationMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
  return durationMinutes > BIRTHDAY_OR_SPACE_DURATION_LIMIT_MINUTES
    ? DURATION_LIMIT_MESSAGE
    : null;
}

export function getEventFormValidationMessage(
  formInput: EventFormInput,
): string | null {
  const form = normalizeEventForm(formInput);

  if (
    form.eventType === EventType.PRIVATE_EVENT &&
    form.privateEvent.totalPeople > 230
  ) {
    return PRIVATE_EVENT_CAPACITY_MESSAGE;
  }

  if (
    form.eventType === EventType.PRIVATE_EVENT &&
    (!form.privateEvent.appliedRange || form.privateEvent.appliedPrice <= 0)
  ) {
    return 'Selecciona un rango de asistentes para calcular el precio.';
  }

  if (form.eventType === EventType.BIRTHDAY_PARTY && !form.celebrantBirthDate) {
    return 'Indica la fecha de nacimiento del festejado.';
  }

  return null;
}

function normalizeDateString(value?: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function calculateMagicEventPricing(
  form:
    | Omit<EventFormPayload, 'pricingBreakdown' | 'pendingPriceItems'>
    | EventFormPayload,
): EventPricingResult {
  const rows: EventPricingLineItem[] = [];
  const pendingPriceItems: string[] = [];

  const pushRow = (
    code: string,
    label: string,
    quantity: number,
    unitPrice: number,
    isQuoted = false,
  ) => {
    if (quantity <= 0) {
      return;
    }

    rows.push({
      code,
      label,
      quantity,
      unitPrice,
      subtotal: isQuoted ? 0 : Number((quantity * unitPrice).toFixed(2)),
      isQuoted,
    });

    if (isQuoted) {
      pendingPriceItems.push(label);
    }
  };

  if (form.eventType === EventType.SPACE_RENTAL) {
    if (form.areaType) {
      pushRow(
        'area_rental',
        form.areaType === EventAreaType.AREA_GRANDE
          ? 'Renta área grande'
          : 'Renta área chica',
        1,
        MAGIC_EVENT_PRICE_CATALOG.areaRental[form.areaType],
      );
    }
  } else if (form.eventType === EventType.PRIVATE_EVENT) {
    if (form.privateEvent.totalPeople > 230) {
      pushRow(
        'private_event_over_capacity',
        'Evento de más de 230 personas',
        1,
        0,
        true,
      );
    } else if (form.privateEvent.appliedPrice > 0) {
      pushRow(
        'private_event',
        form.privateEvent.appliedRange ?? 'Evento privado',
        1,
        form.privateEvent.appliedPrice,
      );
    }
  } else {
    pushRow(
      'guest_children',
      'Niños',
      form.guestCounts.children,
      MAGIC_EVENT_PRICE_CATALOG.guest.child,
    );
    pushRow(
      'guest_adults',
      'Adultos',
      form.guestCounts.adults,
      MAGIC_EVENT_PRICE_CATALOG.guest.adult,
    );

    if (form.packageType === EventPackageType.BASICO_SPA) {
      const manualPrice = form.addOns.spa.manualPrice;
      pushRow(
        'addon_spa',
        'Paquete spa',
        1,
        manualPrice ?? 0,
        manualPrice === null,
      );
    }

    if (form.packageType === EventPackageType.BASICO_DECORACION_PREMIUM) {
      const manualPrice = form.addOns.premiumDecoration.manualPrice;
      pushRow(
        'addon_premium_decoration',
        'Decoración premium',
        1,
        manualPrice ?? 0,
        manualPrice === null,
      );
    }
  }

  const estimatedTotal = rows.reduce((sum, row) => sum + row.subtotal, 0);

  return {
    catalog: MAGIC_EVENT_PRICE_CATALOG,
    lineItems: rows,
    estimatedTotal: Number(estimatedTotal.toFixed(2)),
    hasQuotedItems: pendingPriceItems.length > 0,
    pendingPriceItems,
  };
}

function calculateLegacyEventPricing(
  form:
    | Omit<EventFormPayload, 'pricingBreakdown' | 'pendingPriceItems'>
    | EventFormPayload,
): EventPricingResult {
  const rows: EventPricingLineItem[] = [];
  const pendingPriceItems: string[] = [];

  const pushRow = (
    code: string,
    label: string,
    quantity: number,
    unitPrice: number,
    isQuoted = false,
  ) => {
    if (quantity <= 0) {
      return;
    }
    rows.push({
      code,
      label,
      quantity,
      unitPrice,
      subtotal: isQuoted ? 0 : quantity * unitPrice,
      isQuoted,
    });

    if (isQuoted) {
      pendingPriceItems.push(label);
    }
  };

  pushRow(
    'adult_ticket',
    'Adultos',
    form.adultsCount,
    EVENT_FORM_PRICE_CATALOG.adultTicketPrice,
  );

  if (form.pizzaSpecial) {
    pushRow(
      'pizza_special',
      'Pizza especial',
      1,
      EVENT_FORM_PRICE_CATALOG.pizzaSpecialExtra,
    );
  }

  pushRow(
    'extra_popcorn',
    'Palomitas individuales',
    form.popcornUnits,
    EVENT_FORM_PRICE_CATALOG.extras.popcorn,
  );
  pushRow(
    'extra_candy_bag',
    'Bolo de dulce',
    form.candyBagUnits,
    EVENT_FORM_PRICE_CATALOG.extras.candyBag,
  );
  pushRow(
    'extra_centerpieces',
    'Centros de mesa',
    form.tableCenterpiecesUnits,
    EVENT_FORM_PRICE_CATALOG.extras.tableCenterpieces,
  );
  pushRow(
    'extra_botana_tray',
    'Charola con botana',
    form.botanaTrayUnits,
    EVENT_FORM_PRICE_CATALOG.extras.botanaTray,
  );
  pushRow(
    'extra_fruit_tray',
    'Fruta de temporada + nachos/churros',
    form.fruitTrayUnits,
    0,
    true,
  );
  pushRow(
    'extra_gelatin_individual',
    'Gelatina mosaico individual',
    form.gelatinIndividualUnits,
    EVENT_FORM_PRICE_CATALOG.extras.gelatinIndividual,
  );
  pushRow(
    'extra_gelatin_complete',
    'Gelatina mosaico completa',
    form.gelatinCompleteUnits,
    EVENT_FORM_PRICE_CATALOG.extras.gelatinComplete,
  );
  pushRow(
    'extra_cupcakes',
    'Cupcakes',
    form.cupcakesUnits,
    EVENT_FORM_PRICE_CATALOG.extras.cupcakes,
  );
  pushRow(
    'extra_chocolate',
    'Extra chocolate',
    form.extraChocolateUnits,
    0,
    true,
  );
  pushRow('extra_vanilla', 'Extra vainilla', form.extraVanillaUnits, 0, true);
  pushRow('extra_marble', 'Extra marmoleado', form.extraMarbleUnits, 0, true);

  if (form.decorationPackage === EventDecorationPackage.MEDIA_MAMPARA) {
    pushRow(
      'deco_media_mampara',
      'Decoración media mampara',
      1,
      EVENT_FORM_PRICE_CATALOG.decoration.mediaMampara,
    );
  }

  if (form.decorationPackage === EventDecorationPackage.MAMPARA_COMPLETA) {
    pushRow(
      'deco_mampara_completa',
      'Decoración mampara completa',
      1,
      EVENT_FORM_PRICE_CATALOG.decoration.mamparaCompleta,
    );
  }

  pushRow(
    'deco_neon',
    'Luz neón',
    form.neonUnits,
    EVENT_FORM_PRICE_CATALOG.decoration.neon,
  );
  pushRow(
    'deco_confetti',
    'Papelitos',
    form.confettiUnits,
    EVENT_FORM_PRICE_CATALOG.decoration.confetti,
  );
  pushRow(
    'deco_character',
    'Figuras personajes',
    form.characterFigureUnits,
    EVENT_FORM_PRICE_CATALOG.decoration.characterFigure,
  );

  const estimatedTotal = rows.reduce((sum, row) => sum + row.subtotal, 0);

  return {
    catalog: EVENT_FORM_PRICE_CATALOG,
    lineItems: rows,
    estimatedTotal: Number(estimatedTotal.toFixed(2)),
    hasQuotedItems: pendingPriceItems.length > 0,
    pendingPriceItems,
  };
}

function toPricingBreakdown(
  form:
    | Omit<EventFormPayload, 'pricingBreakdown' | 'pendingPriceItems'>
    | EventFormPayload,
  pricing: EventPricingResult,
): EventPricingBreakdown {
  const areaPrice = form.areaType
    ? MAGIC_EVENT_PRICE_CATALOG.areaRental[form.areaType]
    : 0;
  const childrenSubtotal =
    form.eventType === EventType.BIRTHDAY_PARTY || form.packageType
      ? Number(
          (
            form.guestCounts.children * MAGIC_EVENT_PRICE_CATALOG.guest.child
          ).toFixed(2),
        )
      : 0;
  const adultsSubtotal =
    form.eventType === EventType.BIRTHDAY_PARTY || form.packageType
      ? Number(
          (
            form.guestCounts.adults * MAGIC_EVENT_PRICE_CATALOG.guest.adult
          ).toFixed(2),
        )
      : 0;

  return {
    eventType: form.eventType,
    areaRental: {
      areaType: form.areaType,
      unitPrice: areaPrice,
      subtotal: form.eventType === EventType.SPACE_RENTAL ? areaPrice : 0,
    },
    children: {
      quantity: form.guestCounts.children,
      unitPrice: MAGIC_EVENT_PRICE_CATALOG.guest.child,
      subtotal: childrenSubtotal,
    },
    adults: {
      quantity: form.guestCounts.adults,
      unitPrice: MAGIC_EVENT_PRICE_CATALOG.guest.adult,
      subtotal: adultsSubtotal,
    },
    privateEvent: {
      totalPeople: form.privateEvent.totalPeople,
      appliedRange: form.privateEvent.appliedRange,
      appliedPrice: form.privateEvent.appliedPrice,
      subtotal:
        form.eventType === EventType.PRIVATE_EVENT
          ? form.privateEvent.appliedPrice
          : 0,
      isOverCapacity: form.privateEvent.isOverCapacity,
    },
    addOns: pricing.lineItems
      .filter((item) => item.code.startsWith('addon_'))
      .map((item) => ({
        code: item.code,
        label: item.label,
        unitPrice: item.isQuoted ? null : item.unitPrice,
        subtotal: item.subtotal,
        isPricePending: item.isQuoted,
      })),
    estimatedTotal: pricing.estimatedTotal,
    pendingPriceItems: pricing.pendingPriceItems,
  };
}

function normalizeEventType(input?: EventFormInput): EventType | null {
  const raw = input?.eventType;
  if (
    raw === EventType.BIRTHDAY_PARTY ||
    raw === EventType.SPACE_RENTAL ||
    raw === EventType.PRIVATE_EVENT
  ) {
    return raw;
  }

  if (input?.packageType) {
    return EventType.BIRTHDAY_PARTY;
  }

  if (input?.areaType) {
    return EventType.SPACE_RENTAL;
  }

  if (
    input?.privateEvent?.totalPeople ||
    input?.privateEvent?.appliedRange ||
    input?.privateEvent?.appliedPrice
  ) {
    return EventType.PRIVATE_EVENT;
  }

  return null;
}

function safeNumber(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 0;
  }
  return Math.trunc(value);
}

function safeMoney(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return null;
  }
  return Number(value.toFixed(2));
}

function normalizeFreshWaterFlavor(
  value?: EventDrinkOption | null,
): EventDrinkOption | null {
  if (
    value === EventDrinkOption.HORCHATA ||
    value === EventDrinkOption.JAMAICA ||
    value === EventDrinkOption.LIMON_CON_CHIA
  ) {
    return value;
  }

  return null;
}

function inferFoodOption(pizzaFlavor?: string | null): EventFoodOption | null {
  return pizzaFlavor ? EventFoodOption.PIZZA : null;
}

function mapLegacyCakeFlavor(value?: EventCakeOption | null): string | null {
  if (!value) {
    return null;
  }

  const labels: Record<EventCakeOption, string> = {
    [EventCakeOption.VAINILLA]: 'Vainilla',
    [EventCakeOption.CHOCOLATE]: 'Chocolate',
    [EventCakeOption.MARMOLEADO]: 'Marmoleado',
    [EventCakeOption.CAJETA_CHOCOLATE_MERMELADA]:
      'Cajeta, chocolate o mermelada',
  };

  return labels[value] ?? null;
}

function normalizeLegacyCakeOption(
  value?: string | null,
): EventCakeOption | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('chocolate')) {
    return EventCakeOption.CHOCOLATE;
  }

  if (normalized.includes('marmol')) {
    return EventCakeOption.MARMOLEADO;
  }

  if (normalized.includes('cajeta') || normalized.includes('mermelada')) {
    return EventCakeOption.CAJETA_CHOCOLATE_MERMELADA;
  }

  if (normalized.includes('vainilla')) {
    return EventCakeOption.VAINILLA;
  }

  return null;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return hours * 60 + minutes;
}
