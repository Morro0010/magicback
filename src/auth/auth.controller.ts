import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PublicRoute } from '../common/decorators/public-route.decorator';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.type';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';

type CookieSameSite = 'lax' | 'strict' | 'none';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieOptions(): { sameSite: CookieSameSite; secure: boolean } {
    const isProduction = this.configService.getOrThrow<string>('NODE_ENV') === 'production';
    const configuredSameSite = this.configService.get<CookieSameSite>('COOKIE_SAME_SITE');
    const configuredSecure =
      this.configService.get<string>('COOKIE_SECURE') === undefined
        ? isProduction
        : this.configService.get<string>('COOKIE_SECURE') === 'true';

    return {
      sameSite: configuredSameSite ?? (isProduction ? 'none' : 'lax'),
      secure: configuredSecure,
    };
  }

  private isDesktopRequest(req: FastifyRequest): boolean {
    return req.headers['x-magic-desktop'] === 'true';
  }

  @Post('login')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.login(loginDto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const sessionCookieName = this.configService.getOrThrow<string>('SESSION_COOKIE_NAME');
    const csrfCookieName = this.configService.getOrThrow<string>('CSRF_COOKIE_NAME');
    const isDesktopRequest = this.isDesktopRequest(req);
    const cookieOptions = this.getCookieOptions();
    const cookieReply = reply as FastifyReply & {
      setCookie: (
        name: string,
        value: string,
        options: Record<string, unknown>,
      ) => FastifyReply;
    };

    if (!isDesktopRequest) {
      cookieReply.setCookie(sessionCookieName, result.sessionToken, {
        httpOnly: true,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
        path: '/',
        expires: result.absoluteExpiresAt,
      });

      cookieReply.setCookie(csrfCookieName, result.csrfToken, {
        httpOnly: false,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
        path: '/',
        expires: result.absoluteExpiresAt,
      });
    }

    return {
      user: result.user,
      session: {
        inactivityExpiresAt: result.inactivityExpiresAt,
        absoluteExpiresAt: result.absoluteExpiresAt,
        csrfToken: result.csrfToken,
      },
      ...(isDesktopRequest
        ? {
            desktopAuth: {
              sessionToken: result.sessionToken,
              csrfToken: result.csrfToken,
            },
          }
        : {
            browserAuth: {
              sessionToken: result.sessionToken,
              csrfToken: result.csrfToken,
            },
          }),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @CurrentUser() user: { id: string },
  ) {
    if (req.session) {
      await this.authService.logout(req.session.id, user.id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    const sessionCookieName = this.configService.getOrThrow<string>('SESSION_COOKIE_NAME');
    const csrfCookieName = this.configService.getOrThrow<string>('CSRF_COOKIE_NAME');
    const cookieOptions = this.getCookieOptions();
    const cookieReply = reply as FastifyReply & {
      clearCookie: (name: string, options: Record<string, unknown>) => FastifyReply;
    };

    cookieReply.clearCookie(sessionCookieName, {
      path: '/',
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
      httpOnly: true,
    });

    cookieReply.clearCookie(csrfCookieName, {
      path: '/',
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
      httpOnly: false,
    });

    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: { id: string; name: string; email: string; role: string }) {
    return { user };
  }
}
