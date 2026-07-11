import { UserRole } from '@prisma/client';
import { FastifyRequest } from 'fastify';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
};

export type SessionContext = {
  id: string;
  csrfTokenHash: string;
  inactivityExpiresAt: Date;
  absoluteExpiresAt: Date;
  client: 'web' | 'desktop';
};

export type AuthenticatedRequest = FastifyRequest & {
  cookies?: Record<string, string>;
  user?: AuthenticatedUser;
  session?: SessionContext;
};
