import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuthenticatedRequest } from '../types/authenticated-request.type';
import { sanitizeRequestUrl } from '../utils/request-url.util';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startedAt;
        const userSuffix = req.user ? ` user=${req.user.id}` : '';

        this.logger.log(
          `${req.method} ${sanitizeRequestUrl(req.url)} ${duration}ms${userSuffix}`,
        );
      }),
    );
  }
}
