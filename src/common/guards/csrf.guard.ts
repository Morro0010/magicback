import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE_KEY } from '../constants';
import { AuthenticatedRequest } from '../types/authenticated-request.type';
import { hashOpaqueToken } from '../utils/security.util';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicRoute) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_HTTP_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    if (!req.session) {
      throw new ForbiddenException('CSRF validation failed');
    }

    const headerToken = req.headers['x-csrf-token'];
    const normalizedHeaderToken = Array.isArray(headerToken)
      ? headerToken[0]
      : headerToken;
    const csrfHeader = normalizedHeaderToken?.trim();

    if (req.session.client === 'desktop') {
      if (!csrfHeader) {
        throw new ForbiddenException('CSRF validation failed');
      }

      if (hashOpaqueToken(csrfHeader) !== req.session.csrfTokenHash) {
        throw new ForbiddenException('CSRF validation failed');
      }

      return true;
    }

    const csrfCookieName = this.configService.getOrThrow<string>('CSRF_COOKIE_NAME');
    const csrfCookie = (req.cookies?.[csrfCookieName] as string | undefined)?.trim();

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new ForbiddenException('CSRF validation failed');
    }

    const expectedHash = req.session.csrfTokenHash;
    if (hashOpaqueToken(csrfHeader) !== expectedHash) {
      throw new ForbiddenException('CSRF validation failed');
    }

    return true;
  }
}
