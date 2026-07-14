import { isKnownScannerPath } from './scanner-blocker';

describe('scanner blocker', () => {
  it.each([
    '/.env',
    '/.env.backup',
    '/.git/config',
    '/wp-login.php',
    '/wp-admin/install.php',
    '/xmlrpc.php',
    '/phpmyadmin/index.php',
    '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php',
    '/api/v1/not-real.php',
    '/%2eenv',
  ])('detects scanner path %s', (path) => {
    expect(isKnownScannerPath(path)).toBe(true);
  });

  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/me',
    '/api/v1/public-reservations',
    '/api/v1/special-events/public',
    '/api/docs',
    '/health',
  ])('does not block legitimate path %s', (path) => {
    expect(isKnownScannerPath(path)).toBe(false);
  });
});
