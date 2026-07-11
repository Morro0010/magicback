import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const usersService = {
    findByEmail: jest.fn(),
  } as any;

  const prisma = {
    session: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  } as any;

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, number | string> = {
        SESSION_INACTIVITY_TIMEOUT_MINUTES: 30,
        SESSION_ABSOLUTE_TIMEOUT_HOURS: 8,
      };
      return values[key];
    }),
  } as any;

  const auditService = {
    log: jest.fn(),
  } as any;

  const service = new AuthService(usersService, prisma, configService, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in and creates a rotated session', async () => {
    const passwordHash = await argon2.hash('Admin123!');
    usersService.findByEmail.mockResolvedValue({
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

    expect(prisma.session.updateMany).toHaveBeenCalled();
    expect(prisma.session.create).toHaveBeenCalled();
    expect(result.sessionToken).toBeDefined();
    expect(result.csrfToken).toBeDefined();
    expect(result.user.email).toEqual('admin@magiccity.local');
  });

  it('throws unauthorized for invalid password', async () => {
    const passwordHash = await argon2.hash('Admin123!');
    usersService.findByEmail.mockResolvedValue({
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

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
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
