import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.type';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const sessionResult = {
    sessionToken: 'session-token',
    csrfToken: 'csrf-token',
    inactivityExpiresAt: new Date('2026-07-22T12:00:00.000Z'),
    absoluteExpiresAt: new Date('2026-08-21T12:00:00.000Z'),
    user: {
      id: 'u1',
      name: 'Admin',
      email: 'admin@magiccity.local',
      role: 'ADMIN',
    },
  };

  const loginMock = jest
    .fn<AuthService['login']>()
    .mockResolvedValue(sessionResult);
  const logoutMock = jest.fn<AuthService['logout']>();
  const authService = {
    login: loginMock,
    logout: logoutMock,
  } as unknown as AuthService;

  const getOrThrowMock = jest.fn((key: string): string => {
    const values: Record<string, string> = {
      NODE_ENV: 'development',
      SESSION_COOKIE_NAME: 'mc_session',
      CSRF_COOKIE_NAME: 'mc_csrf',
    };
    const value = values[key];
    if (!value) {
      throw new Error(`Missing test configuration: ${key}`);
    }
    return value;
  });
  const getMock = jest.fn((): undefined => undefined);
  const configService = {
    getOrThrow: getOrThrowMock,
    get: getMock,
  } as unknown as ConfigService;

  const controller = new AuthController(authService, configService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createReply() {
    return {
      header: jest.fn(),
      setCookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    } as unknown as FastifyReply & {
      header: jest.Mock;
      setCookie: jest.Mock;
      clearCookie: jest.Mock;
    };
  }

  it('uses HttpOnly cookies for browser sessions without exposing the session token', async () => {
    const reply = createReply();
    const response = await controller.login(
      { email: 'admin@magiccity.local', password: 'Admin123!' },
      {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as unknown as FastifyRequest,
      reply,
    );

    expect(reply.setCookie).toHaveBeenCalledWith(
      'mc_session',
      'session-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(reply.header).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, max-age=0',
    );
    expect(response).not.toHaveProperty('browserAuth');
    expect(response).not.toHaveProperty('desktopAuth');
  });

  it('returns Bearer credentials only to the explicit desktop client', async () => {
    const reply = createReply();
    const response = await controller.login(
      { email: 'admin@magiccity.local', password: 'Admin123!' },
      {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'jest',
          'x-magic-desktop': 'true',
        },
      } as unknown as FastifyRequest,
      reply,
    );

    expect(reply.setCookie).not.toHaveBeenCalled();
    expect(response).toHaveProperty(
      'desktopAuth.sessionToken',
      'session-token',
    );
  });

  it('restores only the CSRF token from a valid web session cookie', () => {
    const reply = createReply();
    const response = controller.me(
      sessionResult.user,
      {
        cookies: { mc_csrf: 'csrf-token' },
        session: {
          id: 's1',
          csrfTokenHash:
            'a58806c745411a50a426fc29be96491986d7620cdbc6e0084c75f853bb7944a1',
          client: 'web',
          inactivityExpiresAt: sessionResult.inactivityExpiresAt,
          absoluteExpiresAt: sessionResult.absoluteExpiresAt,
        },
      } as unknown as AuthenticatedRequest,
      reply,
    );

    expect(response).toHaveProperty('session.csrfToken', 'csrf-token');
    expect(response).not.toHaveProperty('session.sessionToken');
    expect(reply.header).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, max-age=0',
    );
  });
});
