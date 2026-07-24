import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  type SessionUpdateManyArgs = {
    where: {
      id?: string;
      userId?: string;
      isActive?: boolean;
      OR?: Array<{
        inactivityExpiresAt?: { lte: Date };
        absoluteExpiresAt?: { lte: Date };
      }>;
    };
    data: { isActive: boolean };
  };

  const findByEmailMock = jest.fn<UsersService['findByEmail']>();
  const usersService = {
    findByEmail: findByEmailMock,
  } as unknown as UsersService;

  const sessionUpdateManyCalls: SessionUpdateManyArgs[] = [];
  const sessionUpdateManyMock = jest.fn(
    (args: SessionUpdateManyArgs): Promise<{ count: number }> => {
      sessionUpdateManyCalls.push(args);
      return Promise.resolve({ count: 1 });
    },
  );
  const sessionCreateMock = jest.fn();
  const prisma = {
    session: {
      updateMany: sessionUpdateManyMock,
      create: sessionCreateMock,
    },
  } as unknown as PrismaService;

  const getOrThrowMock = jest.fn((key: string): number | string => {
    const values: Record<string, number | string> = {
      SESSION_INACTIVITY_TIMEOUT_MINUTES: 30,
      SESSION_ABSOLUTE_TIMEOUT_HOURS: 8,
    };
    const value = values[key];
    if (value === undefined) {
      throw new Error(`Missing test configuration: ${key}`);
    }
    return value;
  });
  const configService = {
    getOrThrow: getOrThrowMock,
  } as unknown as ConfigService;

  const auditLogMock = jest.fn<AuditService['log']>();
  const auditService = {
    log: auditLogMock,
  } as unknown as AuditService;

  const service = new AuthService(
    usersService,
    prisma,
    configService,
    auditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    sessionUpdateManyCalls.length = 0;
  });

  it('logs in, retires only expired sessions and creates a new session', async () => {
    const passwordHash = await argon2.hash('Admin123!');
    findByEmailMock.mockResolvedValue({
      id: 'u1',
      email: 'admin@magiccity.local',
      name: 'Admin',
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash,
    });

    const result = await service.login(
      {
        email: 'admin@magiccity.local',
        password: 'Admin123!',
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    const updateExpiredSessionsArgs = sessionUpdateManyCalls[0];
    expect(updateExpiredSessionsArgs?.where.userId).toBe('u1');
    expect(updateExpiredSessionsArgs?.where.isActive).toBe(true);
    expect(
      updateExpiredSessionsArgs?.where.OR?.[0]?.inactivityExpiresAt?.lte,
    ).toBeInstanceOf(Date);
    expect(
      updateExpiredSessionsArgs?.where.OR?.[1]?.absoluteExpiresAt?.lte,
    ).toBeInstanceOf(Date);
    expect(updateExpiredSessionsArgs?.data).toEqual({ isActive: false });
    expect(sessionCreateMock).toHaveBeenCalled();
    expect(result.sessionToken).toBeDefined();
    expect(result.csrfToken).toBeDefined();
    expect(result.user.email).toEqual('admin@magiccity.local');
  });

  it('allows the same user to keep multiple independent active sessions', async () => {
    const passwordHash = await argon2.hash('Admin123!');
    findByEmailMock.mockResolvedValue({
      id: 'u1',
      email: 'admin@magiccity.local',
      name: 'Admin',
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash,
    });

    await service.login(
      {
        email: 'admin@magiccity.local',
        password: 'Admin123!',
      },
      { ipAddress: '10.0.0.10', userAgent: 'Equipo 1' },
    );
    await service.login(
      {
        email: 'admin@magiccity.local',
        password: 'Admin123!',
      },
      { ipAddress: '10.0.0.11', userAgent: 'Equipo 2' },
    );

    expect(sessionCreateMock).toHaveBeenCalledTimes(2);
    expect(sessionUpdateManyCalls).toHaveLength(2);
    for (const call of sessionUpdateManyCalls) {
      expect(call.where).toEqual(
        expect.objectContaining({
          userId: 'u1',
          isActive: true,
          OR: expect.any(Array),
        }),
      );
    }
  });

  it('throws unauthorized for invalid password', async () => {
    const passwordHash = await argon2.hash('Admin123!');
    findByEmailMock.mockResolvedValue({
      id: 'u1',
      email: 'admin@magiccity.local',
      name: 'Admin',
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash,
    });

    await expect(
      service.login(
        { email: 'admin@magiccity.local', password: 'wrong-password' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('logs out and invalidates server session', async () => {
    await service.logout('session-id', 'u1', {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(sessionUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
  });
});
