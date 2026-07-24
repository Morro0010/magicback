import { sanitizeRequestUrl } from './request-url.util';

describe('sanitizeRequestUrl', () => {
  it('redacts private and special-event public tokens', () => {
    expect(
      sanitizeRequestUrl('/api/v1/public/reservations/secret-token?x=1'),
    ).toBe('/api/v1/public/reservations/[redacted]?x=1');
    expect(
      sanitizeRequestUrl(
        '/api/v1/special-event-reservations/public/another-secret',
      ),
    ).toBe('/api/v1/special-event-reservations/public/[redacted]');
  });

  it('leaves ordinary routes unchanged', () => {
    expect(sanitizeRequestUrl('/api/v1/reservations/abc')).toBe(
      '/api/v1/reservations/abc',
    );
  });
});
