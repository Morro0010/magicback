export function normalizePhoneNumber(
  raw: string | null | undefined,
  defaultCountryCode = '52',
): string | null {
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `+${defaultCountryCode}${digits}`;
  }

  if (
    digits.length === defaultCountryCode.length + 10 &&
    digits.startsWith(defaultCountryCode)
  ) {
    return `+${digits}`;
  }

  if (digits.length === 13 && digits.startsWith('521')) {
    return `+52${digits.slice(3)}`;
  }

  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export function isValidPhoneNumber(
  raw: string | null | undefined,
  defaultCountryCode = '52',
): boolean {
  return normalizePhoneNumber(raw, defaultCountryCode) !== null;
}

export function createWhatsAppLink(
  phone: string | null | undefined,
  message: string,
  defaultCountryCode = '52',
): string | null {
  const normalized = normalizePhoneNumber(phone, defaultCountryCode);
  const text = message.trim();

  if (!normalized || !text) {
    return null;
  }

  return `https://wa.me/${normalized.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
