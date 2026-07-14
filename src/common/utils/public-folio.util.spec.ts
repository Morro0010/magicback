import {
  formatPrivateEventFolio,
  formatSpecialEventFolio,
  parsePublicFolioNumber,
} from './public-folio.util';

describe('public folios', () => {
  it('formats private and special event folios consistently', () => {
    expect(formatPrivateEventFolio(427)).toBe('PRV-0427');
    expect(formatSpecialEventFolio(293)).toBe('EVT-0293');
    expect(formatPrivateEventFolio(null)).toBeNull();
  });

  it('parses prefixed folios without accepting internal ids', () => {
    expect(parsePublicFolioNumber('prv-0427', 'PRV')).toBe(427);
    expect(parsePublicFolioNumber('EVT-0293', 'EVT')).toBe(293);
    expect(parsePublicFolioNumber('reservation-uuid', 'PRV')).toBeNull();
  });
});
