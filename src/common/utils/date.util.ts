import { TIME_FORMAT_REGEX } from '../constants';

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

export function isEditionLocked(editableUntil: Date, now = new Date()): boolean {
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
