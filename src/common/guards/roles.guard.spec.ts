import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../constants';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const createContext = (role?: UserRole) =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as any;

  it('allows access when role matches', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === ROLES_KEY) return [UserRole.ADMIN];
        return false;
      }),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(true);
  });

  it('denies access when role does not match', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === ROLES_KEY) return [UserRole.ADMIN];
        return false;
      }),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createContext(UserRole.CASHIER))).toThrow(
      ForbiddenException,
    );
  });
});
