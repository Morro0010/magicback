const SENSITIVE_PATHS = [
  /\/public\/reservations\/[^/?#]+/gi,
  /\/special-event-reservations\/public\/[^/?#]+/gi,
];

export function sanitizeRequestUrl(rawUrl: string) {
  return SENSITIVE_PATHS.reduce(
    (url, pattern) =>
      url.replace(pattern, (match) => {
        const lastSlash = match.lastIndexOf('/');
        return `${match.slice(0, lastSlash + 1)}[redacted]`;
      }),
    rawUrl,
  );
}
