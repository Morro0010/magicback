const TOKEN_GRACE_DAYS_AFTER_EVENT = 30;
const MINIMUM_TOKEN_LIFETIME_DAYS = 7;

export function calculatePublicTokenExpiresAt(
  eventDate: Date,
  now = new Date(),
) {
  const afterEvent = new Date(eventDate);
  afterEvent.setUTCDate(afterEvent.getUTCDate() + TOKEN_GRACE_DAYS_AFTER_EVENT);
  afterEvent.setUTCHours(23, 59, 59, 999);

  const minimumExpiry = new Date(now);
  minimumExpiry.setUTCDate(
    minimumExpiry.getUTCDate() + MINIMUM_TOKEN_LIFETIME_DAYS,
  );

  return afterEvent > minimumExpiry ? afterEvent : minimumExpiry;
}
