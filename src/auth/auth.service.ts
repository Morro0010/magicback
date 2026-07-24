import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../common/utils/security.util';
import { AuditService } from '../common/services/audit.service';

// Verifying a fixed Argon2 hash for unknown accounts keeps the login path
// intentionally similar and avoids disclosing valid emails through timing.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$R+KXb/7lJdmryVnD2VqazA$ahOjtR+xsVu2siBqgk6Svb601TMHAUMNYjwsa9Q75ZI';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(
    input: LoginDto,
    metadata: { ipAddress?: string; userAgent?: string },
  ): Promise<{
    sessionToken: string;
    csrfToken: string;
    inactivityExpiresAt: Date;
    absoluteExpiresAt: Date;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
    };
  }> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(normalizedEmail);
    const isPasswordValid = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );
    if (!user || !user.isActive || !isPasswordValid) {
      await this.auditService.log({
        eventType: 'AUTH_LOGIN_FAILED',
        actorUserId: user?.id ?? null,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();

    // Keep independent browser/device sessions active. Only retire sessions
    // that have already expired; logging in elsewhere must not revoke a
    // healthy session without an explicit logout or security event.
    await this.prisma.session.updateMany({
      where: {
        userId: user.id,
        isActive: true,
        OR: [
          { inactivityExpiresAt: { lte: now } },
          { absoluteExpiresAt: { lte: now } },
        ],
      },
      data: {
        isActive: false,
      },
    });

    const sessionToken = generateOpaqueToken(32);
    const csrfToken = generateOpaqueToken(24);

    const inactivityWindowMinutes = this.configService.getOrThrow<number>(
      'SESSION_INACTIVITY_TIMEOUT_MINUTES',
    );
    const absoluteWindowHours = this.configService.getOrThrow<number>(
      'SESSION_ABSOLUTE_TIMEOUT_HOURS',
    );

    const inactivityExpiresAt = new Date(
      now.getTime() + inactivityWindowMinutes * 60 * 1000,
    );
    const absoluteExpiresAt = new Date(
      now.getTime() + absoluteWindowHours * 60 * 60 * 1000,
    );

    await this.prisma.session.create({
      data: {
        sessionTokenHash: hashOpaqueToken(sessionToken),
        csrfTokenHash: hashOpaqueToken(csrfToken),
        userId: user.id,
        inactivityExpiresAt,
        absoluteExpiresAt,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent?.slice(0, 512) ?? null,
      },
    });

    await this.auditService.log({
      eventType: 'AUTH_LOGIN_SUCCESS',
      actorUserId: user.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: { role: user.role },
    });

    return {
      sessionToken,
      csrfToken,
      inactivityExpiresAt,
      absoluteExpiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(
    sessionId: string,
    actorUserId: string,
    metadata: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    await this.auditService.log({
      eventType: 'AUTH_LOGOUT',
      actorUserId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }
}
