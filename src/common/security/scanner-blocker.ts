import type { FastifyInstance } from 'fastify';

const SCANNER_PATH_PATTERNS = [
  /(?:^|\/)\.env(?:$|[./-])/,
  /(?:^|\/)\.(?:git|svn|hg|aws|docker|vscode)(?:\/|$)/,
  /(?:^|\/)\.(?:htaccess|htpasswd|ds_store)(?:$|\/)/,
  /(?:^|\/)(?:wp-login\.php|xmlrpc\.php|wp-admin|wp-content|wp-includes)(?:\/|$)/,
  /^\/(?:admin|administrator|phpmyadmin|php-my-admin|pma|myadmin)(?:\/|$)/,
  /(?:^|\/)(?:phpmyadmin|php-my-admin|pma)(?:\/|$)/,
  /(?:^|\/)(?:vendor\/phpunit|cgi-bin|boaform|_ignition|laravel|storage\/logs)(?:\/|$)/,
  /(?:^|\/)(?:server-status|actuator\/env|actuator\/heapdump)(?:\/|$)/,
  /(?:^|\/)(?:composer\.(?:json|lock)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)(?:$|\/)/,
  /\.php(?:$|\/)/,
];

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isKnownScannerPath(rawUrl: string) {
  const pathname = (() => {
    try {
      return new URL(rawUrl, 'http://magic-city.local').pathname;
    } catch {
      return rawUrl.split('?')[0] ?? rawUrl;
    }
  })();

  const normalizedPath = safeDecode(pathname)
    .replace(/\/{2,}/g, '/')
    .toLowerCase();

  return SCANNER_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

export function registerScannerBlocker(fastify: FastifyInstance) {
  fastify.addHook('onRequest', (request, reply, done) => {
    const rawUrl = request.raw.url ?? request.url;

    if (isKnownScannerPath(rawUrl)) {
      reply
        .code(404)
        .header('Cache-Control', 'no-store')
        .send();
      return;
    }

    done();
  });
}
