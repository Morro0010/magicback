import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, UserRole, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';

export type VisibleUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findAllVisible(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return { page, limit, total, items: users };
  }

  async createUser(
    dto: CreateUserDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ): Promise<VisibleUser> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(dto.password);

    const created = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: dto.role,
      },
    });

    await this.auditService.log({
      eventType: 'USER_CREATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        targetUserId: created.id,
        role: created.role,
      },
    });

    return this.toVisible(created);
  }

  async updateUser(
    id: string,
    dto: UpdateUserDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ): Promise<VisibleUser> {
    const current = await this.findById(id);

    if (!current) {
      throw new NotFoundException('User not found');
    }

    const nextRole = dto.role ?? current.role;
    const nextIsActive = dto.isActive ?? current.isActive;

    this.assertSelfSafety(actor.id, current.id, nextRole, nextIsActive);
    await this.ensureAdminContinuity(current, nextRole, nextIsActive);

    let normalizedEmail: string | undefined;
    if (dto.email !== undefined) {
      normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== current.email) {
        const existing = await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });

        if (existing && existing.id !== current.id) {
          throw new ConflictException('Email already in use');
        }
      }
    }

    const data: Prisma.UserUpdateInput = {
      name: dto.name === undefined ? undefined : dto.name.trim(),
      email: normalizedEmail,
      role: dto.role,
      isActive: dto.isActive,
    };

    const updated = await this.prisma.user.update({
      where: { id },
      data,
    });

    if (dto.isActive === false) {
      await this.prisma.session.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false },
      });
    }

    await this.auditService.log({
      eventType: 'USER_UPDATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        targetUserId: id,
        changed: Object.keys(dto),
      },
    });

    return this.toVisible(updated);
  }

  async updateUserPassword(
    id: string,
    dto: UpdateUserPasswordDto,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ): Promise<{ ok: true }> {
    const current = await this.findById(id);
    if (!current) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false },
      }),
    ]);

    await this.auditService.log({
      eventType: 'USER_PASSWORD_UPDATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        targetUserId: id,
      },
    });

    return { ok: true };
  }

  async deactivateUser(
    id: string,
    actor: { id: string; ipAddress?: string; userAgent?: string },
  ): Promise<{ ok: true }> {
    const current = await this.findById(id);

    if (!current) {
      throw new NotFoundException('User not found');
    }

    this.assertSelfSafety(actor.id, current.id, current.role, false);
    await this.ensureAdminContinuity(current, current.role, false);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false },
      }),
      this.prisma.session.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false },
      }),
    ]);

    await this.auditService.log({
      eventType: 'USER_DEACTIVATED',
      actorUserId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        targetUserId: id,
      },
    });

    return { ok: true };
  }

  async assertActiveUser(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user || !user.isActive) {
      throw new NotFoundException('User not found or inactive');
    }
    return user;
  }

  private toVisible(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): VisibleUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private assertSelfSafety(
    actorId: string,
    targetUserId: string,
    nextRole: UserRole,
    nextIsActive: boolean,
  ) {
    if (actorId !== targetUserId) {
      return;
    }

    if (!nextIsActive || nextRole !== UserRole.ADMIN) {
      throw new BadRequestException('You cannot remove your own admin access');
    }
  }

  private async ensureAdminContinuity(
    current: User,
    nextRole: UserRole,
    nextIsActive: boolean,
  ) {
    const willLoseAdminAccess =
      current.role === UserRole.ADMIN &&
      current.isActive &&
      (!nextIsActive || nextRole !== UserRole.ADMIN);

    if (!willLoseAdminAccess) {
      return;
    }

    const activeAdmins = await this.prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        isActive: true,
        id: { not: current.id },
      },
    });

    if (activeAdmins === 0) {
      throw new BadRequestException('At least one active admin is required');
    }
  }
}
