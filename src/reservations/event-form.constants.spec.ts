import 'reflect-metadata';
import {
  EventAreaType,
  EventPackageType,
  EventType,
} from './dto/event-form.dto';
import {
  DURATION_LIMIT_MESSAGE,
  PRIVATE_EVENT_CAPACITY_MESSAGE,
  calculateEventFormPricing,
  getEventFormValidationMessage,
  getEventScheduleValidationMessage,
  normalizeEventForm,
} from './event-form.constants';

describe('event form pricing by event type', () => {
  it('prices birthday parties by guests without area rental', () => {
    const form = normalizeEventForm({
      eventType: EventType.BIRTHDAY_PARTY,
      areaType: EventAreaType.AREA_GRANDE,
      packageType: EventPackageType.BASICO,
      guestCounts: { children: 20, adults: 10 },
    });

    const pricing = calculateEventFormPricing(form);

    expect(form.areaType).toBeNull();
    expect(pricing.estimatedTotal).toBe(9000);
    expect(pricing.lineItems.map((item) => item.code)).toEqual([
      'guest_children',
      'guest_adults',
    ]);
  });

  it('prices space rental by selected area only', () => {
    const form = normalizeEventForm({
      eventType: EventType.SPACE_RENTAL,
      areaType: EventAreaType.AREA_GRANDE,
      packageType: EventPackageType.BASICO,
      guestCounts: { children: 40, adults: 20 },
    });

    const pricing = calculateEventFormPricing(form);

    expect(form.packageType).toBeNull();
    expect(pricing.estimatedTotal).toBe(7500);
    expect(pricing.lineItems).toHaveLength(1);
    expect(pricing.lineItems[0].code).toBe('area_rental');
  });

  it('prices private events by people range', () => {
    const form = normalizeEventForm({
      eventType: EventType.PRIVATE_EVENT,
      privateEvent: { totalPeople: 120 },
    });

    const pricing = calculateEventFormPricing(form);

    expect(form.privateEvent.appliedRange).toBe('76 a 140 personas');
    expect(pricing.estimatedTotal).toBe(13500);
  });

  it('prices private events by selected range without requiring exact attendees', () => {
    const form = normalizeEventForm({
      eventType: EventType.PRIVATE_EVENT,
      privateEvent: {
        appliedRange: '141 a 180 personas',
        appliedPrice: 15500,
      },
    });

    const pricing = calculateEventFormPricing(form);

    expect(form.privateEvent.totalPeople).toBe(0);
    expect(form.privateEvent.appliedRange).toBe('141 a 180 personas');
    expect(getEventFormValidationMessage(form)).toBeNull();
    expect(pricing.estimatedTotal).toBe(15500);
  });

  it('validates private event capacity and schedules', () => {
    const privateForm = normalizeEventForm({
      eventType: EventType.PRIVATE_EVENT,
      privateEvent: { totalPeople: 231 },
    });

    expect(getEventFormValidationMessage(privateForm)).toBe(
      PRIVATE_EVENT_CAPACITY_MESSAGE,
    );
    expect(
      getEventScheduleValidationMessage(privateForm, '09:00', '13:00'),
    ).toContain('horario permitido');
    expect(
      getEventScheduleValidationMessage(privateForm, '08:00', '12:00'),
    ).toBeNull();
  });

  it('limits birthday and space rental duration to four hours', () => {
    const birthdayForm = normalizeEventForm({
      eventType: EventType.BIRTHDAY_PARTY,
      packageType: EventPackageType.BASICO,
    });

    expect(
      getEventScheduleValidationMessage(birthdayForm, '10:00', '15:00'),
    ).toBe(DURATION_LIMIT_MESSAGE);
    expect(
      getEventScheduleValidationMessage(birthdayForm, '10:00', '14:00'),
    ).toBeNull();
  });
});
