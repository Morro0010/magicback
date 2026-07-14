import {
  calendarDaysUntil,
  getMinimumPublicReservationDate,
  isPublicReservationDateAllowed,
  isPublicReservationEditionLocked,
  normalizeCalendarDateInput,
} from './date.util';

describe('business calendar reservation rules', () => {
  const businessNow = new Date('2026-07-13T18:00:00.000Z');

  it('allows the first date after three complete calendar days', () => {
    expect(getMinimumPublicReservationDate(businessNow)).toBe('2026-07-17');
    expect(isPublicReservationDateAllowed('2026-07-16', businessNow)).toBe(
      false,
    );
    expect(isPublicReservationDateAllowed('2026-07-17', businessNow)).toBe(
      true,
    );
  });

  it('handles month and year changes without UTC shifts', () => {
    const yearEnd = new Date('2026-12-30T18:00:00.000Z');
    expect(getMinimumPublicReservationDate(yearEnd)).toBe('2027-01-03');
  });

  it('locks public editing at three calendar days or less', () => {
    expect(calendarDaysUntil('2026-07-17', businessNow)).toBe(4);
    expect(isPublicReservationEditionLocked('2026-07-17', businessNow)).toBe(
      false,
    );
    expect(isPublicReservationEditionLocked('2026-07-16', businessNow)).toBe(
      true,
    );
    expect(isPublicReservationEditionLocked('2026-07-13', businessNow)).toBe(
      true,
    );
    expect(isPublicReservationEditionLocked('2026-07-12', businessNow)).toBe(
      true,
    );
  });

  it('normalizes calendar dates without introducing UTC shifts', () => {
    expect(normalizeCalendarDateInput('2018-7-3')).toBe('2018-07-03');
    expect(normalizeCalendarDateInput('2018-07-03T00:00:00.000Z')).toBe(
      '2018-07-03',
    );
    expect(normalizeCalendarDateInput('2018-02-30')).toBe('2018-02-30');
  });
});
