import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_ROUTE_KEY } from '../constants';
import { AuthenticatedRequest } from '../types/authenticated-request.type';
import { hashOpaqueToken } from '../utils/security.util';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicRoute) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.configService.getOrThrow<string>('SESSION_COOKIE_NAME');
    const isDesktopRequest = req.headers['x-magic-desktop'] === 'true';
    const authorizationHeader = req.headers.authorization;
    const bearerToken = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice('Bearer '.length).trim()
      : undefined;
    const rawToken = isDesktopRequest && bearerToken
      ? bearerToken
      : req.cookies?.[cookieName] as string | undefined;

    if (!rawToken) {
      throw new UnauthorizedException('Authentication required');
    }

    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { sessionTokenHash: hashOpaqueToken(rawToken) },
      include: { user: true },
    });

    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session not found');
    }

    if (session.absoluteExpiresAt <= now || session.inactivityExpiresAt <= now) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { isActive: false },
      });
      throw new UnauthorizedException('Session expired');
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException('User inactive');
    }

    const inactivityWindowMinutes = this.configService.getOrThrow<number>(
      'SESSION_INACTIVITY_TIMEOUT_MINUTES',
    );
    const refreshedInactivity = new Date(
      now.getTime() + inactivityWindowMinutes * 60 * 1000,
    );

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        lastActivityAt: now,
        inactivityExpiresAt: refreshedInactivity,
      },
    });

    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      name: session.user.name,
    };

    req.session = {
      id: session.id,
      csrfTokenHash: session.csrfTokenHash,
      inactivityExpiresAt: refreshedInactivity,
      absoluteExpiresAt: session.absoluteExpiresAt,
      client: isDesktopRequest && bearerToken ? 'desktop' : 'web',
    };

    return true;
  }
}
