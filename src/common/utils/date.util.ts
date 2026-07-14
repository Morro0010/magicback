import { TIME_FORMAT_REGEX } from '../constants';

export const DEFAULT_BUSINESS_TIME_ZONE = 'America/Mexico_City';
export const PUBLIC_RESERVATION_MINIMUM_LEAD_DAYS = 4;
export const PUBLIC_RESERVATION_EDIT_LOCK_DAYS = 3;

export function normalizeCalendarDateInput(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})T/.exec(trimmed);
  const match =
    dateOnlyMatch ??
    (isoDateMatch && !Number.isNaN(Date.parse(trimmed)) ? isoDateMatch : null);

  if (!match) {
    return trimmed;
  }

  const normalized = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = parseEventDate(normalized);

  return toIsoDate(parsed) === normalized ? normalized : trimmed;
}

function calendarPartsInTimeZone(
  value: Date,
  timeZone = process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE,
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
  };
}

export function getBusinessCalendarDate(
  now = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE,
): string {
  const parts = calendarPartsInTimeZone(now, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseEventDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function getMinimumPublicReservationDate(
  now = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE,
): string {
  return addCalendarDays(
    getBusinessCalendarDate(now, timeZone),
    PUBLIC_RESERVATION_MINIMUM_LEAD_DAYS,
  );
}

export function isPublicReservationDateAllowed(
  eventDate: Date | string,
  now = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE,
): boolean {
  const value =
    typeof eventDate === 'string'
      ? eventDate.slice(0, 10)
      : toIsoDate(eventDate);
  return value >= getMinimumPublicReservationDate(now, timeZone);
}

export function calendarDaysUntil(
  eventDate: Date | string,
  now = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE,
): number {
  const target =
    typeof eventDate === 'string'
      ? parseEventDate(eventDate.slice(0, 10))
      : parseEventDate(toIsoDate(eventDate));
  const today = parseEventDate(getBusinessCalendarDate(now, timeZone));
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function isPublicReservationEditionLocked(
  eventDate: Date | string,
  now = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE,
): boolean {
  return (
    calendarDaysUntil(eventDate, now, timeZone) <=
    PUBLIC_RESERVATION_EDIT_LOCK_DAYS
  );
}

export function formatCalendarDateEs(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseEventDate(value));
}

export function parseEventDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function calculateEditableUntil(eventDate: Date): Date {
  const result = new Date(eventDate);
  result.setUTCDate(result.getUTCDate() - 3);
  return result;
}

export function isEditionLocked(
  editableUntil: Date,
  now = new Date(),
): boolean {
  return now >= editableUntil;
}

export function isTimeFormatValid(value: string): boolean {
  return TIME_FORMAT_REGEX.test(value);
}

export function timeToMinutes(value: string): number {
  if (!isTimeFormatValid(value)) {
    throw new Error('Invalid time format. Expected HH:mm');
  }

  const [hourStr, minuteStr] = value.split(':');
  return Number(hourStr) * 60 + Number(minuteStr);
}

export function validateTimeRange(startTime: string, endTime: string): void {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (startMinutes >= endMinutes) {
    throw new Error('startTime must be earlier than endTime');
  }
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  return aStart < bEnd && bStart < aEnd;
}
