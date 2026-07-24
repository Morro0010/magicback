import { calculatePublicTokenExpiresAt } from './public-token.util';

describe('calculatePublicTokenExpiresAt', () => {
  it('keeps a link available for 30 days after a future event', () => {
    const expiry = calculatePublicTokenExpiresAt(
      new Date('2026-09-10T00:00:00.000Z'),
      new Date('2026-07-23T00:00:00.000Z'),
    );

    expect(expiry.toISOString()).toBe('2026-10-10T23:59:59.999Z');
  });

  it('gives regenerated links for old events a short minimum lifetime', () => {
    const expiry = calculatePublicTokenExpiresAt(
      new Date('2025-01-01T00:00:00.000Z'),
      new Date('2026-07-23T12:00:00.000Z'),
    );

    expect(expiry.toISOString()).toBe('2026-07-30T12:00:00.000Z');
  });
});
