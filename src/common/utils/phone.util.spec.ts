import { createWhatsAppLink, normalizePhoneNumber } from './phone.util';

describe('phone.util', () => {
  it('normalizes Mexican numbers with default country code', () => {
    expect(normalizePhoneNumber('55 1234 5678')).toBe('+525512345678');
    expect(normalizePhoneNumber('+52 55 1234 5678')).toBe('+525512345678');
    expect(normalizePhoneNumber('+52 1 55 1234 5678')).toBe('+525512345678');
  });

  it('creates encoded wa.me links', () => {
    const link = createWhatsAppLink(
      '55-1234-5678',
      'Hola Magic City\nPago confirmado',
    );

    expect(link).toBe(
      'https://wa.me/525512345678?text=Hola%20Magic%20City%0APago%20confirmado',
    );
  });

  it('returns null when phone or message is invalid', () => {
    expect(createWhatsAppLink('', 'Hola')).toBeNull();
    expect(createWhatsAppLink('55 1234 5678', '')).toBeNull();
  });
});
